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
  revokeApiTokens as revokeUserApiTokens,
} from '$lib/server/api-tokens';
import {
  LOCAL_AUTH_PROVIDER_ID,
  PASSKEY_METHOD_ID,
  TOTP_METHOD_ID,
} from '$lib/server/local-auth-security';
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
  registerPermissionGroupAutoAssignMatcher,
  removePermissionGroupCidr,
  removePermissionGroupCidrs,
  removePermissionGroupUser,
  removePermissionGroupUsers,
  searchPermissionGroupCidrs,
  searchPermissionGroupUsers,
  updatePermissionGroupSettings,
  authProviderKey,
  type PermissionGroupAutoAssignCondition,
} from '$lib/server/permissions';
import { getAuthLoginMethods } from '../auth-registry';
import type {
  AuthenticatedUser,
  PluginDefinition,
  PluginLocaleKey,
  PluginLocaleStrings,
  PluginAdminPermissionContext,
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
const EMAIL_PATTERN_CONDITION = 'email-pattern';
const ACCOUNT_AGE_CONDITION = 'account-age-days';
const ADMIN_STATUS_CONDITION = 'admin-status';
const DAY_MS = 24 * 60 * 60 * 1000;

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

function normalizeEmailPattern(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || /\s/.test(normalized)) {
    return '';
  }
  return normalized;
}

function emailPatternList(value: unknown, limit = 100) {
  const source =
    typeof value === 'string'
      ? value.split(/[\r\n,]/)
      : Array.isArray(value)
        ? value
        : [];
  return [
    ...new Set(
      source
        .map((item) => normalizeEmailPattern(String(item)))
        .filter(Boolean)
        .slice(0, limit),
    ),
  ];
}

function userEmail(email: string | null | undefined) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

function wildcardPatternMatches(value: string, pattern: string) {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function emailMatchesPattern(email: string, pattern: string) {
  if (pattern.startsWith('@')) return email.endsWith(pattern);
  if (pattern.includes('*')) return wildcardPatternMatches(email, pattern);
  return email === pattern;
}

function configInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function formOptionalInteger(
  form: FormData,
  name: string,
  min: number,
  max: number,
) {
  const value = stringValue(form, name);
  if (!value) return null;
  return configInteger(value, min, max);
}

function formChoice<T extends string>(
  form: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T,
) {
  const value = stringValue(form, name);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function booleanConfig(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

registerPermissionGroupAutoAssignMatcher(
  EMAIL_PATTERN_CONDITION,
  ({ user, condition }) => {
    const patterns = emailPatternList(condition.config.patterns);
    const email = userEmail(user.email);
    return (
      Boolean(email) &&
      patterns.some((pattern) => emailMatchesPattern(email, pattern))
    );
  },
);

registerPermissionGroupAutoAssignMatcher(
  ACCOUNT_AGE_CONDITION,
  ({ user, condition }) => {
    const minDays = configInteger(condition.config.minDays, 0, 36500);
    const maxDays = configInteger(condition.config.maxDays, 0, 36500);
    if (minDays === null && maxDays === null) return false;
    const createdAt =
      user.createdAt instanceof Date
        ? user.createdAt
        : new Date(user.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    const ageDays = Math.floor((Date.now() - createdAt.getTime()) / DAY_MS);
    return (
      (minDays === null || ageDays >= minDays) &&
      (maxDays === null || ageDays <= maxDays)
    );
  },
);

registerPermissionGroupAutoAssignMatcher(
  ADMIN_STATUS_CONDITION,
  ({ user, condition }) => {
    const isAdmin = booleanConfig(condition.config.isAdmin);
    return isAdmin === null ? false : user.isAdmin === isAdmin;
  },
);

function permissionGroupAutoAssignFromForm(form: FormData) {
  const patterns = emailPatternList(
    stringValue(form, 'autoAssign.emailPatterns'),
  );
  let minDays = formOptionalInteger(
    form,
    'autoAssign.accountAgeMinDays',
    0,
    36500,
  );
  let maxDays = formOptionalInteger(
    form,
    'autoAssign.accountAgeMaxDays',
    0,
    36500,
  );
  if (minDays !== null && maxDays !== null && maxDays < minDays) {
    [minDays, maxDays] = [maxDays, minDays];
  }
  const adminStatus = formChoice(
    form,
    'autoAssign.adminStatus',
    ['any', 'admin', 'user'] as const,
    'any',
  );
  const conditions: PermissionGroupAutoAssignCondition[] = [];
  if (patterns.length > 0) {
    conditions.push({
      type: EMAIL_PATTERN_CONDITION,
      config: { patterns },
    });
  }
  if (minDays !== null || maxDays !== null) {
    conditions.push({
      type: ACCOUNT_AGE_CONDITION,
      config: {
        ...(minDays !== null ? { minDays } : {}),
        ...(maxDays !== null ? { maxDays } : {}),
      },
    });
  }
  if (adminStatus !== 'any') {
    conditions.push({
      type: ADMIN_STATUS_CONDITION,
      config: { isAdmin: adminStatus === 'admin' },
    });
  }
  return {
    enabled: parseBoolean(form, 'autoAssign.enabled'),
    revokeWhenUnmatched: parseBoolean(form, 'autoAssign.revokeWhenUnmatched'),
    conditions,
  };
}

function permissionManagementGroupInputFromForm(form: FormData) {
  return permissionGroupInputFromForm(form, {
    autoAssign: permissionGroupAutoAssignFromForm(form),
  });
}

function permissionActionAccess(
  action: string,
  permissions: PluginAdminPermissionContext,
) {
  if (permissions.isAdmin) return true;
  if (action === 'createUser') return permissions.admin.manageUsers;
  if (action === 'createGroup' || action === 'deleteGroups') {
    return permissions.admin.managePermissions;
  }
  return true;
}

function permissionItemAccess(
  item: string,
  permissions: PluginAdminPermissionContext,
) {
  if (permissions.isAdmin) return true;
  if (item.startsWith('user-')) return permissions.admin.manageUsers;
  if (item.startsWith('group-')) return permissions.admin.managePermissions;
  return true;
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
    isAdmin: user.isAdmin === true,
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
      reason: user.reason,
      reasonPublic: user.reasonPublic,
      assignmentSource: user.assignmentSource,
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
  if (target?.isAdmin) {
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
  canAccessAdminAction({ action, permissions, strings }) {
    return {
      allowed: permissionActionAccess(action, permissions),
      reason: t(strings, 'server.permissionActionDenied'),
    };
  },

  canAccessAdminSubpage({ item, permissions, strings }) {
    return {
      allowed: permissionItemAccess(item, permissions),
      reason: t(strings, 'server.permissionActionDenied'),
      redirectTo: '/admin/plugins/permission-management',
    };
  },

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
      await createPermissionGroup(permissionManagementGroupInputFromForm(form));
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
          isAdmin: user.isAdmin === true,
          enabled: user.enabled === true,
          createdAt: user.createdAt.toISOString(),
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
      const [settings, members, addableUsers, cidrs] = await Promise.all([
        getSettings(),
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
      const authProviders = getAuthLoginMethods(
        settings.plugins,
        locale,
        settings.i18n.defaultLocale,
      ).map((method) => ({
        id: authProviderKey(method.pluginId, method.id),
        pluginId: method.pluginId,
        methodId: method.id,
        label: method.label,
        type: method.type,
      }));
      authProviders.push(
        {
          id: authProviderKey(LOCAL_AUTH_PROVIDER_ID, TOTP_METHOD_ID),
          pluginId: LOCAL_AUTH_PROVIDER_ID,
          methodId: TOTP_METHOD_ID,
          label: t(strings, 'admin.localTotp'),
          type: 'password' as const,
        },
        {
          id: authProviderKey(LOCAL_AUTH_PROVIDER_ID, PASSKEY_METHOD_ID),
          pluginId: LOCAL_AUTH_PROVIDER_ID,
          methodId: PASSKEY_METHOD_ID,
          label: t(strings, 'admin.localPasskey'),
          type: 'password' as const,
        },
      );
      return {
        kind: 'group' as const,
        group,
        authProviders,
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
        const removed = await revokeUserApiTokens(userId, [
          Number(form.get('tokenId')),
        ]);
        if (removed === 0)
          throw new Error(t(strings, 'server.apiTokenNotFound'));
        return { message: t(strings, 'server.apiTokenRevoked') };
      }
    }

    const groupId = numericItem('group-', item);
    if (groupId !== null) {
      if (action === 'saveGroup') {
        await updatePermissionGroupSettings(
          groupId,
          permissionManagementGroupInputFromForm(form),
        );
        return { message: t(strings, 'server.groupSaved') };
      }
      if (action === 'addGroupUser') {
        await addPermissionGroupUser(
          groupId,
          Number(form.get('userId')),
          permissionAssignmentExpiresAtFromForm(form),
          {
            reason: stringValue(form, 'reason'),
            reasonPublic: parseBoolean(form, 'reasonPublic'),
          },
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
