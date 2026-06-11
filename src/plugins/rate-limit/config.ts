import { isHttpHeaderName } from '../utils';
import {
  defaultSiteLocale,
  siteLocaleKeys,
  type SiteLocale,
} from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';

export type RateLimitPathMode = 'exact' | 'prefix' | 'glob' | 'regex';

export type RateLimitScopePart =
  | 'global'
  | 'ip'
  | 'user'
  | 'apiToken'
  | 'method'
  | 'path'
  | 'route'
  | `header:${string}`
  | `query:${string}`
  | `cookie:${string}`;

export interface RateLimitRule extends Record<string, unknown> {
  id: string;
  name: string;
  enabled: boolean;
  limit: number;
  windowSeconds: number;
  methods: string[];
  path: string;
  pathMode: RateLimitPathMode;
  scope: RateLimitScopePart[];
  requireAuthenticated: boolean | null;
  requireAdmin: boolean | null;
  requireApiToken: boolean | null;
  requireAdminApiToken: boolean | null;
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
}

export interface RateLimitConfig extends Record<string, unknown> {
  responseMessage: string;
  responseMessages: Record<string, string>;
  rules: RateLimitRule[];
}

const methodNames = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

export const defaultRateLimitConfig: RateLimitConfig = {
  responseMessage: 'Too many requests. Try again later.',
  responseMessages: {
    ko: '요청 속도가 너무 빠릅니다. 잠시 후 다시 시도해주세요.',
    en: 'Too many requests. Try again later.',
  },
  rules: [
    {
      id: 'api-create-by-token',
      name: 'API link creation',
      enabled: true,
      limit: 30,
      windowSeconds: 60,
      methods: ['POST'],
      path: '/api/links',
      pathMode: 'exact',
      scope: ['apiToken', 'ip'],
      requireAuthenticated: null,
      requireAdmin: null,
      requireApiToken: true,
      requireAdminApiToken: null,
      headers: {},
      query: {},
      cookies: {},
    },
    {
      id: 'api-write-by-token',
      name: 'API link update/delete',
      enabled: true,
      limit: 120,
      windowSeconds: 60,
      methods: ['PUT', 'PATCH', 'DELETE'],
      path: '/api/links',
      pathMode: 'prefix',
      scope: ['apiToken', 'ip', 'method'],
      requireAuthenticated: null,
      requireAdmin: null,
      requireApiToken: true,
      requireAdminApiToken: null,
      headers: {},
      query: {},
      cookies: {},
    },
    {
      id: 'api-read-by-token',
      name: 'API link lookup',
      enabled: true,
      limit: 300,
      windowSeconds: 60,
      methods: ['GET'],
      path: '/api/links',
      pathMode: 'prefix',
      scope: ['apiToken', 'ip', 'method'],
      requireAuthenticated: null,
      requireAdmin: null,
      requireApiToken: true,
      requireAdminApiToken: null,
      headers: {},
      query: {},
      cookies: {},
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function localizedStrings(
  value: unknown,
  fallback: Record<string, string>,
  fallbackLocale: SiteLocale = defaultSiteLocale,
): Record<SiteLocale, string> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    siteLocaleKeys.map((locale) => [
      locale,
      stringValue(
        source[locale],
        fallback[locale] ?? fallback[fallbackLocale] ?? '',
      ).slice(0, 300),
    ]),
  ) as Record<SiteLocale, string>;
}

function firstLocalizedString(values: Record<string, string>) {
  return siteLocaleKeys.map((locale) => values[locale]).find(Boolean) ?? '';
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, Math.round(numeric)))
    : fallback;
}

function normalizeMethods(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => stringValue(item).toUpperCase())
        .filter((item) => methodNames.includes(item)),
    ),
  ];
}

function normalizePathMode(value: unknown): RateLimitPathMode {
  return ['exact', 'prefix', 'glob', 'regex'].includes(String(value))
    ? (value as RateLimitPathMode)
    : 'prefix';
}

function normalizeScope(value: unknown): RateLimitScopePart[] {
  const source = Array.isArray(value) ? value : ['ip'];
  const normalized = source
    .map((item) => stringValue(item))
    .filter((item): item is RateLimitScopePart => {
      if (
        [
          'global',
          'ip',
          'user',
          'apiToken',
          'method',
          'path',
          'route',
        ].includes(item)
      ) {
        return true;
      }
      if (!/^(header|query|cookie):[A-Za-z0-9_.-]+$/.test(item)) return false;
      if (item.startsWith('header:')) return isHttpHeaderName(item.slice(7));
      return true;
    });
  return normalized.length > 0 ? [...new Set(normalized)] : ['ip'];
}

function normalizeConditionRecord(value: unknown, headers = false) {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .map(([key, raw]) => [key.trim(), String(raw ?? '').trim()] as const)
    .filter(([key]) => {
      if (!key) return false;
      return headers ? isHttpHeaderName(key) : /^[A-Za-z0-9_.-]+$/.test(key);
    })
    .slice(0, 30);
  return Object.fromEntries(entries);
}

export function normalizeRateLimitConfig(
  value: unknown,
  fallbackLocale: SiteLocale = defaultSiteLocale,
): RateLimitConfig {
  const source = isRecord(value) ? value : {};
  const rawRules = Array.isArray(source.rules)
    ? source.rules
    : defaultRateLimitConfig.rules;

  const responseMessages = localizedStrings(
    source.responseMessages,
    {
      ko:
        stringValue(source.responseMessage) ||
        (defaultRateLimitConfig.responseMessages[fallbackLocale] ?? ''),
      en: defaultRateLimitConfig.responseMessages.en,
    },
    fallbackLocale,
  );

  return {
    responseMessage:
      responseMessages[fallbackLocale] ??
      firstLocalizedString(responseMessages),
    responseMessages,
    rules: rawRules.slice(0, 100).map((raw, index) => {
      const rule = isRecord(raw) ? raw : {};
      const id = stringValue(rule.id, `rule-${index + 1}`)
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .slice(0, 64);
      return {
        id: id || `rule-${index + 1}`,
        name: stringValue(rule.name, id || `Rule ${index + 1}`).slice(0, 120),
        enabled: rule.enabled !== false,
        limit: clampInteger(rule.limit, 60, 1, 1_000_000),
        windowSeconds: clampInteger(rule.windowSeconds, 60, 1, 604_800),
        methods: normalizeMethods(rule.methods),
        path: stringValue(rule.path, '/').slice(0, 500),
        pathMode: normalizePathMode(rule.pathMode),
        scope: normalizeScope(rule.scope),
        requireAuthenticated: booleanOrNull(rule.requireAuthenticated),
        requireAdmin: booleanOrNull(rule.requireAdmin),
        requireApiToken: booleanOrNull(rule.requireApiToken),
        requireAdminApiToken: booleanOrNull(rule.requireAdminApiToken),
        headers: normalizeConditionRecord(rule.headers, true),
        query: normalizeConditionRecord(rule.query),
        cookies: normalizeConditionRecord(rule.cookies),
      };
    }),
  };
}

export function validateRateLimitConfig(config: RateLimitConfig) {
  const ids = new Set<string>();

  for (const rule of config.rules) {
    if (ids.has(rule.id)) {
      throw new Error(serverMessage('rateLimitRuleDuplicate', { id: rule.id }));
    }
    ids.add(rule.id);

    if (!/^[A-Za-z0-9_-]{1,64}$/.test(rule.id)) {
      throw new Error(serverMessage('rateLimitRuleIdInvalid', { id: rule.id }));
    }

    if (rule.pathMode === 'regex') {
      try {
        new RegExp(rule.path);
      } catch {
        throw new Error(
          serverMessage('rateLimitRegexInvalid', { name: rule.name }),
        );
      }
    }
  }
}
