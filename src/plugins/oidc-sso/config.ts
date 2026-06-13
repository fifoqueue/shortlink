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
