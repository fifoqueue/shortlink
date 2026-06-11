import { Op } from 'sequelize';
import type { SiteSettings } from '$lib/config';
import type { PluginState } from '$lib/plugin-contracts';
import { ClickEventQueueModel, ensureDatabase } from './database';
import { getClientIp } from './client-ip';
import { recordClick } from './shortener';
import { registerServerShutdownTask } from './shutdown';

const BATCH_SIZE = 50;
const SHUTDOWN_DRAIN_MS = 500;
let drainTimer: NodeJS.Timeout | undefined;
let draining: Promise<void> | undefined;
let drainDeadline = Infinity;
let shuttingDown = false;
let collectClickMetadata: (input: {
  request: Request;
  ip: string;
  states: Record<string, PluginState>;
}) => Promise<Record<string, unknown>> | Record<string, unknown> = () => ({});

export function setClickMetadataCollector(
  collector: typeof collectClickMetadata,
) {
  collectClickMetadata = collector;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(6, attempts));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function headersRecord(headers: Headers) {
  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, value] of headers) {
    const safeKey = key.toLowerCase().slice(0, 120);
    const safeValue = value.slice(0, 2_000);
    totalLength += safeKey.length + safeValue.length;
    if (totalLength > 16_000) break;
    result[safeKey] = safeValue;
  }
  return result;
}

function requestForQueueItem(item: ClickEventQueueModel) {
  try {
    return new Request(item.request_url, {
      headers: item.request_headers,
    });
  } catch {
    return new Request('http://localhost/', {
      headers: item.request_headers,
    });
  }
}

async function metadataFor(item: ClickEventQueueModel) {
  try {
    return await collectClickMetadata({
      request: requestForQueueItem(item),
      ip: item.ip_address ?? '',
      states: item.plugin_states as Record<string, PluginState>,
    });
  } catch (error) {
    console.error('An error occurred while collecting click metadata.', error);
    return {};
  }
}

async function processQueueItem(item: ClickEventQueueModel) {
  await recordClick(item.link_id, {
    queueId: item.id,
    ip: item.ip_address,
    userAgent: item.user_agent,
    referer: item.referer,
    metadata: await metadataFor(item),
  });
  await item.destroy();
}

async function scheduleNextPendingAttempt() {
  const next = await ClickEventQueueModel.findOne({
    order: [
      ['next_attempt_at', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (!next) return;

  scheduleDrain(Math.max(0, next.next_attempt_at.getTime() - Date.now()));
}

async function processDueQueue(deadline = Infinity) {
  await ensureDatabase();

  while (Date.now() < Math.min(deadline, drainDeadline)) {
    const items = await ClickEventQueueModel.findAll({
      where: {
        next_attempt_at: { [Op.lte]: new Date() },
      },
      order: [['id', 'ASC']],
      limit: BATCH_SIZE,
    });
    if (items.length === 0) {
      await scheduleNextPendingAttempt();
      return;
    }

    for (const item of items) {
      if (Date.now() >= Math.min(deadline, drainDeadline)) return;

      try {
        await processQueueItem(item);
      } catch (error) {
        const attempts = item.attempts + 1;
        const delay = retryDelayMs(attempts);
        await item.update({
          attempts,
          last_error: errorMessage(error).slice(0, 2_000),
          next_attempt_at: new Date(Date.now() + delay),
        });
        scheduleDrain(delay);
      }
    }

    if (items.length < BATCH_SIZE) return;
  }
}

function scheduleDrain(delayMs = 0) {
  if (shuttingDown) return;
  if (drainTimer) return;

  drainTimer = setTimeout(() => {
    drainTimer = undefined;
    draining = processDueQueue()
      .catch((error: unknown) => {
        console.error(
          'An error occurred while processing the click queue.',
          error,
        );
        scheduleDrain(retryDelayMs(1));
      })
      .finally(() => {
        draining = undefined;
      });
  }, delayMs);
  drainTimer.unref?.();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function fallbackRecordClick(input: {
  linkId: number;
  request: Request;
  ip: string;
  settings: SiteSettings;
}) {
  await recordClick(input.linkId, {
    ip: input.ip,
    userAgent: input.request.headers.get('user-agent'),
    referer: input.request.headers.get('referer'),
    metadata: await collectClickMetadata({
      request: input.request,
      ip: input.ip,
      states: input.settings.plugins,
    }),
  });
}

export async function enqueueClick(input: {
  linkId: number;
  request: Request;
  getClientAddress: () => string;
  settings: SiteSettings;
}) {
  const ip = getClientIp(
    input.request,
    input.getClientAddress,
    input.settings.network.trustProxyHeaders,
    input.settings.network.proxyIpHeaders,
  );

  try {
    await ensureDatabase();
    await ClickEventQueueModel.create({
      link_id: input.linkId,
      request_url: input.request.url,
      request_headers: headersRecord(input.request.headers),
      plugin_states: clone(input.settings.plugins),
      ip_address: ip || null,
      user_agent: input.request.headers.get('user-agent'),
      referer: input.request.headers.get('referer'),
      next_attempt_at: new Date(),
    });
    scheduleDrain(0);
  } catch (error) {
    console.error('Click queue storage failed; trying a direct write.', error);
    await fallbackRecordClick({ ...input, ip });
  }
}

registerServerShutdownTask(async () => {
  shuttingDown = true;
  const deadline = Date.now() + SHUTDOWN_DRAIN_MS;
  drainDeadline = deadline;

  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = undefined;
  }

  if (draining) {
    await Promise.race([draining, delay(Math.max(0, deadline - Date.now()))]);
  }

  try {
    if (!draining && Date.now() < deadline) {
      await processDueQueue(deadline);
    }
  } catch (error) {
    console.error(
      'Could not finish processing the click queue before shutdown.',
      error,
    );
  }
});

scheduleDrain(1_000);
