import type { Cookies } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { josa } from 'es-hangul';
import * as oidc from 'openid-client';
import { parseHeaderRecord } from '$lib/delimited';
import type {
  AuthenticatedUser,
  AuthPluginModule,
  PluginConfig,
  PluginLocaleContext,
  PluginLocaleKey,
} from '$lib/plugin-contracts';
import { formatText, localizeServerMessage } from '$lib/i18n/ui-text';
import { pluginText } from '$lib/i18n/plugin';
import { getSettings } from '$lib/server/settings';
import { outboundFetch, outboundRequest } from '$lib/server/outbound-http';
import { canUseAuthProvider } from '$lib/server/permissions';
import {
  authCookieOptions,
  clearUserSession,
  createUserSessionFromModel,
  decodeSigned,
  encodeSigned,
  getUserFromSession,
} from '$lib/server/auth-session';
import {
  authenticateUser,
  createPendingSsoUser,
  getUserById,
  upsertSsoUser,
} from '$lib/server/users';
import { findIdentity, linkIdentity } from '$lib/server/user-identities';
import {
  findProvider,
  getJsonPathValue,
  normalizeOidcConfig,
  parseExtraRequestQuery,
  type ExtraRequestQueryError,
  type OidcProvider,
} from './config';

export const id = 'oidc-sso';

const FLOW_COOKIE = 'shortlink_oidc_flow';
const FLOW_TTL_SECONDS = 10 * 60;
const configurationCache = new Map<string, Promise<oidc.Configuration>>();

interface FlowState {
  providerId: string;
  verifier: string;
  state: string;
  nonce: string;
  redirectUri?: string;
  returnTo: string;
  purpose?: 'login' | 'account-link';
  userId?: number;
  expiresAt: number;
  oauth?: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    subjectHint: string;
  };
}

function t(
  context: PluginLocaleContext | undefined,
  key: PluginLocaleKey,
  values?: Record<string, string | number | null | undefined>,
) {
  const text = pluginText(context?.strings, key);
  return values ? formatText(text, values) : text;
}

function providerLoginLabel(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  return t(context, 'auth.providerLogin', {
    name: provider.name,
    nameWithJosa:
      context?.locale === 'ko' ? josa(provider.name, '으로/로') : provider.name,
  });
}

function assertAuthProviderAllowed(
  providerId: string,
  allowedProviders: readonly string[] | null | undefined,
  context?: PluginLocaleContext,
) {
  if (
    !canUseAuthProvider(
      { auth: { providers: allowedProviders ?? null } },
      id,
      providerId,
    )
  ) {
    throw new Error(t(context, 'auth.providerNotAllowed'));
  }
}

function throwLocalizedServerError(
  cause: unknown,
  context?: PluginLocaleContext,
): never {
  const message = cause instanceof Error ? cause.message : String(cause);
  throw new Error(
    context
      ? localizeServerMessage(context.locale, message, context.fallbackLocale)
      : message,
  );
}

function getClientAuthentication(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  const method = provider.clientAuthMethod;
  const clientSecret = provider.clientSecret;
  if (method === 'none') return oidc.None();
  if (!clientSecret) throw new Error(t(context, 'auth.clientSecretRequired'));
  return method === 'client_secret_post'
    ? oidc.ClientSecretPost(clientSecret)
    : oidc.ClientSecretBasic(clientSecret);
}

function extraQueryError(
  context: PluginLocaleContext | undefined,
  type: ExtraRequestQueryError,
  line: number,
) {
  return type === 'keyRequired'
    ? new Error(t(context, 'server.extraRequestQueryKeyRequired', { line }))
    : new Error(t(context, 'server.extraRequestQueryInvalid', { line }));
}

function extraRequestQuery(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  return parseExtraRequestQuery(provider.extraRequestQuery, (type, line) =>
    extraQueryError(context, type, line),
  );
}

function extraRequestHeaders(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  return parseHeaderRecord(
    provider.extraRequestHeaders,
    t(context, 'server.extraRequestHeadersDescription'),
  );
}

function providerOutboundFetch(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  const query = extraRequestQuery(provider, context);
  const headersToAdd = extraRequestHeaders(provider, context);
  const customFetch: oidc.CustomFetch = async (resource, options) => {
    const settings = await getSettings();
    const target = new URL(resource.toString());
    query.forEach((value, key) => {
      target.searchParams.append(key, value);
    });

    const headers = new Headers();
    if (options?.headers) {
      new Headers(options.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    Object.entries(headersToAdd).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return outboundFetch(target, {
      ...options,
      headers,
      settings,
      purpose: 'oidc',
    });
  };
  return customFetch;
}

function appendQuery(target: URL, query: URLSearchParams) {
  query.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
}

function parseFormEncodedOrJson(body: string, contentType = '') {
  if (/\bjson\b/i.test(contentType) || body.trim().startsWith('{')) {
    return JSON.parse(body) as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(body).entries());
}

function stringFromJson(value: unknown, path: string) {
  const current = getJsonPathValue(value, path);
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function booleanFromJson(value: unknown, path: string) {
  const current = getJsonPathValue(value, path);
  if (typeof current === 'boolean') return current;
  if (typeof current === 'number') return current === 1;
  if (typeof current !== 'string') return false;
  const normalized = current.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseLinkHeader(value: string | undefined, baseUrl: string) {
  const links: Array<{ rel: string; href: string }> = [];
  let part = '';
  let quoted = false;
  const parts: string[] = [];
  for (const char of value ?? '') {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      parts.push(part);
      part = '';
    } else {
      part += char;
    }
  }
  if (part) parts.push(part);

  for (const item of parts) {
    const href = /^\s*<([^>]+)>/.exec(item)?.[1];
    if (!href) continue;
    const rel = /;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(item);
    const relValue = (rel?.[1] ?? rel?.[2] ?? '').toLowerCase();
    for (const token of relValue.split(/\s+/).filter(Boolean)) {
      links.push({
        rel: token,
        href: new URL(href, baseUrl).toString(),
      });
    }
  }
  return links;
}

function htmlAttributeValue(tag: string, name: string) {
  const pattern = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function parseHtmlLinks(html: string, baseUrl: string) {
  const links: Array<{ rel: string; href: string }> = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const href = htmlAttributeValue(tag, 'href');
    if (!href) continue;
    const rel = htmlAttributeValue(tag, 'rel').toLowerCase();
    for (const token of rel.split(/\s+/).filter(Boolean)) {
      links.push({
        rel: token,
        href: new URL(href, baseUrl).toString(),
      });
    }
  }
  return links;
}

function firstRel(links: Array<{ rel: string; href: string }>, rel: string) {
  return links.find((link) => link.rel === rel)?.href ?? '';
}

function canonicalHttpUrl(value: string, context?: PluginLocaleContext) {
  const input = value.trim();
  if (!input) throw new Error(t(context, 'auth.loginInputRequired'));
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(t(context, 'auth.loginInputUrlInvalid'));
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !url.hostname ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    url.hostname.includes(':') ||
    url.pathname.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error(t(context, 'auth.loginInputUrlInvalid'));
  }
  url.hostname = url.hostname.toLowerCase();
  if (!url.pathname) url.pathname = '/';
  return url.toString();
}

function sameUrl(left: string, right: string) {
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return left === right;
  }
}

function userInputValue(
  provider: OidcProvider,
  requestParams: URLSearchParams | undefined,
  context?: PluginLocaleContext,
) {
  if (!provider.loginInputName) return '';
  const value =
    requestParams?.get(provider.loginInputName) || provider.loginInputDefault;
  if (!value.trim() && provider.loginInputRequired) {
    throw new Error(t(context, 'auth.loginInputRequired'));
  }
  if (!value.trim()) return '';
  return provider.loginInputUrlCanonicalization
    ? canonicalHttpUrl(value, context)
    : value.trim();
}

async function providerRequest(
  provider: OidcProvider,
  url: string,
  input?: {
    method?: 'GET' | 'POST';
    headers?: HeadersInit;
    body?: URLSearchParams;
    context?: PluginLocaleContext;
  },
) {
  const settings = await getSettings();
  const target = new URL(url);
  appendQuery(target, extraRequestQuery(provider, input?.context));
  const headers = new Headers(input?.headers);
  Object.entries(extraRequestHeaders(provider, input?.context)).forEach(
    ([key, value]) => {
      headers.set(key, value);
    },
  );
  return outboundRequest({
    url: target.toString(),
    method: input?.method ?? 'GET',
    headers,
    body: input?.body,
    settings,
    purpose: 'oidc',
  });
}

interface OAuthEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
}

function oauthMetadataEndpoints(
  metadata: Record<string, unknown>,
): OAuthEndpoints {
  return {
    issuer: stringFromJson(metadata, 'issuer') ?? '',
    authorizationEndpoint:
      stringFromJson(metadata, 'authorization_endpoint') ?? '',
    tokenEndpoint: stringFromJson(metadata, 'token_endpoint') ?? '',
    userInfoEndpoint: stringFromJson(metadata, 'userinfo_endpoint') ?? '',
  };
}

async function fetchOAuthMetadata(
  provider: OidcProvider,
  metadataUrl: string,
  context?: PluginLocaleContext,
) {
  const response = await providerRequest(provider, metadataUrl, {
    headers: { accept: 'application/json' },
    context,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      t(context, 'auth.serverError', {
        status: response.status,
        detail: response.body.slice(0, 500),
      }),
    );
  }
  try {
    return oauthMetadataEndpoints(
      JSON.parse(response.body) as Record<string, unknown>,
    );
  } catch {
    throw new Error(t(context, 'auth.oauthMetadataInvalid'));
  }
}

async function discoverProfileLinkedEndpoints(
  provider: OidcProvider,
  profileUrl: string,
  context?: PluginLocaleContext,
) {
  const profile = await providerRequest(provider, profileUrl, {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
    },
    context,
  });
  if (profile.status < 200 || profile.status >= 300) {
    throw new Error(t(context, 'auth.oauthDiscoveryFailed'));
  }
  const baseUrl = profile.url;
  const headerLinks = parseLinkHeader(profile.headers.link, baseUrl);
  const htmlLinks = /\bhtml\b/i.test(profile.headers['content-type'] ?? '')
    ? parseHtmlLinks(profile.body, baseUrl)
    : [];
  const links = [...headerLinks, ...htmlLinks];
  const metadataUrl = provider.metadataLinkRel
    ? firstRel(links, provider.metadataLinkRel.toLowerCase())
    : '';
  if (metadataUrl) {
    const endpoints = await fetchOAuthMetadata(provider, metadataUrl, context);
    return {
      ...endpoints,
      authorizationEndpoint:
        endpoints.authorizationEndpoint || provider.authorizationEndpoint,
      tokenEndpoint: endpoints.tokenEndpoint || provider.tokenEndpoint,
      userInfoEndpoint: endpoints.userInfoEndpoint || provider.userInfoEndpoint,
    };
  }
  return {
    issuer: '',
    authorizationEndpoint: provider.authorizationEndpointRel
      ? firstRel(links, provider.authorizationEndpointRel.toLowerCase())
      : '',
    tokenEndpoint: provider.tokenEndpointRel
      ? firstRel(links, provider.tokenEndpointRel.toLowerCase())
      : '',
    userInfoEndpoint: provider.userInfoEndpoint,
  };
}

async function resolveOAuthEndpoints(
  provider: OidcProvider,
  subjectHint: string,
  context?: PluginLocaleContext,
): Promise<OAuthEndpoints> {
  let endpoints: OAuthEndpoints;
  if (provider.oauthMetadataSource === 'metadata-url') {
    endpoints = await fetchOAuthMetadata(
      provider,
      provider.oauthMetadataUrl,
      context,
    );
  } else if (provider.oauthMetadataSource === 'profile-link') {
    const profileUrl = subjectHint || provider.loginInputDefault;
    if (!profileUrl) throw new Error(t(context, 'auth.loginInputRequired'));
    endpoints = await discoverProfileLinkedEndpoints(
      provider,
      profileUrl,
      context,
    );
  } else {
    endpoints = {
      issuer: provider.issuerUrl,
      authorizationEndpoint: provider.authorizationEndpoint,
      tokenEndpoint: provider.tokenEndpoint,
      userInfoEndpoint: provider.userInfoEndpoint,
    };
  }
  endpoints = {
    issuer: endpoints.issuer || provider.issuerUrl,
    authorizationEndpoint:
      endpoints.authorizationEndpoint || provider.authorizationEndpoint,
    tokenEndpoint: endpoints.tokenEndpoint || provider.tokenEndpoint,
    userInfoEndpoint: endpoints.userInfoEndpoint || provider.userInfoEndpoint,
  };
  if (!endpoints.authorizationEndpoint) {
    throw new Error(t(context, 'auth.oauthAuthorizationEndpointMissing'));
  }
  return endpoints;
}

async function getConfiguration(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  const { issuerUrl, clientId } = provider;
  if (!issuerUrl || !clientId) {
    throw new Error(t(context, 'auth.issuerAndClientIdRequired'));
  }
  const cacheKey = JSON.stringify([
    issuerUrl,
    clientId,
    provider.clientSecret,
    provider.clientAuthMethod,
    provider.extraRequestQuery,
    provider.extraRequestHeaders,
  ]);
  if (!configurationCache.has(cacheKey)) {
    const request = oidc
      .discovery(
        new URL(issuerUrl),
        clientId,
        undefined,
        getClientAuthentication(provider, context),
        {
          [oidc.customFetch]: providerOutboundFetch(provider, context),
        },
      )
      .catch((cause) => {
        configurationCache.delete(cacheKey);
        throw cause;
      });
    configurationCache.set(cacheKey, request);
  }
  return configurationCache.get(cacheKey)!;
}

function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function oauthErrorDetail(
  error: string,
  description: string | undefined,
  context?: PluginLocaleContext,
) {
  return description
    ? t(context, 'auth.errorWithDescription', { error, description })
    : error;
}

function formatOAuthError(cause: unknown, context?: PluginLocaleContext) {
  if (cause instanceof oidc.AuthorizationResponseError) {
    return t(context, 'auth.authorizationResponseError', {
      detail: oauthErrorDetail(cause.error, cause.error_description, context),
    });
  }
  if (cause instanceof oidc.ResponseBodyError) {
    return t(context, 'auth.serverError', {
      status: cause.status,
      detail: oauthErrorDetail(cause.error, cause.error_description, context),
    });
  }
  if (cause instanceof oidc.WWWAuthenticateChallengeError) {
    return cause.message
      ? t(context, 'auth.authorizationRejectedWithMessage', {
          message: cause.message,
        })
      : t(context, 'auth.authorizationRejected');
  }
  return cause instanceof Error
    ? cause.message
    : t(context, 'auth.requestFailed');
}

export async function createLoginUrl(
  cookies: Cookies,
  origin: string,
  config: PluginConfig,
  providerId: string,
  returnTo: string | null,
  context?: PluginLocaleContext,
  requestParams?: URLSearchParams,
) {
  return createAuthorizationUrl(
    cookies,
    config,
    providerId,
    returnTo,
    'login',
    `${origin}/auth/${id}/callback`,
    context,
    requestParams,
  );
}

async function createAuthorizationUrl(
  cookies: Cookies,
  config: PluginConfig,
  providerId: string,
  returnTo: string | null,
  purpose: FlowState['purpose'],
  redirectUri: string,
  context?: PluginLocaleContext,
  requestParams?: URLSearchParams,
  userId?: number,
) {
  const provider = findProvider(config, providerId);
  if (!provider) throw new Error(t(context, 'auth.providerNotFound'));
  if (provider.flow === 'oauth') {
    return createGenericOAuthAuthorizationUrl({
      cookies,
      provider,
      returnTo,
      purpose,
      redirectUri,
      context,
      requestParams,
      userId,
    });
  }
  const oidcConfig = await getConfiguration(provider, context);
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const flow: FlowState = {
    providerId,
    verifier,
    state,
    nonce,
    redirectUri,
    returnTo: safeReturnTo(returnTo),
    purpose,
    userId,
    expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
  };
  cookies.set(
    FLOW_COOKIE,
    encodeSigned(flow),
    authCookieOptions(FLOW_TTL_SECONDS),
  );

  const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: redirectUri,
    scope: provider.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  appendQuery(
    authorizationUrl,
    parseExtraRequestQuery(provider.authorizationRequestQuery, (type, line) =>
      extraQueryError(context, type, line),
    ),
  );
  return authorizationUrl;
}

async function createGenericOAuthAuthorizationUrl(input: {
  cookies: Cookies;
  provider: OidcProvider;
  returnTo: string | null;
  purpose: FlowState['purpose'];
  redirectUri: string;
  context?: PluginLocaleContext;
  requestParams?: URLSearchParams;
  userId?: number;
}) {
  const subjectHint = userInputValue(
    input.provider,
    input.requestParams,
    input.context,
  );
  const endpoints = await resolveOAuthEndpoints(
    input.provider,
    subjectHint,
    input.context,
  );
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const flow: FlowState = {
    providerId: input.provider.id,
    verifier,
    state,
    nonce,
    redirectUri: input.redirectUri,
    returnTo: safeReturnTo(input.returnTo),
    purpose: input.purpose,
    userId: input.userId,
    expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
    oauth: {
      authorizationEndpoint: endpoints.authorizationEndpoint,
      tokenEndpoint: endpoints.tokenEndpoint || endpoints.authorizationEndpoint,
      userInfoEndpoint: endpoints.userInfoEndpoint,
      subjectHint,
    },
  };
  input.cookies.set(
    FLOW_COOKIE,
    encodeSigned(flow),
    authCookieOptions(FLOW_TTL_SECONDS),
  );

  const target = new URL(endpoints.authorizationEndpoint);
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('client_id', input.provider.clientId);
  target.searchParams.set('redirect_uri', input.redirectUri);
  target.searchParams.set('state', state);
  target.searchParams.set('code_challenge', challenge);
  target.searchParams.set('code_challenge_method', 'S256');
  if (input.provider.scopes.trim()) {
    target.searchParams.set('scope', input.provider.scopes.trim());
  }
  if (subjectHint && input.provider.authorizationHintParameter) {
    target.searchParams.set(
      input.provider.authorizationHintParameter,
      subjectHint,
    );
  }
  appendQuery(
    target,
    parseExtraRequestQuery(
      input.provider.authorizationRequestQuery,
      (type, line) => extraQueryError(input.context, type, line),
    ),
  );
  return target;
}

function callbackOAuthError(currentUrl: URL, context?: PluginLocaleContext) {
  const error = currentUrl.searchParams.get('error');
  if (!error) return null;
  return oauthErrorDetail(
    error,
    currentUrl.searchParams.get('error_description') ?? undefined,
    context,
  );
}

function tokenRequestBody(
  provider: OidcProvider,
  flow: FlowState,
  currentUrl: URL,
  context?: PluginLocaleContext,
) {
  const code = currentUrl.searchParams.get('code');
  if (!code) throw new Error(t(context, 'auth.oauthCodeMissing'));
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId,
    redirect_uri: flow.redirectUri ?? '',
    code_verifier: flow.verifier,
  });
  parseExtraRequestQuery(provider.tokenRequestBody, (type, line) =>
    extraQueryError(context, type, line),
  ).forEach((value, key) => {
    body.append(key, value);
  });
  if (
    provider.clientAuthMethod === 'client_secret_post' &&
    provider.clientSecret
  ) {
    body.set('client_secret', provider.clientSecret);
  }
  return body;
}

function tokenRequestHeaders(provider: OidcProvider) {
  const headers = new Headers({ accept: 'application/json' });
  if (
    provider.clientAuthMethod === 'client_secret_basic' &&
    provider.clientSecret
  ) {
    const token = Buffer.from(
      `${provider.clientId}:${provider.clientSecret}`,
    ).toString('base64');
    headers.set('authorization', `Basic ${token}`);
  }
  return headers;
}

async function fetchOAuthUserInfo(
  provider: OidcProvider,
  endpoint: string,
  accessToken: string,
  context?: PluginLocaleContext,
) {
  if (!endpoint || !accessToken) return {};
  const response = await providerRequest(provider, endpoint, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    context,
  });
  if (response.status < 200 || response.status >= 300) return {};
  try {
    return parseFormEncodedOrJson(
      response.body,
      response.headers['content-type'] ?? '',
    );
  } catch {
    return {};
  }
}

async function verifySubjectAuthorizationEndpoint(
  provider: OidcProvider,
  subject: string,
  expectedAuthorizationEndpoint: string,
  context?: PluginLocaleContext,
) {
  const normalized = canonicalHttpUrl(subject, context);
  const discovered = await discoverProfileLinkedEndpoints(
    provider,
    normalized,
    context,
  );
  if (
    !sameUrl(discovered.authorizationEndpoint, expectedAuthorizationEndpoint)
  ) {
    throw new Error(t(context, 'auth.subjectVerificationFailed'));
  }
  return normalized;
}

async function resolveGenericOAuthCallbackClaims(
  flow: FlowState,
  currentUrl: URL,
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  const error = callbackOAuthError(currentUrl, context);
  if (error) {
    throw new Error(
      t(context, 'auth.authorizationResponseError', { detail: error }),
    );
  }
  if (currentUrl.searchParams.get('state') !== flow.state) {
    throw new Error(
      t(context, 'auth.authorizationResponseError', {
        detail: t(context, 'auth.stateMismatch'),
      }),
    );
  }
  const oauthFlow = flow.oauth;
  if (!oauthFlow) throw new Error(t(context, 'auth.oauthFlowMissing'));
  const exchangeEndpoint = provider.scopes.trim()
    ? oauthFlow.tokenEndpoint || oauthFlow.authorizationEndpoint
    : oauthFlow.authorizationEndpoint;
  const response = await providerRequest(provider, exchangeEndpoint, {
    method: 'POST',
    headers: tokenRequestHeaders(provider),
    body: tokenRequestBody(provider, flow, currentUrl, context),
    context,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      t(context, 'auth.serverError', {
        status: response.status,
        detail: response.body.slice(0, 500),
      }),
    );
  }

  let tokenResponse: Record<string, unknown>;
  try {
    tokenResponse = parseFormEncodedOrJson(
      response.body,
      response.headers['content-type'] ?? '',
    );
  } catch {
    throw new Error(t(context, 'auth.oauthTokenResponseInvalid'));
  }

  const accessToken = stringFromJson(tokenResponse, 'access_token') ?? '';
  const userInfo = await fetchOAuthUserInfo(
    provider,
    oauthFlow.userInfoEndpoint,
    accessToken,
    context,
  );
  const claims = { ...tokenResponse, ...userInfo };
  let subject = stringFromJson(claims, provider.subjectPath);
  if (!subject) throw new Error(t(context, 'auth.subjectMissing'));
  if (provider.subjectVerification === 'authorization-endpoint') {
    subject = await verifySubjectAuthorizationEndpoint(
      provider,
      subject,
      oauthFlow.authorizationEndpoint,
      context,
    );
  }

  const email = stringFromJson(claims, provider.emailPath);
  const allowedDomains = provider.allowedEmailDomains;
  if (
    allowedDomains.length > 0 &&
    (!email ||
      !allowedDomains.includes(email.split('@').at(-1)?.toLowerCase() ?? ''))
  ) {
    throw new Error(t(context, 'auth.emailDomainNotAllowed'));
  }

  return {
    flow,
    provider,
    subject,
    email,
    emailVerified: booleanFromJson(claims, provider.emailVerifiedPath),
    providerName: `${id}:${provider.id}`,
    name: stringFromJson(claims, provider.namePath) || email || subject,
  };
}

async function resolveCallbackClaims(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  context?: PluginLocaleContext,
) {
  const flow = decodeSigned<FlowState>(cookies.get(FLOW_COOKIE));
  cookies.delete(FLOW_COOKIE, { path: '/' });
  if (!flow || flow.expiresAt < Date.now()) {
    throw new Error(t(context, 'auth.loginRequestExpired'));
  }

  const provider = findProvider(config, flow.providerId);
  if (!provider) throw new Error(t(context, 'auth.providerRemoved'));
  if (provider.flow === 'oauth') {
    return resolveGenericOAuthCallbackClaims(
      flow,
      currentUrl,
      provider,
      context,
    );
  }
  const oidcConfig = await getConfiguration(provider, context);
  const callbackUrl = new URL(
    flow.redirectUri ?? `${currentUrl.origin}/auth/${id}/callback`,
  );
  callbackUrl.search = currentUrl.search;
  callbackUrl.hash = currentUrl.hash;
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(oidcConfig, callbackUrl, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
    });
  } catch (cause) {
    throw new Error(formatOAuthError(cause, context));
  }
  const idClaims = tokens.claims();
  let userInfo: oidc.UserInfoResponse | undefined;
  if (tokens.access_token) {
    try {
      userInfo = await oidc.fetchUserInfo(
        oidcConfig,
        tokens.access_token,
        typeof idClaims?.sub === 'string'
          ? idClaims.sub
          : oidc.skipSubjectCheck,
      );
    } catch (cause) {
      if (!idClaims) throw cause;
      console.warn(
        t(context, 'auth.userInfoFailed', {
          message: formatOAuthError(cause, context),
        }),
      );
    }
  }
  const claims = { ...(idClaims ?? {}), ...(userInfo ?? {}) };
  const subject = typeof claims.sub === 'string' ? claims.sub : null;
  if (!subject) throw new Error(t(context, 'auth.subjectMissing'));

  const email = stringFromJson(claims, provider.emailPath);
  const allowedDomains = provider.allowedEmailDomains;
  if (
    allowedDomains.length > 0 &&
    (!email ||
      !allowedDomains.includes(email.split('@').at(-1)?.toLowerCase() ?? ''))
  ) {
    throw new Error(t(context, 'auth.emailDomainNotAllowed'));
  }

  return {
    flow,
    provider,
    subject,
    email,
    emailVerified: booleanFromJson(claims, provider.emailVerifiedPath),
    providerName: `${id}:${provider.id}`,
    name:
      stringFromJson(claims, provider.namePath) ||
      (typeof claims.preferred_username === 'string' &&
        claims.preferred_username) ||
      email ||
      subject,
  };
}

export async function finishLogin(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const { flow, provider, subject, email, emailVerified, providerName, name } =
    await resolveCallbackClaims(cookies, currentUrl, config, context);
  assertAuthProviderAllowed(provider.id, allowedProviders, context);
  if (flow.purpose && flow.purpose !== 'login') {
    throw new Error(t(context, 'auth.notLoginRequest'));
  }
  const existingIdentity = await findIdentity(providerName, subject);
  let storedUser = existingIdentity
    ? await getUserById(existingIdentity.userId)
    : null;
  if (storedUser && !storedUser.enabled) {
    if (provider.emailTrustMode === 'local-verification') {
      return startLocalSsoEmailVerification({
        currentUrl,
        flow,
        email,
        name,
        providerName,
        subject,
        context,
      });
    }
    throw new Error(t(context, 'auth.userDisabled'));
  }
  if (!storedUser) {
    if (provider.emailTrustMode === 'existing-only') {
      throw new Error(t(context, 'auth.existingAccountRequired'));
    }
    if (provider.emailTrustMode === 'local-verification') {
      return startLocalSsoEmailVerification({
        currentUrl,
        flow,
        email,
        name,
        providerName,
        subject,
        context,
      });
    }
    if (provider.emailTrustMode === 'verified-claim' && !emailVerified) {
      throw new Error(t(context, 'auth.emailVerificationClaimRequired'));
    }
    try {
      storedUser = await upsertSsoUser({
        email,
        name,
        provider: providerName,
        subject,
        emailVerifiedAt: new Date(),
      });
    } catch (cause) {
      throwLocalizedServerError(cause, context);
    }
  } else {
    await storedUser.update({
      name: name.trim().slice(0, 120) || storedUser.email,
    });
  }
  await linkIdentity({
    userId: storedUser.id,
    provider: providerName,
    subject,
    email,
  });
  createUserSessionFromModel(cookies, storedUser, providerName, subject);
  return flow.returnTo;
}

export async function createAccountLinkUrl(
  cookies: Cookies,
  origin: string,
  config: PluginConfig,
  providerId: string,
  user: AuthenticatedUser,
  returnTo: string | null,
  context?: PluginLocaleContext,
  requestParams?: URLSearchParams,
) {
  return createAuthorizationUrl(
    cookies,
    config,
    providerId,
    returnTo,
    'account-link',
    `${origin}/account/connections/${id}/callback`,
    context,
    requestParams,
    user.id,
  );
}

export async function finishAccountLink(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  user: AuthenticatedUser,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const { flow, provider, subject, email, providerName } =
    await resolveCallbackClaims(cookies, currentUrl, config, context);
  assertAuthProviderAllowed(provider.id, allowedProviders, context);
  if (flow.purpose !== 'account-link' || flow.userId !== user.id) {
    throw new Error(t(context, 'auth.notAccountLinkRequest'));
  }
  await linkIdentity({
    userId: user.id,
    provider: providerName,
    subject,
    email,
  });
  return flow.returnTo;
}

export async function getUser(
  cookies: Cookies,
  config: PluginConfig,
): Promise<AuthenticatedUser | null> {
  return getUserFromSession(
    cookies,
    (provider) =>
      provider.startsWith(`${id}:`) ||
      (provider === 'password' && passwordLoginEnabled(config)),
  );
}

export async function testProvider(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  if (provider.flow === 'oauth') {
    if (
      provider.oauthMetadataSource === 'profile-link' &&
      !provider.loginInputDefault
    ) {
      return provider.name;
    }
    const endpoints = await resolveOAuthEndpoints(
      provider,
      provider.loginInputDefault,
      context,
    );
    return endpoints.authorizationEndpoint;
  }
  const configuration = await getConfiguration(provider, context);
  return configuration.serverMetadata().issuer;
}

function emailVerificationNoticeUrl(currentUrl: URL, returnTo: string) {
  const target = new URL('/login', currentUrl.origin);
  target.searchParams.set('notice', 'sso-verification-sent');
  if (returnTo && returnTo !== '/')
    target.searchParams.set('returnTo', returnTo);
  return `${target.pathname}${target.search}`;
}

async function startLocalSsoEmailVerification(input: {
  currentUrl: URL;
  flow: FlowState;
  email: string | null;
  name: string;
  providerName: string;
  subject: string;
  context?: PluginLocaleContext;
}) {
  const settings = await getSettings();
  try {
    const user = await createPendingSsoUser({
      settings,
      origin: input.currentUrl.origin,
      email: input.email,
      name: input.name,
      provider: input.providerName,
      subject: input.subject,
    });
    await linkIdentity({
      userId: user.id,
      provider: input.providerName,
      subject: input.subject,
      email: input.email,
    });
  } catch (cause) {
    throwLocalizedServerError(cause, input.context);
  }
  return emailVerificationNoticeUrl(input.currentUrl, input.flow.returnTo);
}

export function passwordLoginEnabled(config: PluginConfig) {
  return normalizeOidcConfig(config).passwordLoginEnabled;
}

function providerIdentifier(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  if (!provider.loginInputName) return undefined;
  return {
    name: provider.loginInputName,
    label:
      provider.loginInputLabel ||
      t(context, 'auth.identifierDefaultLabel', {
        name: provider.loginInputName,
      }),
    placeholder: provider.loginInputPlaceholder || undefined,
    value: provider.loginInputDefault || undefined,
    required: provider.loginInputRequired,
    help: provider.loginInputHelp || undefined,
  };
}

function getLoginMethods(config: PluginConfig, context?: PluginLocaleContext) {
  const normalized = normalizeOidcConfig(config);
  return [
    ...(normalized.passwordLoginEnabled
      ? [
          {
            id: 'password',
            label: t(context, 'auth.passwordLogin'),
            type: 'password' as const,
          },
        ]
      : []),
    ...normalized.providers.map((provider) => ({
      id: provider.id,
      label: providerLoginLabel(provider, context),
      buttonColor: provider.loginButtonColor || undefined,
      buttonTextColor: provider.loginButtonTextColor || undefined,
      iconUrl: provider.loginIconUrl || undefined,
      identifier: providerIdentifier(provider, context),
      type: 'redirect' as const,
    })),
  ];
}

async function authenticatePassword(
  cookies: Cookies,
  config: PluginConfig,
  email: string,
  password: string,
) {
  if (!passwordLoginEnabled(config)) return null;
  const user = await authenticateUser(email, password);
  if (!user) return null;
  return createUserSessionFromModel(cookies, user, 'password', String(user.id));
}

const authPlugin: AuthPluginModule = {
  id,
  getUser,
  clearSession: clearUserSession,
  getLoginMethods,
  authenticatePassword,
  startLogin: createLoginUrl,
  finishLogin,
  startAccountLink: createAccountLinkUrl,
  finishAccountLink,
};
export default authPlugin;
