import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { defaultSettings } from '$lib/config';
import { QueryTypes } from 'sequelize';
import {
  getDatabase,
  USER_ADMIN_LOCK_KEY,
  PermissionGroupModel,
  PermissionGroupUserModel,
  UserModel,
} from '$lib/server/database';
import {
  addPermissionGroupUser,
  addPermissionGroupCidr,
  removePermissionGroupCidrs,
  effectivePermissions,
  createPermissionGroup,
  getPermissionGroup,
  listPermissionGroups,
  normalizePermissionRules,
  registerPermissionGroupAutoAssignMatcher,
  removePermissionGroupUser,
  syncAutomaticPermissionGroupMembershipsForGroup,
  syncAutomaticPermissionGroupMembershipsForUser,
  updatePermissionGroupSettings,
  type PermissionGroupInput,
} from '$lib/server/permissions';
import '$plugins/permission-management/server';

export async function checkPermissions() {
  const inherited = normalizePermissionRules({});
  assert.deepEqual(normalizePermissionRules(inherited), inherited);
  assert.equal(inherited.links.codeMinLength, null);
  assert.equal(inherited.links.domains, null);
  assert.equal(inherited.auth.providers, null);
  const suffix = randomUUID();
  const users = await UserModel.bulkCreate(
    [0, 1].map((index) => ({
      email: `permissions-${suffix}-${index}@example.test`,
      name: 'Permission invariant',
      passwordHash: 'disabled',
      isAdmin: true,
      createdAt: new Date(Date.now() - 20 * 86_400_000),
    })),
  );
  const ids: number[] = [];
  const input: PermissionGroupInput = {
    name: `permissions-${suffix}`,
    description: '',
    priority: 100,
    enabled: true,
    autoAssign: {
      enabled: true,
      revokeWhenUnmatched: true,
      conditions: [
        {
          type: 'email-pattern',
          config: { patterns: users.map((user) => user.email) },
        },
        { type: 'account-age-days', config: { minDays: 10 } },
        { type: 'admin-status', config: { isAdmin: true } },
      ],
    },
    userIds: [],
    ipRules: [],
    rules: normalizePermissionRules({}),
  };
  const hook = `permission-invariant-${suffix}`;
  try {
    const matchingGroups = [];
    for (const [index, priority, enabled, allowed] of [
      [0, 5, true, false],
      [1, 10, true, true],
      [2, 20, false, false],
      [3, 30, true, false],
      [4, 40, true, false],
    ] as const) {
      const group = await createPermissionGroup({
        ...input,
        name: `${input.name}-match-${index}`,
        priority,
        enabled,
        autoAssign: {
          enabled: false,
          revokeWhenUnmatched: false,
          conditions: [],
        },
        rules: normalizePermissionRules({ links: { create: allowed } }),
      });
      ids.push(group.id);
      matchingGroups.push(group);
    }
    const [lower, higher, disabled, expired, unrelated] = matchingGroups;
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    await addPermissionGroupUser(lower.id, users[0].id, future, {
      reason: 'private reason',
      reasonPublic: false,
    });
    await addPermissionGroupUser(higher.id, users[0].id, future, {
      reason: ' public reason ',
      reasonPublic: true,
    });
    await addPermissionGroupUser(disabled.id, users[0].id);
    await addPermissionGroupUser(expired.id, users[0].id, past);
    await addPermissionGroupUser(unrelated.id, users[1].id);
    await addPermissionGroupCidr(lower.id, '192.0.2.0/24', future);
    await addPermissionGroupCidr(lower.id, '192.0.2.0/25', future);
    await addPermissionGroupCidr(higher.id, '2001:db8::/32', future);
    await addPermissionGroupCidr(disabled.id, '192.0.2.0/24');
    await addPermissionGroupCidr(expired.id, '192.0.2.0/24', past);
    const context = {
      settings: defaultSettings,
      user: {
        id: users[0].id,
        provider: 'test',
        subject: 'test',
        name: users[0].name,
        email: users[0].email,
        isAdmin: false,
      },
      isAdmin: false,
      ip: '192.0.2.15',
    };
    const queryContext = new AsyncLocalStorage<boolean>();
    const queries: string[] = [];
    const previousLogging = getDatabase().options.logging;
    getDatabase().options.logging = (sql) => {
      if (queryContext.getStore()) queries.push(sql);
    };
    try {
      const permissions = await queryContext.run(true, () =>
        effectivePermissions(context),
      );
      assert.equal(
        queries.length,
        1,
        'permission evaluation must use one snapshot statement',
      );
      assert.deepEqual(permissions.matchedGroups, [
        { id: lower.id, name: lower.name },
        { id: higher.id, name: higher.name, reason: 'public reason' },
      ]);
      assert.equal(permissions.links.canCreate, true);
    } finally {
      getDatabase().options.logging = previousLogging;
    }
    const ipv4 = await effectivePermissions({ ...context, user: null });
    assert.deepEqual(ipv4.matchedGroups, [{ id: lower.id, name: lower.name }]);
    assert.equal(ipv4.links.canCreate, false);
    const ipv6 = await effectivePermissions({
      ...context,
      user: null,
      ip: '2001:DB8::1234',
    });
    assert.deepEqual(ipv6.matchedGroups, [
      { id: higher.id, name: higher.name },
    ]);
    for (const ip of ['invalid', '192.0.3.1', '::ffff:192.0.2.15']) {
      assert.deepEqual(
        (await effectivePermissions({ ...context, user: null, ip }))
          .matchedGroups,
        [],
      );
    }
    await addPermissionGroupUser(higher.id, users[0].id, past, {
      reason: 'expired reason',
      reasonPublic: true,
    });
    const fallback = await effectivePermissions({
      ...context,
      ip: '2001:db8::1',
    });
    assert.equal(
      fallback.matchedGroups.find((group) => group.id === higher.id)?.reason,
      undefined,
    );
    await removePermissionGroupUser(lower.id, users[0].id);
    await removePermissionGroupCidrs(lower.id, [
      '192.0.2.0/24',
      '192.0.2.0/25',
    ]);
    assert.deepEqual((await effectivePermissions(context)).matchedGroups, []);
    for (const group of matchingGroups)
      await PermissionGroupModel.destroy({ where: { id: group.id } });

    // Built-in matchers must receive createdAt/isAdmin, not only id/email.
    const group = await createPermissionGroup(input);
    ids.push(group.id);
    assert.deepEqual(group.userIds.sort(), users.map((user) => user.id).sort());

    const expiresAt = new Date(Date.now() + 86_400_000);
    await Promise.all([
      syncAutomaticPermissionGroupMembershipsForGroup(group.id),
      addPermissionGroupUser(group.id, users[0].id, expiresAt, {
        reason: 'Manual expiry must survive automatic synchronization',
        reasonPublic: true,
      }),
    ]);
    await syncAutomaticPermissionGroupMembershipsForGroup(group.id);
    const manual = await PermissionGroupUserModel.findOne({
      where: { groupId: group.id, userId: users[0].id },
    });
    assert.equal(manual?.assignmentSource, 'manual');
    assert.equal(manual?.expiresAt?.getTime(), expiresAt.getTime());
    assert.equal(manual?.reasonPublic, true);

    await listPermissionGroups();
    await removePermissionGroupUser(group.id, users[0].id);
    assert.equal(
      (await listPermissionGroups())
        .find((item) => item.id === group.id)
        ?.userIds.includes(users[0].id),
      false,
    );

    await assert.rejects(
      getDatabase().transaction(async (transaction) => {
        await syncAutomaticPermissionGroupMembershipsForUser(
          users[0].id,
          transaction,
        );
        throw new Error('rollback user synchronization');
      }),
      /rollback user synchronization/,
    );
    assert.equal(
      await PermissionGroupUserModel.count({
        where: { groupId: group.id, userId: users[0].id },
      }),
      0,
    );

    const condition = `throws-${suffix}`;
    registerPermissionGroupAutoAssignMatcher(condition, () => {
      throw new Error('matcher failure');
    });
    await assert.rejects(
      updatePermissionGroupSettings(group.id, {
        ...input,
        name: 'Must roll back',
        autoAssign: {
          ...input.autoAssign,
          conditions: [{ type: condition, config: {} }],
        },
      }),
      /matcher failure/,
    );
    assert.equal((await getPermissionGroup(group.id))?.name, input.name);

    // Hold group synchronization before its INSERT, then race a user mutation.
    // Both transactions use a timeout so lock inversion fails instead of hanging.
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const accountReady = Promise.withResolvers<void>();
    const blockedCondition = `blocked-${suffix}`;
    registerPermissionGroupAutoAssignMatcher(
      blockedCondition,
      async ({ user }) => {
        if (user.id !== users[0].id) return false;
        entered.resolve();
        await release.promise;
        return true;
      },
    );
    const concurrentGroup = await createPermissionGroup({
      ...input,
      name: `${input.name}-concurrent`,
      autoAssign: { enabled: false, revokeWhenUnmatched: true, conditions: [] },
    });
    ids.push(concurrentGroup.id);
    await PermissionGroupModel.update(
      {
        autoAssign: {
          enabled: true,
          revokeWhenUnmatched: true,
          conditions: [{ type: blockedCondition, config: {} }],
        },
      },
      { where: { id: concurrentGroup.id } },
    );
    const groupSync = getDatabase().transaction(async (transaction) => {
      await getDatabase().query("SET LOCAL statement_timeout = '5s'", {
        transaction,
      });
      await syncAutomaticPermissionGroupMembershipsForGroup(
        concurrentGroup.id,
        transaction,
      );
    });
    await entered.promise;
    const accountWrite = getDatabase().transaction(async (transaction) => {
      try {
        await getDatabase().query("SET LOCAL statement_timeout = '5s'", {
          transaction,
        });
        const [lock] = await getDatabase().query<{ acquired: boolean }>(
          `SELECT pg_try_advisory_xact_lock(${USER_ADMIN_LOCK_KEY}) AS acquired`,
          { type: QueryTypes.SELECT, transaction },
        );
        assert.equal(
          lock.acquired,
          false,
          'group synchronization must hold the account lock before user FK checks',
        );
        accountReady.resolve();
        await getDatabase().query(
          `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
          { transaction },
        );
        const user = await UserModel.findByPk(users[0].id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
          rejectOnEmpty: true,
        });
        await user.update(
          { name: 'Concurrent permission invariant' },
          { transaction },
        );
        await syncAutomaticPermissionGroupMembershipsForUser(
          user.id,
          transaction,
        );
      } finally {
        accountReady.resolve();
      }
    });
    await accountReady.promise;
    release.resolve();
    await Promise.all([groupSync, accountWrite]);
    assert.equal(
      await PermissionGroupUserModel.count({
        where: { groupId: concurrentGroup.id, userId: users[0].id },
      }),
      1,
    );

    // Failure after the first automatic grant rolls back both grants and group.
    let writes = 0;
    PermissionGroupUserModel.addHook('beforeCreate', hook, (membership) => {
      if (membership.assignmentSource === 'automatic' && ++writes === 2) {
        throw new Error('second membership failure');
      }
    });
    const failedName = `${input.name}-rollback`;
    await assert.rejects(
      createPermissionGroup({ ...input, name: failedName }),
      /second membership failure/,
    );
    assert.equal(writes, 2);
    assert.equal(
      await PermissionGroupModel.count({ where: { name: failedName } }),
      0,
    );
    console.log(
      'permissions: complete matcher inputs, manual membership preservation, fresh revocations, transaction rollback passed',
    );
  } finally {
    PermissionGroupUserModel.removeHook('beforeCreate', hook);
    for (const id of ids) await PermissionGroupModel.destroy({ where: { id } });
    for (const user of users) await user.destroy();
  }
}
