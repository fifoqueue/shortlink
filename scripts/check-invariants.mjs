import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// Use an explicitly supplied empty test database. Never load the application's .env.
assert.ok(
  process.env.TEST_DATABASE_URL,
  'Set TEST_DATABASE_URL to an empty disposable PostgreSQL database.',
);
const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
assert.match(
  databaseUrl.pathname,
  /test/i,
  'The database name must contain "test".',
);
if (process.argv.includes('--clickhouse')) {
  assert.ok(
    process.env.TEST_CLICKHOUSE_URL,
    'Set TEST_CLICKHOUSE_URL to a disposable ClickHouse server.',
  );
}
await mkdir('.codex', { recursive: true });
const output = await mkdtemp(path.resolve('.codex/invariants-'));
Object.assign(process.env, {
  DATABASE_URL: databaseUrl.toString(),
  DATABASE_SYNC_ALTER: 'false',
  DATABASE_POOL_MAX: '10',
  REDIS_URL: '',
  ANALYTICS_CLICKHOUSE_URL: process.argv.includes('--clickhouse')
    ? process.env.TEST_CLICKHOUSE_URL || ''
    : '',
  ANALYTICS_CLICKHOUSE_DATABASE: 'shortlink_test',
  ANALYTICS_CLICKHOUSE_TABLE: 'shortlink_click_events',
  ANALYTICS_CLICKHOUSE_USERNAME: 'shortlink',
  ANALYTICS_CLICKHOUSE_PASSWORD: 'shortlink-test',
  ANALYTICS_CLICKHOUSE_AUTO_CREATE: 'true',
  USER_PLUGIN_DIR: path.join(output, 'plugins'),
  USER_PLUGIN_WATCH: 'false',
  PRIVATE_BASE_URL: 'https://invariants.example.test',
  ORIGIN: 'https://invariants.example.test',
  AUTH_SESSION_SECRET: 'isolated-invariant-check-secret',
  CLICK_QUEUE_SHUTDOWN_DRAIN_MS: '0',
});
try {
  await build({
    configFile: false,
    envDir: false,
    logLevel: 'warn',
    resolve: {
      alias: {
        $lib: path.resolve('src/lib'),
        $plugins: path.resolve('src/plugins'),
      },
    },
    plugins: [
      {
        name: 'invariant-test-environment',
        resolveId(id) {
          if (id === '$env/dynamic/private') return '\0test-env';
          if (id === '$app/environment') return '\0test-app-env';
        },
        load(id) {
          if (id === '\0test-env') return 'export const env = process.env;';
          if (id === '\0test-app-env') return 'export const building = false;';
        },
      },
    ],
    build: {
      ssr: path.resolve(
        process.argv.includes('--benchmark')
          ? 'scripts/benchmark.ts'
          : process.argv.includes('--clickhouse')
            ? 'scripts/check-clickhouse.ts'
            : 'scripts/invariants.ts',
      ),
      outDir: output,
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: 'invariants.mjs' } },
    },
  });
  await import(pathToFileURL(path.join(output, 'invariants.mjs')).href);
} finally {
  await rm(output, { recursive: true, force: true });
}
