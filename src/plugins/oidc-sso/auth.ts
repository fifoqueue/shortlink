import type { Cookies } from '@sveltejs/kit';
import * as oidc from 'openid-client';
import type {
  AuthenticatedUser,
  AuthPluginModule,
  PluginConfig,
  PluginLocaleContext,
  PluginLocaleKey,
} from '$lib/plugin-contracts';
import { formatText } from '$lib/i18n/ui-text';
import { pluginText } from '$lib/i18n/plugin';
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
  getUserById,
  upsertSsoUser,
} from '$lib/server/users';
import { findIdentity, linkIdentity } from '$lib/server/user-identities';
import { findProvider, normalizeOidcConfig, type OidcProvider } from './config';

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
}

function t(
  context: PluginLocaleContext | undefined,
  key: PluginLocaleKey,
  values?: Record<string, string | number | null | undefined>,
) {
  const text = pluginText(context?.strings, key);
  return values ? formatText(text, values) : text;
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
) {
  return createAuthorizationUrl(
    cookies,
    config,
    providerId,
    returnTo,
    'login',
    `${origin}/auth/${id}/callback`,
    context,
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
  userId?: number,
) {
  const provider = findProvider(config, providerId);
  if (!provider) throw new Error(t(context, 'auth.providerNotFound'));
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

  return oidc.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: redirectUri,
    scope: provider.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
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

  const email = typeof claims.email === 'string' ? claims.email : null;
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
    subject,
    email,
    providerName: `${id}:${provider.id}`,
    name:
      (typeof claims.name === 'string' && claims.name) ||
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
) {
  const { flow, subject, email, providerName, name } =
    await resolveCallbackClaims(cookies, currentUrl, config, context);
  if (flow.purpose && flow.purpose !== 'login') {
    throw new Error(t(context, 'auth.notLoginRequest'));
  }
  const existingIdentity = await findIdentity(providerName, subject);
  let storedUser = existingIdentity
    ? await getUserById(existingIdentity.user_id)
    : null;
  if (storedUser && !storedUser.enabled) {
    throw new Error(t(context, 'auth.userDisabled'));
  }
  if (!storedUser) {
    storedUser = await upsertSsoUser({
      email,
      name,
      provider: providerName,
      subject,
    });
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
) {
  return createAuthorizationUrl(
    cookies,
    config,
    providerId,
    returnTo,
    'account-link',
    `${origin}/account/connections/${id}/callback`,
    context,
    user.id,
  );
}

export async function finishAccountLink(
  cookies: Cookies,
  currentUrl: URL,
  config: PluginConfig,
  user: AuthenticatedUser,
  context?: PluginLocaleContext,
) {
  const { flow, subject, email, providerName } = await resolveCallbackClaims(
    cookies,
    currentUrl,
    config,
    context,
  );
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
  const configuration = await getConfiguration(provider, context);
  return configuration.serverMetadata().issuer;
}

export function passwordLoginEnabled(config: PluginConfig) {
  return normalizeOidcConfig(config).passwordLoginEnabled;
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
      label: t(context, 'auth.providerLogin', { name: provider.name }),
      buttonColor: provider.loginButtonColor || undefined,
      buttonTextColor: provider.loginButtonTextColor || undefined,
      iconUrl: provider.loginIconUrl || undefined,
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
