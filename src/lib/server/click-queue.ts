import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
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
import { writeClickAnalytics, type ClickAnalyticsRow } from './click-analytics';
import { getClientIp } from './client-ip';
import { getSettings } from './settings';
import { recordClick } from './shortener';
import { redisKey, redisSendCommand } from './redis';
import { registerServerShutdownTask } from './shutdown';

type QueuedClick = {
  linkId: number;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  pluginStates: Record<string, PluginState>;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  clickedAt: Date;
  attempts: number;
};

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
const MEMORY_BATCH_SIZE = numberEnv('CLICK_QUEUE_BATCH_SIZE', 5_000, 1, 20_000);
const MEMORY_QUEUE_LIMIT = numberEnv(
  'CLICK_QUEUE_MEMORY_LIMIT',
  200_000,
  1_000,
  1_000_000,
);
const METADATA_CONCURRENCY = numberEnv(
  'CLICK_QUEUE_METADATA_CONCURRENCY',
  128,
  1,
  1_024,
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
const REDIS_QUEUE_ENABLED =
  env.CLICK_QUEUE_BACKEND === 'redis' || env.CLICK_QUEUE_REDIS === 'true';
const REDIS_STREAM_KEY = redisKey(
  env.CLICK_QUEUE_REDIS_STREAM?.trim() || 'click-events',
);
const REDIS_STREAM_GROUP =
  env.CLICK_QUEUE_REDIS_GROUP?.trim() || 'shortlink-click-writers';
const REDIS_STREAM_CONSUMER =
  env.CLICK_QUEUE_REDIS_CONSUMER?.trim() ||
  `${process.pid}-${randomUUID().slice(0, 8)}`;
const REDIS_STREAM_MAXLEN = numberEnv(
  'CLICK_QUEUE_REDIS_MAXLEN',
  1_000_000,
  1_000,
  100_000_000,
);

let memoryQueue: QueuedClick[] = [];
let drainTimer: NodeJS.Timeout | undefined;
let draining: Promise<void> | undefined;
let drainDeadline = Infinity;
let shuttingDown = false;
let overflowWarningAt = 0;
let collectClickMetadata: ClickMetadataCollector = () => ({});
let redisGroupReady: Promise<void> | undefined;

export function setClickMetadataCollector(collector: ClickMetadataCollector) {
  collectClickMetadata = collector;
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(6, attempts));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function serializeClick(item: QueuedClick) {
  return JSON.stringify({
    ...item,
    clickedAt: item.clickedAt.toISOString(),
  });
}

function parseQueuedClick(value: string): QueuedClick | null {
  try {
    const parsed = JSON.parse(value) as Omit<QueuedClick, 'clickedAt'> & {
      clickedAt: string;
    };
    return {
      ...parsed,
      requestHeaders: metadataRecord(parsed.requestHeaders) as Record<
        string,
        string
      >,
      pluginStates: metadataRecord(parsed.pluginStates) as Record<
        string,
        PluginState
      >,
      metadata: metadataRecord(parsed.metadata),
      ipAddress: parsed.ipAddress || null,
      userAgent: parsed.userAgent || null,
      referer: parsed.referer || null,
      clickedAt: new Date(parsed.clickedAt),
      attempts: Number.isSafeInteger(parsed.attempts) ? parsed.attempts : 0,
    };
  } catch {
    return null;
  }
}

function redisFieldValue(fields: unknown[], field: string) {
  for (let index = 0; index < fields.length - 1; index += 2) {
    if (String(fields[index]) === field) return String(fields[index + 1]);
  }
  return '';
}

async function ensureRedisGroup() {
  if (!REDIS_QUEUE_ENABLED) return;
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

function requestForClick(
  item: Pick<QueuedClick, 'requestUrl' | 'requestHeaders'>,
) {
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

function requestForQueueItem(item: ClickEventQueueModel) {
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

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

async function metadataForClick(item: QueuedClick, settings: SiteSettings) {
  const request = requestForClick(item);
  try {
    return {
      ...clientHintMetadata(request),
      ...(await collectClickMetadata({
        request,
        ip: item.ipAddress ?? '',
        states: item.pluginStates,
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

async function metadataForQueueItem(item: ClickEventQueueModel) {
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

function groupClickCounts(items: QueuedClick[]) {
  const counts = new Map<number, { count: number; lastClickedAt: Date }>();
  for (const item of items) {
    const current = counts.get(item.linkId);
    if (!current) {
      counts.set(item.linkId, { count: 1, lastClickedAt: item.clickedAt });
    } else {
      current.count += 1;
      if (item.clickedAt > current.lastClickedAt) {
        current.lastClickedAt = item.clickedAt;
      }
    }
  }
  return counts;
}

async function existingLinkIds(linkIds: number[]) {
  if (linkIds.length === 0) return new Set<number>();
  const rows = (await ShortLinkModel.findAll({
    attributes: ['id'],
    where: { id: { [Op.in]: [...new Set(linkIds)] } },
    raw: true,
  })) as unknown as Array<{ id: number }>;
  return new Set(rows.map((row) => Number(row.id)));
}

async function updateClickCounters(
  items: QueuedClick[],
  transaction: Transaction,
) {
  const grouped = [...groupClickCounts(items).entries()];
  if (grouped.length === 0) return;

  const sequelize = getDatabase();
  const values = grouped.map(([linkId, data]) =>
    [
      Number(linkId),
      Number(data.count),
      sequelize.escape(data.lastClickedAt),
    ].join(','),
  );

  await sequelize.query(
    `
      UPDATE short_links AS target
      SET
        clicks = target.clicks + source.click_count,
        last_clicked_at = CASE
          WHEN target.last_clicked_at IS NULL
            OR target.last_clicked_at < source.last_clicked_at
          THEN source.last_clicked_at
          ELSE target.last_clicked_at
        END
      FROM (
        VALUES ${values.map((value) => `(${value})`).join(',')}
      ) AS source(id, click_count, last_clicked_at)
      WHERE target.id = source.id
    `,
    { transaction },
  );
}

async function flushMemoryBatch(batch: QueuedClick[]) {
  await ensureDatabase();
  const linkIds = await existingLinkIds(batch.map((item) => item.linkId));
  const items = batch.filter((item) => linkIds.has(item.linkId));
  if (items.length === 0) return;

  const settings = await getSettings();
  const rows: Omit<ClickAnalyticsRow, 'eventId'>[] = await mapConcurrent(
    items,
    METADATA_CONCURRENCY,
    async (item) => ({
      linkId: item.linkId,
      createdAt: item.clickedAt,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      referer: item.referer,
      metadata: await metadataForClick(item, settings),
    }),
  );

  const transaction = await getDatabase().transaction();
  let analyticsRows: ClickAnalyticsRow[] = [];
  try {
    const createdClicks = await ClickEventModel.bulkCreate(rows, {
      validate: false,
      transaction,
      returning: true,
    });
    analyticsRows = rows.map((row, index) => ({
      ...row,
      eventId: Number(createdClicks[index]?.id ?? 0),
    }));
    await updateClickCounters(items, transaction);
    await transaction.commit();
    await writeClickAnalytics(analyticsRows);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function processQueueItem(item: ClickEventQueueModel) {
  await recordClick(item.linkId, {
    queueId: item.id,
    ip: item.ipAddress,
    userAgent: item.userAgent,
    referer: item.referer,
    metadata: await metadataForQueueItem(item),
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

async function processDueDatabaseQueue(deadline = Infinity) {
  while (Date.now() < Math.min(deadline, drainDeadline)) {
    const items = await ClickEventQueueModel.findAll({
      where: {
        nextAttemptAt: { [Op.lte]: new Date() },
      },
      order: [['id', 'ASC']],
      limit: DB_QUEUE_BATCH_SIZE,
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

    if (items.length < DB_QUEUE_BATCH_SIZE) return;
  }
}

function requeueFailedBatch(batch: QueuedClick[]) {
  const attempts = Math.max(...batch.map((item) => item.attempts)) + 1;
  const delay = retryDelayMs(attempts);
  for (const item of batch) item.attempts = attempts;
  memoryQueue = [...batch, ...memoryQueue];
  scheduleDrain(delay);
}

async function processMemoryQueue(deadline = Infinity) {
  while (
    memoryQueue.length > 0 &&
    Date.now() < Math.min(deadline, drainDeadline)
  ) {
    const batch = memoryQueue.splice(0, MEMORY_BATCH_SIZE);
    try {
      await flushMemoryBatch(batch);
    } catch (error) {
      console.error('An error occurred while flushing click events.', error);
      requeueFailedBatch(batch);
      return;
    }
  }
}

async function enqueueRedisClick(item: QueuedClick) {
  const result = await redisSendCommand([
    'XADD',
    REDIS_STREAM_KEY,
    'MAXLEN',
    '~',
    String(REDIS_STREAM_MAXLEN),
    '*',
    'payload',
    serializeClick(item),
  ]);
  if (result) {
    scheduleDrain(0);
    return;
  }

  console.error('Could not enqueue click in Redis; using memory queue.');
  memoryQueue.push(item);
  scheduleDrain(0);
}

async function readRedisClickBatch() {
  await ensureRedisGroup();
  const result = (await redisSendCommand([
    'XREADGROUP',
    'GROUP',
    REDIS_STREAM_GROUP,
    REDIS_STREAM_CONSUMER,
    'COUNT',
    String(MEMORY_BATCH_SIZE),
    'STREAMS',
    REDIS_STREAM_KEY,
    '>',
  ])) as unknown;
  if (!Array.isArray(result)) return [];

  const stream = result[0];
  if (!Array.isArray(stream) || !Array.isArray(stream[1])) return [];
  return stream[1].flatMap(
    (message): Array<{ id: string; item: QueuedClick }> => {
      if (!Array.isArray(message) || !Array.isArray(message[1])) return [];
      const id = String(message[0]);
      const payload = redisFieldValue(message[1], 'payload');
      const item = payload ? parseQueuedClick(payload) : null;
      return item ? [{ id, item }] : [];
    },
  );
}

async function ackRedisClicks(ids: string[]) {
  if (ids.length === 0) return;
  await redisSendCommand([
    'XACK',
    REDIS_STREAM_KEY,
    REDIS_STREAM_GROUP,
    ...ids,
  ]);
}

async function processRedisQueue(deadline = Infinity) {
  if (!REDIS_QUEUE_ENABLED) return;

  while (Date.now() < Math.min(deadline, drainDeadline)) {
    const entries = await readRedisClickBatch();
    if (entries.length === 0) return;

    await flushMemoryBatch(entries.map((entry) => entry.item));
    await ackRedisClicks(entries.map((entry) => entry.id));
  }
}

async function processDueQueue(deadline = Infinity) {
  await ensureDatabase();
  await processMemoryQueue(deadline);
  if (memoryQueue.length > 0) return;
  await processRedisQueue(deadline);
  await processDueDatabaseQueue(deadline);
}

function scheduleDrain(delayMs = FLUSH_DELAY_MS) {
  if (shuttingDown || drainTimer) return;

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
        if (memoryQueue.length > 0) scheduleDrain(0);
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

export function enqueueClick(input: {
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
  const item: QueuedClick = {
    linkId: input.linkId,
    requestUrl: input.request.url,
    requestHeaders: headersRecord(input.request.headers),
    pluginStates: input.settings.plugins,
    metadata: metadataRecord(input.metadata),
    ipAddress: ip || null,
    userAgent: input.request.headers.get('user-agent')?.slice(0, 1_000) ?? null,
    referer: input.request.headers.get('referer')?.slice(0, 2_000) ?? null,
    clickedAt: new Date(),
    attempts: 0,
  };

  if (REDIS_QUEUE_ENABLED) {
    void enqueueRedisClick(item);
    return;
  }

  memoryQueue.push(item);

  if (memoryQueue.length > MEMORY_QUEUE_LIMIT) {
    const now = Date.now();
    if (now - overflowWarningAt > 10_000) {
      overflowWarningAt = now;
      console.warn(
        `Click queue contains ${memoryQueue.length} items; consider scaling workers or raising database throughput.`,
      );
    }
  }

  scheduleDrain(memoryQueue.length >= MEMORY_BATCH_SIZE ? 0 : FLUSH_DELAY_MS);
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
