import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import { Op, literal, type Transaction } from 'sequelize';
import type { SiteSettings } from '$lib/config';
import type { PluginState } from '$lib/plugin-contracts';
import {
  ClickEventModel,
  ClickEventQueueModel,
  ensureDatabase,
  getDatabase,
  ShortLinkModel,
} from './database';
import { clientHintsFromHeaders } from './client-hints';
import { getClientIp } from './client-ip';
import { getSettings } from './settings';
import { redisKey, redisSendCommand } from './redis';
import { registerServerShutdownTask } from './shutdown';

type ClickMetadataCollector = (input: {
  request: Request;
  ip: string;
  states: Record<string, PluginState>;
  settings: SiteSettings;
}) => Promise<Record<string, unknown>> | Record<string, unknown>;

const DB_QUEUE_BATCH_SIZE = numberEnv(
  'CLICK_QUEUE_DB_BATCH_SIZE',
  250,
  1,
  5_000,
);
const METADATA_CONCURRENCY = numberEnv(
  'CLICK_QUEUE_METADATA_CONCURRENCY',
  16,
  1,
  128,
);
const FLUSH_DELAY_MS = numberEnv('CLICK_QUEUE_FLUSH_MS', 10, 0, 1_000);
const SHUTDOWN_DRAIN_MS = numberEnv(
  'CLICK_QUEUE_SHUTDOWN_DRAIN_MS',
  2_000,
  0,
  30_000,
);
const HEADER_BYTE_LIMIT = numberEnv(
  'CLICK_QUEUE_HEADER_BYTES',
  4_096,
  512,
  65_536,
);
const CLICK_HEADER_SKIP = new Set(['authorization', 'cookie']);
// Drain streams left by older releases; all new clicks are committed to PostgreSQL.
const LEGACY_REDIS_QUEUE =
  env.CLICK_QUEUE_BACKEND === 'redis' || env.CLICK_QUEUE_REDIS === 'true';
const REDIS_STREAM_KEY = redisKey(
  env.CLICK_QUEUE_REDIS_STREAM?.trim() || 'click-events',
);
const REDIS_STREAM_GROUP =
  env.CLICK_QUEUE_REDIS_GROUP?.trim() || 'shortlink-click-writers';
const REDIS_STREAM_CONSUMER =
  env.CLICK_QUEUE_REDIS_CONSUMER?.trim() || `${process.pid}-${randomUUID()}`;
let redisGroupReady: Promise<void> | undefined;
let reclaimCursor = '0-0';
let drainTimer: NodeJS.Timeout | undefined;
let draining: Promise<void> | undefined;
let shuttingDown = false;
let collectClickMetadata: ClickMetadataCollector = () => ({});

export function setClickMetadataCollector(collector: ClickMetadataCollector) {
  collectClickMetadata = collector;
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  const value = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback;
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(6, attempts));
}

function headersRecord(headers: Headers) {
  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, value] of headers) {
    const safeKey = key.toLowerCase().slice(0, 120);
    if (CLICK_HEADER_SKIP.has(safeKey)) continue;
    const safeValue = value.slice(0, 2_000);
    totalLength += safeKey.length + safeValue.length;
    if (totalLength > HEADER_BYTE_LIMIT) break;
    result[safeKey] = safeValue;
  }
  return result;
}

function requestForClick(item: {
  requestUrl: string;
  requestHeaders: Record<string, string>;
}) {
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

function requestForQueueItem(
  item: Pick<ClickEventQueueModel, 'requestUrl' | 'requestHeaders'>,
) {
  return requestForClick({
    requestUrl: item.requestUrl,
    requestHeaders: item.requestHeaders,
  });
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

async function metadataForQueueItem(
  item: Pick<
    ClickEventQueueModel,
    'requestUrl' | 'requestHeaders' | 'ipAddress' | 'pluginStates' | 'metadata'
  >,
  settings: SiteSettings,
) {
  const request = requestForQueueItem(item);
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

export async function enqueueClick(input: {
  linkId: number;
  request: Request;
  getClientAddress: () => string;
  settings: SiteSettings;
  metadata?: Record<string, unknown>;
}): Promise<'accepted' | 'not_found' | 'maxClicks'> {
  await ensureDatabase();
  const accept = async (transaction?: Transaction) => {
    // The conditional UPDATE takes the row lock and rechecks the quota after waiting.
    const [reserved] = await ShortLinkModel.update(
      { redirectCount: literal('redirect_count + 1') },
      {
        where: {
          id: input.linkId,
          [Op.or]: [
            { maxClicks: { [Op.lte]: 0 } },
            literal('redirect_count < max_clicks'),
          ],
        },
        transaction,
      },
    );
    if (!reserved) {
      const link = await ShortLinkModel.findByPk(input.linkId, {
        attributes: ['id'],
        transaction,
      });
      return link ? ('maxClicks' as const) : ('not_found' as const);
    }
    if (input.settings.links.trackClicks) {
      const ip = getClientIp(
        input.request,
        input.getClientAddress,
        input.settings.network.trustProxyHeaders,
        input.settings.network.proxyIpHeaders,
      );
      await ClickEventQueueModel.create(
        {
          linkId: input.linkId,
          requestUrl: input.request.url,
          requestHeaders: headersRecord(input.request.headers),
          pluginStates: input.settings.plugins,
          metadata: metadataRecord(input.metadata),
          ipAddress: ip || null,
          userAgent:
            input.request.headers.get('user-agent')?.slice(0, 1_000) ?? null,
          referer:
            input.request.headers.get('referer')?.slice(0, 2_000) ?? null,
          lastError: null,
        },
        { transaction },
      );
    }
    return 'accepted' as const;
  };
  // Without analytics there is only one write, already atomic in PostgreSQL.
  const result = input.settings.links.trackClicks
    ? await getDatabase().transaction(accept)
    : await accept();
  if (result === 'accepted') scheduleDrain(FLUSH_DELAY_MS);
  return result;
}

async function processQueueBatch(items: ClickEventQueueModel[]) {
  const settings = await getSettings();
  const metadata = new Map<string, Record<string, unknown>>();
  // Collect external metadata before taking locks, with bounded network concurrency.
  for (let offset = 0; offset < items.length; offset += METADATA_CONCURRENCY) {
    await Promise.all(
      items.slice(offset, offset + METADATA_CONCURRENCY).map(async (item) => {
        metadata.set(
          String(item.id),
          await metadataForQueueItem(item, settings),
        );
      }),
    );
  }
  const parentIds = [...new Set(items.map((item) => item.linkId))];
  const result = await getDatabase().transaction(async (transaction) => {
    // Parent first, sorted: same order as link/account deletion. Busy parents are
    // left to the next pass instead of making every worker wait on the same link.
    const links = await ShortLinkModel.findAll({
      attributes: ['id'],
      where: { id: parentIds },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (links.length === 0)
      return {
        count: 0,
        skippedLinkIds: parentIds,
      };
    const lockedIds = new Set(links.map((link) => link.id));
    const skippedLinkIds = parentIds.filter((id) => !lockedIds.has(id));
    const pending = await ClickEventQueueModel.findAll({
      where: {
        id: items.map((item) => item.id),
        linkId: links.map((link) => link.id),
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (pending.length === 0)
      return {
        count: 0,
        skippedLinkIds: parentIds,
      };
    const ids = pending.map((item) => item.id);
    await ClickEventModel.bulkCreate(
      pending.map((item) => ({
        queueId: item.id,
        linkId: item.linkId,
        createdAt: item.createdAt,
        ipAddress: item.ipAddress,
        userAgent: item.userAgent,
        referer: item.referer,
        metadata:
          metadata.get(String(item.id)) ?? metadataRecord(item.metadata),
      })),
      {
        transaction,
        updateOnDuplicate: ['queueId'],
        conflictAttributes: ['queueId'],
        returning: false,
      },
    );
    await getDatabase().query(
      `
      UPDATE short_links AS link
      SET last_clicked_at = GREATEST(link.last_clicked_at, batch.clicked_at)
      FROM (
        SELECT link_id, max(created_at) AS clicked_at
        FROM click_events WHERE queue_id = ANY(CAST($ids AS bigint[])) GROUP BY link_id
      ) AS batch
      WHERE link.id = batch.link_id
    `,
      { bind: { ids }, transaction },
    );
    await ClickEventQueueModel.destroy({ where: { id: ids }, transaction });
    return { count: pending.length, skippedLinkIds };
  });
  return { count: result.count, skippedLinkIds: result.skippedLinkIds };
}

async function processLegacyRedisQueue() {
  if (!LEGACY_REDIS_QUEUE) return;
  redisGroupReady ??= redisSendCommand(
    ['XGROUP', 'CREATE', REDIS_STREAM_KEY, REDIS_STREAM_GROUP, '0', 'MKSTREAM'],
    { throwOnError: true },
  )
    .then(() => undefined)
    .catch((error: unknown) => {
      if (String(error).includes('BUSYGROUP')) return;
      redisGroupReady = undefined;
      throw error;
    });
  await redisGroupReady;
  const claimed = await redisSendCommand(
    [
      'XAUTOCLAIM',
      REDIS_STREAM_KEY,
      REDIS_STREAM_GROUP,
      REDIS_STREAM_CONSUMER,
      '60000',
      reclaimCursor,
      'COUNT',
      String(DB_QUEUE_BATCH_SIZE),
    ],
    { throwOnError: true },
  );
  let messages: unknown[] = [];
  if (Array.isArray(claimed)) {
    reclaimCursor = String(claimed[0]);
    if (Array.isArray(claimed[1])) messages = claimed[1];
  }
  if (messages.length === 0) {
    const next = await redisSendCommand(
      [
        'XREADGROUP',
        'GROUP',
        REDIS_STREAM_GROUP,
        REDIS_STREAM_CONSUMER,
        'COUNT',
        String(DB_QUEUE_BATCH_SIZE),
        'STREAMS',
        REDIS_STREAM_KEY,
        '>',
      ],
      { throwOnError: true },
    );
    if (
      Array.isArray(next) &&
      Array.isArray(next[0]) &&
      Array.isArray(next[0][1])
    )
      messages = next[0][1];
  }
  const settings = messages.length > 0 ? await getSettings() : null;
  for (const message of messages) {
    if (!Array.isArray(message) || !Array.isArray(message[1])) continue;
    const id = String(message[0]);
    try {
      const fields: unknown[] = message[1];
      const payloadIndex = fields.findIndex(
        (field, index) => index % 2 === 0 && String(field) === 'payload',
      );
      if (payloadIndex < 0)
        throw new Error(`Legacy click ${id} has no payload.`);
      const value = JSON.parse(String(fields[payloadIndex + 1])) as Record<
        string,
        unknown
      >;
      const linkId = Number(value.linkId);
      const createdAt = new Date(String(value.clickedAt));
      if (
        !Number.isSafeInteger(linkId) ||
        linkId <= 0 ||
        Number.isNaN(createdAt.getTime())
      ) {
        throw new Error(`Legacy click ${id} has invalid link or timestamp.`);
      }
      const sourceId = `${REDIS_STREAM_KEY}:${id}`;
      const metadata = await metadataForQueueItem(
        {
          requestUrl:
            typeof value.requestUrl === 'string'
              ? value.requestUrl
              : 'http://localhost/',
          requestHeaders: metadataRecord(value.requestHeaders) as Record<
            string,
            string
          >,
          ipAddress:
            typeof value.ipAddress === 'string' ? value.ipAddress : null,
          pluginStates: metadataRecord(value.pluginStates),
          metadata: metadataRecord(value.metadata),
        },
        settings!,
      );
      await getDatabase().transaction(async (transaction) => {
        const link = await ShortLinkModel.findByPk(linkId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!link) return null;
        if (await ClickEventModel.findOne({ where: { sourceId }, transaction }))
          return null;
        await ClickEventModel.create(
          {
            sourceId,
            linkId,
            createdAt,
            ipAddress:
              typeof value.ipAddress === 'string' ? value.ipAddress : null,
            userAgent:
              typeof value.userAgent === 'string' ? value.userAgent : null,
            referer: typeof value.referer === 'string' ? value.referer : null,
            metadata,
          },
          { transaction },
        );
        await link.increment('redirectCount', { transaction });
        if (!link.lastClickedAt || link.lastClickedAt < createdAt) {
          await link.update({ lastClickedAt: createdAt }, { transaction });
        }
      });
      await redisSendCommand(
        ['XACK', REDIS_STREAM_KEY, REDIS_STREAM_GROUP, id],
        { throwOnError: true },
      );
    } catch (error) {
      console.error(
        `Could not import legacy click ${id}; retained for retry.`,
        error,
      );
    }
  }
}

export async function processClickQueue(deadline = Infinity) {
  await ensureDatabase();
  const skippedLinkIds = new Set<number>();
  while (Date.now() < deadline) {
    const items = await ClickEventQueueModel.findAll({
      where: {
        nextAttemptAt: { [Op.lte]: new Date() },
        ...(skippedLinkIds.size > 0
          ? { linkId: { [Op.notIn]: [...skippedLinkIds] } }
          : {}),
      },
      order: [
        ['nextAttemptAt', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: DB_QUEUE_BATCH_SIZE,
    });
    if (items.length === 0) break;
    if (Date.now() >= deadline) return;
    try {
      const result = await processQueueBatch(items);
      for (const id of result.skippedLinkIds) skippedLinkIds.add(id);
    } catch (batchError) {
      // Isolate a malformed event so it cannot indefinitely block healthy siblings.
      // The ordinary path still commits the entire batch in one transaction.
      for (const item of items) {
        if (Date.now() >= deadline) return;
        try {
          if (items.length === 1) throw batchError;
          const result = await processQueueBatch([item]);
          for (const id of result.skippedLinkIds) skippedLinkIds.add(id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await ClickEventQueueModel.update(
            {
              attempts: literal('attempts + 1'),
              lastError: message.slice(0, 2_000),
              nextAttemptAt: new Date(
                Date.now() + retryDelayMs(item.attempts + 1),
              ),
            },
            { where: { id: item.id } },
          );
        }
      }
    }
  }
  if (Date.now() < deadline) await processLegacyRedisQueue();
}

function scheduleDrain(delayMs = 1_000) {
  if (building || shuttingDown || drainTimer || draining) return;
  drainTimer = setTimeout(() => {
    drainTimer = undefined;
    draining = processClickQueue()
      .catch((error: unknown) => {
        console.error('Could not process the durable click queue.', error);
      })
      .finally(() => {
        draining = undefined;
        scheduleDrain();
      });
  }, delayMs);
  drainTimer.unref?.();
}

registerServerShutdownTask(async () => {
  shuttingDown = true;
  if (drainTimer) clearTimeout(drainTimer);
  const deadline = Date.now() + SHUTDOWN_DRAIN_MS;
  // Unprocessed rows survive shutdown and are picked up by the next worker.
  if (!draining && Date.now() < deadline) {
    await processClickQueue(deadline).catch((error: unknown) => {
      console.error(
        'Could not finish processing the durable click queue.',
        error,
      );
    });
  }
});

scheduleDrain();
