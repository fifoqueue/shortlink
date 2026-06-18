import { Op } from 'sequelize';
import type { SiteSettings } from '$lib/config';
import type { PluginState } from '$lib/plugin-contracts';
import { ClickEventQueueModel, ensureDatabase } from './database';
import { clientHintsFromHeaders } from './client-hints';
import { getClientIp } from './client-ip';
import { getSettings } from './settings';
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
  settings: SiteSettings;
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
    return new Request(item.requestUrl, {
      headers: item.requestHeaders,
    });
  } catch {
    return new Request('http://localhost/', {
      headers: item.requestHeaders,
    });
  }
}

function clientHintMetadata(request: Request) {
  const clientHints = clientHintsFromHeaders(request.headers);
  return Object.keys(clientHints).length > 0 ? { clientHints } : {};
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function metadataFor(item: ClickEventQueueModel) {
  const request = requestForQueueItem(item);
  const settings = await getSettings();
  try {
    return {
      ...clientHintMetadata(request),
      ...(await collectClickMetadata({
        request,
        ip: item.ipAddress ?? '',
        states: item.pluginStates as Record<string, PluginState>,
        settings,
      })),
      ...metadataRecord(item.metadata),
    };
  } catch (error) {
    console.error('An error occurred while collecting click metadata.', error);
    return {
      ...clientHintMetadata(request),
      ...metadataRecord(item.metadata),
    };
  }
}

async function processQueueItem(item: ClickEventQueueModel) {
  await recordClick(item.linkId, {
    queueId: item.id,
    ip: item.ipAddress,
    userAgent: item.userAgent,
    referer: item.referer,
    metadata: await metadataFor(item),
  });
  await item.destroy();
}

async function scheduleNextPendingAttempt() {
  const next = await ClickEventQueueModel.findOne({
    order: [
      ['nextAttemptAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (!next) return;

  scheduleDrain(Math.max(0, next.nextAttemptAt.getTime() - Date.now()));
}

async function processDueQueue(deadline = Infinity) {
  await ensureDatabase();

  while (Date.now() < Math.min(deadline, drainDeadline)) {
    const items = await ClickEventQueueModel.findAll({
      where: {
        nextAttemptAt: { [Op.lte]: new Date() },
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
          lastError: errorMessage(error).slice(0, 2_000),
          nextAttemptAt: new Date(Date.now() + delay),
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
  metadata?: Record<string, unknown>;
}) {
  await recordClick(input.linkId, {
    ip: input.ip,
    userAgent: input.request.headers.get('user-agent'),
    referer: input.request.headers.get('referer'),
    metadata: {
      ...clientHintMetadata(input.request),
      ...(await collectClickMetadata({
        request: input.request,
        ip: input.ip,
        states: input.settings.plugins,
        settings: input.settings,
      })),
      ...metadataRecord(input.metadata),
    },
  });
}

export async function enqueueClick(input: {
  linkId: number;
  request: Request;
  getClientAddress: () => string;
  settings: SiteSettings;
  metadata?: Record<string, unknown>;
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
      linkId: input.linkId,
      requestUrl: input.request.url,
      requestHeaders: headersRecord(input.request.headers),
      pluginStates: clone(input.settings.plugins),
      metadata: metadataRecord(input.metadata),
      ipAddress: ip || null,
      userAgent: input.request.headers.get('user-agent'),
      referer: input.request.headers.get('referer'),
      nextAttemptAt: new Date(),
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
