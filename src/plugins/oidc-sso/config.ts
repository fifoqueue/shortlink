import type { PluginConfig } from '$lib/plugin-contracts';

export interface OidcProvider {
  id: string;
  name: string;
  loginButtonColor: string;
  loginButtonTextColor: string;
  loginIconUrl: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  scopes: string;
  allowedEmailDomains: string[];
}

export interface OidcPluginConfig extends Record<string, unknown> {
  passwordLoginEnabled: boolean;
  providers: OidcProvider[];
}

export const defaultOidcScopes = 'openid profile email';

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
  return {
    id: raw.id,
    name: raw.name,
    loginButtonColor: stringValue(raw.loginButtonColor),
    loginButtonTextColor: stringValue(raw.loginButtonTextColor),
    loginIconUrl: stringValue(raw.loginIconUrl),
    issuerUrl: raw.issuerUrl,
    clientId: raw.clientId,
    clientSecret: typeof raw.clientSecret === 'string' ? raw.clientSecret : '',
    clientAuthMethod:
      method === 'client_secret_post' || method === 'none'
        ? method
        : 'client_secret_basic',
    scopes: typeof raw.scopes === 'string' ? raw.scopes : defaultOidcScopes,
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
