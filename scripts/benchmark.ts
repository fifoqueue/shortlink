import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Op } from 'sequelize';
import {
  ensureDatabase,
  getDatabase,
  closeDatabase,
  UserModel,
  ShortLinkModel,
  ClickEventModel,
  ClickEventQueueModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
} from '$lib/server/database';
import {
  getSettings,
  updateSettings,
  setPluginStateNormalizer,
} from '$lib/server/settings';
import { effectivePermissions } from '$lib/server/permissions';
import { enqueueClick, processClickQueue } from '$lib/server/click-queue';
import { runServerShutdownTasks } from '$lib/server/shutdown';
import { normalizePluginStates } from '$plugins/server';

setPluginStateNormalizer(normalizePluginStates);
await runServerShutdownTasks('manual-benchmark-workers');
await ensureDatabase();
const database = getDatabase();
const suffix = randomUUID();
const users = await UserModel.bulkCreate(
  Array.from({ length: 50 }, (_, index) => ({
    email: `${suffix}-${index}@example.test`,
    name: 'Benchmark',
    passwordHash: '',
  })),
);
const groups = await PermissionGroupModel.bulkCreate(
  Array.from({ length: 40 }, (_, index) => ({ name: `${suffix}-${index}` })),
);
await PermissionGroupUserModel.bulkCreate(
  groups.flatMap((group) =>
    users.map((user) => ({
      groupId: group.id,
      userId: user.id,
      expiresAt: null,
    })),
  ),
);
const links = await ShortLinkModel.bulkCreate(
  Array.from({ length: 10 }, (_, index) => ({
    domain: 'performance.example.test',
    code: `${suffix}-${index}`,
    url: 'https://example.test/',
  })),
);
await updateSettings((settings) => {
  settings.links.trackClicks = true;
});
const settings = await getSettings();
let statements = 0;
const previousLogging = database.options.logging;
database.options.logging = () => {
  statements += 1;
};
const results: Array<Record<string, string | number>> = [];
async function measure(
  name: string,
  operations: number,
  run: () => Promise<void>,
  prepare?: () => Promise<void>,
) {
  const samples: Array<{ ms: number; sql: number }> = [];
  for (let sample = 0; sample < 3; sample += 1) {
    await prepare?.();
    const before = statements;
    const start = performance.now();
    await run();
    samples.push({ ms: performance.now() - start, sql: statements - before });
  }
  samples.sort((a, b) => a.ms - b.ms);
  const median = samples[1];
  results.push({
    name,
    operations,
    ms: Number(median.ms.toFixed(2)),
    sql: median.sql,
    operationsPerSecond: Math.round((operations * 1000) / median.ms),
  });
}
const clearClicks = async () => {
  await ClickEventQueueModel.destroy({
    where: { linkId: { [Op.in]: links.map((link) => link.id) } },
  });
  await ClickEventModel.destroy({
    where: { linkId: { [Op.in]: links.map((link) => link.id) } },
  });
};
try {
  await measure('settings-read', 100, async () => {
    for (let index = 0; index < 100; index += 1) await getSettings();
  });
  await measure('permissions-40-groups-2000-memberships', 30, async () => {
    for (let index = 0; index < 30; index += 1) {
      await effectivePermissions({
        settings,
        user: null,
        isAdmin: false,
        ip: '203.0.113.12',
      });
    }
  });
  await measure(
    'durable-enqueue-concurrency-10',
    100,
    async () => {
      for (let offset = 0; offset < 100; offset += 10) {
        const accepted = await Promise.all(
          links.map((link) =>
            enqueueClick({
              linkId: link.id,
              request: new Request('https://performance.example.test/'),
              getClientAddress: () => '203.0.113.12',
              settings,
            }),
          ),
        );
        assert.ok(accepted.every((result) => result === 'accepted'));
      }
    },
    clearClicks,
  );
  await measure(
    'durable-drain',
    300,
    async () => {
      await processClickQueue();
      assert.equal(
        await ClickEventQueueModel.count({
          where: { linkId: { [Op.in]: links.map((link) => link.id) } },
        }),
        0,
      );
      assert.equal(
        await ClickEventModel.count({
          where: { linkId: { [Op.in]: links.map((link) => link.id) } },
        }),
        300,
      );
    },
    async () => {
      await clearClicks();
      await ClickEventQueueModel.bulkCreate(
        Array.from({ length: 300 }, (_, index) => ({
          linkId: links[index % links.length].id,
          requestUrl: 'https://performance.example.test/',
          pluginStates: settings.plugins,
          ipAddress: '203.0.113.12',
          userAgent: null,
          referer: null,
          lastError: null,
        })),
      );
    },
  );
  console.log(JSON.stringify({ samples: 3, pool: 10, results }, null, 2));
} finally {
  database.options.logging = previousLogging;
  await clearClicks();
  await ShortLinkModel.destroy({ where: { id: links.map((link) => link.id) } });
  await PermissionGroupModel.destroy({
    where: { id: groups.map((group) => group.id) },
  });
  await UserModel.destroy({ where: { id: users.map((user) => user.id) } });
  await closeDatabase();
}
