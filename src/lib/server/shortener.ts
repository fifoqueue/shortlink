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
import { EXPIRES_AT_REQUIRES_DATE } from './link-form';
import { getSettings } from './settings';
import { linkEditFieldKeys, type SiteSettings } from '$lib/config';
import type { LinkOwner } from './link-owner';
import type { LinkSearchState } from '$lib/search';
import { serverMessage } from '$lib/i18n/ui-text';
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
  url: string;
  owned?: boolean;
  preview: LinkPreview;
  tags: string[];
  created_at: string;
  clicks: number;
  last_clicked_at: string | null;
  smart: LinkSmartOptions;
  routing: LinkRoutingOptions;
  health: LinkHealth;
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
  mobileUrl?: string;
  desktopUrl?: string;
  abUrl?: string;
  abPercent?: string | number | null;
}

export interface LinkSmartOptions {
  expiresAt: string | null;
  maxClicks: number;
  passwordProtected: boolean;
}

export interface LinkRoutingOptions {
  mobileUrl: string;
  desktopUrl: string;
  abUrl: string;
  abPercent: number;
}

export interface LinkHealth {
  status: 'unchecked' | 'ok' | 'warning' | 'broken';
  statusCode: number | null;
  checkedAt: string | null;
  error: string;
  latencyMs: number | null;
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
  created_at: string;
  ip: string | null;
  user_agent: string | null;
  referer: string | null;
  metadata: Record<string, unknown>;
}

type RedirectLink = Link & {
  passwordHash: string | null;
  passwordSalt: string | null;
};

type CreatorVisibility = 'none' | 'name' | 'admin';

export type ClickEventSearch =
  | {
      field: 'created_at' | 'ip_address' | 'referer' | 'user_agent';
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
}

export interface DeleteLinksResult {
  requested: number;
  deleted: number;
  notFound: number;
  denied: number;
  disabled: number;
  tooManyClicks: number;
}

export interface UpdateLinkOptions {
  isAdmin?: boolean;
  allowAnyOwner?: boolean;
  editableFields?: LinkEditField[];
  linkSettings?: SiteSettings['links'];
  owner?: LinkOwner;
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
  'custom.css',
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

function publicLink(link: ShortLinkModel, owner?: LinkOwner): Link {
  const preview = normalizeStoredPreview(link.preview);
  const output: Link = {
    id: link.id,
    code: link.code,
    url: link.url,
    preview,
    tags: normalizedTags(link.tags),
    created_at: link.created_at.toISOString(),
    clicks: link.clicks,
    last_clicked_at: link.last_clicked_at?.toISOString() ?? null,
    smart: {
      expiresAt: link.expires_at?.toISOString() ?? null,
      maxClicks: Math.max(0, link.max_clicks ?? 0),
      passwordProtected: Boolean(link.password_hash && link.password_salt),
    },
    routing: {
      mobileUrl: link.mobile_url ?? '',
      desktopUrl: link.desktop_url ?? '',
      abUrl: link.ab_url ?? '',
      abPercent: Math.max(0, Math.min(100, link.ab_percent ?? 0)),
    },
    health: {
      status: healthStatus(link.health_status),
      statusCode: link.health_status_code ?? null,
      checkedAt: link.health_checked_at?.toISOString() ?? null,
      error: (link.health_error ?? '').slice(0, 500),
      latencyMs: link.health_latency_ms ?? null,
    },
  };
  if (owner) output.owned = linkMatchesOwner(link, owner);
  return output;
}

function redirectLink(link: ShortLinkModel): RedirectLink {
  return {
    ...publicLink(link),
    passwordHash: link.password_hash,
    passwordSalt: link.password_salt,
  };
}

interface CreateLinkOptions {
  isAdmin?: boolean;
  linkSettings?: SiteSettings['links'];
  owner?: LinkOwner;
  preview?: LinkPreviewInput;
  operations?: LinkOperationsInput;
}

function normalizeUrl(
  raw: string,
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
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
  return parsed.toString();
}

function normalizeOptionalUrl(
  raw: string | undefined,
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
) {
  const value = (raw ?? '').trim();
  return value ? normalizeUrl(value, settings, options) : null;
}

function normalizeUtmValue(value: string | undefined) {
  return (value ?? '').trim().slice(0, 160);
}

function applyCreateUrlOptions(url: string, input: LinkOperationsInput = {}) {
  const parsed = new URL(url);

  for (const [field, param] of UTM_FIELDS) {
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
) {
  const preview = normalizeStoredPreview(existing.preview);
  if (fields.has('previewTitle')) {
    preview.title = (input.title ?? '').trim().slice(0, 160);
  }
  if (fields.has('previewDescription')) {
    preview.description = (input.description ?? '').trim().slice(0, 500);
  }
  if (fields.has('previewImageUrl')) {
    preview.imageUrl = normalizePreviewImageUrl(input.imageUrl ?? '').slice(
      0,
      700,
    );
  }
  if (fields.has('themeColor')) {
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
  if (value === EXPIRES_AT_REQUIRES_DATE) {
    throw new Error(serverMessage('expirationTimeNeedsDate'));
  }
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
      password_hash: passwordHash(password, salt),
      password_salt: salt,
    };
  }

  if (input.clearPassword) {
    return {
      password_hash: null,
      password_salt: null,
    };
  }

  return existing
    ? {}
    : {
        password_hash: null,
        password_salt: null,
      };
}

const ALL_LINK_EDIT_FIELDS: LinkEditField[] = [...linkEditFieldKeys];

function editableFieldsSet(fields?: LinkEditField[]) {
  return new Set(fields && fields.length > 0 ? fields : ALL_LINK_EDIT_FIELDS);
}

function normalizeLinkOperationsForUpdate(
  input: LinkOperationsInput = {},
  settings: SiteSettings['links'],
  options: { isAdmin?: boolean },
  existing: ShortLinkModel,
  fields: Set<LinkEditField>,
) {
  const updates: Record<string, unknown> = {};

  if (fields.has('tags')) updates.tags = normalizedTags(input.tags);

  if (fields.has('expiresAt')) {
    updates.expires_at = normalizeDate(input.expiresAt);
  }
  if (fields.has('maxClicks')) {
    updates.max_clicks = normalizeNonNegativeInt(
      input.maxClicks,
      2_000_000_000,
    );
  }

  if (fields.has('password')) {
    Object.assign(updates, passwordFields(input, existing));
  }

  if (fields.has('mobileUrl')) {
    updates.mobile_url = normalizeOptionalUrl(
      input.mobileUrl,
      settings,
      options,
    );
  }
  if (fields.has('desktopUrl')) {
    updates.desktop_url = normalizeOptionalUrl(
      input.desktopUrl,
      settings,
      options,
    );
  }

  if (fields.has('abUrl')) {
    updates.ab_url = normalizeOptionalUrl(input.abUrl, settings, options);
  }
  if (fields.has('abPercent')) {
    updates.ab_percent = normalizeNonNegativeInt(input.abPercent, 100);
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

  if (input.expiresAt) fields.expires_at = normalizeFutureDate(input.expiresAt);

  if (input.maxClicks !== undefined && input.maxClicks !== null) {
    const maxClicks = normalizeNonNegativeInt(input.maxClicks, 2_000_000_000);
    if (maxClicks > 0) fields.max_clicks = maxClicks;
  }

  const password = (input.password ?? '').trim();
  if (password) {
    Object.assign(fields, passwordFields({ password }));
  }

  const mobileUrl = normalizeOptionalUrl(input.mobileUrl, settings, options);
  if (mobileUrl) fields.mobile_url = mobileUrl;

  const desktopUrl = normalizeOptionalUrl(input.desktopUrl, settings, options);
  if (desktopUrl) fields.desktop_url = desktopUrl;

  const abUrl = normalizeOptionalUrl(input.abUrl, settings, options);
  if (abUrl) fields.ab_url = abUrl;

  if (input.abPercent !== undefined && input.abPercent !== null) {
    const abPercent = normalizeNonNegativeInt(input.abPercent, 100);
    if (abPercent > 0) fields.ab_percent = abPercent;
  }

  return fields;
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
  if (owner.userId) return { creator_user_id: owner.userId };

  const candidates: WhereOptions[] = [];
  if (owner.sessionId) {
    candidates.push({ creator_session_id: owner.sessionId });
  }
  if (owner.ipHash) {
    candidates.push({ creator_ip_hash: owner.ipHash });
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

  if (search.field === 'created_at') {
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
    where: { link_id: linkId },
    order: [['created_at', 'DESC']],
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
    const clickedAt = click.created_at.getTime();
    if (clickedAt >= now - oneDayMs) last24h += 1;
    if (clickedAt < now - oneDayMs && clickedAt >= now - oneDayMs * 2) {
      previous24h += 1;
    }

    const referer = refererLabel(click.referer);
    referrers.set(referer, (referrers.get(referer) ?? 0) + 1);

    const browser = userAgentLabel(click.user_agent);
    browsers.set(browser, (browsers.get(browser) ?? 0) + 1);

    const country = metadataCountry(click.metadata);
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);

    if (isAdmin && click.ip_address) {
      ipCounts.set(click.ip_address, (ipCounts.get(click.ip_address) ?? 0) + 1);
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
              label: 'Repeated IP',
              message: `${repeatedIp.count} recent sample clicks from ${repeatedIp.label}`,
            },
          ]
        : [],
  };
}

async function linkCreatorInfo(linkId: number, visibility: CreatorVisibility) {
  if (visibility === 'none') return null;

  const link = await ShortLinkModel.findByPk(linkId, {
    attributes: ['creator_user_id', 'creator_ip_address'],
  });
  if (!link) return null;

  const creator = link.creator_user_id
    ? await UserModel.findByPk(link.creator_user_id, {
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
    ipAddress: link.creator_ip_address,
  } satisfies LinkCreatorInfo;
}

function linkMatchesOwner(link: ShortLinkModel, owner: LinkOwner) {
  if (owner.userId) return link.creator_user_id === owner.userId;
  return Boolean(
    (owner.sessionId && link.creator_session_id === owner.sessionId) ||
    (owner.ipHash && link.creator_ip_hash === owner.ipHash),
  );
}

function normalizeCodes(codes: string[]) {
  const normalized = codes
    .map((code) => code.trim())
    .filter((code) => /^[A-Za-z0-9_-]{1,64}$/.test(code));
  return [...new Set(normalized)].slice(0, 250);
}

export async function listLinks(
  limit = 30,
  owner?: LinkOwner,
  ownedBy?: LinkOwner,
) {
  await ensureDatabase();
  const where = owner ? ownerWhere(owner) : undefined;
  const links = await ShortLinkModel.findAll({
    where,
    order: [['id', 'DESC']],
    limit,
  });
  return links.map((link) => publicLink(link, ownedBy ?? owner));
}

export async function listLinksPage(
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
  owner?: LinkOwner,
  search?: LinkSearchState,
  ownedBy?: LinkOwner,
) {
  await ensureDatabase();
  const where = combineWhere(
    owner ? ownerWhere(owner) : undefined,
    linkSearchWhere(search),
  );
  const totalItems = await ShortLinkModel.count({ where });
  const pagination = paginationMeta({ totalItems, page, pageSize });
  const links = await ShortLinkModel.findAll({
    where,
    order: [['id', 'DESC']],
    limit: pagination.pageSize,
    offset: pageOffset(pagination),
  });

  return {
    items: links.map((link) => publicLink(link, ownedBy ?? owner)),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
  } satisfies PaginatedLinks;
}

export async function getLinkByCode(code: string) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({ where: { code } });
  return link ? publicLink(link) : undefined;
}

export async function getRedirectLinkByCode(code: string) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({ where: { code } });
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
    return 'max_clicks' as const;
  }

  return null;
}

function mobileUserAgent(userAgent: string) {
  return /android|iphone|ipad|ipod|mobile|opera mini|iemobile/i.test(userAgent);
}

export function destinationForRequest(link: Link, request: Request) {
  const userAgent = request.headers.get('user-agent') ?? '';

  if (mobileUserAgent(userAgent) && link.routing.mobileUrl) {
    return link.routing.mobileUrl;
  }

  if (!mobileUserAgent(userAgent) && link.routing.desktopUrl) {
    return link.routing.desktopUrl;
  }

  if (
    link.routing.abUrl &&
    link.routing.abPercent > 0 &&
    randomInt(100) < link.routing.abPercent
  ) {
    return link.routing.abUrl;
  }

  return link.url;
}

async function insertLink(
  code: string,
  url: string,
  owner?: LinkOwner,
  preview: LinkPreviewInput = {},
  operations: LinkOperationsInput = {},
  settings?: SiteSettings['links'],
  options: { isAdmin?: boolean } = {},
) {
  try {
    const link = await ShortLinkModel.create({
      code,
      url,
      ...normalizePreviewForCreate(preview),
      ...normalizeLinkOperationsForCreate(
        operations,
        settings ?? (await getSettings()).links,
        options,
      ),
      creator_user_id: owner?.userId ?? null,
      creator_session_id: owner?.sessionId ?? null,
      creator_ip_hash: owner?.ipHash ?? null,
      creator_ip_address: owner?.ipAddress ?? null,
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
  options: CreateLinkOptions = {},
) {
  await ensureDatabase();
  const settings = options.linkSettings ?? (await getSettings()).links;
  const url = applyCreateUrlOptions(
    normalizeUrl(rawUrl, settings, options),
    options.operations,
  );
  const requestedCode = validateCode(rawCode, settings, options);

  if (requestedCode) {
    return insertLink(
      requestedCode,
      url,
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
    url: string;
    preview?: LinkPreviewInput;
    operations?: LinkOperationsInput;
  },
  options: UpdateLinkOptions = {},
): Promise<UpdateLinkResult> {
  await ensureDatabase();
  const settings = options.linkSettings ?? (await getSettings()).links;
  const link = await ShortLinkModel.findOne({ where: { code } });
  if (!link) return { status: 'not_found' };

  if (!options.isAdmin && !options.allowAnyOwner) {
    if (!options.owner || !linkMatchesOwner(link, options.owner)) {
      return { status: 'denied' };
    }
  }

  const editableFields = editableFieldsSet(options.editableFields);
  const updates: Record<string, unknown> = {};
  const editableUtmFields = UTM_FIELDS.map(([field]) => field).filter((field) =>
    editableFields.has(field),
  );
  if (editableFields.has('url') || editableUtmFields.length > 0) {
    const baseUrl = editableFields.has('url') ? input.url : link.url;
    const operations = Object.fromEntries(
      editableUtmFields.map((field) => [field, input.operations?.[field]]),
    ) as LinkOperationsInput;
    updates.url = applyCreateUrlOptions(
      normalizeUrl(baseUrl, settings, { isAdmin: options.isAdmin }),
      operations,
    );
  }
  if (
    editableFields.has('previewTitle') ||
    editableFields.has('previewDescription') ||
    editableFields.has('previewImageUrl') ||
    editableFields.has('themeColor')
  ) {
    Object.assign(
      updates,
      normalizePreviewForUpdate(input.preview, editableFields, link),
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
      ),
    );
  }
  await link.update(updates);

  return { status: 'updated', link: publicLink(link) };
}

async function fetchHealth(url: string) {
  const startedAt = Date.now();

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8_000),
      });
    }

    const latencyMs = Date.now() - startedAt;
    return {
      status:
        response.status >= 500
          ? ('broken' as const)
          : response.status >= 400
            ? ('warning' as const)
            : ('ok' as const),
      statusCode: response.status,
      error: '',
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'broken' as const,
      statusCode: null,
      error: error instanceof Error ? error.message.slice(0, 500) : 'Request failed',
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function checkLinkHealth(
  code: string,
  options: UpdateLinkOptions = {},
): Promise<LinkHealthResult> {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({ where: { code } });
  if (!link) return { status: 'not_found' };

  if (!options.isAdmin && !options.allowAnyOwner) {
    if (!options.owner || !linkMatchesOwner(link, options.owner)) {
      return { status: 'denied' };
    }
  }

  const result = await fetchHealth(link.url);
  await link.update({
    health_status: result.status,
    health_status_code: result.statusCode,
    health_checked_at: new Date(),
    health_error: result.error,
    health_latency_ms: result.latencyMs,
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
        where: { queue_id: data.queueId },
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
    link.last_clicked_at = clickedAt;
    await link.save({ transaction, fields: ['last_clicked_at'] });

    await ClickEventModel.create(
      {
        queue_id: data.queueId ?? null,
        link_id: link.id,
        created_at: clickedAt,
        ip_address: data.ip || null,
        user_agent: data.userAgent || null,
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
    isAdmin?: boolean;
    creatorVisibility?: CreatorVisibility;
    page?: number;
    pageSize?: number;
    search?: ClickEventSearch;
  } = {},
) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({ where: { code } });
  if (!link) return undefined;
  return getStatsForLink(publicLink(link), options);
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
    { link_id: link.id },
    clickEventSearchWhere(options.search),
  );
  const clickQuery = (page: number) =>
    ClickEventModel.findAll({
      where: clickWhere,
      order: [['created_at', 'DESC']],
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
  const clickEvents = clicks.map(
    ({
      created_at,
      ip_address,
      metadata,
      referer,
      user_agent,
    }): ClickEvent => ({
      created_at: created_at.toISOString(),
      ip: ip_address
        ? options.isAdmin
          ? ip_address
          : anonymizeIp(ip_address)
        : null,
      referer,
      user_agent,
      metadata,
    }),
  );
  const [creator, insights] = await Promise.all([
    creatorPromise,
    insightsPromise,
  ]);

  return {
    ...link,
    creator,
    click_events: clickEvents,
    insights,
    pagination: pagination satisfies PaginationMeta,
  };
}

export async function canViewStats(input: {
  code: string;
  isAdmin?: boolean;
  allowAnyOwner?: boolean;
  owner?: LinkOwner;
}) {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({ where: { code: input.code } });
  if (!link) return { allowed: false, link: undefined };
  const isOwner = input.owner ? linkMatchesOwner(link, input.owner) : false;
  return {
    allowed: input.isAdmin || input.allowAnyOwner || isOwner,
    link: publicLink(link),
    isOwner,
  };
}

export async function deleteLink(code: string) {
  await ensureDatabase();
  return (await ShortLinkModel.destroy({ where: { code } })) > 0;
}

export async function deleteLinks(
  codes: string[],
  options: DeleteLinksOptions = {},
) {
  await ensureDatabase();
  const requestedCodes = normalizeCodes(codes);
  const result: DeleteLinksResult = {
    requested: requestedCodes.length,
    deleted: 0,
    notFound: 0,
    denied: 0,
    disabled: 0,
    tooManyClicks: 0,
  };

  if (requestedCodes.length === 0) return result;

  const links = await ShortLinkModel.findAll({
    where: { code: { [Op.in]: requestedCodes } },
  });
  const linksByCode = new Map(links.map((link) => [link.code, link]));
  const deletableIds: number[] = [];
  const maxClicks = Math.max(0, Math.trunc(options.maxClicks ?? 0));
  const clickLimitEnabled = maxClicks > 0;

  for (const code of requestedCodes) {
    const link = linksByCode.get(code);
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
