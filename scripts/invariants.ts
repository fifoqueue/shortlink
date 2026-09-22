import assert from 'node:assert/strict';
import { closeDatabase, ensureDatabase, UserModel } from '$lib/server/database';
import { setPluginStateNormalizer } from '$lib/server/settings';
import { normalizePluginStates } from '$plugins/server';
import { runServerShutdownTasks } from '$lib/server/shutdown';
import { checkAccounts } from './invariants-accounts';
import { checkOAuth } from './invariants-oauth';
import { checkPermissions } from './invariants-permissions';
import { checkRateLimit, checkRecoveryLimits } from './invariants-rate-limit';
import { checkSettings } from './invariants-settings';
import { checkLinks } from './invariants-links';

setPluginStateNormalizer(normalizePluginStates);
try {
  // Exercise workers explicitly so background drains cannot consume failure fixtures.
  await runServerShutdownTasks('manual-invariant-workers');
  await ensureDatabase();
  assert.equal(await UserModel.count(), 0, 'Use an empty test database.');
  await checkAccounts();
  await checkOAuth();
  await checkSettings();
  await checkPermissions();
  await checkRateLimit();
  await checkRecoveryLimits();
  await checkLinks();
  console.log('All transaction and concurrency invariants passed.');
} finally {
  await runServerShutdownTasks('invariant-check');
  await closeDatabase();
}
