import {
  createUser,
  deleteUser,
  ensureCanDeleteUser,
  getUserById,
  searchUsers,
  updateUser,
} from '$lib/server/users';
import {
  listApiTokens,
  revokeApiToken as revokeUserApiToken,
} from '$lib/server/api-tokens';
import { getSettings, parseBoolean, stringValue } from '$lib/server/settings';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import { pluginText } from '$lib/i18n/plugin';
import { DEFAULT_PAGE_SIZE, pageParam } from '$lib/server/pagination';
import {
  addPermissionGroupCidr,
  addPermissionGroupUser,
  createPermissionGroup,
  deletePermissionGroup,
  deletePermissionGroups,
  getPermissionGroup,
  listPermissionGroupSummaries,
  permissionAssignmentExpiresAtFromForm,
  permissionGroupInputFromForm,
  removePermissionGroupCidr,
  removePermissionGroupCidrs,
  removePermissionGroupUser,
  removePermissionGroupUsers,
  searchPermissionGroupCidrs,
  searchPermissionGroupUsers,
  updatePermissionGroupSettings,
} from '$lib/server/permissions';
import type {
  AuthenticatedUser,
  PluginDefinition,
  PluginLocaleKey,
  PluginLocaleStrings,
} from '$lib/plugin-contracts';

function numericItem(prefix: string, item: string) {
  if (!item.startsWith(prefix)) return null;
  const id = Number(item.slice(prefix.length));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function userItem(id: number) {
  return `user-${id}`;
}

function groupItem(id: number) {
  return `group-${id}`;
}

const GROUP_MEMBER_PAGE_SIZE = 5;
const GROUP_CIDR_PAGE_SIZE = 6;

function formIds(form: FormData, name: string) {
  return [
    ...new Set(
      form
        .getAll(name)
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];
}

function formStrings(form: FormData, name: string) {
  return [
    ...new Set(
      form
        .getAll(name)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function t(strings: PluginLocaleStrings, key: PluginLocaleKey) {
  return pluginText(strings, key);
}

function formatText(
  strings: PluginLocaleStrings,
  key: PluginLocaleKey,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    t(strings, key),
  );
}

function userSummary(
  user: Awaited<ReturnType<typeof searchUsers>>['items'][number],
) {
  return {
    id: user.id,
    item: userItem(user.id),
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin === true,
    enabled: user.enabled === true,
  };
}

function userSearchPayload(
  result: Awaited<ReturnType<typeof searchUsers>>,
  pageName: string,
  queryName: string,
) {
  return {
    query: result.query,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    pageName,
    queryName,
    users: result.items.map(userSummary),
  };
}

function memberSearchPayload(
  result: Awaited<ReturnType<typeof searchPermissionGroupUsers>>,
  pageName: string,
  queryName: string,
) {
  return {
    query: result.query,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    pageName,
    queryName,
    users: result.items.map((user) => ({
      id: user.id,
      item: userItem(user.id),
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      enabled: user.enabled,
      expiresAt: user.expiresAt,
    })),
  };
}

async function assertCanManageUser(
  actor: AuthenticatedUser | null,
  actorIsAdmin: boolean,
  strings: PluginLocaleStrings,
  targetId?: number,
  nextIsAdmin = false,
) {
  if (actorIsAdmin) return;
  if (nextIsAdmin) {
    throw new Error(t(strings, 'server.adminUserRequiresRoot'));
  }
  if (!targetId) return;
  const target = await getUserById(targetId);
  if (target?.is_admin) {
    throw new Error(t(strings, 'server.adminUserManageRequiresRoot'));
  }
  if (!actor) throw new Error(t(strings, 'server.manageUsersDenied'));
}

async function adminBaseData(url: URL) {
  const [settings, users, groups] = await Promise.all([
    getSettings(),
    searchUsers({
      query: url.searchParams.get('userQ'),
      page: pageParam(url, 'userPage'),
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listPermissionGroupSummaries(),
  ]);
  return {
    passwordMinLength: settings.auth.password.minLength,
    passwordPolicy: passwordPolicyDescription(settings.auth.password),
    userSearch: userSearchPayload(users, 'userPage', 'userQ'),
    groups: groups.map((group) => ({
      ...group,
      item: groupItem(group.id),
    })),
  };
}

const serverPlugin = {
  async loadAdminData({ url }) {
    return adminBaseData(url);
  },

  async handleAdminAction({ action, form, user, isAdmin, strings }) {
    if (action === 'createUser') {
      const settings = await getSettings();
      const nextIsAdmin = parseBoolean(form, 'isAdmin');
      await assertCanManageUser(user, isAdmin, strings, undefined, nextIsAdmin);
      await createUser({
        email: stringValue(form, 'email'),
        name: stringValue(form, 'name'),
        password: stringValue(form, 'password'),
        isAdmin: isAdmin && nextIsAdmin,
        emailVerifiedAt: new Date(),
        passwordPolicy: settings.auth.password,
      });
      return { message: t(strings, 'server.userCreated') };
    }

    if (action === 'createGroup') {
      await createPermissionGroup(permissionGroupInputFromForm(form));
      return { message: t(strings, 'server.groupCreated') };
    }

    if (action === 'deleteGroups') {
      const ids = formIds(form, 'groupIds');
      if (ids.length === 0) {
        throw new Error(t(strings, 'server.selectGroupsToDelete'));
      }
      const deleted = await deletePermissionGroups(ids);
      return {
        message: formatText(strings, 'server.groupsDeleted', {
          count: deleted,
        }),
      };
    }

    throw new Error(t(strings, 'server.unsupportedPluginAction'));
  },

  async loadAdminSubpage({ item, url, locale, strings }) {
    const userId = numericItem('user-', item);
    if (userId !== null) {
      const user = await getUserById(userId);
      if (!user) throw new Error(t(strings, 'server.userNotFound'));
      const [settings, apiTokens] = await Promise.all([
        getSettings(),
        listApiTokens(userId),
      ]);
      return {
        kind: 'user' as const,
        passwordMinLength: settings.auth.password.minLength,
        passwordPolicy: passwordPolicyDescription(
          settings.auth.password,
          locale,
        ),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.is_admin === true,
          enabled: user.enabled === true,
          createdAt: user.created_at.toISOString(),
        },
        apiTokens,
      };
    }

    const groupId = numericItem('group-', item);
    if (groupId !== null) {
      const group = await getPermissionGroup(groupId, {
        includeRelations: false,
      });
      if (!group) throw new Error(t(strings, 'server.groupNotFound'));
      const memberQuery = url.searchParams.get('memberQ') ?? '';
      const userQuery = url.searchParams.get('addUserQ') ?? '';
      const cidrQuery = url.searchParams.get('cidrQ') ?? '';
      const [members, addableUsers, cidrs] = await Promise.all([
        searchPermissionGroupUsers({
          groupId,
          query: memberQuery,
          page: pageParam(url, 'memberPage'),
          pageSize: GROUP_MEMBER_PAGE_SIZE,
        }),
        userQuery.trim()
          ? searchUsers({
              query: userQuery,
              page: pageParam(url, 'addUserPage'),
              pageSize: GROUP_MEMBER_PAGE_SIZE,
              excludePermissionGroupId: groupId,
            })
          : Promise.resolve({
              items: [],
              total: 0,
              page: 1,
              pageSize: GROUP_MEMBER_PAGE_SIZE,
              totalPages: 1,
              query: '',
            }),
        searchPermissionGroupCidrs({
          groupId,
          query: cidrQuery,
          page: pageParam(url, 'cidrPage'),
          pageSize: GROUP_CIDR_PAGE_SIZE,
        }),
      ]);
      return {
        kind: 'group' as const,
        group,
        cidrs,
        members: memberSearchPayload(members, 'memberPage', 'memberQ'),
        addableUsers: userSearchPayload(
          addableUsers,
          'addUserPage',
          'addUserQ',
        ),
      };
    }

    throw new Error(t(strings, 'server.invalidAdminItem'));
  },

  async handleAdminSubpageAction({
    item,
    action,
    form,
    user,
    isAdmin,
    strings,
  }) {
    const userId = numericItem('user-', item);
    if (userId !== null) {
      if (action === 'saveUser') {
        const settings = await getSettings();
        const nextIsAdmin = parseBoolean(form, 'isAdmin');
        await assertCanManageUser(user, isAdmin, strings, userId, nextIsAdmin);
        await updateUser({
          id: userId,
          email: stringValue(form, 'email'),
          name: stringValue(form, 'name'),
          isAdmin: isAdmin && nextIsAdmin,
          enabled: parseBoolean(form, 'enabled'),
          password: stringValue(form, 'password'),
          passwordPolicy: settings.auth.password,
        });
        return { message: t(strings, 'server.userSaved') };
      }
      if (action === 'deleteUser') {
        await assertCanManageUser(user, isAdmin, strings, userId);
        await ensureCanDeleteUser(userId);
        await deleteUser(userId);
        return {
          message: t(strings, 'server.userDeleted'),
          redirectTo: '/admin/plugins/permission-management',
        };
      }
      if (action === 'revokeApiToken') {
        await assertCanManageUser(user, isAdmin, strings, userId);
        const removed = await revokeUserApiToken(
          userId,
          Number(form.get('tokenId')),
        );
        if (!removed) throw new Error(t(strings, 'server.apiTokenNotFound'));
        return { message: t(strings, 'server.apiTokenRevoked') };
      }
    }

    const groupId = numericItem('group-', item);
    if (groupId !== null) {
      if (action === 'saveGroup') {
        await updatePermissionGroupSettings(
          groupId,
          permissionGroupInputFromForm(form),
        );
        return { message: t(strings, 'server.groupSaved') };
      }
      if (action === 'addGroupUser') {
        await addPermissionGroupUser(
          groupId,
          Number(form.get('userId')),
          permissionAssignmentExpiresAtFromForm(form),
        );
        return { message: t(strings, 'server.groupUserAdded') };
      }
      if (action === 'removeGroupUser') {
        await removePermissionGroupUser(groupId, Number(form.get('userId')));
        return { message: t(strings, 'server.groupUserRemoved') };
      }
      if (action === 'removeGroupUsers') {
        const userIds = formIds(form, 'userIds');
        if (userIds.length === 0) {
          throw new Error(t(strings, 'server.selectUsersToRemove'));
        }
        const deleted = await removePermissionGroupUsers(groupId, userIds);
        return {
          message: formatText(strings, 'server.usersRemoved', {
            count: deleted,
          }),
        };
      }
      if (action === 'addGroupCidr') {
        await addPermissionGroupCidr(
          groupId,
          stringValue(form, 'cidr'),
          permissionAssignmentExpiresAtFromForm(form),
        );
        return { message: t(strings, 'server.groupCidrAdded') };
      }
      if (action === 'removeGroupCidr') {
        await removePermissionGroupCidr(groupId, stringValue(form, 'cidr'));
        return { message: t(strings, 'server.groupCidrRemoved') };
      }
      if (action === 'removeGroupCidrs') {
        const cidrs = formStrings(form, 'cidrs');
        if (cidrs.length === 0) {
          throw new Error(t(strings, 'server.selectCidrsToRemove'));
        }
        const deleted = await removePermissionGroupCidrs(groupId, cidrs);
        return {
          message: formatText(strings, 'server.cidrsRemoved', {
            count: deleted,
          }),
        };
      }
      if (action === 'deleteGroup') {
        await deletePermissionGroup(groupId);
        return {
          message: t(strings, 'server.groupDeleted'),
          redirectTo: '/admin/plugins/permission-management',
        };
      }
    }

    throw new Error(t(strings, 'server.unsupportedPermissionAction'));
  },
} satisfies Partial<PluginDefinition>;

export default serverPlugin;
