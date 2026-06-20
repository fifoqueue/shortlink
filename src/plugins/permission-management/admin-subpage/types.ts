import type { LinkEditFieldKey, LinkOptionKey } from '$lib/config';

export type User = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  enabled: boolean;
  createdAt: string;
};

export type GroupUser = {
  id: number;
  item: string;
  email: string;
  name: string;
  isAdmin: boolean;
  enabled: boolean;
  expiresAt?: string | null;
  reason?: string;
  reasonPublic?: boolean;
  assignmentSource?: 'manual' | 'automatic';
};

export type CidrRule = {
  cidr: string;
  expiresAt: string | null;
};

export type AuthProviderOption = {
  id: string;
  pluginId: string;
  methodId: string;
  label: string;
  type: 'password' | 'redirect';
};

export type RuleValue = boolean | null;

export type Group = {
  id: number;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  autoAssign: {
    enabled: boolean;
    conditions: Array<{
      type: string;
      config: Record<string, unknown>;
    }>;
    revokeWhenUnmatched: boolean;
  };
  userIds: number[];
  ipRules: string[];
  userMemberships: Array<{
    userId: number;
    expiresAt: string | null;
    reason: string;
    reasonPublic: boolean;
  }>;
  cidrRules: CidrRule[];
  rules: {
    links: {
      create: RuleValue;
      options: Record<LinkOptionKey, RuleValue>;
      codeMinLength: number | null;
      codeMaxLength: number | null;
      generatedCodeLength: number | null;
      domains: string[] | null;
      deleteOwn: RuleValue;
      deleteMaxClicks: number | null;
      editOwn: RuleValue;
      viewAll: RuleValue;
      editAll: RuleValue;
      deleteAll: RuleValue;
      statsAll: RuleValue;
      statsCsv: RuleValue;
      share: RuleValue;
      healthAll: RuleValue;
      expiresAtBypass: RuleValue;
      passwordBypass: RuleValue;
      editableFields: Record<LinkEditFieldKey, RuleValue>;
    };
    admin: {
      access: RuleValue;
      sections: string[];
      manageSections: string[];
      plugins: string[];
      manageUsers: RuleValue;
      managePermissions: RuleValue;
    };
    auth: {
      providers: string[] | null;
      resendVerificationDailyLimit: number | null;
      passwordResetDailyLimit: number | null;
    };
    api: Record<string, RuleValue>;
  };
};

export type UserSearch = {
  query: string;
  page: number;
  total: number;
  totalPages: number;
  users: GroupUser[];
};

export type CidrSearch = {
  query: string;
  page: number;
  total: number;
  totalPages: number;
  cidrs: CidrRule[];
};

export type ApiToken = {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type UserAdminData = {
  kind: 'user';
  passwordMinLength: number;
  passwordPolicy: string;
  user: User;
  apiTokens: ApiToken[];
};

export type GroupAdminData = {
  kind: 'group';
  group: Group;
  authProviders: AuthProviderOption[];
  cidrs: CidrSearch;
  members: UserSearch;
  addableUsers: UserSearch;
};

export type AdminData = UserAdminData | GroupAdminData;
export type PermissionTab = 'links' | 'admin' | 'auth' | 'api';
export type AutoAssignTab = 'email' | 'account';
export type LinkPermissionKey =
  | 'create'
  | 'deleteOwn'
  | 'editOwn'
  | 'viewAll'
  | 'editAll'
  | 'deleteAll'
  | 'statsAll'
  | 'statsCsv'
  | 'share'
  | 'healthAll'
  | 'expiresAtBypass'
  | 'passwordBypass';
