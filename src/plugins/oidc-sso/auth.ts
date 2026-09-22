import type { Cookies } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { josa } from 'es-hangul';
import * as oidc from 'openid-client';
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
  findEnabledUserByEmail,
  getUserById,
  upsertSsoUser,
} from '$lib/server/users';
import {
  findIdentity,
  linkIdentity,
  listUserIdentities,
} from '$lib/server/user-identities';
import { setSecurityUnlock } from '$lib/server/local-auth-security';
import {
  findProvider,
  getJsonPathValue,
  normalizeOidcConfig,
  parseTokenRequestBody,
  type OidcProvider,
} from './config';

export const id = 'oidc-sso';

const FLOW_COOKIE = 'shortlink_oidc_flow';
const EMAIL_COOKIE = 'shortlink_oidc_email';
const FLOW_TTL_SECONDS = 10 * 60;
const configurationCache = new Map<string, Promise<oidc.Configuration>>();

interface FlowState {
  providerId: string;
  verifier: string;
  state: string;
  nonce: string;
  redirectUri?: string;
  returnTo: string;
  purpose?: 'login' | 'account-link' | 'security-unlock';
  userId?: number;
  expectedSubject?: string;
  expiresAt: number;
  oauth?: {
    tokenEndpoint: string;
    userInfoEndpoint: string;
  };
}

interface CallbackClaims {
  flow: FlowState;
  provider: OidcProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  emailSource: 'provider' | 'manual';
  providerName: string;
  name: string;
}

interface ManualEmailState {
  providerId: string;
  subject: string;
  name: string;
  returnTo: string;
  expiresAt: number;
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

const providerOutboundFetch: oidc.CustomFetch = async (resource, options) =>
  outboundFetch(resource, {
    ...options,
    settings: await getSettings(),
    purpose: 'oidc',
  });

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

function emailDomainAllowed(provider: OidcProvider, email: string) {
  const domain = email.split('@').at(-1)?.toLowerCase() ?? '';
  return (
    provider.allowedEmailDomains.length === 0 ||
    provider.allowedEmailDomains.includes(domain)
  );
}

function assertKnownEmailDomainAllowed(
  provider: OidcProvider,
  email: string | null,
  context?: PluginLocaleContext,
) {
  if (email && !emailDomainAllowed(provider, email)) {
    throw new Error(t(context, 'auth.emailDomainNotAllowed'));
  }
}

function assertRequiredEmailDomainAllowed(
  provider: OidcProvider,
  email: string | null,
  context?: PluginLocaleContext,
) {
  if (
    provider.allowedEmailDomains.length > 0 &&
    (!email || !emailDomainAllowed(provider, email))
  ) {
    throw new Error(t(context, 'auth.emailDomainNotAllowed'));
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
  return value.trim();
}

async function providerRequest(
  url: string,
  input?: {
    method?: 'GET' | 'POST';
    headers?: HeadersInit;
    body?: URLSearchParams;
  },
) {
  const settings = await getSettings();
  return outboundRequest({
    url,
    method: input?.method ?? 'GET',
    headers: input?.headers,
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
  metadataUrl: string,
  context?: PluginLocaleContext,
) {
  const response = await providerRequest(metadataUrl, {
    headers: { accept: 'application/json' },
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

async function resolveOAuthEndpoints(
  provider: OidcProvider,
  context?: PluginLocaleContext,
): Promise<OAuthEndpoints> {
  let endpoints: OAuthEndpoints;
  if (provider.oauthMetadataSource === 'metadata-url') {
    endpoints = await fetchOAuthMetadata(provider.oauthMetadataUrl, context);
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
  if (!endpoints.tokenEndpoint) {
    throw new Error(t(context, 'auth.oauthTokenEndpointMissing'));
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
  ]);
  if (!configurationCache.has(cacheKey)) {
    const request = oidc
      .discovery(
        new URL(issuerUrl),
        clientId,
        undefined,
        getClientAuthentication(provider, context),
        {
          [oidc.customFetch]: providerOutboundFetch,
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
  expectedSubject?: string,
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
      expectedSubject,
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
    expectedSubject,
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
  expectedSubject?: string;
}) {
  const subjectHint =
    input.expectedSubject ??
    userInputValue(input.provider, input.requestParams, input.context);
  const endpoints = await resolveOAuthEndpoints(input.provider, input.context);
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
    expectedSubject: input.expectedSubject,
    expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
    oauth: {
      tokenEndpoint: endpoints.tokenEndpoint,
      userInfoEndpoint: endpoints.userInfoEndpoint,
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
  parseTokenRequestBody(provider.tokenRequestBody, (type, line) =>
    type === 'keyRequired'
      ? new Error(t(context, 'server.tokenRequestBodyKeyRequired', { line }))
      : new Error(t(context, 'server.tokenRequestBodyInvalid', { line })),
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

async function fetchOAuthUserInfo(endpoint: string, accessToken: string) {
  if (!endpoint || !accessToken) return {};
  const response = await providerRequest(endpoint, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
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
  if (!oauthFlow.tokenEndpoint)
    throw new Error(t(context, 'auth.oauthTokenEndpointMissing'));
  const response = await providerRequest(oauthFlow.tokenEndpoint, {
    method: 'POST',
    headers: tokenRequestHeaders(provider),
    body: tokenRequestBody(provider, flow, currentUrl, context),
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

  const accessToken = stringFromJson(tokenResponse, 'access_token');
  if (!accessToken)
    throw new Error(t(context, 'auth.oauthTokenResponseInvalid'));
  const userInfo = await fetchOAuthUserInfo(
    oauthFlow.userInfoEndpoint,
    accessToken,
  );
  const claims = { ...tokenResponse, ...userInfo };
  const subject = stringFromJson(claims, provider.subjectPath);
  if (!subject) throw new Error(t(context, 'auth.subjectMissing'));

  const email = stringFromJson(claims, provider.emailPath);
  assertKnownEmailDomainAllowed(provider, email, context);

  return {
    flow,
    provider,
    subject,
    email,
    emailVerified: booleanFromJson(claims, provider.emailVerifiedPath),
    emailSource: 'provider',
    providerName: `${id}:${provider.id}`,
    name: stringFromJson(claims, provider.namePath) || email || subject,
  } satisfies CallbackClaims;
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
    throw new Error(formatOAuthError(cause, context), { cause });
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
  assertKnownEmailDomainAllowed(provider, email, context);

  return {
    flow,
    provider,
    subject,
    email,
    emailVerified: booleanFromJson(claims, provider.emailVerifiedPath),
    emailSource: 'provider',
    providerName: `${id}:${provider.id}`,
    name:
      stringFromJson(claims, provider.namePath) ||
      (typeof claims.preferred_username === 'string' &&
        claims.preferred_username) ||
      email ||
      subject,
  } satisfies CallbackClaims;
}

export async function finishLogin(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const claims = await resolveCallbackClaims(
    cookies,
    currentUrl,
    config,
    context,
  );
  return completeLogin(cookies, currentUrl, claims, context, allowedProviders);
}

async function completeLogin(
  cookies: Cookies,
  currentUrl: URL,
  claims: CallbackClaims,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const {
    flow,
    provider,
    subject,
    email,
    emailVerified,
    emailSource,
    providerName,
    name,
  } = claims;
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
      if (!email) {
        return startManualSsoEmailInput(cookies, currentUrl, claims);
      }
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
    if (!email) {
      return startManualSsoEmailInput(cookies, currentUrl, claims);
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
    if (
      emailSource === 'manual' &&
      (await manualEmailRequiresLocalVerification(provider))
    ) {
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
    if (emailSource === 'manual' && (await findEnabledUserByEmail(email))) {
      throw new Error(t(context, 'auth.manualEmailExistingAccount'));
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
    await linkIdentity({
      userId: storedUser.id,
      provider: providerName,
      subject,
      email,
    });
  }
  createUserSessionFromModel(cookies, storedUser, providerName, subject);
  return flow.returnTo;
}

async function completeAccountLink(
  claims: CallbackClaims,
  user: AuthenticatedUser,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const { flow, provider, subject, email, providerName } = claims;
  assertAuthProviderAllowed(provider.id, allowedProviders, context);
  assertRequiredEmailDomainAllowed(provider, email, context);
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

async function completeSecurityUnlock(
  cookies: Cookies,
  claims: CallbackClaims,
  user: AuthenticatedUser,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const { flow, provider, subject, email, providerName } = claims;
  assertAuthProviderAllowed(provider.id, allowedProviders, context);
  assertRequiredEmailDomainAllowed(provider, email, context);
  if (flow.purpose !== 'security-unlock' || flow.userId !== user.id) {
    throw new Error(t(context, 'auth.notSecurityUnlockRequest'));
  }
  if (flow.expectedSubject && flow.expectedSubject !== subject) {
    throw new Error(t(context, 'auth.securityUnlockAccountMismatch'));
  }
  const identity = await findIdentity(providerName, subject);
  if (!identity || identity.userId !== user.id) {
    throw new Error(t(context, 'auth.connectedAccountRequired'));
  }
  setSecurityUnlock(cookies, user.id);
  return flow.returnTo || '/account';
}

export async function finishCallback(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  user: AuthenticatedUser | null,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const claims = await resolveCallbackClaims(
    cookies,
    currentUrl,
    config,
    context,
  );
  const purpose = claims.flow.purpose ?? 'login';
  if (purpose === 'login') {
    return completeLogin(
      cookies,
      currentUrl,
      claims,
      context,
      allowedProviders,
    );
  }
  if (purpose === 'account-link') {
    if (!user) throw new Error(t(context, 'auth.notAccountLinkRequest'));
    return completeAccountLink(claims, user, context, allowedProviders);
  }
  if (purpose === 'security-unlock') {
    if (!user) throw new Error(t(context, 'auth.notSecurityUnlockRequest'));
    return completeSecurityUnlock(
      cookies,
      claims,
      user,
      context,
      allowedProviders,
    );
  }
  throw new Error(t(context, 'auth.loginRequestExpired'));
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
    `${origin}/auth/${id}/callback`,
    context,
    requestParams,
    user.id,
  );
}

async function connectedProviderIdentities(
  config: PluginConfig,
  user: AuthenticatedUser,
) {
  const normalized = normalizeOidcConfig(config);
  const providers = new Map(
    normalized.providers.map((provider) => [provider.id, provider]),
  );
  const identities = await listUserIdentities(user.id);
  return identities.flatMap((identity) => {
    if (!identity.provider.startsWith(`${id}:`)) return [];
    const providerId = identity.provider.slice(`${id}:`.length);
    const provider = providers.get(providerId);
    return provider
      ? [
          {
            provider,
            identity,
          },
        ]
      : [];
  });
}

export async function getSecurityUnlockMethods(
  config: PluginConfig,
  user: AuthenticatedUser,
  context?: PluginLocaleContext,
) {
  return (await connectedProviderIdentities(config, user)).map(
    ({ provider }) => ({
      id: provider.id,
      label: t(context, 'auth.providerReauthentication', {
        name: provider.name,
        nameWithJosa:
          context?.locale === 'ko'
            ? josa(provider.name, '으로/로')
            : provider.name,
      }),
      buttonColor: provider.loginButtonColor || undefined,
      buttonTextColor: provider.loginButtonTextColor || undefined,
      iconUrl: provider.loginIconUrl || undefined,
      type: 'redirect' as const,
    }),
  );
}

export async function createSecurityUnlockUrl(
  cookies: Cookies,
  origin: string,
  config: PluginConfig,
  providerId: string,
  user: AuthenticatedUser,
  returnTo: string | null,
  context?: PluginLocaleContext,
  requestParams?: URLSearchParams,
) {
  const connected = (await connectedProviderIdentities(config, user)).find(
    ({ provider }) => provider.id === providerId,
  );
  if (!connected) throw new Error(t(context, 'auth.connectedAccountRequired'));
  return createAuthorizationUrl(
    cookies,
    config,
    providerId,
    returnTo,
    'security-unlock',
    `${origin}/auth/${id}/callback`,
    context,
    requestParams,
    user.id,
    connected.identity.subject,
  );
}

export async function getUser(
  cookies: Cookies,
  config: PluginConfig,
): Promise<AuthenticatedUser | null> {
  const normalized = normalizeOidcConfig(config);
  const providerIds = new Set(
    normalized.providers.map((provider) => `${id}:${provider.id}`),
  );
  return getUserFromSession(cookies, (provider) => {
    if (provider === 'password') return normalized.passwordLoginEnabled;
    return providerIds.has(provider);
  });
}

export async function testProvider(
  provider: OidcProvider,
  context?: PluginLocaleContext,
) {
  if (provider.flow === 'oauth') {
    const endpoints = await resolveOAuthEndpoints(provider, context);
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

function manualEmailUrl(currentUrl: URL, returnTo: string) {
  const target = new URL(`/auth/${id}/email`, currentUrl.origin);
  if (returnTo && returnTo !== '/') {
    target.searchParams.set('returnTo', returnTo);
  }
  return `${target.pathname}${target.search}`;
}

function readManualEmailState(cookies: Cookies) {
  const state = decodeSigned<ManualEmailState>(cookies.get(EMAIL_COOKIE));
  if (!state || state.expiresAt < Date.now()) {
    cookies.delete(EMAIL_COOKIE, { path: '/' });
    return null;
  }
  return state;
}

function startManualSsoEmailInput(
  cookies: Cookies,
  currentUrl: URL,
  claims: CallbackClaims,
) {
  const state: ManualEmailState = {
    providerId: claims.provider.id,
    subject: claims.subject,
    name: claims.name,
    returnTo: claims.flow.returnTo,
    expiresAt: Date.now() + FLOW_TTL_SECONDS * 1000,
  };
  cookies.set(
    EMAIL_COOKIE,
    encodeSigned(state),
    authCookieOptions(FLOW_TTL_SECONDS),
  );
  return manualEmailUrl(currentUrl, claims.flow.returnTo);
}

async function manualEmailRequiresLocalVerification(provider: OidcProvider) {
  const settings = await getSettings();
  return (
    settings.auth.emailVerification.enabled ||
    provider.emailTrustMode !== 'disabled'
  );
}

export function pendingManualEmailLogin(
  cookies: Cookies,
  config: PluginConfig,
  emailVerificationEnabled = false,
) {
  const state = readManualEmailState(cookies);
  if (!state) return null;
  const provider = findProvider(config, state.providerId);
  if (!provider) {
    cookies.delete(EMAIL_COOKIE, { path: '/' });
    return null;
  }
  return {
    providerName: provider.name,
    returnTo: state.returnTo,
    emailVerificationRequired:
      emailVerificationEnabled || provider.emailTrustMode !== 'disabled',
  };
}

export async function finishManualEmailLogin(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  email: string,
  context?: PluginLocaleContext,
  allowedProviders?: readonly string[] | null,
) {
  const state = readManualEmailState(cookies);
  if (!state) throw new Error(t(context, 'auth.loginRequestExpired'));
  const provider = findProvider(config, state.providerId);
  if (!provider) {
    cookies.delete(EMAIL_COOKIE, { path: '/' });
    throw new Error(t(context, 'auth.providerRemoved'));
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error(t(context, 'auth.manualEmailRequired'));
  }
  assertRequiredEmailDomainAllowed(provider, normalizedEmail, context);
  const flow: FlowState = {
    providerId: state.providerId,
    verifier: '',
    state: '',
    nonce: '',
    returnTo: state.returnTo,
    purpose: 'login',
    expiresAt: state.expiresAt,
  };
  const returnTo = await completeLogin(
    cookies,
    currentUrl,
    {
      flow,
      provider,
      subject: state.subject,
      email: normalizedEmail,
      emailVerified: false,
      emailSource: 'manual',
      providerName: `${id}:${provider.id}`,
      name: state.name || normalizedEmail || state.subject,
    },
    context,
    allowedProviders,
  );
  cookies.delete(EMAIL_COOKIE, { path: '/' });
  return returnTo;
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
    await createPendingSsoUser({
      settings,
      origin: input.currentUrl.origin,
      email: input.email,
      name: input.name,
      provider: input.providerName,
      subject: input.subject,
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
  finishCallback,
  startAccountLink: createAccountLinkUrl,
  getSecurityUnlockMethods,
  startSecurityUnlock: createSecurityUnlockUrl,
};
export default authPlugin;
