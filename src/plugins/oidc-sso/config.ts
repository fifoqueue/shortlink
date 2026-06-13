import type { PluginConfig } from '$lib/plugin-contracts';

export type SsoProviderFlow = 'oidc' | 'oauth';
export type OAuthMetadataSource = 'manual' | 'metadata-url' | 'profile-link';
export type OAuthSubjectVerification = 'none' | 'authorization-endpoint';
export type EmailTrustMode =
  | 'verified-claim'
  | 'local-verification'
  | 'disabled'
  | 'existing-only';

export interface OidcProvider {
  id: string;
  name: string;
  flow: SsoProviderFlow;
  loginButtonColor: string;
  loginButtonTextColor: string;
  loginIconUrl: string;
  issuerUrl: string;
  oauthMetadataSource: OAuthMetadataSource;
  oauthMetadataUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  metadataLinkRel: string;
  authorizationEndpointRel: string;
  tokenEndpointRel: string;
  clientId: string;
  clientSecret: string;
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  scopes: string;
  authorizationRequestQuery: string;
  tokenRequestBody: string;
  extraRequestQuery: string;
  extraRequestHeaders: string;
  loginInputName: string;
  loginInputLabel: string;
  loginInputPlaceholder: string;
  loginInputHelp: string;
  loginInputDefault: string;
  loginInputRequired: boolean;
  loginInputUrlCanonicalization: boolean;
  authorizationHintParameter: string;
  subjectPath: string;
  emailPath: string;
  emailVerifiedPath: string;
  namePath: string;
  subjectVerification: OAuthSubjectVerification;
  emailTrustMode: EmailTrustMode;
  allowedEmailDomains: string[];
}

export interface OidcPluginConfig extends Record<string, unknown> {
  passwordLoginEnabled: boolean;
  providers: OidcProvider[];
}

export const defaultOidcScopes = 'openid profile email';

export type ExtraRequestQueryError = 'invalid' | 'keyRequired';

type JsonPathSegment =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number };

const blockedJsonPathKeys = new Set(['__proto__', 'prototype', 'constructor']);

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function emailTrustMode(value: unknown): EmailTrustMode {
  return value === 'local-verification' ||
    value === 'disabled' ||
    value === 'existing-only'
    ? value
    : 'verified-claim';
}

function provider(value: unknown): OidcProvider | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.issuerUrl !== 'string' ||
    typeof raw.clientId !== 'string'
  ) {
    return null;
  }
  const method = raw.clientAuthMethod;
  const flow = raw.flow === 'oauth' ? 'oauth' : 'oidc';
  const oauthMetadataSource =
    raw.oauthMetadataSource === 'metadata-url' ||
    raw.oauthMetadataSource === 'profile-link'
      ? raw.oauthMetadataSource
      : 'manual';
  return {
    id: raw.id,
    name: raw.name,
    flow,
    loginButtonColor: stringValue(raw.loginButtonColor),
    loginButtonTextColor: stringValue(raw.loginButtonTextColor),
    loginIconUrl: stringValue(raw.loginIconUrl),
    issuerUrl: raw.issuerUrl,
    oauthMetadataSource,
    oauthMetadataUrl: stringValue(raw.oauthMetadataUrl),
    authorizationEndpoint: stringValue(raw.authorizationEndpoint),
    tokenEndpoint: stringValue(raw.tokenEndpoint),
    userInfoEndpoint: stringValue(raw.userInfoEndpoint),
    metadataLinkRel: stringValue(raw.metadataLinkRel),
    authorizationEndpointRel: stringValue(raw.authorizationEndpointRel),
    tokenEndpointRel: stringValue(raw.tokenEndpointRel),
    clientId: raw.clientId,
    clientSecret: typeof raw.clientSecret === 'string' ? raw.clientSecret : '',
    clientAuthMethod:
      method === 'client_secret_post' || method === 'none'
        ? method
        : 'client_secret_basic',
    scopes: typeof raw.scopes === 'string' ? raw.scopes : defaultOidcScopes,
    authorizationRequestQuery: stringValue(raw.authorizationRequestQuery),
    tokenRequestBody: stringValue(raw.tokenRequestBody),
    extraRequestQuery: stringValue(raw.extraRequestQuery),
    extraRequestHeaders: stringValue(raw.extraRequestHeaders),
    loginInputName: stringValue(raw.loginInputName),
    loginInputLabel: stringValue(raw.loginInputLabel),
    loginInputPlaceholder: stringValue(raw.loginInputPlaceholder),
    loginInputHelp: stringValue(raw.loginInputHelp),
    loginInputDefault: stringValue(raw.loginInputDefault),
    loginInputRequired: booleanValue(raw.loginInputRequired),
    loginInputUrlCanonicalization: booleanValue(
      raw.loginInputUrlCanonicalization,
    ),
    authorizationHintParameter: stringValue(raw.authorizationHintParameter),
    subjectPath: stringValue(raw.subjectPath) || 'sub',
    emailPath: stringValue(raw.emailPath) || 'email',
    emailVerifiedPath: stringValue(raw.emailVerifiedPath) || 'email_verified',
    namePath: stringValue(raw.namePath) || 'name',
    subjectVerification:
      raw.subjectVerification === 'authorization-endpoint'
        ? 'authorization-endpoint'
        : 'none',
    emailTrustMode: emailTrustMode(raw.emailTrustMode),
    allowedEmailDomains: stringArray(raw.allowedEmailDomains),
  };
}

export function normalizeOidcConfig(config: PluginConfig): OidcPluginConfig {
  return {
    passwordLoginEnabled: config.passwordLoginEnabled !== false,
    providers: Array.isArray(config.providers)
      ? config.providers
          .map(provider)
          .filter((item): item is OidcProvider => Boolean(item))
      : [],
  };
}

export function findProvider(config: PluginConfig, id: string) {
  return normalizeOidcConfig(config).providers.find((item) => item.id === id);
}

export function parseList(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function providerSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function readQuotedJsonPathKey(input: string, startIndex: number) {
  const quote = input[startIndex];
  let value = '';
  for (let index = startIndex + 1; index < input.length; index += 1) {
    const char = input[index];
    if (char === quote) {
      return { value, nextIndex: index + 1 };
    }
    if (char !== '\\') {
      value += char;
      continue;
    }
    const escaped = input[index + 1];
    if (!escaped) throw new Error('Invalid JSON path');
    index += 1;
    if (escaped === 'b') value += '\b';
    else if (escaped === 'f') value += '\f';
    else if (escaped === 'n') value += '\n';
    else if (escaped === 'r') value += '\r';
    else if (escaped === 't') value += '\t';
    else if (escaped === 'u') {
      const hex = input.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new Error('Invalid JSON path');
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 4;
    } else {
      value += escaped;
    }
  }
  throw new Error('Invalid JSON path');
}

function pushJsonPathKey(segments: JsonPathSegment[], key: string) {
  const normalized = key.trim();
  if (!normalized || blockedJsonPathKeys.has(normalized)) {
    throw new Error('Invalid JSON path');
  }
  segments.push({ type: 'key', key: normalized });
}

function pushJsonPathIndex(segments: JsonPathSegment[], value: string) {
  if (!/^\d+$/.test(value)) throw new Error('Invalid JSON path');
  const index = Number(value);
  if (!Number.isSafeInteger(index)) throw new Error('Invalid JSON path');
  segments.push({ type: 'index', index });
}

export function parseJsonPath(path: string) {
  const source = path.trim();
  const segments: JsonPathSegment[] = [];
  let index = 0;
  if (!source) return segments;
  if (source[index] === '$') {
    index += 1;
    if (index < source.length && !'.['.includes(source[index])) {
      throw new Error('Invalid JSON path');
    }
  }

  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    const char = source[index];
    if (!char) break;
    if (char === '.') {
      index += 1;
      const start = index;
      while (
        index < source.length &&
        source[index] !== '.' &&
        source[index] !== '['
      ) {
        index += 1;
      }
      pushJsonPathKey(segments, source.slice(start, index));
      continue;
    }
    if (char === '[') {
      index += 1;
      while (/\s/.test(source[index] ?? '')) index += 1;
      if (source[index] === '"' || source[index] === "'") {
        const result = readQuotedJsonPathKey(source, index);
        index = result.nextIndex;
        while (/\s/.test(source[index] ?? '')) index += 1;
        if (source[index] !== ']') throw new Error('Invalid JSON path');
        index += 1;
        pushJsonPathKey(segments, result.value);
        continue;
      }
      const start = index;
      while (index < source.length && source[index] !== ']') index += 1;
      if (source[index] !== ']') throw new Error('Invalid JSON path');
      const value = source.slice(start, index).trim();
      index += 1;
      if (!value) throw new Error('Invalid JSON path');
      if (/^\d+$/.test(value)) pushJsonPathIndex(segments, value);
      else pushJsonPathKey(segments, value);
      continue;
    }
    const start = index;
    while (
      index < source.length &&
      source[index] !== '.' &&
      source[index] !== '['
    ) {
      index += 1;
    }
    pushJsonPathKey(segments, source.slice(start, index));
  }

  return segments;
}

export function isValidJsonPath(path: string) {
  try {
    parseJsonPath(path);
    return true;
  } catch {
    return false;
  }
}

function arrayIndexFromPathSegment(segment: JsonPathSegment) {
  if (segment.type === 'index') return segment.index;
  if (!/^\d+$/.test(segment.key)) return null;
  const index = Number(segment.key);
  return Number.isSafeInteger(index) ? index : null;
}

export function getJsonPathValue(value: unknown, path: string) {
  let current = value;
  let segments: JsonPathSegment[];
  try {
    segments = parseJsonPath(path);
  } catch {
    return null;
  }
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return null;
    if (Array.isArray(current)) {
      const index = arrayIndexFromPathSegment(segment);
      if (index === null || !Object.hasOwn(current, index)) return null;
      current = current[index];
      continue;
    }
    const key = segment.type === 'index' ? String(segment.index) : segment.key;
    if (blockedJsonPathKeys.has(key) || !Object.hasOwn(current, key)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function parseExtraRequestQuery(
  value: string,
  error: (type: ExtraRequestQueryError, line: number) => Error,
) {
  const params = new URLSearchParams();
  const fail = (type: ExtraRequestQueryError, line: number) => {
    throw error(type, line);
  };

  value.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim().replace(/^\?/, '');
    if (!trimmed) return;
    for (const part of trimmed.split('&')) {
      const item = part.trim();
      if (!item) continue;
      let parsed: URLSearchParams;
      try {
        parsed = new URLSearchParams(item);
      } catch {
        fail('invalid', index + 1);
        return;
      }
      for (const [key, queryValue] of parsed) {
        if (!key.trim()) fail('keyRequired', index + 1);
        params.append(key.trim(), queryValue);
      }
    }
  });

  return params;
}
