import pg from 'pg';

const { Client } = pg;
const env = process.env;

function requiredEnv(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numberEnv(name, fallback, min, max) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ClickHouse identifier "${value}".`);
  }
  return `\`${value}\``;
}

function clickHouseUrl(query) {
  const url = new URL(requiredEnv('ANALYTICS_CLICKHOUSE_URL'));
  const database = env.ANALYTICS_CLICKHOUSE_DATABASE?.trim();
  if (database) url.searchParams.set('database', database);
  url.searchParams.set('query', query);
  return url;
}

function clickHouseHeaders() {
  const headers = {};
  const username = env.ANALYTICS_CLICKHOUSE_USERNAME?.trim();
  const password = env.ANALYTICS_CLICKHOUSE_PASSWORD ?? '';
  if (username) {
    headers.authorization = `Basic ${Buffer.from(
      `${username}:${password}`,
    ).toString('base64')}`;
  }
  return headers;
}

async function clickHouseRequest(query, body) {
  const response = await fetch(clickHouseUrl(query), {
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

async function clickHouseSelect(query) {
  const text = await clickHouseRequest(`${query}\nFORMAT JSONEachRow`);
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function clickHouseDate(value) {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}

async function ensureClickHouseTable(table) {
  if (env.ANALYTICS_CLICKHOUSE_AUTO_CREATE === 'false') return;
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

async function existingClickHouseEventIds(table, ids) {
  if (ids.length === 0) return new Set();
  const rows = await clickHouseSelect(`
    SELECT event_id
    FROM ${quoteIdentifier(table)}
    WHERE event_id IN (${ids.map((id) => Number(id)).join(',')})
  `);
  return new Set(rows.map((row) => String(row.event_id)));
}

async function insertClickHouseRows(table, rows) {
  if (rows.length === 0) return;
  await clickHouseRequest(
    `INSERT INTO ${quoteIdentifier(table)} FORMAT JSONEachRow`,
    rows
      .map((row) =>
        JSON.stringify({
          event_id: Number(row.id),
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
  const batchSize = numberEnv(
    'CLICKHOUSE_BACKFILL_BATCH_SIZE',
    10_000,
    1,
    100_000,
  );
  let lastId = env.CLICKHOUSE_BACKFILL_START_ID?.trim() || '0';
  const endId = env.CLICKHOUSE_BACKFILL_END_ID?.trim() || '';
  const endIdValue = endId ? Number(endId) : 0;
  let total = 0;
  let scanned = 0;
  let skipped = 0;

  await ensureClickHouseTable(table);
  if (env.CLICKHOUSE_BACKFILL_TRUNCATE === 'true') {
    await clickHouseRequest(`TRUNCATE TABLE ${quoteIdentifier(table)}`);
  }

  const client = new Client({
    connectionString: requiredEnv('DATABASE_URL'),
    ssl:
      env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
  });

  await client.connect();
  try {
    for (;;) {
      const params = [lastId, batchSize];
      const filters = ['id > $1'];
      if (Number.isFinite(endIdValue) && endIdValue > 0) {
        params.push(endIdValue);
        filters.push(`id <= $${params.length}`);
      }

      const result = await client.query(
        `
          SELECT
            id,
            link_id,
            created_at,
            ip_address,
            user_agent,
            referer,
            metadata
          FROM click_events
          WHERE ${filters.join(' AND ')}
          ORDER BY id ASC
          LIMIT $2
        `,
        params,
      );

      if (result.rows.length === 0) break;
      scanned += result.rows.length;
      const existingIds = await existingClickHouseEventIds(
        table,
        result.rows.map((row) => row.id),
      );
      const missingRows = result.rows.filter(
        (row) => !existingIds.has(String(row.id)),
      );
      await insertClickHouseRows(table, missingRows);
      lastId = String(result.rows.at(-1).id);
      total += missingRows.length;
      skipped += result.rows.length - missingRows.length;
      console.log(
        `Scanned ${scanned}; inserted ${total}; skipped ${skipped}; last id ${lastId}.`,
      );
    }
  } finally {
    await client.end();
  }

  console.log(
    `ClickHouse backfill complete. Scanned ${scanned}; inserted ${total}; skipped ${skipped}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
