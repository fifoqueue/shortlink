import { Sequelize, QueryTypes } from 'sequelize';

const env = process.env;
const MAX_POSTGRES_ID = 9_223_372_036_854_775_807n;

function requiredEnv(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numberEnv(name, fallback, min, max) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function eventId(value, name = 'event_id') {
  const text = String(value);
  if (
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^\d+$/.test(text)
  ) {
    throw new Error(
      `${name} must be a non-negative PostgreSQL bigint decimal string.`,
    );
  }
  const id = BigInt(text);
  if (id > MAX_POSTGRES_ID)
    throw new Error(`${name} exceeds the PostgreSQL bigint range.`);
  return id.toString();
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ClickHouse identifier "${value}".`);
  }
  return `\`${value}\``;
}

function clickHouseUrl(query) {
  const url = new URL(requiredEnv('ANALYTICS_CLICKHOUSE_URL'));
  url.username = '';
  url.password = '';
  const database = env.ANALYTICS_CLICKHOUSE_DATABASE?.trim();
  if (database) url.searchParams.set('database', database);
  url.searchParams.set('query', query);
  url.searchParams.set('wait_end_of_query', '1');
  url.searchParams.set('async_insert', '0');
  url.searchParams.set('wait_for_async_insert', '1');
  url.searchParams.set('output_format_json_quote_64bit_integers', '1');
  url.searchParams.set('input_format_allow_errors_num', '0');
  url.searchParams.set('input_format_allow_errors_ratio', '0');
  url.searchParams.set('input_format_skip_unknown_fields', '0');
  return url;
}

function clickHouseHeaders() {
  const url = new URL(requiredEnv('ANALYTICS_CLICKHOUSE_URL'));
  const password =
    env.ANALYTICS_CLICKHOUSE_PASSWORD ?? decodeURIComponent(url.password);
  const username =
    env.ANALYTICS_CLICKHOUSE_USERNAME?.trim() ||
    decodeURIComponent(url.username) ||
    (password ? 'default' : '');
  return username
    ? {
        authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      }
    : {};
}

async function clickHouseRequest(query, body) {
  const url = clickHouseUrl(query);
  // Large recovery ID lists must not exceed ClickHouse's HTTP URL limit.
  if (body === undefined) url.searchParams.delete('query');
  const response = await fetch(url, {
    method: 'POST',
    headers: clickHouseHeaders(),
    body: body ?? query,
    signal: AbortSignal.timeout(
      numberEnv('ANALYTICS_CLICKHOUSE_TIMEOUT_MS', 10_000, 100, 120_000),
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

async function clickHouseSelect(query) {
  const text = await clickHouseRequest(`${query}\nFORMAT JSONEachRow`);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function clickHouseDate(value) {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}

async function ensureClickHouseTable(table) {
  if (env.ANALYTICS_CLICKHOUSE_AUTO_CREATE !== 'false') {
    await clickHouseRequest(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)}
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
  // CREATE IF NOT EXISTS does not upgrade a pre-existing incompatible table.
  const tables = await clickHouseSelect(`
    SELECT engine, sorting_key, partition_key FROM system.tables
    WHERE database = currentDatabase() AND name = '${table}'
  `);
  const actual = tables[0];
  const key = actual?.sorting_key
    ?.replace(/\s+/g, '')
    .replace(/^tuple\((.*)\)$/, '$1')
    .replace(/^\((.*)\)$/, '$1');
  if (
    !actual ||
    !/^(?:Replicated|Shared)?ReplacingMergeTree$/.test(actual.engine) ||
    key !== 'link_id,event_id,created_at' ||
    actual.partition_key.replace(/\s+/g, '') !== 'toYYYYMM(created_at)'
  ) {
    throw new Error(
      `ClickHouse table ${table} must use ReplacingMergeTree, ORDER BY (link_id, event_id, created_at), and PARTITION BY toYYYYMM(created_at). Migrate the existing table or choose a new table name; no data was removed.`,
    );
  }
  const columns = await clickHouseSelect(`
    SELECT name, type FROM system.columns
    WHERE database = currentDatabase() AND table = '${table}'
  `);
  const types = new Map(
    columns.map((column) => [column.name, column.type.replace(/\s+/g, '')]),
  );
  for (const [column, expected] of Object.entries({
    event_id: 'UInt64',
    created_at: "DateTime64(3,'UTC')",
    link_id: 'UInt32',
    ip_address: 'Nullable(String)',
    user_agent: 'Nullable(String)',
    referer: 'Nullable(String)',
    metadata_json: 'String',
  })) {
    if (types.get(column) !== expected)
      throw new Error(
        `ClickHouse column ${table}.${column} must have type ${expected}; migrate the table before backfilling.`,
      );
  }
}

function rowKey(row) {
  return `${eventId(row.id)}:${row.link_id}:${new Date(row.created_at).getTime()}`;
}

async function existingClickHouseKeys(table, rows) {
  if (rows.length === 0) return new Set();
  const existing = await clickHouseSelect(`
    SELECT toString(event_id) AS event_id, link_id,
      toString(toUnixTimestamp64Milli(created_at)) AS created_at_ms
    FROM ${quoteIdentifier(table)}
    WHERE event_id IN (${rows.map((row) => eventId(row.id)).join(',')})
  `);
  return new Set(
    existing.map(
      (row) => `${eventId(row.event_id)}:${row.link_id}:${row.created_at_ms}`,
    ),
  );
}

async function insertClickHouseRows(table, rows) {
  if (rows.length === 0) return;
  await clickHouseRequest(
    `INSERT INTO ${quoteIdentifier(table)} FORMAT JSONEachRow`,
    rows
      .map((row) =>
        JSON.stringify({
          event_id: eventId(row.id),
          created_at: clickHouseDate(row.created_at),
          link_id: Number(row.link_id),
          ip_address: row.ip_address,
          user_agent: row.user_agent,
          referer: row.referer,
          metadata_json: JSON.stringify(row.metadata ?? {}),
        }),
      )
      .join('\n'),
  );
}

async function main() {
  const table =
    env.ANALYTICS_CLICKHOUSE_TABLE?.trim() || 'shortlink_click_events';
  quoteIdentifier(table);
  const batchSize = numberEnv(
    'CLICKHOUSE_BACKFILL_BATCH_SIZE',
    10_000,
    1,
    100_000,
  );
  let lastId = eventId(
    env.CLICKHOUSE_BACKFILL_START_ID?.trim() || '0',
    'CLICKHOUSE_BACKFILL_START_ID',
  );
  const endId = env.CLICKHOUSE_BACKFILL_END_ID?.trim()
    ? eventId(
        env.CLICKHOUSE_BACKFILL_END_ID.trim(),
        'CLICKHOUSE_BACKFILL_END_ID',
      )
    : null;
  if (endId !== null && BigInt(endId) <= BigInt(lastId)) {
    throw new Error(
      'CLICKHOUSE_BACKFILL_END_ID must be greater than the exclusive START_ID.',
    );
  }
  if (
    env.CLICKHOUSE_BACKFILL_TRUNCATE === 'true' &&
    (lastId !== '0' || endId !== null)
  ) {
    throw new Error(
      'CLICKHOUSE_BACKFILL_TRUNCATE requires a full backfill: START_ID=0 and no END_ID.',
    );
  }
  const database = new Sequelize(requiredEnv('DATABASE_URL'), {
    dialect: 'postgres',
    logging: false,
    pool: { max: 1, min: 0 },
    dialectOptions:
      env.DATABASE_SSL === 'true'
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
  });
  let total = 0;
  let scanned = 0;
  let skipped = 0;
  try {
    await database.authenticate();
    // Validate the source schema before any optional destructive mirror operation.
    await database.query(
      'SELECT id, link_id, created_at, ip_address, user_agent, referer, metadata FROM click_events LIMIT 0',
    );
    const [ackColumn] = await database.query(
      `
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'click_events'
        AND column_name = 'clickhouse_synced_at') AS present
    `,
      { type: QueryTypes.SELECT },
    );
    await ensureClickHouseTable(table);
    if (env.CLICKHOUSE_BACKFILL_TRUNCATE === 'true') {
      // Reset before truncation so an interrupted rebuild remains retryable.
      if (ackColumn.present) {
        await database.query(
          'UPDATE click_events SET clickhouse_synced_at = NULL WHERE clickhouse_synced_at IS NOT NULL',
        );
      }
      await clickHouseRequest(`TRUNCATE TABLE ${quoteIdentifier(table)}`);
    }
    for (;;) {
      const params = [lastId, batchSize];
      const filters = ['id > $1'];
      if (endId !== null) {
        params.push(endId);
        filters.push('id <= $3');
      }
      const rows = await database.query(
        `
        SELECT id, link_id, created_at, ip_address, user_agent, referer, metadata
        FROM click_events WHERE ${filters.join(' AND ')} ORDER BY id ASC LIMIT $2
      `,
        { bind: params, type: QueryTypes.SELECT },
      );
      if (rows.length === 0) break;
      scanned += rows.length;
      const existingKeys = await existingClickHouseKeys(table, rows);
      const missingRows = rows.filter((row) => !existingKeys.has(rowKey(row)));
      await insertClickHouseRows(table, missingRows);
      if (ackColumn.present) {
        await database.query(
          `
          UPDATE click_events SET clickhouse_synced_at = NOW()
          WHERE id = ANY(CAST($1 AS bigint[])) AND clickhouse_synced_at IS NULL
        `,
          { bind: [rows.map((row) => eventId(row.id))] },
        );
      }
      lastId = eventId(rows.at(-1).id);
      total += missingRows.length;
      skipped += rows.length - missingRows.length;
      console.log(
        `Scanned ${scanned}; inserted ${total}; skipped ${skipped}; last id ${lastId}.`,
      );
    }
  } finally {
    await database.close();
  }
  console.log(
    `ClickHouse backfill complete. Scanned ${scanned}; inserted ${total}; skipped ${skipped}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
