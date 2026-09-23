import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Sequelize, QueryTypes } from 'sequelize';
import clickMigration from '../src/lib/server/migrations/011-durable-click-reservations.migration';
import { columnExists } from '../src/lib/server/migrations/helpers';
import {
  ClickEventModel,
  ClickEventQueueModel,
  LinkAccessGrantModel,
  getDatabase,
  LinkAccessShareModel,
  ShortLinkModel,
  UserModel,
} from '../src/lib/server/database';
import { getSettings } from '../src/lib/server/settings';
import {
  createLink,
  listLinksPage,
  updateLink,
  deleteLinks,
  getRedirectLinkByCode,
} from '../src/lib/server/shortener';
import {
  acceptLinkShareInvite,
  cancelLinkShare,
  rotateLinkShareToken,
  saveLinkShare,
  revokeLinkShareGrant,
} from '../src/lib/server/link-sharing';
import { enqueueClick, processClickQueue } from '../src/lib/server/click-queue';

export async function checkLinks() {
  const settings = structuredClone(await getSettings());
  settings.links.trackClicks = true;
  const domain = 'invariants.example';
  const owner = await UserModel.create({
    email: `${randomUUID()}@example.test`,
    name: 'Owner',
    passwordHash: '',
  });
  const recipient = await UserModel.create({
    email: `${randomUUID()}@example.test`,
    name: 'Recipient',
    passwordHash: '',
  });
  const create = (maxClicks = 0) =>
    createLink(
      'https://example.com/',
      randomUUID().replaceAll('-', '').slice(0, 12),
      {
        domain,
        isAdmin: true,
        owner: { userId: owner.id },
        linkSettings: settings.links,
        operations: { maxClicks },
      },
    );
  const guest = { sessionId: randomUUID(), ipHash: 'shared-network' };
  const neighbor = { sessionId: randomUUID(), ipHash: guest.ipHash };
  const privateLink = await createLink(
    'https://example.com/private',
    randomUUID().replaceAll('-', '').slice(0, 12),
    {
      domain,
      isAdmin: true,
      owner: guest,
      linkSettings: settings.links,
    },
  );
  const neighborList = await listLinksPage(1, 25, neighbor);
  assert.equal(
    neighborList.items.some((link) => link.id === privateLink.id),
    false,
    'Shared IP must not expose another browser links',
  );
  const deniedEdit = await updateLink(
    privateLink.code,
    { url: 'https://example.com/changed' },
    { domain, owner: neighbor, linkSettings: settings.links },
  );
  assert.equal(
    deniedEdit.status,
    'denied',
    'Shared IP must not authorize edits',
  );
  const quotaLink = await create(3);
  const enqueue = (linkId: number, trackClicks = true) =>
    enqueueClick({
      linkId,
      request: new Request(`https://${domain}/test`, {
        headers: { cookie: 'private', authorization: 'Bearer private' },
      }),
      getClientAddress: () => '127.0.0.1',
      settings: { ...settings, links: { ...settings.links, trackClicks } },
    });
  const results = await Promise.all(
    Array.from({ length: 12 }, () => enqueue(quotaLink.id)),
  );
  assert.equal(
    results.filter((value) => value === 'accepted').length,
    3,
    'last quota slots are reserved once',
  );
  assert.equal(results.filter((value) => value === 'maxClicks').length, 9);
  assert.equal(
    Number((await ShortLinkModel.findByPk(quotaLink.id))?.redirectCount),
    3,
  );
  await Promise.all([processClickQueue(), processClickQueue()]);
  assert.equal(
    await ClickEventModel.count({ where: { linkId: quotaLink.id } }),
    3,
    'concurrent workers do not duplicate clicks',
  );
  assert.equal(
    await ClickEventQueueModel.count({ where: { linkId: quotaLink.id } }),
    0,
  );

  const noTracking = await create(1);
  assert.deepEqual(
    await Promise.all([
      enqueue(noTracking.id, false),
      enqueue(noTracking.id, false),
    ]).then((values) => values.sort()),
    ['accepted', 'maxClicks'],
  );
  assert.equal(
    await ClickEventQueueModel.count({ where: { linkId: noTracking.id } }),
    0,
  );
  assert.equal(
    await ClickEventModel.count({ where: { linkId: noTracking.id } }),
    0,
    'disabled tracking stores no visitor event',
  );

  const rolledBack = await create(1);
  ClickEventQueueModel.addHook('beforeCreate', 'reject-invariant-click', () => {
    throw new Error('injected queue failure');
  });
  try {
    await assert.rejects(enqueue(rolledBack.id), /injected queue failure/);
  } finally {
    ClickEventQueueModel.removeHook('beforeCreate', 'reject-invariant-click');
  }
  assert.equal(
    Number((await ShortLinkModel.findByPk(rolledBack.id))?.redirectCount),
    0,
    'failed enqueue rolls back quota',
  );
  assert.equal(await enqueue(rolledBack.id), 'accepted');

  ClickEventQueueModel.addHook(
    'beforeBulkDestroy',
    'reject-invariant-consume',
    () => {
      throw new Error('injected consume failure');
    },
  );
  try {
    await processClickQueue();
  } finally {
    ClickEventQueueModel.removeHook(
      'beforeBulkDestroy',
      'reject-invariant-consume',
    );
  }
  assert.equal(
    await ClickEventModel.count({ where: { linkId: rolledBack.id } }),
    0,
    'failed queue deletion rolls back event insert',
  );
  const pending = await ClickEventQueueModel.findOne({
    where: { linkId: rolledBack.id },
  });
  assert(pending, 'failed consumption preserves durable queue row');
  assert.equal(pending.requestHeaders.cookie, undefined);
  assert.equal(pending.requestHeaders.authorization, undefined);
  await pending.update({ nextAttemptAt: new Date(0) });
  await processClickQueue();
  assert.equal(
    await ClickEventModel.count({ where: { linkId: rolledBack.id } }),
    1,
  );

  const healthyBatchLink = await create();
  const poisonedBatchLink = await create();
  await enqueue(healthyBatchLink.id);
  await enqueue(poisonedBatchLink.id);
  ClickEventModel.addHook(
    'beforeBulkCreate',
    'reject-one-batch-event',
    (rows) => {
      if (rows.some((row) => row.linkId === poisonedBatchLink.id)) {
        throw new Error('injected malformed batch event');
      }
    },
  );
  try {
    await processClickQueue();
  } finally {
    ClickEventModel.removeHook('beforeBulkCreate', 'reject-one-batch-event');
  }
  assert.equal(
    await ClickEventModel.count({ where: { linkId: healthyBatchLink.id } }),
    1,
    'one malformed event does not block healthy batch siblings',
  );
  assert.equal(
    await ClickEventModel.count({ where: { linkId: poisonedBatchLink.id } }),
    0,
  );
  const poisoned = await ClickEventQueueModel.findOne({
    where: { linkId: poisonedBatchLink.id },
  });
  assert(poisoned, 'failed event remains durable for retry');
  await poisoned.update({ nextAttemptAt: new Date(0) });
  await processClickQueue();
  assert.equal(
    await ClickEventModel.count({ where: { linkId: poisonedBatchLink.id } }),
    1,
  );

  const collisionLink = await create();
  const existingClick = await ClickEventModel.findOne({
    where: { linkId: quotaLink.id },
  });
  assert(existingClick);
  await enqueue(collisionLink.id);
  ClickEventModel.addHook(
    'beforeBulkCreate',
    'force-unrelated-primary-conflict',
    (rows) => {
      for (const row of rows) {
        if (row.linkId === collisionLink.id) row.id = existingClick.id;
      }
    },
  );
  try {
    await processClickQueue();
  } finally {
    ClickEventModel.removeHook(
      'beforeBulkCreate',
      'force-unrelated-primary-conflict',
    );
  }
  assert.equal(
    await ClickEventModel.count({ where: { linkId: collisionLink.id } }),
    0,
  );
  const collisionPending = await ClickEventQueueModel.findOne({
    where: { linkId: collisionLink.id },
  });
  assert(
    collisionPending,
    'an unrelated unique conflict must not acknowledge an unpersisted click',
  );
  await collisionPending.update({ nextAttemptAt: new Date(0) });
  await processClickQueue();
  assert.equal(
    await ClickEventModel.count({ where: { linkId: collisionLink.id } }),
    1,
  );

  const busyLink = await create();
  const laterLink = await create();
  const rawBatchSize = process.env.CLICK_QUEUE_DB_BATCH_SIZE?.trim();
  const configuredBatchSize = rawBatchSize ? Number(rawBatchSize) : NaN;
  const batchSize = Number.isFinite(configuredBatchSize)
    ? Math.max(1, Math.min(5_000, Math.trunc(configuredBatchSize)))
    : 250;
  await ShortLinkModel.update(
    { redirectCount: batchSize },
    { where: { id: busyLink.id } },
  );
  await ClickEventQueueModel.bulkCreate(
    Array.from({ length: batchSize }, () => ({
      linkId: busyLink.id,
      requestUrl: `https://${domain}/busy`,
      ipAddress: null,
      userAgent: null,
      referer: null,
      lastError: null,
    })),
  );
  await enqueue(laterLink.id);
  const blocker = await getDatabase().transaction();
  try {
    await ShortLinkModel.findByPk(busyLink.id, {
      transaction: blocker,
      lock: blocker.LOCK.UPDATE,
    });
    await processClickQueue();
    assert.equal(
      await ClickEventModel.count({ where: { linkId: laterLink.id } }),
      1,
      'a locked prefix spanning the entire batch must not starve an unlocked later link',
    );
    assert.equal(
      await ClickEventQueueModel.count({ where: { linkId: busyLink.id } }),
      batchSize,
    );
  } finally {
    await blocker.rollback();
  }
  await processClickQueue();
  assert.equal(
    await ClickEventModel.count({ where: { linkId: busyLink.id } }),
    batchSize,
  );

  const concurrent = await create();
  assert.equal(
    (await getRedirectLinkByCode(concurrent.code, domain))?.smart
      .passwordProtected,
    false,
  );
  await updateLink(
    concurrent.code,
    { operations: { password: 'invariant-password' } },
    {
      domain,
      isAdmin: true,
      partial: true,
      linkSettings: settings.links,
    },
  );
  assert.equal(
    (await getRedirectLinkByCode(concurrent.code, domain))?.smart
      .passwordProtected,
    true,
    'redirect reads cannot retain stale password policy',
  );
  const shares = await Promise.all(
    Array.from({ length: 4 }, () =>
      saveLinkShare({
        linkId: concurrent.id,
        createdByUserId: owner.id,
        canViewStats: true,
        editableFields: ['url'],
      }),
    ),
  );
  assert.equal(
    new Set(shares.map((share) => share.id)).size,
    1,
    'first-share creation is serialized',
  );
  assert.equal(
    await LinkAccessShareModel.count({ where: { linkId: concurrent.id } }),
    1,
  );
  const token = shares[0].token;
  const accepted = await Promise.all(
    Array.from({ length: 4 }, () =>
      acceptLinkShareInvite({ token, userId: recipient.id }),
    ),
  );
  assert(accepted.every((result) => result.status === 'accepted'));
  const grants = await LinkAccessGrantModel.findAll({
    where: { linkId: concurrent.id, userId: recipient.id },
  });
  assert.equal(
    grants.length,
    1,
    'concurrent invite acceptance creates one grant',
  );
  await rotateLinkShareToken(concurrent.id);
  assert.equal(
    (await acceptLinkShareInvite({ token, userId: recipient.id })).status,
    'not_found',
  );
  const current = await LinkAccessShareModel.findOne({
    where: { linkId: concurrent.id },
  });
  assert(current);
  await cancelLinkShare(concurrent.id);
  assert.equal(
    (
      await acceptLinkShareInvite({
        token: current.token,
        userId: recipient.id,
      })
    ).status,
    'expired',
  );
  await revokeLinkShareGrant({ linkId: concurrent.id, grantId: grants[0].id });
  assert.equal(
    (
      await updateLink(
        concurrent.code,
        { url: 'https://example.org/' },
        {
          domain,
          sharedUserId: recipient.id,
          partial: true,
          linkSettings: settings.links,
        },
      )
    ).status,
    'denied',
  );

  const updated = await Promise.all([
    updateLink(
      concurrent.code,
      { operations: { utmSource: 'source' } },
      { domain, isAdmin: true, partial: true, linkSettings: settings.links },
    ),
    updateLink(
      concurrent.code,
      { operations: { utmMedium: 'medium' } },
      { domain, isAdmin: true, partial: true, linkSettings: settings.links },
    ),
  ]);
  assert(updated.every((result) => result.status === 'updated'));
  const url = new URL((await ShortLinkModel.findByPk(concurrent.id))!.url);
  assert.equal(
    url.searchParams.get('utm_source'),
    'source',
    'parallel partial updates preserve sibling fields',
  );
  assert.equal(url.searchParams.get('utm_medium'), 'medium');
  const deletion = await deleteLinks([{ code: quotaLink.code, domain }], {
    owner: { userId: owner.id },
    allowUserDelete: true,
    maxClicks: 2,
  });
  assert.equal(deletion.tooManyClicks, 1, 'delete limit sees reserved clicks');
  await checkClickMigration();
  console.log(
    'links: quota races, enqueue/consume rollback, worker deduplication, shares, partial updates, migration upgrade passed',
  );
}

async function checkClickMigration() {
  // The runner requires a disposable TEST_DATABASE_URL; isolate DDL from live test workers too.
  const schema = `invariant_${randomUUID().replaceAll('-', '')}`;
  await getDatabase().query(`CREATE SCHEMA "${schema}"`);
  const fixture = new Sequelize(process.env.TEST_DATABASE_URL!, {
    logging: false,
    schema,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  try {
    await fixture.query(`
      CREATE TABLE short_links (id integer PRIMARY KEY);
      CREATE TABLE click_events (id bigserial PRIMARY KEY, link_id integer NOT NULL, queue_id bigint);
      CREATE TABLE click_event_queue (id bigint PRIMARY KEY, link_id integer NOT NULL);
      INSERT INTO short_links VALUES (1);
      INSERT INTO click_events (link_id, queue_id) VALUES (1, 10), (1, NULL);
      INSERT INTO click_event_queue VALUES (10, 1), (11, 1);
    `);
    assert.equal(await clickMigration.shouldRun(fixture), true);
    await clickMigration.up(fixture);
    const count = async () => {
      const rows = await fixture.query<{ count: string }>(
        'SELECT redirect_count AS count FROM short_links WHERE id = 1',
        { type: QueryTypes.SELECT },
      );
      return Number(rows[0].count);
    };
    assert.equal(
      await count(),
      3,
      'migration counts events and only unconsumed pending rows',
    );
    assert.equal(await clickMigration.shouldRun(fixture), false);
    await fixture.query('UPDATE short_links SET redirect_count = 4');
    await clickMigration.up(fixture);
    assert.equal(
      await count(),
      4,
      'rerunning migration preserves live reservations',
    );

    await fixture.query(
      'ALTER TABLE short_links DROP COLUMN redirect_count; ALTER TABLE click_events DROP COLUMN queue_id',
    );
    await assert.rejects(clickMigration.up(fixture));
    assert.equal(
      await columnExists(fixture, 'short_links', 'redirect_count'),
      false,
      'failed backfill rolls back schema mutation',
    );
    await fixture.query(
      'ALTER TABLE click_events ADD COLUMN queue_id bigint; DROP TABLE click_event_queue',
    );
    await clickMigration.up(fixture);
    assert.equal(await count(), 2, 'upgrade works before queue table exists');
    await fixture.query(
      'ALTER TABLE short_links DROP COLUMN redirect_count; DROP TABLE click_events',
    );
    await clickMigration.up(fixture);
    assert.equal(
      await count(),
      0,
      'partial initial schema has no prior clicks',
    );
  } finally {
    await fixture.close();
    await getDatabase().query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}
