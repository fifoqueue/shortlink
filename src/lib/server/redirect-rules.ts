import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import type { LinkOptionKey } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';

export type RedirectRuleConditionType =
  | 'device'
  | 'language'
  | 'query-param'
  | 'any-query-param'
  | 'valueless-query-param'
  | 'ip'
  | 'geo-country'
  | 'geo-city'
  | 'percentage';

export interface RedirectRuleCondition {
  type: RedirectRuleConditionType;
  matchKey: string | null;
  matchValue: string | null;
}

export interface RedirectRule {
  longUrl: string;
  conditions: RedirectRuleCondition[];
}

export interface MatchedRedirectRule {
  index: number;
  rule: RedirectRule;
}

export interface RedirectRuleContext {
  requestUrl: string;
  userAgent: string;
  acceptLanguage: string;
  ip: string;
  clientHints: {
    mobile: boolean | null;
    platform: string;
  };
  metadata: Record<string, string>;
}

const conditionTypes = new Set<RedirectRuleConditionType>([
  'device',
  'language',
  'query-param',
  'any-query-param',
  'valueless-query-param',
  'ip',
  'geo-country',
  'geo-city',
  'percentage',
]);

const conditionPermissionKeys: Record<
  RedirectRuleConditionType,
  LinkOptionKey
> = {
  device: 'redirectRuleDevice',
  language: 'redirectRuleLanguage',
  'query-param': 'redirectRuleQuery',
  'any-query-param': 'redirectRuleQuery',
  'valueless-query-param': 'redirectRuleQuery',
  ip: 'redirectRuleIp',
  'geo-country': 'redirectRuleGeo',
  'geo-city': 'redirectRuleGeo',
  percentage: 'redirectRulePercentage',
};

const deviceMatchValues = new Set([
  'android',
  'ios',
  'mobile',
  'windows',
  'linux',
  'macos',
  'chromeos',
  'desktop',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function scalarStringValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return '';
}

function parsedRules(value: unknown) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      throw new Error(serverMessage('redirectRulesJsonInvalid'));
    }
    throw new Error(serverMessage('redirectRulesInvalid'));
  }

  throw new Error(serverMessage('redirectRulesInvalid'));
}

function normalizedType(value: unknown): RedirectRuleConditionType | null {
  const type = stringValue(value).toLowerCase();
  return conditionTypes.has(type as RedirectRuleConditionType)
    ? (type as RedirectRuleConditionType)
    : null;
}

function normalizeCondition(value: unknown): RedirectRuleCondition | null {
  if (!isRecord(value)) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }
  const type = normalizedType(value.type);
  if (!type) throw new Error(serverMessage('redirectRuleConditionInvalid'));
  const matchKey = stringValue(value.matchKey).slice(0, 120) || null;
  const rawMatchValue = scalarStringValue(value.matchValue).slice(0, 300);
  const matchValue =
    type === 'device' || type === 'language' || type === 'geo-country'
      ? rawMatchValue.toLowerCase() || null
      : rawMatchValue || null;

  if (type === 'query-param' && (!matchKey || !matchValue)) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }
  if (type === 'any-query-param' && !matchKey) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }
  if (type === 'valueless-query-param' && !matchKey) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }
  if (
    !['query-param', 'any-query-param', 'valueless-query-param'].includes(
      type,
    ) &&
    !matchValue
  ) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }

  if (type === 'device' && !deviceMatchValues.has(matchValue ?? '')) {
    throw new Error(serverMessage('redirectRuleConditionInvalid'));
  }

  if (type === 'percentage') {
    const percent = Number(matchValue);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new Error(serverMessage('redirectRuleConditionInvalid'));
    }
    return {
      type,
      matchKey,
      matchValue: String(Math.round(percent)),
    };
  }

  return { type, matchKey, matchValue };
}

export function normalizeRedirectRules(
  value: unknown,
  normalizeUrl: (value: string) => string,
) {
  return parsedRules(value)
    .map((raw): RedirectRule => {
      if (!isRecord(raw)) {
        throw new Error(serverMessage('redirectRulesInvalid'));
      }
      const rawLongUrl = stringValue(raw.longUrl) || stringValue(raw.url);
      if (!rawLongUrl) {
        throw new Error(serverMessage('redirectRuleUrlRequired'));
      }
      const longUrl = normalizeUrl(rawLongUrl);
      const conditions = Array.isArray(raw.conditions)
        ? raw.conditions
            .map(normalizeCondition)
            .filter(
              (condition): condition is RedirectRuleCondition =>
                condition !== null,
            )
            .slice(0, 12)
        : [];
      if (conditions.length === 0) {
        throw new Error(serverMessage('redirectRuleConditionInvalid'));
      }
      return { longUrl, conditions };
    })
    .slice(0, 20);
}

function storedCondition(value: unknown): RedirectRuleCondition | null {
  try {
    return normalizeCondition(value);
  } catch {
    return null;
  }
}

export function storedRedirectRules(value: unknown): RedirectRule[] {
  const rules = Array.isArray(value) ? value : [];
  return rules
    .map((raw): RedirectRule | null => {
      if (!isRecord(raw)) return null;
      const longUrl = stringValue(raw.longUrl) || stringValue(raw.url);
      const conditions = Array.isArray(raw.conditions)
        ? raw.conditions
            .map(storedCondition)
            .filter(
              (condition): condition is RedirectRuleCondition =>
                condition !== null,
            )
        : [];
      if (!longUrl || conditions.length === 0) return null;
      return { longUrl, conditions };
    })
    .filter((rule): rule is RedirectRule => rule !== null)
    .slice(0, 20);
}

export function redirectRulesText(value: unknown) {
  const rules = storedRedirectRules(value);
  return rules.length > 0 ? JSON.stringify(rules, null, 2) : '';
}

export function redirectRulePermissionKeysFromValue(value: unknown) {
  const keys = new Set<LinkOptionKey>();
  for (const rule of parsedRules(value)) {
    if (!isRecord(rule) || !Array.isArray(rule.conditions)) continue;
    for (const rawCondition of rule.conditions) {
      if (!isRecord(rawCondition)) continue;
      const type = normalizedType(rawCondition.type);
      if (type) keys.add(conditionPermissionKeys[type]);
    }
  }
  return [...keys];
}

export function redirectRulePermissionKeysFromRules(rules: RedirectRule[]) {
  const keys = new Set<LinkOptionKey>();
  for (const rule of rules) {
    for (const condition of rule.conditions) {
      keys.add(conditionPermissionKeys[condition.type]);
    }
  }
  return [...keys];
}

export function redirectRuleConditionTypes(rules: RedirectRule[]) {
  const types = new Set<RedirectRuleConditionType>();
  for (const rule of rules) {
    for (const condition of rule.conditions) {
      types.add(condition.type);
    }
  }
  return [...types];
}

function normalizedLanguage(value: string) {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function languageMatches(header: string, expected: string) {
  const target = normalizedLanguage(expected);
  if (!target) return false;
  return header
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter((part) => part && part !== '*')
    .map(normalizedLanguage)
    .some((language) =>
      target.length === 2
        ? language === target || language.startsWith(`${target}-`)
        : language === target,
    );
}

function deviceFromContext(context: RedirectRuleContext) {
  const platform = context.clientHints.platform.toLowerCase();
  const ua = context.userAgent.toLowerCase();
  const mobileHint = context.clientHints.mobile;
  const android = platform.includes('android') || ua.includes('android');
  const ios =
    platform.includes('ios') ||
    /\biphone\b|\bipad\b|\bipod\b/.test(ua) ||
    (platform.includes('mac') && ua.includes('mobile'));
  const chromeos = platform.includes('chrome os') || ua.includes('cros');
  const windows = platform.includes('windows') || ua.includes('windows');
  const macos = !ios && (platform.includes('mac') || ua.includes('macintosh'));
  const linux =
    !android &&
    !chromeos &&
    (platform.includes('linux') || ua.includes('linux'));
  const mobile =
    mobileHint === true ||
    android ||
    ios ||
    /\bmobile\b|opera mini|iemobile/.test(ua);
  const desktop = mobileHint === false || windows || macos || linux || chromeos;
  return { android, ios, mobile, windows, linux, macos, chromeos, desktop };
}

function deviceMatches(context: RedirectRuleContext, value: string) {
  const device = value.trim().toLowerCase();
  const flags = deviceFromContext(context);
  return flags[device as keyof typeof flags] === true;
}

function queryMatches(
  context: RedirectRuleContext,
  condition: RedirectRuleCondition,
) {
  let url: URL;
  try {
    url = new URL(context.requestUrl);
  } catch {
    return false;
  }
  const key = condition.matchKey ?? '';
  if (!key) return false;
  if (condition.type === 'any-query-param') return url.searchParams.has(key);
  if (condition.type === 'valueless-query-param') {
    return url.searchParams.has(key) && url.searchParams.get(key) === '';
  }
  return url.searchParams.getAll(key).includes(condition.matchValue ?? '');
}

function cleanIp(value: string) {
  const ip = value.trim().replace(/^"|"$/g, '');
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function ipv4Number(value: string) {
  const ip = cleanIp(value);
  if (isIP(ip) !== 4) return null;
  return ip.split('.').reduce((result, part) => result * 256 + Number(part), 0);
}

function ipv4WildcardMatches(ip: string, pattern: string) {
  const ipParts = cleanIp(ip).split('.');
  const patternParts = pattern.trim().split('.');
  return (
    ipParts.length === 4 &&
    patternParts.length === 4 &&
    patternParts.every((part, index) => part === '*' || part === ipParts[index])
  );
}

function ipv4CidrMatches(ip: string, pattern: string) {
  const [address, rawPrefix] = pattern.split('/');
  const target = ipv4Number(ip);
  const base = ipv4Number(address ?? '');
  const prefix = Number(rawPrefix);
  if (target === null || base === null || !Number.isInteger(prefix)) {
    return false;
  }
  if (prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (target & mask) === (base & mask);
}

function ipv6ToBigInt(value: string) {
  let input = cleanIp(value).toLowerCase();
  const zoneIndex = input.indexOf('%');
  if (zoneIndex !== -1) input = input.slice(0, zoneIndex);

  const ipv4Match = input.match(/(.+:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const ipv4 = ipv4Number(ipv4Match[2]);
    if (ipv4 === null) return null;
    input = `${ipv4Match[1]}${((ipv4 >>> 16) & 0xffff).toString(
      16,
    )}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts =
    halves.length === 2
      ? [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
      : left;

  if (parts.length !== 8 || missing < 0) return null;

  let result = 0n;
  for (const part of parts) {
    if (!/^[\da-f]{1,4}$/.test(part)) return null;
    result = (result << 16n) + BigInt(Number.parseInt(part, 16));
  }
  return result;
}

function ipv6CidrMatches(ip: string, pattern: string) {
  const [address, rawPrefix] = pattern.split('/');
  const target = ipv6ToBigInt(ip);
  const base = ipv6ToBigInt(address ?? '');
  const prefix = Number(rawPrefix);
  if (target === null || base === null || !Number.isInteger(prefix)) {
    return false;
  }
  if (prefix < 0 || prefix > 128) return false;
  const shift = BigInt(128 - prefix);
  return prefix === 0 || target >> shift === base >> shift;
}

function exactIpMatches(ip: string, pattern: string) {
  const target = cleanIp(ip);
  const value = cleanIp(pattern);
  const targetFamily = isIP(target);
  const valueFamily = isIP(value);
  if (!targetFamily || targetFamily !== valueFamily) return false;
  if (targetFamily === 4) return target === value;
  return ipv6ToBigInt(target) === ipv6ToBigInt(value);
}

function ipMatches(ip: string, pattern: string) {
  const target = cleanIp(ip);
  const value = pattern.trim();
  if (!target || !value) return false;
  if (value.includes('*')) return ipv4WildcardMatches(target, value);
  if (value.includes('/') && isIP(value.split('/')[0] ?? '') === 4) {
    return ipv4CidrMatches(target, value);
  }
  if (value.includes('/') && isIP(value.split('/')[0] ?? '') === 6) {
    return ipv6CidrMatches(target, value);
  }
  return exactIpMatches(target, value);
}

function percentageMatches(value: string) {
  const percent = Math.max(0, Math.min(100, Number(value)));
  return Number.isFinite(percent) && percent > 0 && randomInt(100) < percent;
}

function conditionMatches(
  context: RedirectRuleContext,
  condition: RedirectRuleCondition,
) {
  const value = condition.matchValue ?? '';
  if (condition.type === 'device') return deviceMatches(context, value);
  if (condition.type === 'language') {
    return languageMatches(context.acceptLanguage, value);
  }
  if (
    condition.type === 'query-param' ||
    condition.type === 'any-query-param' ||
    condition.type === 'valueless-query-param'
  ) {
    return queryMatches(context, condition);
  }
  if (condition.type === 'ip') return ipMatches(context.ip, value);
  if (condition.type === 'geo-country') {
    return (
      context.metadata.geoCountryCode?.toLowerCase() === value.toLowerCase()
    );
  }
  if (condition.type === 'geo-city') {
    return context.metadata.geoCityName?.toLowerCase() === value.toLowerCase();
  }
  if (condition.type === 'percentage') return percentageMatches(value);
  return false;
}

export function matchingRedirectRule(
  rules: RedirectRule[],
  context: RedirectRuleContext,
) {
  return matchedRedirectRule(rules, context)?.rule;
}

export function matchedRedirectRule(
  rules: RedirectRule[],
  context: RedirectRuleContext,
): MatchedRedirectRule | null {
  for (const [index, rule] of rules.entries()) {
    if (
      rule.conditions.every((condition) => conditionMatches(context, condition))
    ) {
      return { index, rule };
    }
  }

  return null;
}

export function redirectRuleClientHints(headers: Headers) {
  const mobileHeader = headers.get('sec-ch-ua-mobile')?.trim();
  const platform = headers
    .get('sec-ch-ua-platform')
    ?.trim()
    .replace(/^"|"$/g, '');
  return {
    mobile: mobileHeader === '?1' ? true : mobileHeader === '?0' ? false : null,
    platform: platform ?? '',
  };
}

export function redirectRuleContextFromRequest(
  request: Request,
  input: {
    ip?: string;
    metadata?: Record<string, string>;
  } = {},
): RedirectRuleContext {
  return {
    requestUrl: request.url,
    userAgent: request.headers.get('user-agent') ?? '',
    acceptLanguage: request.headers.get('accept-language') ?? '',
    ip: input.ip ?? '',
    clientHints: redirectRuleClientHints(request.headers),
    metadata: input.metadata ?? {},
  };
}
