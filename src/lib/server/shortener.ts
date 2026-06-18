import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  cast,
  col,
  fn,
  Op,
  UniqueConstraintError,
  where as sqlWhere,
  type WhereOptions,
} from 'sequelize';
import {
  ClickEventModel,
  ensureDatabase,
  getDatabase,
  ShortLinkModel,
  UserModel,
} from './database';
import { browserLabelFromClientHints } from './client-hints';
import { getSettings } from './settings';
import {
  linkEditFieldKeys,
  redirectRuleConditionKeys,
  type LinkOptionKey,
  type SiteSettings,
} from '$lib/config';
import {
  matchedRedirectRule,
  normalizeRedirectRules,
  redirectRuleContextFromRequest,
  redirectRulePermissionKeysFromRules,
  storedRedirectRules,
  type MatchedRedirectRule,
  type RedirectRule,
} from './redirect-rules';
import type { LinkOwner } from './link-owner';
import type { LinkSearchState } from '$lib/search';
import { serverMessage } from '$lib/i18n/ui-text';
import { outboundRequest } from './outbound-http';
import {
  activeShareAccessForLinkId,
  linkShareSummariesByLinkId,
  sharedLinkIdsForUser,
  type LinkShareListSummary,
} from './link-sharing';
import {
  DEFAULT_PAGE_SIZE,
  normalizedPage,
  normalizedPageSize,
  pageOffset,
  paginationMeta,
  type PaginationMeta,
} from './pagination';
import type { LinkEditField } from './permissions';

export interface Link {
  id: number;
  code: string;
  domain: string;
  url: string;
  owned?: boolean;
  preview: LinkPreview;
  tags: string[];
  createdAt: string;
  clicks: number;
  lastClickedAt: string | null;
  smart: LinkSmartOptions;
  routing: LinkRoutingOptions;
  health: LinkHealth;
  share: LinkShareListSummary;
}

export interface LinkPreview {
  title: string;
  description: string;
  imageUrl: string;
  themeColor: string;
}

export type LinkPreviewInput = Partial<LinkPreview>;

export interface LinkOperationsInput {
  tags?: string[] | string;
  expiresAt?: string | Date | null;
  maxClicks?: string | number | null;
  password?: string;
  clearPassword?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  redirectRules?: string | RedirectRule[] | null;
}

export interface LinkSmartOptions {
  expiresAt: string | null;
  maxClicks: number;
  passwordProtected: boolean;
}

export interface LinkRoutingOptions {
  redirectRules: RedirectRule[];
}

export interface LinkHealth {
  status: 'unchecked' | 'ok' | 'warning' | 'broken';
  statusCode: number | null;
  checkedAt: string | null;
  error: string;
  responseBody: string;
  latencyMs: number | null;
}

export interface RedirectDestinationResult {
  url: string;
  matchedRule: MatchedRedirectRule | null;
}

export interface LinkCreatorInfo {
  name: string;
  account: {
    id: number;
    email: string | null;
    enabled: boolean;
  } | null;
  ipAddress: string | null;
}

export interface PaginatedLinks {
  items: Link[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ClickEvent {
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  browser: string;
  metadata: Record<string, unknown>;
}

export type ClickInsightAlert = {
  type: 'repeatedIp';
  count: number;
  value: string;
};

type RedirectLink = Link & {
  passwordHash: string | null;
  passwordSalt: string | null;
};

type CreatorVisibility = 'none' | 'name' | 'admin';

export type ClickEventSearch =
  | {
      field: 'createdAt' | 'ipAddress' | 'referer' | 'userAgent';
      query: string;
    }
  | {
      field: 'metadata';
      query: string;
      paths: string[][];
    };

export interface DeleteLinksOptions {
  isAdmin?: boolean;
  owner?: LinkOwner;
  allowUserDelete?: boolean;
  allowAnyOwner?: boolean;
  maxClicks?: number;
  domain?: string;
}

export interface DeleteLinksResult {
  requested: number;
  deleted: number;
  notFound: number;
  denied: number;
  disabled: number;
  tooManyClicks: number;
}

export interface LinkCodeSelection {
  code: string;
  domain?: string;
}

export interface UpdateLinkOptions {
  isAdmin?: boolean;
  allowAnyOwner?: boolean;
  editableFields?: LinkEditField[];
  linkSettings?: SiteSettings['links'];
  siteSettings?: SiteSettings;
  domain?: string;
  owner?: LinkOwner;
  sharedUserId?: number | null;
  partial?: boolean;
}

export type UpdateLinkResult =
  | { status: 'updated'; link: Link }
  | { status: 'not_found' }
  | { status: 'denied' };

export type LinkHealthResult =
  | { status: 'checked'; link: Link }
  | { status: 'not_found' }
  | { status: 'denied' };

const ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_STATS_PAGE = 10_000;
const RESERVED_CODES = new Set([
  'api',
  'admin',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  '_app',
]);

const HEALTH_STATUSES = new Set(['unchecked', 'ok', 'warning', 'broken']);
const UTM_FIELDS = [
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
  ['utmTerm', 'utm_term'],
  ['utmContent', 'utm_content'],
] as const;
type UtmField = (typeof UTM_FIELDS)[number][0];
type UtmPermissions = Partial<Record<UtmField, boolean>>;

function domainWhere(domain: string | undefined): WhereOptions {
  if (domain === undefined) return {};
  return { domain };
}

function linkLookupWhere(
  code: string,
  domain: string | undefined,
): WhereOptions {
  return combineWhere({ code }, domainWhere(domain)) ?? { code };
}

interface UrlPolicyOptions {
  isAdmin?: boolean;
  utmPermissions?: UtmPermissions;
}

function utmFieldAllowed(field: UtmField, options: UrlPolicyOptions) {
  if (options.isAdmin) return true;
  if (!options.utmPermissions) return true;
  return options.utmPermissions[field] === true;
}

function deleteSearchParamCaseInsensitive(parsed: URL, param: string) {
  const normalizedParam = param.toLowerCase();
  const matchingKeys = [
    ...new Set(
      [...parsed.searchParams.keys()].filter(
        (key) => key.toLowerCase() === normalizedParam,
      ),
    ),
  ];
  for (const key of matchingKeys) parsed.searchParams.delete(key);
}

function stripDisallowedUtmParams(parsed: URL, options: UrlPolicyOptions) {
  if (options.isAdmin || !options.utmPermissions) return;

  for (const [field, param] of UTM_FIELDS) {
    if (!utmFieldAllowed(field, options)) {
      deleteSearchParamCaseInsensitive(parsed, param);
    }
  }
}

function utmPermissionsFromEditableFields(
  fields: Set<LinkEditField>,
): Record<UtmField, boolean> {
  return Object.fromEntries(
    UTM_FIELDS.map(([field]) => [field, fields.has(field)]),
  ) as Record<UtmField, boolean>;
}

function utmPermissionsFromLinkOptions(
  options: Partial<Record<LinkOptionKey, boolean>>,
): Record<UtmField, boolean> {
  return Object.fromEntries(
    UTM_FIELDS.map(([field]) => [field, options[field] === true]),
  ) as Record<UtmField, boolean>;
}

function normalizedTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const tags = source
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40));

  return [...new Set(tags)].slice(0, 20);
}

function healthStatus(value: unknown): LinkHealth['status'] {
  return typeof value === 'string' && HEALTH_STATUSES.has(value)
    ? (value as LinkHealth['status'])
    : 'unchecked';
}

const emptyShareSummary = {
  recipientCount: 0,
  access: null,
} satisfies LinkShareListSummary;

function publicLink(
  link: ShortLinkModel,
  owner?: LinkOwner,
  share: LinkShareListSummary = emptyShareSummary,
): Link {
  const preview = normalizeStoredPreview(link.preview);
  const output: Link = {
    id: link.id,
    code: link.code,
    domain: link.domain,
    url: link.url,
    preview,
    tags: normalizedTags(link.tags),
    createdAt: link.createdAt.toISOString(),
    clicks: link.clicks,
    lastClickedAt: link.lastClickedAt?.toISOString() ?? null,
    smart: {
      expiresAt: link.expiresAt?.toISOString() ?? null,
      maxClicks: Math.max(0, link.maxClicks ?? 0),
      passwordProtected: Boolean(link.passwordHash && link.passwordSalt),
    },
    routing: {
      redirectRules: storedRedirectRules(link.redirectRules),
    },
    health: {
      status: healthStatus(link.healthStatus),
      statusCode: link.healthStatusCode ?? null,
      checkedAt: link.healthCheckedAt?.toISOString() ?? null,
      error: (link.healthError ?? '').slice(0, 500),
      responseBody: (link.healthResponseBody ?? '').slice(0, 8_000),
      latencyMs: link.healthLatencyMs ?? null,
    },
    share,
  };
  if (owner) output.owned = linkMatchesOwner(link, owner);
  return output;
}

function redirectLink(link: ShortLinkModel): RedirectLink {
  return {
    ...publicLink(link),
    passwordHash: link.passwordHash,
    passwordSalt: link.passwordSalt,
  };
}

interface CreateLinkOptions {
  isAdmin?: boolean;
  linkSettings?: SiteSettings['links'];
  owner?: LinkOwner;
  domain: string;
  preview?: LinkPreviewInput;
  operations?: LinkOperationsInput;
}

function normalizeUrl(
  raw: string,
  settings: SiteSettings['links'],
  options: UrlPolicyOptions,
) {
  const value = raw.trim();
  if (!value) throw new Error(serverMessage('enterUrl'));

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    ? value
    : `https://${value}`;
  const parsed = new URL(withProtocol);
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();

  if (!options.isAdmin && !settings.allowedSchemes.includes(scheme)) {
    throw new Error(
      serverMessage('urlSchemeNotAllowed', {
        schemes: settings.allowedSchemes.join(', '),
      }),
    );
  }

  if (
    settings.blockedHosts.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    )
  ) {
    throw new Error(serverMessage('domainBlocked'));
  }

  if (settings.stripUrlHash) parsed.hash = '';
  stripDisallowedUtmParams(parsed, options);
  return parsed.toString();
}

function normalizeUtmValue(value: string | undefined) {
  return (value ?? '').trim().slice(0, 160);
}

function applyCreateUrlOptions(
  url: string,
  input: LinkOperationsInput = {},
  options: UrlPolicyOptions = {},
) {
  const parsed = new URL(url);

  for (const [field, param] of UTM_FIELDS) {
    if (!utmFieldAllowed(field, options)) continue;
    const value = normalizeUtmValue(input[field]);
    if (value) parsed.searchParams.set(param, value);
  }

  return parsed.toString();
}

function normalizePreviewImageUrl(raw: string) {
  const value = raw.trim();
  if (!value) return '';

  const parsed = new URL(value);
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (!['http', 'https'].includes(scheme)) {
    throw new Error(serverMessage('previewImageUrlInvalid'));
  }
  return parsed.toString();
}

function normalizeThemeColor(raw: string) {
  const value = raw.trim();
  if (!value) return '';

  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(serverMessage('themeColorFormat'));
  }

  return value.toLowerCase();
}

function stringPreviewValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeStoredPreview(raw: unknown): LinkPreview {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const themeColor = stringPreviewValue(source.themeColor).trim();

  return {
    title: stringPreviewValue(source.title).trim().slice(0, 160),
    description: stringPreviewValue(source.description).trim().slice(0, 500),
    imageUrl: stringPreviewValue(source.imageUrl).trim().slice(0, 700),
    themeColor: /^#[0-9a-fA-F]{6}$/.test(themeColor)
      ? themeColor.toLowerCase()
      : '',
  };
}

function normalizePreview(input: LinkPreviewInput = {}) {
  const preview = {
    title: (input.title ?? '').trim().slice(0, 160),
    description: (input.description ?? '').trim().slice(0, 500),
    imageUrl: normalizePreviewImageUrl(input.imageUrl ?? '').slice(0, 700),
    themeColor: normalizeThemeColor(input.themeColor ?? ''),
  };

  return { preview };
}

function normalizePreviewForUpdate(
  input: LinkPreviewInput = {},
  fields: Set<LinkEditField>,
  existing: ShortLinkModel,
  partial = false,
) {
  const preview = normalizeStoredPreview(existing.preview);
  if (fields.has('previewTitle') && (!partial || input.title !== undefined)) {
    preview.title = (input.title ?? '').trim().slice(0, 160);
  }
  if (
    fields.has('previewDescription') &&
    (!partial || input.description !== undefined)
  ) {
    preview.description = (input.description ?? '').trim().slice(0, 500);
  }
  if (
    fields.has('previewImageUrl') &&
    (!partial || input.imageUrl !== undefined)
  ) {
    preview.imageUrl = normalizePreviewImageUrl(input.imageUrl ?? '').slice(
      0,
      700,
    );
  }
  if (
    fields.has('themeColor') &&
    (!partial || input.themeColor !== undefined)
  ) {
    preview.themeColor = normalizeThemeColor(input.themeColor ?? '');
  }
  return { preview };
}

function normalizePreviewForCreate(input: LinkPreviewInput = {}) {
  const normalized = normalizePreview(input);
  const preview = normalized.preview;
  if (
    !preview.title &&
    !preview.description &&
    !preview.imageUrl &&
    !preview.themeColor
  ) {
    return {};
  }

  return normalized;
}

function normalizeDate(value: LinkOperationsInput['expiresAt']) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(serverMessage('expirationDateInvalid'));
  }
  return date;
}

function normalizeFutureDate(value: LinkOperationsInput['expiresAt']) {
  const date = normalizeDate(value);
  if (date && date.getTime() <= Date.now()) {
    throw new Error(serverMessage('expirationDateFuture'));
  }
  return date;
}

function normalizeNonNegativeInt(
  value: string | number | null | undefined,
  max: number,
) {
  if (value === null || value === undefined || value === '') return 0;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(number)));
}

function passwordHash(password: string, salt: string) {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function passwordFields(
  input: LinkOperationsInput = {},
  existing?: ShortLinkModel,
) {
  const password = (input.password ?? '').trim();
  if (password) {
    const salt = randomBytes(12).toString('hex');
    return {
      passwordHash: passwordHash(password, salt),
      passwordSalt: salt,
    };
  }

  if (input.clearPassword) {
    return {
      passwordHash: null,
      passwordSalt: null,
    };
  }

  return existing
    ? {}
    : {
        passwordHash: null,
        passwordSalt: null,
      };
}

const ALL_LINK_EDIT_FIELDS: LinkEditField[] = [...linkEditFieldKeys];

function editableFieldsSet(fields?: LinkEditField[]) {
  return new Set(fields === undefined ? ALL_LINK_EDIT_FIELDS : fields);
}

function normalizeLinkOperationsForUpdate(
  input: LinkOperationsInput = {},
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
  existing: ShortLinkModel,
  fields: Set<LinkEditField>,
  partial = false,
) {
  const updates: Record<string, unknown> = {};

  if (fields.has('tags') && (!partial || input.tags !== undefined)) {
    updates.tags = normalizedTags(input.tags);
  }

  if (fields.has('expiresAt') && (!partial || input.expiresAt !== undefined)) {
    updates.expiresAt = normalizeDate(input.expiresAt);
  }
  if (fields.has('maxClicks') && (!partial || input.maxClicks !== undefined)) {
    updates.maxClicks = normalizeNonNegativeInt(input.maxClicks, 2_000_000_000);
  }

  if (
    fields.has('password') &&
    (!partial ||
      input.password !== undefined ||
      input.clearPassword !== undefined)
  ) {
    Object.assign(updates, passwordFields(input, existing));
  }

  if (fields.has('redirectRules') && input.redirectRules !== undefined) {
    updates.redirectRules = normalizeRedirectRulesForStorage(
      input.redirectRules,
      settings,
      options,
      redirectRuleEditPermissions(fields),
    );
  }

  return updates;
}

function normalizeLinkOperationsForCreate(
  input: LinkOperationsInput = {},
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
) {
  const fields: Record<string, unknown> = {};

  const tags = normalizedTags(input.tags);
  if (tags.length > 0) fields.tags = tags;

  if (input.expiresAt) fields.expiresAt = normalizeFutureDate(input.expiresAt);

  if (input.maxClicks !== undefined && input.maxClicks !== null) {
    const maxClicks = normalizeNonNegativeInt(input.maxClicks, 2_000_000_000);
    if (maxClicks > 0) fields.maxClicks = maxClicks;
  }

  const password = (input.password ?? '').trim();
  if (password) {
    Object.assign(fields, passwordFields({ password }));
  }

  if (input.redirectRules !== undefined && input.redirectRules !== null) {
    const redirectRules = normalizeRedirectRulesForStorage(
      input.redirectRules,
      settings,
      options,
    );
    if (redirectRules.length > 0) fields.redirectRules = redirectRules;
  }

  return fields;
}

function normalizeRedirectRulesForStorage(
  value: LinkOperationsInput['redirectRules'],
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
  permissions: Partial<Record<LinkOptionKey, boolean>> = settings.options,
) {
  const utmPermissions = utmPermissionsFromLinkOptions(permissions);
  const redirectRules = normalizeRedirectRules(value, (raw) =>
    normalizeUrl(raw, settings, {
      isAdmin: options.isAdmin,
      utmPermissions,
    }),
  );

  if (redirectRules.length === 0 || options.isAdmin) return redirectRules;

  if (!permissions.redirectRules) {
    throw new Error(serverMessage('optionDenied', { label: 'redirectRules' }));
  }

  for (const key of redirectRulePermissionKeysFromRules(redirectRules)) {
    if (!permissions[key]) {
      throw new Error(serverMessage('optionDenied', { label: key }));
    }
  }

  return redirectRules;
}

function redirectRuleEditPermissions(
  fields: Set<LinkEditField>,
): Partial<Record<LinkOptionKey, boolean>> {
  const permissions: Partial<Record<LinkOptionKey, boolean>> = {
    redirectRules: fields.has('redirectRules'),
  };
  for (const key of redirectRuleConditionKeys) {
    permissions[key] = fields.has(key);
  }
  for (const [field] of UTM_FIELDS) {
    permissions[field] = fields.has(field);
  }
  return permissions;
}

function validateCode(
  raw: string,
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
) {
  const code = raw.trim();
  if (!code) return '';

  if (!settings.allowCustomCodes && !options.isAdmin) {
    throw new Error(serverMessage('customCodesDisabled'));
  }

  if (
    (!options.isAdmin && code.length < settings.codeMinLength) ||
    code.length > settings.codeMaxLength ||
    !/^[A-Za-z0-9_-]+$/.test(code)
  ) {
    if (options.isAdmin) {
      throw new Error(
        serverMessage('customCodeTooLong', {
          max: settings.codeMaxLength,
        }),
      );
    }

    throw new Error(
      serverMessage('customCodeLengthRange', {
        min: settings.codeMinLength,
        max: settings.codeMaxLength,
      }),
    );
  }

  if (RESERVED_CODES.has(code.toLowerCase())) {
    throw new Error(serverMessage('reservedCode'));
  }

  return code;
}

function generateCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

function anonymizeIp(ip: string) {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function ownerWhere(owner: LinkOwner): WhereOptions {
  if (owner.userId) return { creatorUserId: owner.userId };

  const candidates: WhereOptions[] = [];
  if (owner.sessionId) {
    candidates.push({ creatorSessionId: owner.sessionId });
  }
  if (owner.ipHash) {
    candidates.push({ creatorIpHash: owner.ipHash });
  }

  if (candidates.length === 0) return { id: -1 };
  return { [Op.or]: candidates };
}

function linkSearchWhere(search?: LinkSearchState): WhereOptions | undefined {
  const query = search?.query.trim();
  if (!query) return undefined;
  const field = search?.field ?? 'code';
  const like = `%${query}%`;

  if (field === 'tags') {
    return sqlWhere(cast(col('tags'), 'TEXT'), { [Op.like]: like });
  }

  return {
    [field]: {
      [Op.like]: like,
    },
  };
}

function clickEventSearchWhere(
  search?: ClickEventSearch,
): WhereOptions | undefined {
  const query = search?.query.trim();
  if (!search || !query) return undefined;
  const like = `%${query}%`;

  if (search.field === 'createdAt') {
    return sqlWhere(cast(col('created_at'), 'TEXT'), { [Op.like]: like });
  }

  if (search.field === 'metadata') {
    const paths = search.paths.filter((path) => path.length > 0);
    if (paths.length === 0) return undefined;

    return {
      [Op.or]: paths.map((path) =>
        sqlWhere(fn('jsonb_extract_path_text', col('metadata'), ...path), {
          [Op.like]: like,
        }),
      ),
    };
  }

  return {
    [search.field]: {
      [Op.like]: like,
    },
  };
}

function combineWhere(
  ...filters: Array<WhereOptions | undefined>
): WhereOptions | undefined {
  const activeFilters = filters.filter(
    (filter): filter is WhereOptions => filter !== undefined,
  );
  if (activeFilters.length === 0) return undefined;
  if (activeFilters.length === 1) return activeFilters[0];
  return { [Op.and]: activeFilters };
}

function refererLabel(value: string | null) {
  if (!value) return 'Direct access';

  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function userAgentLabel(value: string | null) {
  const userAgent = value ?? '';
  if (!userAgent) return 'Unknown';
  if (/bot|crawler|spider|preview/i.test(userAgent)) return 'Bot/preview';
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) {
    return 'Safari';
  }
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  return mobileUserAgent(userAgent) ? 'Mobile browser' : 'Other browser';
}

function clickBrowserLabel(input: {
  metadata: Record<string, unknown>;
  userAgent: string | null;
}) {
  return (
    browserLabelFromClientHints(input.metadata) ??
    userAgentLabel(input.userAgent)
  );
}

function metadataCountry(metadata: Record<string, unknown>) {
  const country =
    metadata.country &&
    typeof metadata.country === 'object' &&
    !Array.isArray(metadata.country)
      ? (metadata.country as Record<string, unknown>)
      : null;
  if (!country) return '';

  return String(country.name ?? country.code ?? '').trim();
}

function topEntries(counts: Map<string, number>, limit = 5) {
  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

async function clickInsights(linkId: number, isAdmin?: boolean) {
  const clicks = await ClickEventModel.findAll({
    attributes: [
      'createdAt',
      'referer',
      'metadata',
      'userAgent',
      ...(isAdmin ? ['ipAddress'] : []),
    ],
    where: { linkId },
    order: [['createdAt', 'DESC']],
    limit: 1_000,
  });
  const referrers = new Map<string, number>();
  const browsers = new Map<string, number>();
  const countries = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1_000;
  let last24h = 0;
  let previous24h = 0;

  for (const click of clicks) {
    const clickedAt = click.createdAt.getTime();
    if (clickedAt >= now - oneDayMs) last24h += 1;
    if (clickedAt < now - oneDayMs && clickedAt >= now - oneDayMs * 2) {
      previous24h += 1;
    }

    const referer = refererLabel(click.referer);
    referrers.set(referer, (referrers.get(referer) ?? 0) + 1);

    const browser = clickBrowserLabel(click);
    browsers.set(browser, (browsers.get(browser) ?? 0) + 1);

    const country = metadataCountry(click.metadata);
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);

    if (isAdmin && click.ipAddress) {
      ipCounts.set(click.ipAddress, (ipCounts.get(click.ipAddress) ?? 0) + 1);
    }
  }

  const repeatedIp =
    isAdmin && ipCounts.size > 0 ? topEntries(ipCounts, 1)[0] : undefined;

  return {
    sampleSize: clicks.length,
    last24h,
    previous24h,
    topReferrers: topEntries(referrers),
    topBrowsers: topEntries(browsers),
    topCountries: topEntries(countries),
    alerts:
      repeatedIp && repeatedIp.count >= 10
        ? [
            {
              type: 'repeatedIp' as const,
              count: repeatedIp.count,
              value: repeatedIp.label,
            },
          ]
        : [],
  };
}

function publicClickEvent(
  { createdAt, ipAddress, metadata, referer, userAgent }: ClickEventModel,
  options: { isAdmin?: boolean } = {},
): ClickEvent {
  return {
    createdAt: createdAt.toISOString(),
    ip: ipAddress
      ? options.isAdmin
        ? ipAddress
        : anonymizeIp(ipAddress)
      : null,
    referer,
    userAgent,
    browser: clickBrowserLabel({ metadata, userAgent }),
    metadata,
  };
}

async function linkCreatorInfo(linkId: number, visibility: CreatorVisibility) {
  if (visibility === 'none') return null;

  const link = await ShortLinkModel.findByPk(linkId, {
    attributes: ['creatorUserId', 'creatorIpAddress'],
  });
  if (!link) return null;

  const creator = link.creatorUserId
    ? await UserModel.findByPk(link.creatorUserId, {
        attributes: ['id', 'name', 'email', 'enabled'],
      })
    : null;
  const name = creator?.name || 'Anonymous creator';

  if (visibility === 'name') {
    return {
      name,
      account: null,
      ipAddress: null,
    } satisfies LinkCreatorInfo;
  }

  return {
    name,
    account: creator
      ? {
          id: creator.id,
          email: creator.email,
          enabled: creator.enabled,
        }
      : null,
    ipAddress: link.creatorIpAddress,
  } satisfies LinkCreatorInfo;
}

function linkMatchesOwner(link: ShortLinkModel, owner: LinkOwner) {
  if (owner.userId) return link.creatorUserId === owner.userId;
  return Boolean(
    (owner.sessionId && link.creatorSessionId === owner.sessionId) ||
    (owner.ipHash && link.creatorIpHash === owner.ipHash),
  );
}

export async function listLinks(
  limit = 30,
  owner?: LinkOwner,
  ownedBy?: LinkOwner,
  sharedWithUserId?: number | null,
) {
  await ensureDatabase();
  const sharedLinkIds =
    owner && sharedWithUserId
      ? await sharedLinkIdsForUser(sharedWithUserId)
      : [];
  const where = owner
    ? sharedLinkIds.length > 0
      ? {
          [Op.or]: [ownerWhere(owner), { id: { [Op.in]: sharedLinkIds } }],
        }
      : ownerWhere(owner)
    : undefined;
  const links = await ShortLinkModel.findAll({
    where,
    order: [['id', 'DESC']],
    limit,
  });
  const shareSummaries = await linkShareSummariesByLinkId(
    links.map((link) => link.id),
    sharedWithUserId,
  );
  return links.map((link) =>
    publicLink(link, ownedBy ?? owner, shareSummaries.get(link.id)),
  );
}

export async function listLinksPage(
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
  owner?: LinkOwner,
  search?: LinkSearchState,
  ownedBy?: LinkOwner,
  sharedWithUserId?: number | null,
) {
  await ensureDatabase();
  const sharedLinkIds =
    owner && sharedWithUserId
      ? await sharedLinkIdsForUser(sharedWithUserId)
      : [];
  const visibilityWhere = owner
    ? sharedLinkIds.length > 0
      ? {
          [Op.or]: [ownerWhere(owner), { id: { [Op.in]: sharedLinkIds } }],
        }
      : ownerWhere(owner)
    : undefined;
  const where = combineWhere(visibilityWhere, linkSearchWhere(search));
  const totalItems = await ShortLinkModel.count({ where });
  const pagination = paginationMeta({ totalItems, page, pageSize });
  const links = await ShortLinkModel.findAll({
    where,
    order: [['id', 'DESC']],
    limit: pagination.pageSize,
    offset: pageOffset(pagination),
  });
  const shareSummaries = await linkShareSummariesByLinkId(
    links.map((link) => link.id),
    sharedWithUserId,
  );

  return {
    items: links.map((link) =>
      publicLink(link, ownedBy ?? owner, shareSummaries.get(link.id)),
    ),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
  } satisfies PaginatedLinks;
}

export async function getLinkByCode(code: string, domain?: string) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(code, domain),
  });
  return link ? publicLink(link) : undefined;
}

export async function getRedirectLinkByCode(code: string, domain?: string) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(code, domain),
  });
  return link ? redirectLink(link) : undefined;
}

export function protectedLinkCookieName(code: string) {
  const suffix = createHash('sha256').update(code).digest('hex').slice(0, 18);
  return `slk_link_${suffix}`;
}

export function protectedLinkCookieValue(link: RedirectLink) {
  if (!link.passwordHash) return '';
  return createHash('sha256')
    .update(`${link.id}:${link.code}:${link.passwordHash}`)
    .digest('hex');
}

export function verifyLinkPassword(link: RedirectLink, password: string) {
  if (!link.passwordHash || !link.passwordSalt) return true;
  return passwordHash(password, link.passwordSalt) === link.passwordHash;
}

export function linkAccessBlockReason(link: Link) {
  if (
    link.smart.expiresAt &&
    new Date(link.smart.expiresAt).getTime() <= Date.now()
  ) {
    return 'expired' as const;
  }

  if (link.smart.maxClicks > 0 && link.clicks >= link.smart.maxClicks) {
    return 'maxClicks' as const;
  }

  return null;
}

function mobileUserAgent(userAgent: string) {
  return /android|iphone|ipad|ipod|mobile|opera mini|iemobile/i.test(userAgent);
}

export function destinationForRequest(
  link: Link,
  request: Request,
  input: { ip?: string; metadata?: Record<string, string> } = {},
) {
  return redirectResultForRequest(link, request, input).url;
}

export function redirectResultForRequest(
  link: Link,
  request: Request,
  input: { ip?: string; metadata?: Record<string, string> } = {},
): RedirectDestinationResult {
  const matchedRule = matchedRedirectRule(
    link.routing.redirectRules,
    redirectRuleContextFromRequest(request, input),
  );
  if (matchedRule) return { url: matchedRule.rule.longUrl, matchedRule };

  return { url: link.url, matchedRule: null };
}

async function insertLink(
  code: string,
  url: string,
  domain: string,
  owner?: LinkOwner,
  preview: LinkPreviewInput = {},
  operations: LinkOperationsInput = {},
  settings?: SiteSettings['links'],
  options: { isAdmin?: boolean } = {},
) {
  try {
    const link = await ShortLinkModel.create({
      code,
      domain,
      url,
      ...normalizePreviewForCreate(preview),
      ...normalizeLinkOperationsForCreate(
        operations,
        settings ?? (await getSettings()).links,
        options,
      ),
      creatorUserId: owner?.userId ?? null,
      creatorSessionId: owner?.sessionId ?? null,
      creatorIpHash: owner?.ipHash ?? null,
      creatorIpAddress: owner?.ipAddress ?? null,
    });
    return publicLink(link);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new Error(serverMessage('codeInUse'));
    }
    throw error;
  }
}

export async function createLink(
  rawUrl: string,
  rawCode = '',
  options: CreateLinkOptions,
) {
  await ensureDatabase();
  const settings = options.linkSettings ?? (await getSettings()).links;
  const utmPermissions = utmPermissionsFromLinkOptions(settings.options);
  const url = applyCreateUrlOptions(
    normalizeUrl(rawUrl, settings, {
      isAdmin: options.isAdmin,
      utmPermissions,
    }),
    options.operations,
    { isAdmin: options.isAdmin, utmPermissions },
  );
  const requestedCode = validateCode(rawCode, settings, options);

  if (requestedCode) {
    return insertLink(
      requestedCode,
      url,
      options.domain,
      options.owner,
      options.preview,
      options.operations,
      settings,
      options,
    );
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCode(
      attempt < 7
        ? settings.generatedCodeLength
        : Math.min(settings.codeMaxLength, 12),
    );
    try {
      return await insertLink(
        code,
        url,
        options.domain,
        options.owner,
        options.preview,
        options.operations,
        settings,
        options,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === serverMessage('codeInUse')
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(serverMessage('shortCodeGenerateFailed'));
}

export async function updateLink(
  code: string,
  input: {
    url?: string;
    preview?: LinkPreviewInput;
    operations?: LinkOperationsInput;
  },
  options: UpdateLinkOptions = {},
): Promise<UpdateLinkResult> {
  await ensureDatabase();
  const settings = options.linkSettings ?? (await getSettings()).links;
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(code, options.domain),
  });
  if (!link) return { status: 'not_found' };

  let sharedEditableFields: LinkEditField[] | null = null;
  if (!options.isAdmin && !options.allowAnyOwner) {
    const ownerMatches = options.owner
      ? linkMatchesOwner(link, options.owner)
      : false;
    if (!ownerMatches && options.sharedUserId) {
      const access = await activeShareAccessForLinkId(
        link.id,
        options.sharedUserId,
      );
      if (access?.canEdit) {
        sharedEditableFields = access.editableFields as LinkEditField[];
      }
    }
    if (!ownerMatches && !sharedEditableFields) {
      return { status: 'denied' };
    }
  }

  const editableFields = editableFieldsSet(
    sharedEditableFields ?? options.editableFields,
  );
  if (editableFields.size === 0) return { status: 'denied' };
  const utmPermissions = utmPermissionsFromEditableFields(editableFields);
  const updates: Record<string, unknown> = {};
  const partial = options.partial === true;
  const editableUtmFields = UTM_FIELDS.map(([field]) => field).filter(
    (field) =>
      editableFields.has(field) &&
      (!partial || input.operations?.[field] !== undefined),
  );
  if (
    (editableFields.has('url') && (!partial || input.url !== undefined)) ||
    editableUtmFields.length > 0
  ) {
    const baseUrl =
      editableFields.has('url') && input.url !== undefined
        ? input.url
        : link.url;
    const operations = Object.fromEntries(
      editableUtmFields.map((field) => [field, input.operations?.[field]]),
    ) as LinkOperationsInput;
    updates.url = applyCreateUrlOptions(
      normalizeUrl(baseUrl, settings, {
        isAdmin: options.isAdmin,
        utmPermissions,
      }),
      operations,
      { isAdmin: options.isAdmin, utmPermissions },
    );
  }
  const hasEditablePreviewField =
    editableFields.has('previewTitle') ||
    editableFields.has('previewDescription') ||
    editableFields.has('previewImageUrl') ||
    editableFields.has('themeColor');
  if (hasEditablePreviewField && (!partial || input.preview !== undefined)) {
    Object.assign(
      updates,
      normalizePreviewForUpdate(input.preview, editableFields, link, partial),
    );
  }
  if (input.operations !== undefined) {
    Object.assign(
      updates,
      normalizeLinkOperationsForUpdate(
        input.operations,
        settings,
        { isAdmin: options.isAdmin },
        link,
        editableFields,
        partial,
      ),
    );
  }
  await link.update(updates);

  return { status: 'updated', link: publicLink(link) };
}

function normalizeResponseText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8_000);
}

function htmlToPlainText(value: string) {
  return normalizeResponseText(
    value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '\n')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(address|article|aside|blockquote|div|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi,
        '\n',
      )
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'"),
  );
}

function plainResponseBody(body: string, contentType: string) {
  if (!body.trim()) return '';
  if (/html|xml/i.test(contentType)) return htmlToPlainText(body);
  return normalizeResponseText(body)
    .replace(/<[^>]+>/g, ' ')
    .trim();
}

async function fetchHealth(url: string, settings: SiteSettings) {
  const startedAt = Date.now();

  try {
    let response = await outboundRequest({
      url,
      method: 'HEAD',
      settings,
      purpose: 'link-health',
      timeoutMs: 8_000,
    });

    if (response.status === 405 || response.status >= 400) {
      response = await outboundRequest({
        url,
        method: 'GET',
        settings,
        purpose: 'link-health',
        timeoutMs: 8_000,
      });
    }

    const latencyMs = Date.now() - startedAt;
    const isErrorResponse = response.status >= 400;
    const responseBody = isErrorResponse
      ? plainResponseBody(response.body, response.headers['content-type'] ?? '')
      : '';
    return {
      status:
        response.status >= 500
          ? ('broken' as const)
          : response.status >= 400
            ? ('warning' as const)
            : ('ok' as const),
      statusCode: response.status,
      error: isErrorResponse
        ? `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
        : '',
      responseBody,
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'broken' as const,
      statusCode: null,
      error:
        error instanceof Error ? error.message.slice(0, 500) : 'Request failed',
      responseBody: '',
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function checkLinkHealth(
  code: string,
  options: UpdateLinkOptions = {},
): Promise<LinkHealthResult> {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(code, options.domain),
  });
  if (!link) return { status: 'not_found' };

  if (!options.isAdmin && !options.allowAnyOwner) {
    if (!options.owner || !linkMatchesOwner(link, options.owner)) {
      return { status: 'denied' };
    }
  }

  const settings = options.siteSettings ?? (await getSettings());
  const result = await fetchHealth(link.url, settings);
  await link.update({
    healthStatus: result.status,
    healthStatusCode: result.statusCode,
    healthCheckedAt: new Date(),
    healthError: result.error,
    healthResponseBody: result.responseBody || null,
    healthLatencyMs: result.latencyMs,
  });

  return { status: 'checked', link: publicLink(link) };
}

export async function recordClick(
  linkId: number,
  data: {
    queueId?: number | null;
    ip?: string | null;
    userAgent?: string | null;
    referer?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await ensureDatabase();
  const sequelize = getDatabase();
  const transaction = await sequelize.transaction();

  try {
    if (data.queueId) {
      const existingClick = await ClickEventModel.findOne({
        where: { queueId: data.queueId },
        transaction,
      });
      if (existingClick) {
        await transaction.commit();
        return;
      }
    }

    const link = await ShortLinkModel.findByPk(linkId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!link) {
      await transaction.rollback();
      return;
    }

    const clickedAt = new Date();
    await link.increment('clicks', { transaction });
    link.lastClickedAt = clickedAt;
    await link.save({ transaction, fields: ['lastClickedAt'] });

    await ClickEventModel.create(
      {
        queueId: data.queueId ?? null,
        linkId: link.id,
        createdAt: clickedAt,
        ipAddress: data.ip || null,
        userAgent: data.userAgent || null,
        referer: data.referer || null,
        metadata: data.metadata ?? {},
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getStats(
  code: string,
  options: {
    domain?: string;
    isAdmin?: boolean;
    creatorVisibility?: CreatorVisibility;
    page?: number;
    pageSize?: number;
    search?: ClickEventSearch;
  } = {},
) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(code, options.domain),
  });
  if (!link) return undefined;
  return getStatsForLink(publicLink(link), options);
}

export async function listClickEventsForLink(
  link: Pick<Link, 'id'>,
  options: { isAdmin?: boolean; search?: ClickEventSearch } = {},
) {
  await ensureDatabase();
  const clicks = await ClickEventModel.findAll({
    where: combineWhere(
      { linkId: link.id },
      clickEventSearchWhere(options.search),
    ),
    order: [['createdAt', 'DESC']],
  });
  return clicks.map((click) => publicClickEvent(click, options));
}

export async function getStatsForLink(
  link: Link,
  options: {
    isAdmin?: boolean;
    creatorVisibility?: CreatorVisibility;
    page?: number;
    pageSize?: number;
    search?: ClickEventSearch;
  } = {},
) {
  await ensureDatabase();
  const pageSize = normalizedPageSize(options.pageSize);
  const requestedPage = Math.min(MAX_STATS_PAGE, normalizedPage(options.page));
  let totalItems = 0;
  let clicks: ClickEventModel[] = [];
  const clickWhere = combineWhere(
    { linkId: link.id },
    clickEventSearchWhere(options.search),
  );
  const clickQuery = (page: number) =>
    ClickEventModel.findAll({
      where: clickWhere,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: pageOffset({ page, pageSize }),
    });

  const creatorPromise = linkCreatorInfo(
    link.id,
    options.creatorVisibility ?? (options.isAdmin ? 'admin' : 'none'),
  );
  const insightsPromise = clickInsights(link.id, options.isAdmin);

  try {
    const [count, pageClicks] = await Promise.all([
      ClickEventModel.count({ where: clickWhere }),
      clickQuery(requestedPage),
    ]);
    totalItems = count;
    const page = paginationMeta({
      totalItems,
      page: requestedPage,
      pageSize,
    }).page;
    clicks = page === requestedPage ? pageClicks : await clickQuery(page);
  } catch (cause) {
    console.error('Failed to load link click statistics.', cause);
  }
  const pagination = paginationMeta({
    totalItems,
    page: requestedPage,
    pageSize,
  });
  const clickEvents = clicks.map((click) => publicClickEvent(click, options));
  const [creator, insights] = await Promise.all([
    creatorPromise,
    insightsPromise,
  ]);

  return {
    ...link,
    creator,
    clickEvents,
    insights,
    pagination: pagination satisfies PaginationMeta,
  };
}

export async function canViewStats(input: {
  code: string;
  domain?: string;
  isAdmin?: boolean;
  allowAnyOwner?: boolean;
  owner?: LinkOwner;
  sharedUserId?: number | null;
}) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: linkLookupWhere(input.code, input.domain),
  });
  if (!link) return { allowed: false, link: undefined };
  const isOwner = input.owner ? linkMatchesOwner(link, input.owner) : false;
  const sharedAccess = input.sharedUserId
    ? await activeShareAccessForLinkId(link.id, input.sharedUserId)
    : null;
  return {
    allowed:
      input.isAdmin ||
      input.allowAnyOwner ||
      isOwner ||
      sharedAccess?.canViewStats === true,
    link: publicLink(link, input.owner, {
      recipientCount: 0,
      access: sharedAccess,
    }),
    isOwner,
    isShared: sharedAccess !== null,
  };
}

export async function deleteLink(code: string, domain?: string) {
  await ensureDatabase();
  return (
    (await ShortLinkModel.destroy({ where: linkLookupWhere(code, domain) })) > 0
  );
}

function normalizedLinkSelections(
  selections: Array<string | LinkCodeSelection>,
  fallbackDomain?: string,
) {
  const normalized = selections
    .map((selection) =>
      typeof selection === 'string'
        ? { code: selection.trim(), domain: fallbackDomain }
        : {
            code: selection.code.trim(),
            domain: selection.domain ?? fallbackDomain,
          },
    )
    .filter((selection) => /^[A-Za-z0-9_-]{1,64}$/.test(selection.code));
  const seen = new Set<string>();
  return normalized.filter((selection) => {
    const key = `${selection.domain ?? ''}\u0000${selection.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function deleteLinks(
  codes: Array<string | LinkCodeSelection>,
  options: DeleteLinksOptions = {},
) {
  await ensureDatabase();
  const requestedLinks = normalizedLinkSelections(codes, options.domain);
  const result: DeleteLinksResult = {
    requested: requestedLinks.length,
    deleted: 0,
    notFound: 0,
    denied: 0,
    disabled: 0,
    tooManyClicks: 0,
  };

  if (requestedLinks.length === 0) return result;

  const links = await ShortLinkModel.findAll({
    where: {
      [Op.or]: requestedLinks.map((link) =>
        linkLookupWhere(link.code, link.domain),
      ),
    },
  });
  const linksByKey = new Map(
    links.map((link) => [`${link.domain ?? ''}\u0000${link.code}`, link]),
  );
  const deletableIds: number[] = [];
  const maxClicks = Math.max(0, Math.trunc(options.maxClicks ?? 0));
  const clickLimitEnabled = maxClicks > 0;

  for (const selection of requestedLinks) {
    const link = linksByKey.get(
      `${selection.domain ?? ''}\u0000${selection.code}`,
    );
    if (!link) {
      result.notFound += 1;
      continue;
    }

    if (options.isAdmin || options.allowAnyOwner) {
      deletableIds.push(link.id);
      continue;
    }

    if (!options.allowUserDelete) {
      result.disabled += 1;
      continue;
    }

    if (!options.owner || !linkMatchesOwner(link, options.owner)) {
      result.denied += 1;
      continue;
    }

    if (clickLimitEnabled && link.clicks > maxClicks) {
      result.tooManyClicks += 1;
      continue;
    }

    deletableIds.push(link.id);
  }

  if (deletableIds.length > 0) {
    result.deleted = await ShortLinkModel.destroy({
      where: { id: { [Op.in]: deletableIds } },
    });
  }

  return result;
}

export async function countLinksByDomain(domains: readonly string[]) {
  await ensureDatabase();
  const normalizedDomains = [...new Set(domains.filter(Boolean))];
  const entries = await Promise.all(
    normalizedDomains.map(async (domain) => [
      domain,
      await ShortLinkModel.count({ where: { domain } }),
    ]),
  );
  return Object.fromEntries(entries) as Record<string, number>;
}
