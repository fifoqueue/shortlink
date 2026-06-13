import { isIP } from 'node:net';
import type { RequestEvent } from '@sveltejs/kit';
import { Op, QueryTypes, type Transaction, type WhereOptions } from 'sequelize';
import {
  linkEditFieldKeys,
  linkOptionKeys,
  linkedLinkEditFieldPairs,
  linkedLinkOptionKeyPairs,
  redirectRuleConditionKeys,
  type LinkEditFieldKey,
  type LinkOptionKey as ConfigLinkOptionKey,
  type SiteSettings,
} from '$lib/config';
import type {
  AdminPluginAccessPermission,
  AuthenticatedUser,
} from '$lib/plugin-contracts';
import { serverMessage } from '$lib/i18n/ui-text';
import { redirectRulePermissionKeysFromValue } from './redirect-rules';
import { pageOffset, paginationMeta } from './pagination';
import {
  PermissionGroupCidrModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
  UserModel,
  ensureDatabase,
  getDatabase,
} from './database';
import { getClientIp } from './client-ip';
import { parseBoolean, stringValue } from './settings';
import { normalizeShortLinkDomains } from './url';

export const LINK_OPTION_KEYS = linkOptionKeys;
export type LinkOptionKey = ConfigLinkOptionKey;

export const LINK_EDIT_FIELD_KEYS = linkEditFieldKeys;
export type LinkEditField = LinkEditFieldKey;

export const ADMIN_SECTION_KEYS = [
  'general',
  'links',
  'theme',
  'plugins',
  'data',
] as const;
export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

export const API_PERMISSION_KEYS = [
  'enabled',
  'create',
  'list',
  'stats',
  'delete',
  'update',
] as const;
export type ApiPermissionKey = (typeof API_PERMISSION_KEYS)[number];

export interface PermissionRules {
  links: {
    create: boolean | null;
    options: Record<LinkOptionKey, boolean | null>;
    codeMinLength: number | null;
    codeMaxLength: number | null;
    generatedCodeLength: number | null;
    domains: string[] | null;
    deleteOwn: boolean | null;
    deleteMaxClicks: number | null;
    editOwn: boolean | null;
    viewAll: boolean | null;
    editAll: boolean | null;
    deleteAll: boolean | null;
    statsAll: boolean | null;
    statsCsv: boolean | null;
    healthAll: boolean | null;
    expiresAtBypass: boolean | null;
    passwordBypass: boolean | null;
    editableFields: Record<LinkEditField, boolean | null>;
  };
  admin: {
    access: boolean | null;
    sections: AdminSectionKey[];
    manageSections: AdminSectionKey[];
    plugins: string[];
    manageUsers: boolean | null;
    managePermissions: boolean | null;
  };
  auth: {
    resendVerificationDailyLimit: number | null;
    passwordResetDailyLimit: number | null;
  };
  api: Record<ApiPermissionKey, boolean | null>;
}

export interface PermissionGroupAutoAssign {
  enabled: boolean;
  conditions: PermissionGroupAutoAssignCondition[];
  revokeWhenUnmatched: boolean;
}

export interface PermissionGroupAutoAssignCondition {
  type: string;
  config: Record<string, unknown>;
}

export interface PermissionGroupInput {
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  autoAssign: PermissionGroupAutoAssign;
  userIds: number[];
  ipRules: string[];
  rules: PermissionRules;
}

interface NormalizedCidr {
  cidr: string;
  family: number;
  startHex: string;
  endHex: string;
}

interface NormalizedPermissionGroupInput extends PermissionGroupInput {
  cidrs: NormalizedCidr[];
}

interface PermissionGroupUserMembership {
  userId: number;
  expiresAt: string | null;
  reason: string;
  reasonPublic: boolean;
  assignmentSource: PermissionGroupAssignmentSource;
}

type PermissionGroupAssignmentSource = 'manual' | 'automatic';

export interface PublicPermissionGroupReason {
  id: number;
  name: string;
  reason: string;
}

export interface PublicPermissionGroup {
  id: number;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  autoAssign: PermissionGroupAutoAssign;
  userIds: number[];
  ipRules: string[];
  userMemberships: PermissionGroupUserMembership[];
  cidrRules: Array<{ cidr: string; expiresAt: string | null }>;
  rules: PermissionRules;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPermissionGroupSummary {
  id: number;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  userCount: number;
  cidrCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissionGroup {
  id: number;
  name: string;
  description: string;
  priority: number;
  expiresAt: string | null;
  assignmentSource: PermissionGroupAssignmentSource;
}

export interface PermissionGroupUserSearchItem {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  enabled: boolean;
  expiresAt: string | null;
  reason: string;
  reasonPublic: boolean;
  assignmentSource: PermissionGroupAssignmentSource;
}

export interface PermissionGroupUserSearchResult {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: PermissionGroupUserSearchItem[];
}

export interface PermissionGroupCidrSearchResult {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  cidrs: Array<{ cidr: string; expiresAt: string | null }>;
}

export interface EffectivePermissions {
  isAdmin: boolean;
  matchedGroups: Array<{ id: number; name: string; reason?: string }>;
  links: {
    canCreate: boolean;
    options: Record<LinkOptionKey, boolean>;
    codeMinLength: number;
    codeMaxLength: number;
    generatedCodeLength: number;
    domains: string[];
    deleteOwn: boolean;
    deleteMaxClicks: number;
    editOwn: boolean;
    viewAll: boolean;
    editAll: boolean;
    deleteAll: boolean;
    statsAll: boolean;
    statsCsv: boolean;
    healthAll: boolean;
    expiresAtBypass: boolean;
    passwordBypass: boolean;
    editableFields: LinkEditField[];
  };
  admin: {
    access: boolean;
    sections: AdminSectionKey[];
    manageSections: AdminSectionKey[];
    plugins: string[];
    manageUsers: boolean;
    managePermissions: boolean;
  };
  auth: {
    resendVerificationDailyLimit: number;
    passwordResetDailyLimit: number;
  };
  api: Record<ApiPermissionKey, boolean>;
}

const ALL_LINK_OPTIONS = Object.fromEntries(
  LINK_OPTION_KEYS.map((key) => [key, true]),
) as Record<LinkOptionKey, boolean>;
const ALL_LINK_EDIT_FIELDS = [...LINK_EDIT_FIELD_KEYS];
const ALL_ADMIN_SECTIONS = [...ADMIN_SECTION_KEYS];

const emptyRules: PermissionRules = {
  links: {
    create: null,
    options: Object.fromEntries(
      LINK_OPTION_KEYS.map((key) => [key, null]),
    ) as Record<LinkOptionKey, null>,
    codeMinLength: null,
    codeMaxLength: null,
    generatedCodeLength: null,
    domains: null,
    deleteOwn: null,
    deleteMaxClicks: null,
    editOwn: null,
    viewAll: null,
    editAll: null,
    deleteAll: null,
    statsAll: null,
    statsCsv: null,
    healthAll: null,
    expiresAtBypass: null,
    passwordBypass: null,
    editableFields: Object.fromEntries(
      LINK_EDIT_FIELD_KEYS.map((key) => [key, null]),
    ) as Record<LinkEditField, null>,
  },
  admin: {
    access: null,
    sections: [],
    manageSections: [],
    plugins: [],
    manageUsers: null,
    managePermissions: null,
  },
  auth: {
    resendVerificationDailyLimit: null,
    passwordResetDailyLimit: null,
  },
  api: Object.fromEntries(
    API_PERMISSION_KEYS.map((key) => [key, null]),
  ) as Record<ApiPermissionKey, null>,
};

const emptyAutoAssign: PermissionGroupAutoAssign = {
  enabled: false,
  conditions: [],
  revokeWhenUnmatched: false,
};

type PermissionGroupAutoAssignMatcher = (input: {
  user: UserModel;
  condition: PermissionGroupAutoAssignCondition;
}) => boolean | Promise<boolean>;

const autoAssignMatchers = new Map<string, PermissionGroupAutoAssignMatcher>();

export function registerPermissionGroupAutoAssignMatcher(
  type: string,
  matcher: PermissionGroupAutoAssignMatcher,
) {
  const normalized = type.trim();
  if (!normalized) return;
  autoAssignMatchers.set(normalized, matcher);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function selectedKeys<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  const source = Array.isArray(value) ? value : [];
  const allowedSet = new Set<string>(allowed);
  return [
    ...new Set(
      source
        .map((item) => String(item))
        .filter((item): item is T => allowedSet.has(item)),
    ),
  ];
}

function normalizedOptionRules(options: Record<string, unknown>) {
  return Object.fromEntries(
    LINK_OPTION_KEYS.map((key) => {
      const direct = nullableBoolean(options[key]);
      return [key, direct];
    }),
  ) as Record<LinkOptionKey, boolean | null>;
}

function normalizedEditFieldRules(value: unknown) {
  const allowedSet = new Set<string>(LINK_EDIT_FIELD_KEYS);

  if (Array.isArray(value)) {
    const selectedFields = new Set(
      value
        .map((field) => String(field))
        .filter((field): field is LinkEditField => allowedSet.has(field)),
    );
    for (const pair of linkedLinkEditFieldPairs) {
      if (pair.some((field) => selectedFields.has(field))) {
        for (const field of pair) selectedFields.add(field);
      }
    }
    if (selectedFields.has('redirectRules')) {
      const hasCondition = redirectRuleConditionKeys.some((key) =>
        selectedFields.has(key),
      );
      if (!hasCondition) {
        for (const key of redirectRuleConditionKeys) selectedFields.add(key);
      }
    } else {
      for (const key of redirectRuleConditionKeys) selectedFields.delete(key);
    }
    return Object.fromEntries(
      LINK_EDIT_FIELD_KEYS.map((key) => [
        key,
        selectedFields.size === 0 ? null : selectedFields.has(key),
      ]),
    ) as Record<LinkEditField, boolean | null>;
  }

  const rules = isRecord(value) ? value : {};
  return Object.fromEntries(
    LINK_EDIT_FIELD_KEYS.map((key) => [key, nullableBoolean(rules[key])]),
  ) as Record<LinkEditField, boolean | null>;
}

function coupleLinkedOptionRules(rules: Record<LinkOptionKey, boolean | null>) {
  for (const [left, right] of linkedLinkOptionKeyPairs) {
    const rule = rules[left] ?? rules[right];
    if (rule !== null) {
      rules[left] = rule;
      rules[right] = rule;
    }
  }
  return rules;
}

function coupleLinkedEditFieldRules(
  rules: Record<LinkEditField, boolean | null>,
) {
  for (const [left, right] of linkedLinkEditFieldPairs) {
    const rule = rules[left] ?? rules[right];
    if (rule !== null) {
      rules[left] = rule;
      rules[right] = rule;
    }
  }
  return rules;
}

function normalizeEffectiveRedirectRuleOptions(
  options: Record<LinkOptionKey, boolean>,
) {
  if (!options.redirectRules) {
    for (const key of redirectRuleConditionKeys) options[key] = false;
    return;
  }

  if (!redirectRuleConditionKeys.some((key) => options[key])) {
    options.redirectRules = false;
  }
}

function normalizeEffectiveRedirectRuleEditFields(fields: LinkEditField[]) {
  const fieldSet = new Set(fields);
  if (!fieldSet.has('redirectRules')) {
    for (const key of redirectRuleConditionKeys) fieldSet.delete(key);
  }
  if (!redirectRuleConditionKeys.some((key) => fieldSet.has(key))) {
    fieldSet.delete('redirectRules');
  }
  if (redirectRuleConditionKeys.some((key) => fieldSet.has(key))) {
    fieldSet.add('redirectRules');
  }
  return LINK_EDIT_FIELD_KEYS.filter((key) => fieldSet.has(key));
}

function stringList(value: unknown, limit = 200) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\r\n,]/)
      : [];
  return [
    ...new Set(
      source
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, limit),
    ),
  ];
}

function normalizePermissionGroupAutoAssign(
  value: unknown,
): PermissionGroupAutoAssign {
  const raw = isRecord(value) ? value : {};
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions
        .map((condition): PermissionGroupAutoAssignCondition | null => {
          if (!isRecord(condition)) return null;
          const type = String(condition.type ?? '').trim();
          const config = isRecord(condition.config) ? condition.config : {};
          return type ? { type, config: clone(config) } : null;
        })
        .filter(
          (condition): condition is PermissionGroupAutoAssignCondition =>
            condition !== null,
        )
        .slice(0, 100)
    : [];
  return {
    ...emptyAutoAssign,
    enabled: raw.enabled === true && conditions.length > 0,
    conditions,
    revokeWhenUnmatched: raw.revokeWhenUnmatched === true,
  };
}

function userIdList(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return [
    ...new Set(
      source
        .map((item) => Number(item))
        .filter((item) => Number.isSafeInteger(item) && item > 0),
    ),
  ].slice(0, 500);
}

function parseIpv4ToBigInt(value: string) {
  if (isIP(value) !== 4) return null;
  const parts = value.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((result, part) => (result << 8n) + BigInt(part), 0n);
}

function ipv4FromBigInt(value: bigint) {
  return [24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 255n))
    .join('.');
}

function ipv6InputToHextets(value: string) {
  let normalized = value.toLowerCase();
  const embeddedIpv4 = /(^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (embeddedIpv4) {
    const ipv4 = parseIpv4ToBigInt(embeddedIpv4[2]);
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${normalized.slice(0, embeddedIpv4.index + embeddedIpv4[1].length)}${high}:${low}`;
  }

  const doubleColonParts = normalized.split('::');
  if (doubleColonParts.length > 2) return null;

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(':').filter(Boolean)
    : [];
  const right = doubleColonParts[1]
    ? doubleColonParts[1].split(':').filter(Boolean)
    : [];
  const missing = 8 - left.length - right.length;
  if (doubleColonParts.length === 1 && missing !== 0) return null;
  if (doubleColonParts.length === 2 && missing < 1) return null;

  const hextets = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (
    hextets.length !== 8 ||
    hextets.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null;
  }
  return hextets.map((part) => Number.parseInt(part, 16));
}

function parseIpv6ToBigInt(value: string) {
  if (isIP(value) !== 6) return null;
  const hextets = ipv6InputToHextets(value);
  if (!hextets) return null;
  return hextets.reduce((result, part) => (result << 16n) + BigInt(part), 0n);
}

function ipv6FromBigInt(value: bigint) {
  const hextets = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 0xffffn).toString(16),
  );
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < hextets.length; index += 1) {
    if (hextets[index] !== '0') continue;
    let end = index;
    while (end < hextets.length && hextets[end] === '0') end += 1;
    const length = end - index;
    if (length > bestLength && length >= 2) {
      bestStart = index;
      bestLength = length;
    }
    index = end - 1;
  }
  if (bestStart === -1) return hextets.join(':');

  const before = hextets.slice(0, bestStart).join(':');
  const after = hextets.slice(bestStart + bestLength).join(':');
  if (!before && !after) return '::';
  if (!before) return `::${after}`;
  if (!after) return `${before}::`;
  return `${before}::${after}`;
}

function hexAddress(value: bigint, family: number) {
  return value.toString(16).padStart(family === 4 ? 8 : 32, '0');
}

function cidrBounds(address: bigint, family: number, prefix: number) {
  const bits = BigInt(family === 4 ? 32 : 128);
  const hostBits = bits - BigInt(prefix);
  const addressSpace = 1n << bits;
  const fullMask = addressSpace - 1n;
  const networkMask = prefix === 0 ? 0n : (fullMask << hostBits) & fullMask;
  const start = address & networkMask;
  const end = start | (fullMask ^ networkMask);
  return { start, end };
}

function parseCidr(value: string): NormalizedCidr {
  const normalized = value.trim().toLowerCase();
  const match = /^(.+)\/(\d{1,3})$/.exec(normalized);
  if (!match) {
    throw new Error(serverMessage('ipRuleCidrRequired', { value }));
  }

  const addressText = match[1];
  const prefix = Number(match[2]);
  const family = isIP(addressText);
  if (family !== 4 && family !== 6) {
    throw new Error(serverMessage('ipRuleInvalidAddress', { value }));
  }
  const maxPrefix = family === 4 ? 32 : 128;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    throw new Error(
      serverMessage('ipRuleInvalidPrefix', { value, max: maxPrefix }),
    );
  }

  const address =
    family === 4
      ? parseIpv4ToBigInt(addressText)
      : parseIpv6ToBigInt(addressText);
  if (address === null) {
    throw new Error(serverMessage('ipRuleParseFailed', { value }));
  }

  const { start, end } = cidrBounds(address, family, prefix);
  const canonicalAddress =
    family === 4 ? ipv4FromBigInt(start) : ipv6FromBigInt(start);
  return {
    cidr: `${canonicalAddress}/${prefix}`,
    family,
    startHex: hexAddress(start, family),
    endHex: hexAddress(end, family),
  };
}

function normalizeCidrs(value: unknown, limit = 200) {
  const parsed = new Map<string, NormalizedCidr>();
  for (const item of stringList(value, limit)) {
    const cidr = parseCidr(item);
    parsed.set(`${cidr.family}:${cidr.cidr}`, cidr);
  }
  return [...parsed.values()];
}

function ipAddressForMatch(value: string) {
  const normalized = value.trim().toLowerCase();
  const family = isIP(normalized);
  if (family === 4) {
    const address = parseIpv4ToBigInt(normalized);
    return address === null ? null : { family, address };
  }
  if (family === 6) {
    const address = parseIpv6ToBigInt(normalized);
    return address === null ? null : { family, address };
  }
  return null;
}

export function normalizePermissionRules(value: unknown): PermissionRules {
  const raw = isRecord(value) ? value : {};
  const links = isRecord(raw.links) ? raw.links : {};
  const options = isRecord(links.options) ? links.options : {};
  const admin = isRecord(raw.admin) ? raw.admin : {};
  const auth = isRecord(raw.auth) ? raw.auth : {};
  const api = isRecord(raw.api) ? raw.api : {};

  return {
    links: {
      create: nullableBoolean(links.create),
      options: coupleLinkedOptionRules(normalizedOptionRules(options)),
      codeMinLength: boundedNumber(links.codeMinLength, 1, 64),
      codeMaxLength: boundedNumber(links.codeMaxLength, 1, 64),
      generatedCodeLength: boundedNumber(links.generatedCodeLength, 1, 64),
      domains: Object.prototype.hasOwnProperty.call(links, 'domains')
        ? normalizeShortLinkDomains(stringList(links.domains, 100))
        : null,
      deleteOwn: nullableBoolean(links.deleteOwn),
      deleteMaxClicks: boundedNumber(links.deleteMaxClicks, 0, 1_000_000),
      editOwn: nullableBoolean(links.editOwn),
      viewAll: nullableBoolean(links.viewAll),
      editAll: nullableBoolean(links.editAll),
      deleteAll: nullableBoolean(links.deleteAll),
      statsAll: nullableBoolean(links.statsAll),
      statsCsv: nullableBoolean(links.statsCsv),
      healthAll: nullableBoolean(links.healthAll),
      expiresAtBypass: nullableBoolean(links.expiresAtBypass),
      passwordBypass: nullableBoolean(links.passwordBypass),
      editableFields: coupleLinkedEditFieldRules(
        normalizedEditFieldRules(links.editableFields),
      ),
    },
    admin: {
      access: nullableBoolean(admin.access),
      sections: selectedKeys(admin.sections, ADMIN_SECTION_KEYS),
      manageSections: selectedKeys(admin.manageSections, ADMIN_SECTION_KEYS),
      plugins: stringList(admin.plugins, 100),
      manageUsers: nullableBoolean(admin.manageUsers),
      managePermissions: nullableBoolean(admin.managePermissions),
    },
    auth: {
      resendVerificationDailyLimit: boundedNumber(
        auth.resendVerificationDailyLimit,
        0,
        1_000,
      ),
      passwordResetDailyLimit: boundedNumber(
        auth.passwordResetDailyLimit,
        0,
        1_000,
      ),
    },
    api: Object.fromEntries(
      API_PERMISSION_KEYS.map((key) => [key, nullableBoolean(api[key])]),
    ) as Record<ApiPermissionKey, boolean | null>,
  };
}

function publicGroup(
  group: PermissionGroupModel,
  userMemberships: PermissionGroupUserMembership[] = [],
  cidrRules: Array<{ cidr: string; expiresAt: string | null }> = [],
): PublicPermissionGroup {
  const userIds = userMemberships.map((membership) => membership.userId);
  const ipRules = cidrRules.map((rule) => rule.cidr);

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    priority: group.priority,
    enabled: group.enabled,
    autoAssign: normalizePermissionGroupAutoAssign(group.auto_assign),
    userIds,
    ipRules,
    userMemberships,
    cidrRules,
    rules: normalizePermissionRules(group.rules),
    createdAt: group.created_at.toISOString(),
    updatedAt: group.updated_at.toISOString(),
  };
}

async function loadGroupRelations(groupIds: number[]) {
  const userMembershipsByGroup = new Map<
    number,
    PermissionGroupUserMembership[]
  >();
  const cidrRulesByGroup = new Map<
    number,
    Array<{ cidr: string; expiresAt: string | null }>
  >();
  if (groupIds.length === 0)
    return { userMembershipsByGroup, cidrRulesByGroup };

  const [memberships, cidrs] = await Promise.all([
    PermissionGroupUserModel.findAll({
      where: { group_id: { [Op.in]: groupIds } },
      order: [
        ['group_id', 'ASC'],
        ['user_id', 'ASC'],
      ],
    }),
    PermissionGroupCidrModel.findAll({
      where: { group_id: { [Op.in]: groupIds } },
      order: [
        ['group_id', 'ASC'],
        ['family', 'ASC'],
        ['start_hex', 'ASC'],
      ],
    }),
  ]);

  for (const membership of memberships) {
    const list = userMembershipsByGroup.get(membership.group_id) ?? [];
    list.push({
      userId: membership.user_id,
      expiresAt: membership.expires_at?.toISOString() ?? null,
      reason: membership.reason,
      reasonPublic: membership.reason_public === true,
      assignmentSource:
        membership.assignment_source === 'automatic' ? 'automatic' : 'manual',
    });
    userMembershipsByGroup.set(membership.group_id, list);
  }
  for (const cidr of cidrs) {
    const list = cidrRulesByGroup.get(cidr.group_id) ?? [];
    list.push({
      cidr: cidr.cidr,
      expiresAt: cidr.expires_at?.toISOString() ?? null,
    });
    cidrRulesByGroup.set(cidr.group_id, list);
  }

  return { userMembershipsByGroup, cidrRulesByGroup };
}

export async function listPermissionGroups() {
  await ensureDatabase();
  const groups = await PermissionGroupModel.findAll({
    order: [
      ['priority', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const relations = await loadGroupRelations(groups.map((group) => group.id));
  return groups.map((group) =>
    publicGroup(
      group,
      relations.userMembershipsByGroup.get(group.id) ?? [],
      relations.cidrRulesByGroup.get(group.id) ?? [],
    ),
  );
}

async function relationCounts(
  table: 'permission_group_users' | 'permission_group_cidrs',
  groupIds: number[],
) {
  const counts = new Map<number, number>();
  if (groupIds.length === 0) return counts;
  const rows = await getDatabase().query<{
    group_id: number;
    count: string | number;
  }>(
    `
      SELECT group_id, COUNT(*) AS count
      FROM ${table}
      WHERE group_id IN (:groupIds)
      GROUP BY group_id
    `,
    {
      replacements: { groupIds },
      type: QueryTypes.SELECT,
    },
  );
  for (const row of rows) counts.set(row.group_id, Number(row.count));
  return counts;
}

export async function listPermissionGroupSummaries() {
  await ensureDatabase();
  const groups = await PermissionGroupModel.findAll({
    order: [
      ['priority', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const groupIds = groups.map((group) => group.id);
  const [userCounts, cidrCounts] = await Promise.all([
    relationCounts('permission_group_users', groupIds),
    relationCounts('permission_group_cidrs', groupIds),
  ]);
  return groups.map(
    (group): PublicPermissionGroupSummary => ({
      id: group.id,
      name: group.name,
      description: group.description,
      priority: group.priority,
      enabled: group.enabled,
      userCount: userCounts.get(group.id) ?? 0,
      cidrCount: cidrCounts.get(group.id) ?? 0,
      createdAt: group.created_at.toISOString(),
      updatedAt: group.updated_at.toISOString(),
    }),
  );
}

export async function getPermissionGroup(
  id: number,
  options: { includeRelations?: boolean } = {},
) {
  await ensureDatabase();
  const group = await PermissionGroupModel.findByPk(id);
  if (!group) return null;
  if (options.includeRelations === false) return publicGroup(group);
  const relations = await loadGroupRelations([id]);
  return publicGroup(
    group,
    relations.userMembershipsByGroup.get(id) ?? [],
    relations.cidrRulesByGroup.get(id) ?? [],
  );
}

function assignmentExpiresAt(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function groupIdCondition(groupId: number) {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
}

export async function searchPermissionGroupUsers(input: {
  groupId: number;
  query?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<PermissionGroupUserSearchResult> {
  await ensureDatabase();
  groupIdCondition(input.groupId);
  const query = (input.query ?? '').trim().slice(0, 120);
  const replacements: Record<string, string | number> = {
    groupId: input.groupId,
  };
  const filters = ['pgu.group_id = :groupId'];

  if (query) {
    replacements.like = `%${query}%`;
    const numericId = Number(query);
    const searchFilters = ['u.email ILIKE :like', 'u.name ILIKE :like'];
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      replacements.numericId = numericId;
      searchFilters.push('u.id = :numericId');
    }
    filters.push(`(${searchFilters.join(' OR ')})`);
  }

  const whereSql = filters.join(' AND ');
  const countRows = await getDatabase().query<{ count: string | number }>(
    `
      SELECT COUNT(*) AS count
      FROM permission_group_users pgu
      JOIN users u ON u.id = pgu.user_id
      WHERE ${whereSql}
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
    },
  );
  const total = Number(countRows[0]?.count ?? 0);
  const pagination = paginationMeta({
    totalItems: total,
    page: input.page,
    pageSize: input.pageSize,
  });
  const rows = await getDatabase().query<{
    id: number;
    email: string;
    name: string;
    is_admin: boolean;
    enabled: boolean;
    expires_at: Date | string | null;
    reason: string | null;
    reason_public: boolean | null;
    assignment_source: string | null;
  }>(
    `
      SELECT
        u.id,
        u.email,
        u.name,
        u.is_admin,
        u.enabled,
        pgu.expires_at,
        pgu.reason,
        pgu.reason_public,
        pgu.assignment_source
      FROM permission_group_users pgu
      JOIN users u ON u.id = pgu.user_id
      WHERE ${whereSql}
      ORDER BY u.name ASC, u.email ASC, u.id ASC
      LIMIT :limit OFFSET :offset
    `,
    {
      replacements: {
        ...replacements,
        limit: pagination.pageSize,
        offset: pageOffset(pagination),
      },
      type: QueryTypes.SELECT,
    },
  );

  return {
    query,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: pagination.totalPages,
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      isAdmin: row.is_admin === true,
      enabled: row.enabled === true,
      expiresAt: assignmentExpiresAt(row.expires_at),
      reason: (row.reason ?? '').trim(),
      reasonPublic: row.reason_public === true,
      assignmentSource:
        row.assignment_source === 'automatic' ? 'automatic' : 'manual',
    })),
  };
}

export async function searchPermissionGroupCidrs(input: {
  groupId: number;
  query?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<PermissionGroupCidrSearchResult> {
  await ensureDatabase();
  groupIdCondition(input.groupId);
  const query = (input.query ?? '').trim().slice(0, 120);
  const where: WhereOptions<PermissionGroupCidrModel> = {
    group_id: input.groupId,
  };
  if (query) where.cidr = { [Op.iLike]: `%${query}%` };

  const total = await PermissionGroupCidrModel.count({ where });
  const pagination = paginationMeta({
    totalItems: total,
    page: input.page,
    pageSize: input.pageSize,
  });
  const rows = await PermissionGroupCidrModel.findAll({
    where,
    order: [
      ['family', 'ASC'],
      ['start_hex', 'ASC'],
      ['cidr', 'ASC'],
    ],
    limit: pagination.pageSize,
    offset: pageOffset(pagination),
  });

  return {
    query,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: pagination.totalPages,
    cidrs: rows.map((row) => ({
      cidr: row.cidr,
      expiresAt: assignmentExpiresAt(row.expires_at),
    })),
  };
}

export async function listUserPermissionGroups(
  userId: number,
): Promise<UserPermissionGroup[]> {
  await ensureDatabase();
  if (!Number.isSafeInteger(userId) || userId <= 0) return [];
  const rows = await getDatabase().query<{
    id: number;
    name: string;
    description: string;
    priority: number;
    expires_at: Date | string | null;
    assignment_source: string | null;
  }>(
    `
      SELECT
        pg.id,
        pg.name,
        pg.description,
        pg.priority,
        pgu.expires_at,
        pgu.assignment_source
      FROM permission_group_users pgu
      JOIN permission_groups pg ON pg.id = pgu.group_id
      WHERE pgu.user_id = :userId
        AND pg.enabled = true
        AND (pgu.expires_at IS NULL OR pgu.expires_at > now())
      ORDER BY pg.priority ASC, pg.id ASC
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    expiresAt: assignmentExpiresAt(row.expires_at),
    assignmentSource:
      row.assignment_source === 'automatic' ? 'automatic' : 'manual',
  }));
}

function normalizeGroupInput(
  input: PermissionGroupInput,
): NormalizedPermissionGroupInput {
  const minLength = input.rules.links.codeMinLength;
  const maxLength = input.rules.links.codeMaxLength;
  const generatedLength = input.rules.links.generatedCodeLength;
  const rules = normalizePermissionRules(input.rules);
  const autoAssign = normalizePermissionGroupAutoAssign(input.autoAssign);
  const cidrs = normalizeCidrs(input.ipRules, 200);

  if (minLength !== null && maxLength !== null && minLength > maxLength) {
    rules.links.codeMaxLength = minLength;
  }
  if (
    generatedLength !== null &&
    rules.links.codeMinLength !== null &&
    generatedLength < rules.links.codeMinLength
  ) {
    rules.links.generatedCodeLength = rules.links.codeMinLength;
  }
  if (
    generatedLength !== null &&
    rules.links.codeMaxLength !== null &&
    generatedLength > rules.links.codeMaxLength
  ) {
    rules.links.generatedCodeLength = rules.links.codeMaxLength;
  }

  return {
    name: input.name.trim().slice(0, 120) || 'New permission group',
    description: input.description.trim().slice(0, 1000),
    priority: Math.max(0, Math.min(10_000, Math.round(input.priority))),
    enabled: input.enabled,
    autoAssign,
    userIds: userIdList(input.userIds),
    ipRules: cidrs.map((cidr) => cidr.cidr),
    cidrs,
    rules,
  };
}

async function replaceGroupAssignments(
  groupId: number,
  input: NormalizedPermissionGroupInput,
  transaction: Transaction,
) {
  if (input.userIds.length > 0) {
    const existingUsers = await UserModel.findAll({
      attributes: ['id'],
      where: { id: { [Op.in]: input.userIds } },
      transaction,
    });
    const existingIds = new Set(existingUsers.map((user) => user.id));
    const missingIds = input.userIds.filter(
      (userId) => !existingIds.has(userId),
    );
    if (missingIds.length > 0) {
      throw new Error(
        serverMessage('unknownUserIdsIncluded', {
          ids: missingIds.join(', '),
        }),
      );
    }
  }

  await Promise.all([
    PermissionGroupUserModel.destroy({
      where: { group_id: groupId },
      transaction,
    }),
    PermissionGroupCidrModel.destroy({
      where: { group_id: groupId },
      transaction,
    }),
  ]);

  const createdAt = new Date();
  await Promise.all([
    input.userIds.length > 0
      ? PermissionGroupUserModel.bulkCreate(
          input.userIds.map((userId) => ({
            group_id: groupId,
            user_id: userId,
            expires_at: null,
            assignment_source: 'manual',
            created_at: createdAt,
          })),
          { transaction },
        )
      : Promise.resolve(),
    input.cidrs.length > 0
      ? PermissionGroupCidrModel.bulkCreate(
          input.cidrs.map((cidr) => ({
            group_id: groupId,
            cidr: cidr.cidr,
            family: cidr.family,
            start_hex: cidr.startHex,
            end_hex: cidr.endHex,
            expires_at: null,
            created_at: createdAt,
          })),
          { transaction },
        )
      : Promise.resolve(),
  ]);
}

export async function createPermissionGroup(input: PermissionGroupInput) {
  await ensureDatabase();
  const normalized = normalizeGroupInput(input);
  const groupId = await getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const group = await PermissionGroupModel.create(
      {
        name: normalized.name,
        description: normalized.description,
        priority: normalized.priority,
        enabled: normalized.enabled,
        rules: normalized.rules as unknown as Record<string, unknown>,
        auto_assign: normalized.autoAssign as unknown as Record<
          string,
          unknown
        >,
        created_at: now,
        updated_at: now,
      },
      { transaction },
    );
    await replaceGroupAssignments(group.id, normalized, transaction);
    return group.id;
  });
  await syncAutomaticPermissionGroupMembershipsForGroup(groupId);
  const group = await getPermissionGroup(groupId);
  if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
  return group;
}

export async function updatePermissionGroup(
  id: number,
  input: PermissionGroupInput,
) {
  await ensureDatabase();
  const normalized = normalizeGroupInput(input);
  await getDatabase().transaction(async (transaction) => {
    const group = await PermissionGroupModel.findByPk(id, { transaction });
    if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
    await group.update(
      {
        name: normalized.name,
        description: normalized.description,
        priority: normalized.priority,
        enabled: normalized.enabled,
        rules: normalized.rules as unknown as Record<string, unknown>,
        auto_assign: normalized.autoAssign as unknown as Record<
          string,
          unknown
        >,
        updated_at: new Date(),
      },
      { transaction },
    );
    await replaceGroupAssignments(group.id, normalized, transaction);
  });
  await syncAutomaticPermissionGroupMembershipsForGroup(id);
  const group = await getPermissionGroup(id);
  if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
  return group;
}

export async function updatePermissionGroupSettings(
  id: number,
  input: PermissionGroupInput,
) {
  await ensureDatabase();
  const normalized = normalizeGroupInput({
    ...input,
    userIds: [],
    ipRules: [],
  });
  await getDatabase().transaction(async (transaction) => {
    const group = await PermissionGroupModel.findByPk(id, { transaction });
    if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
    await group.update(
      {
        name: normalized.name,
        description: normalized.description,
        priority: normalized.priority,
        enabled: normalized.enabled,
        rules: normalized.rules as unknown as Record<string, unknown>,
        auto_assign: normalized.autoAssign as unknown as Record<
          string,
          unknown
        >,
        updated_at: new Date(),
      },
      { transaction },
    );
  });
  await syncAutomaticPermissionGroupMembershipsForGroup(id);
  const group = await getPermissionGroup(id);
  if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
  return group;
}

export async function deletePermissionGroup(id: number) {
  await ensureDatabase();
  return (await PermissionGroupModel.destroy({ where: { id } })) > 0;
}

export async function deletePermissionGroups(ids: number[]) {
  await ensureDatabase();
  const uniqueIds = [
    ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ];
  if (uniqueIds.length === 0) return 0;
  return PermissionGroupModel.destroy({
    where: { id: { [Op.in]: uniqueIds } },
  });
}

export async function addPermissionGroupUser(
  groupId: number,
  userId: number,
  expiresAt: Date | null = null,
  options: { reason?: string; reasonPublic?: boolean } = {},
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error(serverMessage('userIdInvalid'));
  }
  return getDatabase().transaction(async (transaction) => {
    const [group, user] = await Promise.all([
      PermissionGroupModel.findByPk(groupId, { transaction }),
      UserModel.findByPk(userId, { transaction }),
    ]);
    if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
    if (!user) throw new Error(serverMessage('userNotFound'));
    const reason = (options.reason ?? '').trim().slice(0, 1000);
    const reasonPublic = reason ? options.reasonPublic === true : false;
    const [membership, created] = await PermissionGroupUserModel.findOrCreate({
      where: { group_id: groupId, user_id: userId },
      defaults: {
        group_id: groupId,
        user_id: userId,
        expires_at: expiresAt,
        reason,
        reason_public: reasonPublic,
        assignment_source: 'manual',
        created_at: new Date(),
      },
      transaction,
    });
    if (!created)
      await membership.update(
        {
          expires_at: expiresAt,
          reason,
          reason_public: reasonPublic,
          assignment_source: 'manual',
        },
        { transaction },
      );
  });
}

export async function removePermissionGroupUser(
  groupId: number,
  userId: number,
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error(serverMessage('userIdInvalid'));
  }
  await removePermissionGroupUsers(groupId, [userId]);
}

export async function removePermissionGroupUsers(
  groupId: number,
  userIds: number[],
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  const uniqueIds = [
    ...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ];
  if (uniqueIds.length === 0) return 0;
  return PermissionGroupUserModel.destroy({
    where: { group_id: groupId, user_id: { [Op.in]: uniqueIds } },
  });
}

async function userMatchesAutoAssign(
  user: UserModel,
  autoAssign: PermissionGroupAutoAssign,
) {
  if (!autoAssign.enabled) return false;
  if (autoAssign.conditions.length === 0) return false;
  for (const condition of autoAssign.conditions) {
    const matcher = autoAssignMatchers.get(condition.type);
    if (!matcher) return false;
    if (!(await matcher({ user, condition }))) return false;
  }
  return true;
}

async function upsertAutomaticMembership(groupId: number, userId: number) {
  const [membership, created] = await PermissionGroupUserModel.findOrCreate({
    where: { group_id: groupId, user_id: userId },
    defaults: {
      group_id: groupId,
      user_id: userId,
      expires_at: null,
      reason: '',
      reason_public: false,
      assignment_source: 'automatic',
      created_at: new Date(),
    },
  });

  if (!created && membership.assignment_source === 'automatic') {
    await membership.update({
      expires_at: null,
      reason: '',
      reason_public: false,
    });
  }
}

export async function syncAutomaticPermissionGroupMembershipsForUser(
  userId: number,
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  const user = await UserModel.findByPk(userId);
  if (!user) return;
  const groups = await PermissionGroupModel.findAll();

  for (const group of groups) {
    const autoAssign = normalizePermissionGroupAutoAssign(group.auto_assign);
    if (await userMatchesAutoAssign(user, autoAssign)) {
      await upsertAutomaticMembership(group.id, user.id);
      continue;
    }
    if (autoAssign.revokeWhenUnmatched) {
      await PermissionGroupUserModel.destroy({
        where: {
          group_id: group.id,
          user_id: user.id,
          assignment_source: 'automatic',
        },
      });
    }
  }
}

export async function syncAutomaticPermissionGroupMembershipsForGroup(
  groupId: number,
) {
  await ensureDatabase();
  groupIdCondition(groupId);
  const group = await PermissionGroupModel.findByPk(groupId);
  if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
  const autoAssign = normalizePermissionGroupAutoAssign(group.auto_assign);

  if (!autoAssign.enabled) {
    if (autoAssign.revokeWhenUnmatched) {
      await PermissionGroupUserModel.destroy({
        where: { group_id: group.id, assignment_source: 'automatic' },
      });
    }
    return;
  }

  const users = await UserModel.findAll({
    attributes: ['id', 'email'],
  });
  const matchedUserIds: number[] = [];
  for (const user of users) {
    if (await userMatchesAutoAssign(user, autoAssign)) {
      matchedUserIds.push(user.id);
    }
  }

  for (const userId of matchedUserIds) {
    await upsertAutomaticMembership(group.id, userId);
  }

  if (!autoAssign.revokeWhenUnmatched) return;
  const where: WhereOptions<PermissionGroupUserModel> = {
    group_id: group.id,
    assignment_source: 'automatic',
  };
  if (matchedUserIds.length > 0) {
    where.user_id = { [Op.notIn]: matchedUserIds };
  }
  await PermissionGroupUserModel.destroy({ where });
}

export async function addPermissionGroupCidr(
  groupId: number,
  rawCidr: string,
  expiresAt: Date | null = null,
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  const cidr = parseCidr(rawCidr);
  return getDatabase().transaction(async (transaction) => {
    const group = await PermissionGroupModel.findByPk(groupId, {
      transaction,
    });
    if (!group) throw new Error(serverMessage('permissionGroupNotFound'));
    const [rule, created] = await PermissionGroupCidrModel.findOrCreate({
      where: { group_id: groupId, cidr: cidr.cidr },
      defaults: {
        group_id: groupId,
        cidr: cidr.cidr,
        family: cidr.family,
        start_hex: cidr.startHex,
        end_hex: cidr.endHex,
        expires_at: expiresAt,
        created_at: new Date(),
      },
      transaction,
    });
    if (!created) {
      await rule.update(
        {
          family: cidr.family,
          start_hex: cidr.startHex,
          end_hex: cidr.endHex,
          expires_at: expiresAt,
        },
        { transaction },
      );
    }
  });
}

export async function removePermissionGroupCidr(groupId: number, cidr: string) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  const normalized = cidr.trim();
  if (!normalized) throw new Error(serverMessage('cidrInvalid'));
  await removePermissionGroupCidrs(groupId, [normalized]);
}

export async function removePermissionGroupCidrs(
  groupId: number,
  cidrs: string[],
) {
  await ensureDatabase();
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error(serverMessage('permissionGroupIdInvalid'));
  }
  const uniqueCidrs = [
    ...new Set(cidrs.map((cidr) => cidr.trim()).filter(Boolean)),
  ];
  if (uniqueCidrs.length === 0) return 0;
  return PermissionGroupCidrModel.destroy({
    where: { group_id: groupId, cidr: { [Op.in]: uniqueCidrs } },
  });
}

function ipMatchesCidr(ip: string, rule: string) {
  const address = ipAddressForMatch(ip);
  if (!address) return false;
  let cidr: NormalizedCidr;
  try {
    cidr = parseCidr(rule);
  } catch {
    return false;
  }
  if (address.family !== cidr.family) return false;
  const start = BigInt(`0x${cidr.startHex}`);
  const end = BigInt(`0x${cidr.endHex}`);
  return address.address >= start && address.address <= end;
}

function isActiveAssignment(expiresAt: string | null) {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}

function activeUserMembership(
  group: PublicPermissionGroup,
  user: AuthenticatedUser | null,
) {
  if (!user) return undefined;
  return group.userMemberships.find(
    (membership) =>
      membership.userId === user.id && isActiveAssignment(membership.expiresAt),
  );
}

function activeCidrRule(group: PublicPermissionGroup, ip: string) {
  return group.cidrRules.find(
    (rule) =>
      isActiveAssignment(rule.expiresAt) && ipMatchesCidr(ip, rule.cidr),
  );
}

function matchedGroupSummary(
  group: PublicPermissionGroup,
  user: AuthenticatedUser | null,
  ip: string,
) {
  const membership = activeUserMembership(group, user);
  const cidr = membership ? undefined : activeCidrRule(group, ip);
  if (!membership && !cidr) return null;
  const reason =
    membership?.reasonPublic === true ? membership.reason.trim() : '';
  return {
    id: group.id,
    name: group.name,
    ...(reason ? { reason } : {}),
  };
}

function basePermissions(
  settings: SiteSettings,
  user: AuthenticatedUser | null,
): EffectivePermissions {
  const defaultDomains =
    settings.links.allowedDomains.length > 0
      ? settings.links.allowedDomains
      : settings.general.domains;

  return {
    isAdmin: false,
    matchedGroups: [],
    links: {
      canCreate:
        settings.links.allowCreate &&
        (settings.access.visibility === 'public' || Boolean(user)),
      options: { ...settings.links.options },
      codeMinLength: settings.links.codeMinLength,
      codeMaxLength: settings.links.codeMaxLength,
      generatedCodeLength: settings.links.generatedCodeLength,
      domains: [...defaultDomains],
      deleteOwn: settings.links.allowUserDelete,
      deleteMaxClicks: settings.links.userDeleteMaxClicks,
      editOwn: settings.links.editOwn,
      viewAll: settings.links.viewAll,
      editAll: settings.links.editAll,
      deleteAll: settings.links.deleteAll,
      statsAll: settings.links.statsAll,
      statsCsv: settings.links.statsCsv,
      healthAll: settings.links.healthAll,
      expiresAtBypass: false,
      passwordBypass: false,
      editableFields: [...settings.links.editableFields],
    },
    admin: {
      access: false,
      sections: [],
      manageSections: [],
      plugins: [],
      manageUsers: false,
      managePermissions: false,
    },
    auth: {
      resendVerificationDailyLimit:
        settings.auth.accountRecovery.resendVerificationDailyLimit,
      passwordResetDailyLimit:
        settings.auth.accountRecovery.passwordResetDailyLimit,
    },
    api: {
      enabled: settings.api.enabled,
      create: settings.api.allowCreate,
      list: settings.api.allowList,
      stats: settings.api.allowStats,
      delete: settings.api.allowDelete,
      update: settings.api.allowUpdate,
    },
  };
}

function adminPermissions(settings: SiteSettings): EffectivePermissions {
  return {
    isAdmin: true,
    matchedGroups: [],
    links: {
      canCreate: true,
      options: { ...ALL_LINK_OPTIONS },
      codeMinLength: 1,
      codeMaxLength: settings.links.codeMaxLength,
      generatedCodeLength: settings.links.generatedCodeLength,
      domains: [...settings.general.domains],
      deleteOwn: true,
      deleteMaxClicks: 0,
      editOwn: true,
      viewAll: true,
      editAll: true,
      deleteAll: true,
      statsAll: true,
      statsCsv: true,
      healthAll: true,
      expiresAtBypass: true,
      passwordBypass: true,
      editableFields: [...ALL_LINK_EDIT_FIELDS],
    },
    admin: {
      access: true,
      sections: [...ALL_ADMIN_SECTIONS],
      manageSections: [...ALL_ADMIN_SECTIONS],
      plugins: ['*'],
      manageUsers: true,
      managePermissions: true,
    },
    auth: {
      resendVerificationDailyLimit: 1_000,
      passwordResetDailyLimit: 1_000,
    },
    api: {
      enabled: true,
      create: true,
      list: true,
      stats: true,
      delete: true,
      update: true,
    },
  };
}

function applyGroupRules(
  permissions: EffectivePermissions,
  group: PublicPermissionGroup,
  matchedGroup: EffectivePermissions['matchedGroups'][number],
  settings: SiteSettings,
) {
  const rules = group.rules;
  permissions.matchedGroups.push(matchedGroup);

  if (rules.links.create !== null) {
    permissions.links.canCreate = rules.links.create;
  }
  for (const key of LINK_OPTION_KEYS) {
    const value = rules.links.options[key];
    if (value !== null) permissions.links.options[key] = value;
  }
  if (rules.links.codeMinLength !== null) {
    permissions.links.codeMinLength = rules.links.codeMinLength;
  }
  if (rules.links.codeMaxLength !== null) {
    permissions.links.codeMaxLength = rules.links.codeMaxLength;
  }
  if (rules.links.generatedCodeLength !== null) {
    permissions.links.generatedCodeLength = rules.links.generatedCodeLength;
  }
  if (rules.links.domains !== null) {
    permissions.links.domains =
      rules.links.domains.length > 0
        ? [...rules.links.domains]
        : [...settings.general.domains];
  }
  if (rules.links.deleteOwn !== null) {
    permissions.links.deleteOwn = rules.links.deleteOwn;
  }
  if (rules.links.deleteMaxClicks !== null) {
    permissions.links.deleteMaxClicks = rules.links.deleteMaxClicks;
  }
  if (rules.links.editOwn !== null) {
    permissions.links.editOwn = rules.links.editOwn;
  }
  if (rules.links.viewAll !== null)
    permissions.links.viewAll = rules.links.viewAll;
  if (rules.links.editAll !== null)
    permissions.links.editAll = rules.links.editAll;
  if (rules.links.deleteAll !== null)
    permissions.links.deleteAll = rules.links.deleteAll;
  if (rules.links.statsAll !== null)
    permissions.links.statsAll = rules.links.statsAll;
  if (rules.links.statsCsv !== null)
    permissions.links.statsCsv = rules.links.statsCsv;
  if (rules.links.healthAll !== null)
    permissions.links.healthAll = rules.links.healthAll;
  if (rules.links.expiresAtBypass !== null)
    permissions.links.expiresAtBypass = rules.links.expiresAtBypass;
  if (rules.links.passwordBypass !== null)
    permissions.links.passwordBypass = rules.links.passwordBypass;
  const editableFields = new Set(permissions.links.editableFields);
  for (const key of LINK_EDIT_FIELD_KEYS) {
    const value = rules.links.editableFields[key];
    if (value === true) editableFields.add(key);
    if (value === false) editableFields.delete(key);
  }
  permissions.links.editableFields = LINK_EDIT_FIELD_KEYS.filter((key) =>
    editableFields.has(key),
  );

  if (rules.admin.access !== null)
    permissions.admin.access = rules.admin.access;
  if (rules.admin.sections.length > 0) {
    permissions.admin.sections = [...rules.admin.sections];
  }
  if (rules.admin.manageSections.length > 0) {
    permissions.admin.manageSections = [...rules.admin.manageSections];
  }
  if (rules.admin.plugins.length > 0) {
    permissions.admin.plugins = [...rules.admin.plugins];
  }
  if (rules.admin.manageUsers !== null) {
    permissions.admin.manageUsers = rules.admin.manageUsers;
  }
  if (rules.admin.managePermissions !== null) {
    permissions.admin.managePermissions = rules.admin.managePermissions;
  }

  if (rules.auth.resendVerificationDailyLimit !== null) {
    permissions.auth.resendVerificationDailyLimit =
      rules.auth.resendVerificationDailyLimit;
  }
  if (rules.auth.passwordResetDailyLimit !== null) {
    permissions.auth.passwordResetDailyLimit =
      rules.auth.passwordResetDailyLimit;
  }

  for (const key of API_PERMISSION_KEYS) {
    const value = rules.api[key];
    if (value !== null) permissions.api[key] = value;
  }
}

function normalizeEffectiveLinks(
  permissions: EffectivePermissions,
  settings: SiteSettings,
) {
  const links = permissions.links;
  const min = Math.max(1, Math.min(64, Math.round(links.codeMinLength)));
  const max = Math.max(min, Math.min(64, Math.round(links.codeMaxLength)));
  links.codeMinLength = min;
  links.codeMaxLength = max;
  links.generatedCodeLength = Math.max(
    min,
    Math.min(max, Math.round(links.generatedCodeLength)),
  );
  normalizeEffectiveRedirectRuleOptions(links.options);
  links.editableFields = normalizeEffectiveRedirectRuleEditFields(
    links.editableFields,
  );
  const configuredDomains = new Set(settings.general.domains);
  links.domains = [
    ...new Set(links.domains.filter((domain) => configuredDomains.has(domain))),
  ];
  return permissions;
}

export async function effectivePermissions(input: {
  settings: SiteSettings;
  user: AuthenticatedUser | null;
  isAdmin: boolean;
  ip: string;
}) {
  if (input.isAdmin) return adminPermissions(input.settings);
  const permissions = basePermissions(input.settings, input.user);
  const groups = (await listPermissionGroups())
    .filter((group) => group.enabled)
    .map((group) => ({
      group,
      matchedGroup: matchedGroupSummary(group, input.user, input.ip),
    }))
    .filter(
      (
        value,
      ): value is {
        group: PublicPermissionGroup;
        matchedGroup: EffectivePermissions['matchedGroups'][number];
      } => value.matchedGroup !== null,
    );

  for (const { group, matchedGroup } of groups) {
    applyGroupRules(permissions, group, matchedGroup, input.settings);
  }

  return normalizeEffectiveLinks(permissions, input.settings);
}

export function publicPermissionGroupReasons(
  permissions: EffectivePermissions,
): PublicPermissionGroupReason[] {
  return permissions.matchedGroups.flatMap((group) => {
    const reason = group.reason?.trim();
    return reason ? [{ id: group.id, name: group.name, reason }] : [];
  });
}

export async function effectivePermissionsForEvent(
  event: Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>,
) {
  const settings = event.locals.settings;
  return effectivePermissions({
    settings,
    user: event.locals.user,
    isAdmin: event.locals.isAdmin,
    ip: getClientIp(
      event.request,
      event.getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    ),
  });
}

export function linkSettingsForPermissions(
  settings: SiteSettings['links'],
  permissions: EffectivePermissions,
): SiteSettings['links'] {
  return {
    ...settings,
    allowCustomCodes: permissions.links.options.customCode,
    options: { ...permissions.links.options },
    codeMinLength: permissions.links.codeMinLength,
    codeMaxLength: permissions.links.codeMaxLength,
    generatedCodeLength: permissions.links.generatedCodeLength,
    allowedDomains: [...permissions.links.domains],
  };
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function assertCreateOptionsAllowed(
  form: FormData,
  permissions: EffectivePermissions,
) {
  const checks: Array<[LinkOptionKey, string, string[]]> = [
    ['customCode', 'customCode', ['code']],
    ['previewTitle', 'previewTitle', ['previewTitle']],
    ['previewDescription', 'previewDescription', ['previewDescription']],
    ['previewImageUrl', 'previewImageUrl', ['previewImageUrl']],
    ['themeColor', 'themeColor', ['themeColor']],
    ['utmSource', 'utmSource', ['utmSource']],
    ['utmMedium', 'utmMedium', ['utmMedium']],
    ['utmCampaign', 'utmCampaign', ['utmCampaign']],
    ['utmTerm', 'utmTerm', ['utmTerm']],
    ['utmContent', 'utmContent', ['utmContent']],
    ['expiresAt', 'expiresAt', ['expiresAt']],
    ['maxClicks', 'maxClicks', ['maxClicks']],
    ['password', 'password', ['password', 'clearPassword']],
    ['tags', 'tags', ['tags']],
    ['redirectRules', 'redirectRules', ['redirectRules']],
  ];

  for (const [key, label, names] of checks) {
    if (permissions.links.options[key]) continue;
    if (names.some((name) => hasValue(form.get(name)))) {
      throw new Error(serverMessage('optionDenied', { label }));
    }
  }

  if (hasValue(form.get('redirectRules'))) {
    if (!permissions.links.options.redirectRules) {
      throw new Error(
        serverMessage('optionDenied', { label: 'redirectRules' }),
      );
    }

    for (const key of redirectRulePermissionKeysFromValue(
      form.get('redirectRules'),
    )) {
      if (!permissions.links.options[key]) {
        throw new Error(serverMessage('optionDenied', { label: key }));
      }
    }
  }
}

export function canAccessAdminSection(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
) {
  return permissions.isAdmin || permissions.admin.sections.includes(section);
}

export function canManageAdminSection(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
) {
  return (
    permissions.isAdmin || permissions.admin.manageSections.includes(section)
  );
}

export function canAccessAdminPlugin(
  permissions: EffectivePermissions,
  pluginId: string,
  accessPermissions: readonly AdminPluginAccessPermission[] = [],
) {
  const hasPluginAccess =
    permissions.admin.plugins.includes('*') ||
    permissions.admin.plugins.includes(pluginId);
  const hasDeclaredPermission = accessPermissions.some(
    (permission) => permissions.admin[permission],
  );
  return (
    permissions.isAdmin ||
    (permissions.admin.access && (hasPluginAccess || hasDeclaredPermission))
  );
}

export function firstAllowedAdminSection(
  permissions: EffectivePermissions,
): AdminSectionKey | null {
  if (permissions.isAdmin) return 'general';
  return permissions.admin.sections[0] ?? null;
}

export function permissionAssignmentExpiresAtFromForm(
  form: FormData,
): Date | null {
  const directValue = stringValue(form, 'expiresAt');
  if (directValue) {
    const date = new Date(directValue);
    if (Number.isNaN(date.getTime())) {
      throw new Error(serverMessage('expirationDateInvalid'));
    }
    if (date.getTime() <= Date.now()) {
      throw new Error(serverMessage('expirationDateFuture'));
    }
    return date;
  }

  return null;
}

export function permissionGroupInputFromForm(
  form: FormData,
  input: { autoAssign?: PermissionGroupAutoAssign } = {},
): PermissionGroupInput {
  const rules: PermissionRules = clone(emptyRules);
  for (const key of LINK_OPTION_KEYS) {
    const value = stringValue(form, `linkOption.${key}`, 'inherit');
    rules.links.options[key] =
      value === 'allow' ? true : value === 'deny' ? false : null;
  }
  coupleLinkedOptionRules(rules.links.options);
  for (const key of [
    'create',
    'deleteOwn',
    'editOwn',
    'viewAll',
    'editAll',
    'deleteAll',
    'statsAll',
    'statsCsv',
    'healthAll',
    'expiresAtBypass',
    'passwordBypass',
  ] as const) {
    const value = stringValue(form, `links.${key}`, 'inherit');
    rules.links[key] =
      value === 'allow' ? true : value === 'deny' ? false : null;
  }

  rules.links.codeMinLength = parseBoolean(form, 'overrideCodeMinLength')
    ? boundedNumber(form.get('codeMinLength'), 1, 64)
    : null;
  rules.links.codeMaxLength = parseBoolean(form, 'overrideCodeMaxLength')
    ? boundedNumber(form.get('codeMaxLength'), 1, 64)
    : null;
  rules.links.generatedCodeLength = parseBoolean(
    form,
    'overrideGeneratedCodeLength',
  )
    ? boundedNumber(form.get('generatedCodeLength'), 1, 64)
    : null;
  rules.links.domains = parseBoolean(form, 'overrideDomains')
    ? normalizeShortLinkDomains(stringList(stringValue(form, 'allowedDomains')))
    : null;
  rules.links.deleteMaxClicks = parseBoolean(form, 'overrideDeleteMaxClicks')
    ? boundedNumber(form.get('deleteMaxClicks'), 0, 1_000_000)
    : null;
  for (const key of LINK_EDIT_FIELD_KEYS) {
    const value = stringValue(form, `linkEditField.${key}`, 'inherit');
    rules.links.editableFields[key] =
      value === 'allow' ? true : value === 'deny' ? false : null;
  }
  coupleLinkedEditFieldRules(rules.links.editableFields);

  const adminAccess = stringValue(form, 'admin.access', 'inherit');
  rules.admin.access =
    adminAccess === 'allow' ? true : adminAccess === 'deny' ? false : null;
  rules.admin.sections = selectedKeys(
    form.getAll('adminSections'),
    ADMIN_SECTION_KEYS,
  );
  rules.admin.manageSections = selectedKeys(
    form.getAll('adminManageSections'),
    ADMIN_SECTION_KEYS,
  );
  rules.admin.plugins = stringList(stringValue(form, 'adminPlugins'), 100);
  rules.admin.manageUsers =
    stringValue(form, 'admin.manageUsers', 'inherit') === 'allow'
      ? true
      : stringValue(form, 'admin.manageUsers', 'inherit') === 'deny'
        ? false
        : null;
  rules.admin.managePermissions =
    stringValue(form, 'admin.managePermissions', 'inherit') === 'allow'
      ? true
      : stringValue(form, 'admin.managePermissions', 'inherit') === 'deny'
        ? false
        : null;

  rules.auth.resendVerificationDailyLimit = parseBoolean(
    form,
    'overrideResendVerificationDailyLimit',
  )
    ? boundedNumber(form.get('resendVerificationDailyLimit'), 0, 1_000)
    : null;
  rules.auth.passwordResetDailyLimit = parseBoolean(
    form,
    'overridePasswordResetDailyLimit',
  )
    ? boundedNumber(form.get('passwordResetDailyLimit'), 0, 1_000)
    : null;

  for (const key of API_PERMISSION_KEYS) {
    const value = stringValue(form, `api.${key}`, 'inherit');
    rules.api[key] = value === 'allow' ? true : value === 'deny' ? false : null;
  }

  return {
    name: stringValue(form, 'name'),
    description: stringValue(form, 'description'),
    priority: boundedNumber(form.get('priority'), 0, 10_000) ?? 100,
    enabled: parseBoolean(form, 'enabled'),
    autoAssign: normalizePermissionGroupAutoAssign(input.autoAssign),
    userIds: userIdList(
      form.getAll('userIds').length > 0
        ? form.getAll('userIds')
        : stringValue(form, 'userIds'),
    ),
    ipRules: stringList(stringValue(form, 'ipRules'), 200),
    rules,
  };
}
