import { env } from '$env/dynamic/private';

export type ClickAnalyticsRow = {
  eventId?: number;
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
  const database = env.ANALYTICS_CLICKHOUSE_DATABASE?.trim();
  if (database) url.searchParams.set('database', database);
  url.searchParams.set('query', query);
  return url;
}

function clickHouseHeaders() {
  const headers: Record<string, string> = {};
  const username = env.ANALYTICS_CLICKHOUSE_USERNAME?.trim();
  const password = env.ANALYTICS_CLICKHOUSE_PASSWORD ?? '';
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
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`ClickHouse request failed: ${response.status} ${detail}`);
  }

  return response.text();
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
  if (!clickAnalyticsEnabled() || !CLICKHOUSE_AUTO_CREATE) return;
  clickHouseReady ??= clickHouseRequest(
    `
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
    `,
  ).then(() => undefined);
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
    eventId: Number(row.event_id),
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

export async function writeClickAnalytics(rows: ClickAnalyticsRow[]) {
  if (!clickAnalyticsEnabled() || rows.length === 0) return;

  try {
    await ensureClickHouseTable();
    await clickHouseRequest(
      `INSERT INTO ${quoteIdentifier(CLICKHOUSE_TABLE)} FORMAT JSONEachRow`,
      rows
        .map((row) =>
          JSON.stringify({
            event_id: row.eventId ?? 0,
            created_at: clickHouseDate(row.createdAt),
            link_id: row.linkId,
            ip_address: row.ipAddress,
            user_agent: row.userAgent,
            referer: row.referer,
            metadata_json: JSON.stringify(row.metadata),
          }),
        )
        .join('\n'),
    );
  } catch (error) {
    console.error('Could not write click analytics to ClickHouse.', error);
  }
}

export async function countClickAnalyticsEvents(input: {
  linkId: number;
  search?: ClickAnalyticsSearch;
}) {
  await ensureClickHouseTable();
  const rows = await clickHouseSelect<ClickHouseCountRow>(`
    SELECT count() AS count
    FROM ${quoteIdentifier(CLICKHOUSE_TABLE)}
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
    FROM ${quoteIdentifier(CLICKHOUSE_TABLE)}
    WHERE ${clickHouseWhere(input)}
    ORDER BY created_at DESC
    ${limitOffsetClause(input)}
  `);
  return rows.map(clickHouseEvent);
}
