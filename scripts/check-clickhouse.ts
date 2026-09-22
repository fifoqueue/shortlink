import { closeDatabase, ensureDatabase } from '$lib/server/database';
import { runServerShutdownTasks } from '$lib/server/shutdown';
import { setPluginStateNormalizer } from '$lib/server/settings';
import { normalizePluginStates } from '$plugins/server';
import { checkClickHouse } from './invariants-clickhouse';

setPluginStateNormalizer(normalizePluginStates);
try {
  await runServerShutdownTasks('manual-clickhouse-workers');
  await ensureDatabase();
  await checkClickHouse();
} finally {
  await runServerShutdownTasks('clickhouse-check-complete');
  await closeDatabase();
}
