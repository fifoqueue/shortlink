import { Op } from 'sequelize';
import { parseBoolean, stringValue } from '$lib/server/settings';
import type {
  PluginConfig,
  PluginDefinition,
  PluginLocaleContext,
  PluginLocaleKey,
  PluginLocaleStrings,
} from '$lib/plugin-contracts';
import { formatText } from '$lib/i18n/ui-text';
import { pluginText } from '$lib/i18n/plugin';
import {
  ensureDatabase,
  UserIdentityModel,
  UserModel,
  UserPasskeyCredentialModel,
} from '$lib/server/database';
import {
  listUserIdentities,
  unlinkIdentity,
} from '$lib/server/user-identities';
import { canUseAuthProvider } from '$lib/server/permissions';
import { parseHeaderRecord } from '$lib/delimited';
import { testProvider } from './auth';
import {
  defaultOidcScopes,
  isValidJsonPath,
  normalizeOidcConfig,
  parseExtraRequestQuery,
  parseList,
  providerSlug,
  type EmailTrustMode,
  type OAuthMetadataSource,
  type OAuthSubjectVerification,
  type OidcProvider,
  type SsoProviderFlow,
} from './config';

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const oidcProviderPrefix = 'oidc-sso:';

interface ProviderDeletionImpact {
  connectedUserCount: number;
  soleLoginUserCount: number;
}

function t(
  strings: PluginLocaleStrings | undefined,
  key: PluginLocaleKey,
  values?: Record<string, string | number | null | undefined>,
) {
  const text = pluginText(strings, key);
  return values ? formatText(text, values) : text;
}

function validateOptionalHexColor(
  value: string,
  labelKey: PluginLocaleKey,
  strings: PluginLocaleStrings,
) {
  if (value && !hexColorPattern.test(value)) {
    throw new Error(
      t(strings, 'server.hexColorFormat', {
        label: t(strings, labelKey),
      }),
    );
  }
}

function validateOptionalIconUrl(value: string, strings: PluginLocaleStrings) {
  if (!value) return;
  if (value.startsWith('/') && !value.startsWith('//')) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return;
  } catch {
    // fall through to the shared error below
  }
  throw new Error(t(strings, 'server.loginIconUrlInvalid'));
}

function validateOptionalHttpUrl(
  value: string,
  messageKey: PluginLocaleKey,
  strings: PluginLocaleStrings,
) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return;
  } catch {
    // fall through to shared validation error
  }
  throw new Error(t(strings, messageKey));
}

function validatePath(
  value: string,
  messageKey: PluginLocaleKey,
  strings: PluginLocaleStrings,
) {
  if (!value || isValidJsonPath(value)) return;
  throw new Error(t(strings, messageKey));
}

function providerFromForm(
  form: FormData,
  current?: OidcProvider,
): OidcProvider {
  const flow: SsoProviderFlow =
    stringValue(form, 'flow', current?.flow ?? 'oidc') === 'oauth'
      ? 'oauth'
      : 'oidc';
  const oauthMetadataSourceInput = stringValue(
    form,
    'oauthMetadataSource',
    current?.oauthMetadataSource ?? 'manual',
  );
  const oauthMetadataSource: OAuthMetadataSource =
    oauthMetadataSourceInput === 'metadata-url' ||
    oauthMetadataSourceInput === 'profile-link'
      ? oauthMetadataSourceInput
      : 'manual';
  const subjectVerification: OAuthSubjectVerification =
    stringValue(
      form,
      'subjectVerification',
      current?.subjectVerification ?? 'none',
    ) === 'authorization-endpoint'
      ? 'authorization-endpoint'
      : 'none';
  const emailTrustModeInput = stringValue(
    form,
    'emailTrustMode',
    current?.emailTrustMode ?? 'verified-claim',
  );
  const emailTrustMode: EmailTrustMode =
    emailTrustModeInput === 'local-verification' ||
    emailTrustModeInput === 'disabled' ||
    emailTrustModeInput === 'existing-only'
      ? emailTrustModeInput
      : 'verified-claim';
  const clientAuthMethod = stringValue(
    form,
    'clientAuthMethod',
    current?.clientAuthMethod ?? 'client_secret_basic',
  );
  const clientSecret = stringValue(form, 'clientSecret');
  const selectedAuthMethod =
    clientAuthMethod === 'client_secret_post' || clientAuthMethod === 'none'
      ? clientAuthMethod
      : 'client_secret_basic';
  const scopeInput = stringValue(
    form,
    'scopes',
    current?.scopes ?? (flow === 'oauth' ? '' : defaultOidcScopes),
  );

  return {
    id: providerSlug(stringValue(form, 'id', current?.id ?? '')),
    name: stringValue(form, 'name', current?.name ?? ''),
    flow,
    loginButtonColor: stringValue(
      form,
      'loginButtonColor',
      current?.loginButtonColor ?? '',
    ),
    loginButtonTextColor: stringValue(
      form,
      'loginButtonTextColor',
      current?.loginButtonTextColor ?? '',
    ),
    loginIconUrl: stringValue(
      form,
      'loginIconUrl',
      current?.loginIconUrl ?? '',
    ),
    issuerUrl: stringValue(form, 'issuerUrl', current?.issuerUrl ?? ''),
    oauthMetadataSource,
    oauthMetadataUrl: stringValue(
      form,
      'oauthMetadataUrl',
      current?.oauthMetadataUrl ?? '',
    ),
    authorizationEndpoint: stringValue(
      form,
      'authorizationEndpoint',
      current?.authorizationEndpoint ?? '',
    ),
    tokenEndpoint: stringValue(
      form,
      'tokenEndpoint',
      current?.tokenEndpoint ?? '',
    ),
    userInfoEndpoint: stringValue(
      form,
      'userInfoEndpoint',
      current?.userInfoEndpoint ?? '',
    ),
    metadataLinkRel: stringValue(
      form,
      'metadataLinkRel',
      current?.metadataLinkRel ?? '',
    ),
    authorizationEndpointRel: stringValue(
      form,
      'authorizationEndpointRel',
      current?.authorizationEndpointRel ?? '',
    ),
    tokenEndpointRel: stringValue(
      form,
      'tokenEndpointRel',
      current?.tokenEndpointRel ?? '',
    ),
    clientId: stringValue(form, 'clientId', current?.clientId ?? ''),
    clientSecret:
      selectedAuthMethod === 'none'
        ? ''
        : clientSecret || current?.clientSecret || '',
    clientAuthMethod: selectedAuthMethod,
    scopes: flow === 'oauth' ? scopeInput : scopeInput || defaultOidcScopes,
    authorizationRequestQuery: stringValue(
      form,
      'authorizationRequestQuery',
      current?.authorizationRequestQuery ?? '',
    ).slice(0, 5000),
    tokenRequestBody: stringValue(
      form,
      'tokenRequestBody',
      current?.tokenRequestBody ?? '',
    ).slice(0, 5000),
    extraRequestQuery: stringValue(
      form,
      'extraRequestQuery',
      current?.extraRequestQuery ?? '',
    ).slice(0, 5000),
    extraRequestHeaders: stringValue(
      form,
      'extraRequestHeaders',
      current?.extraRequestHeaders ?? '',
    ).slice(0, 5000),
    loginInputName: stringValue(
      form,
      'loginInputName',
      current?.loginInputName ?? '',
    ),
    loginInputLabel: stringValue(
      form,
      'loginInputLabel',
      current?.loginInputLabel ?? '',
    ),
    loginInputPlaceholder: stringValue(
      form,
      'loginInputPlaceholder',
      current?.loginInputPlaceholder ?? '',
    ),
    loginInputHelp: stringValue(
      form,
      'loginInputHelp',
      current?.loginInputHelp ?? '',
    ),
    loginInputDefault: stringValue(
      form,
      'loginInputDefault',
      current?.loginInputDefault ?? '',
    ),
    loginInputRequired: parseBoolean(form, 'loginInputRequired'),
    loginInputUrlCanonicalization: parseBoolean(
      form,
      'loginInputUrlCanonicalization',
    ),
    authorizationHintParameter: stringValue(
      form,
      'authorizationHintParameter',
      current?.authorizationHintParameter ?? '',
    ),
    subjectPath:
      stringValue(form, 'subjectPath', current?.subjectPath ?? 'sub') || 'sub',
    emailPath:
      stringValue(form, 'emailPath', current?.emailPath ?? 'email') || 'email',
    emailVerifiedPath:
      stringValue(
        form,
        'emailVerifiedPath',
        current?.emailVerifiedPath ?? 'email_verified',
      ) || 'email_verified',
    namePath:
      stringValue(form, 'namePath', current?.namePath ?? 'name') || 'name',
    subjectVerification,
    emailTrustMode,
    allowedEmailDomains: parseList(
      stringValue(
        form,
        'allowedEmailDomains',
        current?.allowedEmailDomains.join('\n') ?? '',
      ),
    ),
  };
}

function validateExtraRequests(
  provider: OidcProvider,
  strings: PluginLocaleStrings,
) {
  parseExtraRequestQuery(provider.extraRequestQuery, (type, line) =>
    type === 'keyRequired'
      ? new Error(t(strings, 'server.extraRequestQueryKeyRequired', { line }))
      : new Error(t(strings, 'server.extraRequestQueryInvalid', { line })),
  );
  parseHeaderRecord(
    provider.extraRequestHeaders,
    t(strings, 'server.extraRequestHeadersDescription'),
  );
  parseExtraRequestQuery(provider.authorizationRequestQuery, (type, line) =>
    type === 'keyRequired'
      ? new Error(
          t(strings, 'server.authorizationRequestQueryKeyRequired', { line }),
        )
      : new Error(
          t(strings, 'server.authorizationRequestQueryInvalid', { line }),
        ),
  );
  parseExtraRequestQuery(provider.tokenRequestBody, (type, line) =>
    type === 'keyRequired'
      ? new Error(t(strings, 'server.tokenRequestBodyKeyRequired', { line }))
      : new Error(t(strings, 'server.tokenRequestBodyInvalid', { line })),
  );
}

function requireProvider(provider: OidcProvider, strings: PluginLocaleStrings) {
  if (!provider.id) throw new Error(t(strings, 'server.providerIdRequired'));
  if (!provider.name)
    throw new Error(t(strings, 'server.providerNameRequired'));
  validateOptionalHexColor(
    provider.loginButtonColor,
    'server.loginButtonColorLabel',
    strings,
  );
  validateOptionalHexColor(
    provider.loginButtonTextColor,
    'server.loginButtonTextColorLabel',
    strings,
  );
  validateOptionalIconUrl(provider.loginIconUrl, strings);
  if (provider.flow === 'oidc' && !provider.issuerUrl) {
    throw new Error(t(strings, 'server.issuerUrlRequired'));
  }
  if (!provider.clientId) {
    throw new Error(t(strings, 'server.clientIdRequired'));
  }
  if (provider.clientAuthMethod !== 'none' && !provider.clientSecret) {
    throw new Error(t(strings, 'auth.clientSecretRequired'));
  }
  validateOptionalHttpUrl(
    provider.issuerUrl,
    'server.issuerUrlInvalid',
    strings,
  );
  validateOptionalHttpUrl(
    provider.oauthMetadataUrl,
    'server.oauthMetadataUrlInvalid',
    strings,
  );
  validateOptionalHttpUrl(
    provider.authorizationEndpoint,
    'server.authorizationEndpointInvalid',
    strings,
  );
  validateOptionalHttpUrl(
    provider.tokenEndpoint,
    'server.tokenEndpointInvalid',
    strings,
  );
  validateOptionalHttpUrl(
    provider.userInfoEndpoint,
    'server.userInfoEndpointInvalid',
    strings,
  );
  if (provider.flow === 'oauth') {
    if (
      provider.oauthMetadataSource === 'manual' &&
      !provider.authorizationEndpoint
    ) {
      throw new Error(t(strings, 'server.authorizationEndpointRequired'));
    }
    if (
      provider.oauthMetadataSource === 'metadata-url' &&
      !provider.oauthMetadataUrl
    ) {
      throw new Error(t(strings, 'server.oauthMetadataUrlRequired'));
    }
    if (
      provider.oauthMetadataSource === 'profile-link' &&
      !provider.loginInputName &&
      !provider.loginInputDefault
    ) {
      throw new Error(t(strings, 'server.loginInputRequiredForProfileLink'));
    }
    if (!provider.subjectPath) {
      throw new Error(t(strings, 'server.subjectPathRequired'));
    }
  }
  validatePath(provider.subjectPath, 'server.subjectPathInvalid', strings);
  validatePath(provider.emailPath, 'server.emailPathInvalid', strings);
  validatePath(
    provider.emailVerifiedPath,
    'server.emailVerifiedPathInvalid',
    strings,
  );
  validatePath(provider.namePath, 'server.namePathInvalid', strings);
  validateExtraRequests(provider, strings);
}

function savePolicy(
  form: FormData,
  config: PluginConfig,
  context: PluginLocaleContext,
) {
  const oidc = normalizeOidcConfig(config);
  const passwordLoginEnabled = parseBoolean(form, 'passwordLoginEnabled');
  if (!passwordLoginEnabled && oidc.providers.length === 0) {
    throw new Error(t(context.strings, 'server.passwordLoginRequiresProvider'));
  }
  return {
    config: {
      ...oidc,
      passwordLoginEnabled,
    },
    message: t(context.strings, 'server.loginPolicySaved'),
  };
}

async function saveProvider(
  form: FormData,
  config: PluginConfig,
  context: PluginLocaleContext,
) {
  const oidc = normalizeOidcConfig(config);
  const originalId = stringValue(form, 'originalId');
  const current = oidc.providers.find((provider) => provider.id === originalId);
  const provider = providerFromForm(form, current);
  requireProvider(provider, context.strings);
  const duplicate = oidc.providers.some(
    (item) => item.id === provider.id && item.id !== originalId,
  );
  if (duplicate) {
    throw new Error(t(context.strings, 'server.providerIdDuplicate'));
  }

  await testProvider(provider, context);

  const providers = originalId
    ? oidc.providers.map((item) => (item.id === originalId ? provider : item))
    : [...oidc.providers, provider];

  return {
    enabled: true,
    config: {
      ...oidc,
      providers,
    },
    message: originalId
      ? t(context.strings, 'server.providerSaved')
      : t(context.strings, 'server.providerAdded'),
  };
}

function deleteProvider(
  form: FormData,
  config: PluginConfig,
  strings: PluginLocaleStrings,
) {
  const oidc = normalizeOidcConfig(config);
  const id = stringValue(form, 'id');
  const providers = oidc.providers.filter((provider) => provider.id !== id);
  if (!oidc.passwordLoginEnabled && providers.length === 0) {
    throw new Error(t(strings, 'server.lastProviderDeleteDenied'));
  }
  return {
    config: {
      ...oidc,
      providers,
    },
    message: t(strings, 'server.providerDeleted'),
  };
}

function providerIdentityKey(providerId: string) {
  return `${oidcProviderPrefix}${providerId}`;
}

async function providerDeletionImpacts(config: PluginConfig) {
  const oidc = normalizeOidcConfig(config);
  const providerKeys = oidc.providers.map((provider) =>
    providerIdentityKey(provider.id),
  );
  const impacts = Object.fromEntries(
    oidc.providers.map((provider) => [
      provider.id,
      {
        connectedUserCount: 0,
        soleLoginUserCount: 0,
      } satisfies ProviderDeletionImpact,
    ]),
  ) as Record<string, ProviderDeletionImpact>;
  if (providerKeys.length === 0) return impacts;

  await ensureDatabase();
  const identities = await UserIdentityModel.findAll({
    attributes: ['userId', 'provider'],
    where: { provider: { [Op.in]: providerKeys } },
  });
  const userIds = [...new Set(identities.map((identity) => identity.userId))];
  if (userIds.length === 0) return impacts;

  const [users, passkeys] = await Promise.all([
    UserModel.findAll({
      attributes: ['id', 'email', 'name', 'passwordHash'],
      where: {
        id: { [Op.in]: userIds },
        enabled: true,
      },
    }),
    UserPasskeyCredentialModel.findAll({
      attributes: ['userId'],
      group: ['userId'],
      where: { userId: { [Op.in]: userIds } },
    }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const passkeyUserIds = new Set(passkeys.map((passkey) => passkey.userId));
  const providerKeysByUserId = new Map<number, Set<string>>();
  const userIdsByProviderKey = new Map<string, Set<number>>();

  for (const identity of identities) {
    if (!usersById.has(identity.userId)) continue;
    if (!providerKeysByUserId.has(identity.userId)) {
      providerKeysByUserId.set(identity.userId, new Set());
    }
    providerKeysByUserId.get(identity.userId)?.add(identity.provider);
    if (!userIdsByProviderKey.has(identity.provider)) {
      userIdsByProviderKey.set(identity.provider, new Set());
    }
    userIdsByProviderKey.get(identity.provider)?.add(identity.userId);
  }

  for (const provider of oidc.providers) {
    const providerKey = providerIdentityKey(provider.id);
    const connectedUserIds = [...(userIdsByProviderKey.get(providerKey) ?? [])];
    const soleLoginUserCount = connectedUserIds.filter((userId) => {
      const user = usersById.get(userId);
      if (!user) return false;
      const otherSsoProvider = [
        ...(providerKeysByUserId.get(user.id) ?? []),
      ].some((key) => key !== providerKey);
      const localPasswordLogin =
        oidc.passwordLoginEnabled && user.passwordHash.startsWith('scrypt:');
      const passkeyLogin = passkeyUserIds.has(user.id);
      return !otherSsoProvider && !localPasswordLogin && !passkeyLogin;
    }).length;

    impacts[provider.id] = {
      connectedUserCount: connectedUserIds.length,
      soleLoginUserCount,
    };
  }

  return impacts;
}

function providerIdentifier(
  provider: OidcProvider,
  strings: PluginLocaleStrings,
) {
  if (!provider.loginInputName) return undefined;
  return {
    name: provider.loginInputName,
    label:
      provider.loginInputLabel ||
      t(strings, 'auth.identifierDefaultLabel', {
        name: provider.loginInputName,
      }),
    placeholder: provider.loginInputPlaceholder || undefined,
    value: provider.loginInputDefault || undefined,
    required: provider.loginInputRequired,
    help: provider.loginInputHelp || undefined,
  };
}

const serverPlugin = {
  async loadAdminData({ state, url }) {
    return {
      callbackUrl: `${url.origin}/auth/oidc-sso/callback`,
      providerDeletionImpacts: await providerDeletionImpacts(state.config),
    };
  },

  async handleAdminAction({
    action,
    form,
    state,
    locale,
    fallbackLocale,
    strings,
  }) {
    const context = { locale, fallbackLocale, strings };
    if (action === 'savePolicy') return savePolicy(form, state.config, context);
    if (action === 'saveProvider') {
      return saveProvider(form, state.config, context);
    }
    if (action === 'deleteProvider') {
      return deleteProvider(form, state.config, strings);
    }
    throw new Error(t(strings, 'server.unsupportedPluginAction', { action }));
  },

  async loadUserAdminData({ userId, state }) {
    const oidc = normalizeOidcConfig(state.config);
    const identities = await listUserIdentities(userId);
    return {
      connections: identities
        .filter((identity) => identity.provider.startsWith('oidc-sso:'))
        .map((identity) => {
          const providerId = identity.provider.slice('oidc-sso:'.length);
          const provider = oidc.providers.find(
            (item) => item.id === providerId,
          );
          return {
            id: identity.id,
            provider: identity.provider,
            providerName: provider?.name ?? providerId,
            subject: identity.subject,
            email: identity.email,
            createdAt: identity.createdAt.toISOString(),
          };
        }),
    };
  },

  async handleUserAdminAction({ userId, action, form, strings }) {
    if (action === 'unlink') {
      const removed = await unlinkIdentity({
        userId,
        provider: stringValue(form, 'provider'),
        identityId: Number(stringValue(form, 'identityId', '0')),
      });
      if (!removed) throw new Error(t(strings, 'server.connectionNotFound'));
      return { message: t(strings, 'server.connectionUnlinked') };
    }
    throw new Error(t(strings, 'server.unsupportedUserAction'));
  },

  async loadAccountData({ user, state, strings, permissions }) {
    const oidc = normalizeOidcConfig(state.config);
    const identities = await listUserIdentities(user.id);
    return {
      providers: oidc.providers
        .map((provider) => {
          const providerName = `oidc-sso:${provider.id}`;
          const connection = identities.find(
            (identity) => identity.provider === providerName,
          );
          if (
            !connection &&
            !canUseAuthProvider(permissions, 'oidc-sso', provider.id)
          ) {
            return null;
          }
          return {
            id: provider.id,
            name: provider.name,
            identifier: providerIdentifier(provider, strings),
            connected: Boolean(connection),
            connectionId: connection?.id ?? null,
            email: connection?.email ?? null,
            subject: connection?.subject ?? null,
          };
        })
        .filter((provider): provider is NonNullable<typeof provider> =>
          Boolean(provider),
        ),
    };
  },

  async handleAccountAction({ user, action, form, strings }) {
    if (action === 'unlink') {
      const providerId = stringValue(form, 'providerId');
      const removed = await unlinkIdentity({
        userId: user.id,
        provider: `oidc-sso:${providerId}`,
        identityId: Number(stringValue(form, 'identityId', '0')),
      });
      if (!removed) throw new Error(t(strings, 'server.connectionNotFound'));
      return { message: t(strings, 'server.connectionUnlinked') };
    }
    throw new Error(t(strings, 'server.unsupportedAccountAction'));
  },
} satisfies Partial<PluginDefinition>;

export default serverPlugin;
