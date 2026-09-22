import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { ClickEventModel, ensureDatabase, getDatabase } from './database';
import { Op } from 'sequelize';
import { registerServerShutdownTask } from './shutdown';

export type ClickAnalyticsRow = {
  eventId?: string | number;
  linkId: number;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  metadata: Record<string, unknown>;
};

export type ClickAnalyticsEvent = Omit<ClickAnalyticsRow, 'linkId'>;

export type ClickAnalyticsSearch =
  | {
      field: 'createdAt' | 'ipAddress' | 'referer' | 'userAgent';
      query: string;
    }
  | {
      field: 'metadata';
      query: string;
      paths: string[][];
    };

type ClickHouseEventRow = {
  event_id: number | string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  referer: string | null;
  metadata_json: string | null;
};

type ClickHouseCountRow = {
  count: number | string;
};

const CLICKHOUSE_TABLE =
  env.ANALYTICS_CLICKHOUSE_TABLE?.trim() || 'shortlink_click_events';
const CLICKHOUSE_AUTO_CREATE = env.ANALYTICS_CLICKHOUSE_AUTO_CREATE !== 'false';

let clickHouseReady: Promise<void> | undefined;

export function clickAnalyticsEnabled() {
  return Boolean(env.ANALYTICS_CLICKHOUSE_URL?.trim());
}

function clickHouseUrl(query: string) {
  const base = env.ANALYTICS_CLICKHOUSE_URL?.trim();
  if (!base) return null;

  const url = new URL(base);
  url.username = '';
  url.password = '';
  const database = env.ANALYTICS_CLICKHOUSE_DATABASE?.trim();
  if (database) url.searchParams.set('database', database);
  url.searchParams.set('query', query);
  // An HTTP acknowledgment must mean the insert finished without skipped rows.
  url.searchParams.set('wait_end_of_query', '1');
  url.searchParams.set('async_insert', '0');
  url.searchParams.set('wait_for_async_insert', '1');
  url.searchParams.set('output_format_json_quote_64bit_integers', '1');
  url.searchParams.set('input_format_skip_unknown_fields', '0');
  url.searchParams.set('input_format_allow_errors_num', '0');
  url.searchParams.set('input_format_allow_errors_ratio', '0');
  return url;
}

function clickHouseHeaders() {
  const headers: Record<string, string> = {};
  const url = new URL(env.ANALYTICS_CLICKHOUSE_URL!);
  const password =
    env.ANALYTICS_CLICKHOUSE_PASSWORD ?? decodeURIComponent(url.password);
  const username =
    env.ANALYTICS_CLICKHOUSE_USERNAME?.trim() ||
    decodeURIComponent(url.username) ||
    (password ? 'default' : '');
  if (username) {
    headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  return headers;
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ClickHouse identifier "${value}".`);
  }
  return `\`${value}\``;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function safeInteger(
  value: number,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

async function clickHouseRequest(query: string, body?: string) {
  const url = clickHouseUrl(query);
  if (!url) return;

  const response = await fetch(url, {
    method: 'POST',
    headers: clickHouseHeaders(),
    body,
    signal: AbortSignal.timeout(
      safeInteger(
        Number(env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS || 10_000),
        10_000,
        100,
        120_000,
      ),
    ),
  });
  const text = await response.text();
  const exception = response.headers.get('x-clickhouse-exception-code');
  if (
    !response.ok ||
    (exception && exception !== '0') ||
    /^Code:\s*\d+[.,\s]/m.test(text)
  ) {
    throw new Error(
      `ClickHouse request failed: ${response.status} ${text.slice(0, 2_000)}`,
    );
  }
  if (!/^\s*SELECT\b/i.test(query) && text.trim()) {
    throw new Error(
      `Unexpected ClickHouse write response: ${text.slice(0, 2_000)}`,
    );
  }
  return text;
}

async function clickHouseSelect<T>(query: string): Promise<T[]> {
  const text = await clickHouseRequest(`${query}\nFORMAT JSONEachRow`);
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function ensureClickHouseTable() {
  if (!clickAnalyticsEnabled()) return;
  clickHouseReady ??= (async () => {
    if (CLICKHOUSE_AUTO_CREATE) {
      await clickHouseRequest(`
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(CLICKHOUSE_TABLE)}
        (
          event_id UInt64,
          created_at DateTime64(3, 'UTC'),
          link_id UInt32,
          ip_address Nullable(String),
          user_agent Nullable(String),
          referer Nullable(String),
          metadata_json String
        )
        ENGINE = ReplacingMergeTree
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (link_id, event_id, created_at)
      `);
    }
    const tables = await clickHouseSelect<{
      engine: string;
      sorting_key: string;
      partition_key: string;
    }>(`
      SELECT engine, sorting_key, partition_key FROM system.tables
      WHERE database = currentDatabase() AND name = ${quoteLiteral(CLICKHOUSE_TABLE)}
    `);
    const table = tables[0];
    if (
      !table ||
      !/^(?:Replicated|Shared)?ReplacingMergeTree$/.test(table.engine) ||
      table.sorting_key
        .replace(/\s+/g, '')
        .replace(/^tuple\((.*)\)$/, '$1')
        .replace(/^\((.*)\)$/, '$1') !== 'link_id,event_id,created_at' ||
      table.partition_key.replace(/\s+/g, '') !== 'toYYYYMM(created_at)'
    ) {
      throw new Error(
        'ClickHouse table must use ReplacingMergeTree with ORDER BY (link_id, event_id, created_at) and PARTITION BY toYYYYMM(created_at). Migrate the existing table before enabling delivery.',
      );
    }
    const columns = await clickHouseSelect<{ name: string; type: string }>(`
      SELECT name, type FROM system.columns
      WHERE database = currentDatabase() AND table = ${quoteLiteral(CLICKHOUSE_TABLE)}
    `);
    const expected: Record<string, string> = {
      event_id: 'UInt64',
      created_at: "DateTime64(3, 'UTC')",
      link_id: 'UInt32',
      ip_address: 'Nullable(String)',
      user_agent: 'Nullable(String)',
      referer: 'Nullable(String)',
      metadata_json: 'String',
    };
    if (
      Object.entries(expected).some(
        ([name, type]) =>
          columns
            .find((column) => column.name === name)
            ?.type.replace(/\s+/g, '') !== type.replace(/\s+/g, ''),
      )
    ) {
      throw new Error(
        'ClickHouse table columns do not match the documented click event schema. Migrate the existing table before enabling delivery.',
      );
    }
  })().catch((error: unknown) => {
    clickHouseReady = undefined;
    throw error;
  });
  await clickHouseReady;
}

function clickHouseDate(value: Date) {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

function parseClickHouseDate(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
}

function parseMetadata(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clickHouseEvent(row: ClickHouseEventRow): ClickAnalyticsEvent {
  return {
    eventId: String(row.event_id),
    createdAt: parseClickHouseDate(row.created_at),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    referer: row.referer,
    metadata: parseMetadata(row.metadata_json),
  };
}

function searchLike(expression: string, query: string) {
  return `${expression} LIKE ${quoteLiteral(`%${query}%`)}`;
}

function metadataPathExpression(path: string[]) {
  return `ifNull(JSONExtractRaw(metadata_json, ${path
    .map((part) => quoteLiteral(part))
    .join(', ')}), '')`;
}

function clickHouseSearchWhere(search?: ClickAnalyticsSearch) {
  const query = search?.query.trim();
  if (!search || !query) return '';

  if (search.field === 'createdAt') {
    return searchLike('toString(created_at)', query);
  }

  if (search.field === 'metadata') {
    const paths = search.paths.filter((path) => path.length > 0);
    if (paths.length === 0) return '';
    return `(${paths
      .map((path) => searchLike(metadataPathExpression(path), query))
      .join(' OR ')})`;
  }

  const columns = {
    ipAddress: 'ip_address',
    referer: 'referer',
    userAgent: 'user_agent',
  } satisfies Record<typeof search.field, string>;
  return searchLike(`ifNull(${columns[search.field]}, '')`, query);
}

function clickHouseWhere(input: {
  linkId: number;
  search?: ClickAnalyticsSearch;
}) {
  const filters = [`link_id = ${safeInteger(input.linkId, 0, 0, 2 ** 32 - 1)}`];
  const searchWhere = clickHouseSearchWhere(input.search);
  if (searchWhere) filters.push(searchWhere);
  return filters.join(' AND ');
}

function limitOffsetClause(input: { limit?: number; offset?: number }) {
  if (input.limit === undefined) return '';
  const limit = safeInteger(input.limit, 100, 1, 1_000_000);
  const offset = safeInteger(input.offset ?? 0, 0, 0, 1_000_000_000);
  return ` LIMIT ${limit} OFFSET ${offset}`;
}

function eventId(value: string | number | undefined) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(
      'ClickHouse event ID must be a safe integer or decimal string.',
    );
  }
  const id = String(value);
  if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 18_446_744_073_709_551_615n) {
    throw new Error(
      'ClickHouse event ID must be a positive UInt64 decimal value.',
    );
  }
  return id;
}

export async function writeClickAnalytics(rows: ClickAnalyticsRow[]) {
  if (!clickAnalyticsEnabled() || rows.length === 0) return;
  const body = rows
    .map((row) =>
      JSON.stringify({
        event_id: eventId(row.eventId),
        created_at: clickHouseDate(row.createdAt),
        link_id: row.linkId,
        ip_address: row.ipAddress,
        user_agent: row.userAgent,
        referer: row.referer,
        metadata_json: JSON.stringify(row.metadata),
      }),
    )
    .join('\n');
  try {
    await ensureClickHouseTable();
    await clickHouseRequest(
      `INSERT INTO ${quoteIdentifier(CLICKHOUSE_TABLE)} FORMAT JSONEachRow`,
      body,
    );
  } catch (error) {
    clickHouseReady = undefined;
    throw error;
  }
}

// PostgreSQL events themselves are the durable outbox. No network call holds DB locks.
// Retrying after an uncertain HTTP result is safe when reads use FINAL.
export async function syncClickAnalytics() {
  if (!clickAnalyticsEnabled()) return 0;
  await ensureDatabase();
  let leasedUntil: Date;
  const rows = await getDatabase().transaction(async (transaction) => {
    const pending = await ClickEventModel.findAll({
      attributes: [
        'id',
        'linkId',
        'createdAt',
        'ipAddress',
        'userAgent',
        'referer',
        'metadata',
      ],
      where: {
        clickhouseSyncedAt: null,
        clickhouseNextAttemptAt: { [Op.lte]: new Date() },
      },
      order: [
        ['clickhouseNextAttemptAt', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: safeInteger(
        Number(env.ANALYTICS_CLICKHOUSE_BATCH_SIZE || 1_000),
        1_000,
        1,
        10_000,
      ),
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (pending.length > 0) {
      // The lease survives a worker crash. It covers schema checks plus the insert;
      // after expiry another worker can safely resend the same immutable identities.
      const timeout = safeInteger(
        Number(env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS || 10_000),
        10_000,
        100,
        120_000,
      );
      leasedUntil = new Date(Date.now() + timeout * 5 + 30_000);
      await ClickEventModel.update(
        { clickhouseNextAttemptAt: leasedUntil },
        {
          where: { id: pending.map((row) => row.id) },
          transaction,
        },
      );
    }
    return pending;
  });
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);
  try {
    await writeClickAnalytics(
      rows.map((row) => ({
        ...row.get({ plain: true }),
        eventId: String(row.id),
      })),
    );
    const [acknowledged] = await ClickEventModel.update(
      { clickhouseSyncedAt: new Date() },
      {
        where: { id: ids, clickhouseSyncedAt: null },
      },
    );
    return acknowledged;
  } catch (error) {
    await ClickEventModel.update(
      { clickhouseNextAttemptAt: new Date() },
      {
        where: {
          id: ids,
          clickhouseSyncedAt: null,
          clickhouseNextAttemptAt: leasedUntil!,
        },
      },
    );
    throw error;
  }
}

let deliveryTimer: NodeJS.Timeout | undefined;
let delivery: Promise<void> | undefined;
let deliveryFailures = 0;
let deliveryStopped = false;

function scheduleDelivery(delayMs = 1_000) {
  if (
    building ||
    !clickAnalyticsEnabled() ||
    deliveryStopped ||
    deliveryTimer ||
    delivery
  )
    return;
  deliveryTimer = setTimeout(() => {
    deliveryTimer = undefined;
    let nextDelay = 1_000;
    delivery = syncClickAnalytics()
      .then((count) => {
        deliveryFailures = 0;
        if (count > 0) nextDelay = 10;
      })
      .catch((error: unknown) => {
        deliveryFailures = Math.min(deliveryFailures + 1, 6);
        console.error(
          'ClickHouse delivery failed; PostgreSQL events remain pending for retry.',
          error,
        );
      })
      .finally(() => {
        delivery = undefined;
        scheduleDelivery(
          deliveryFailures
            ? Math.min(60_000, 1_000 * 2 ** deliveryFailures)
            : nextDelay,
        );
      });
  }, delayMs);
  deliveryTimer.unref?.();
}

registerServerShutdownTask(async () => {
  deliveryStopped = true;
  if (deliveryTimer) clearTimeout(deliveryTimer);
  if (delivery) await delivery;
});
scheduleDelivery();

export async function countClickAnalyticsEvents(input: {
  linkId: number;
  search?: ClickAnalyticsSearch;
}) {
  await ensureClickHouseTable();
  const rows = await clickHouseSelect<ClickHouseCountRow>(`
    SELECT count() AS count
    FROM ${quoteIdentifier(CLICKHOUSE_TABLE)} FINAL
    WHERE ${clickHouseWhere(input)}
  `);
  return Number(rows[0]?.count ?? 0);
}

export async function listClickAnalyticsEvents(input: {
  linkId: number;
  search?: ClickAnalyticsSearch;
  limit?: number;
  offset?: number;
}) {
  await ensureClickHouseTable();
  const rows = await clickHouseSelect<ClickHouseEventRow>(`
    SELECT
      created_at,
      event_id,
      ip_address,
      user_agent,
      referer,
      metadata_json
    FROM ${quoteIdentifier(CLICKHOUSE_TABLE)} FINAL
    WHERE ${clickHouseWhere(input)}
    ORDER BY created_at DESC
    ${limitOffsetClause(input)}
  `);
  return rows.map(clickHouseEvent);
}
