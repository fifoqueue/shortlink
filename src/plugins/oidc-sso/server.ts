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
  listUserIdentities,
  unlinkIdentity,
} from '$lib/server/user-identities';
import { testProvider } from './auth';
import {
  normalizeOidcConfig,
  parseList,
  providerSlug,
  type OidcProvider,
} from './config';

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

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

function providerFromForm(
  form: FormData,
  current?: OidcProvider,
): OidcProvider {
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

  return {
    id: providerSlug(stringValue(form, 'id', current?.id ?? '')),
    name: stringValue(form, 'name', current?.name ?? ''),
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
    clientId: stringValue(form, 'clientId', current?.clientId ?? ''),
    clientSecret:
      selectedAuthMethod === 'none'
        ? ''
        : clientSecret || current?.clientSecret || '',
    clientAuthMethod: selectedAuthMethod,
    scopes:
      stringValue(form, 'scopes', current?.scopes ?? 'openid profile email') ||
      'openid profile email',
    allowedEmailDomains: parseList(
      stringValue(
        form,
        'allowedEmailDomains',
        current?.allowedEmailDomains.join('\n') ?? '',
      ),
    ),
  };
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
  if (!provider.issuerUrl)
    throw new Error(t(strings, 'server.issuerUrlRequired'));
  if (!provider.clientId)
    throw new Error(t(strings, 'server.clientIdRequired'));
  if (provider.clientAuthMethod !== 'none' && !provider.clientSecret) {
    throw new Error(t(strings, 'auth.clientSecretRequired'));
  }
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

const serverPlugin = {
  async loadAdminData({ url }) {
    return {
      callbackUrl: `${url.origin}/auth/oidc-sso/callback`,
      accountLinkCallbackUrl: `${url.origin}/account/connections/oidc-sso/callback`,
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
            createdAt: identity.created_at.toISOString(),
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

  async loadAccountData({ user, state }) {
    const oidc = normalizeOidcConfig(state.config);
    const identities = await listUserIdentities(user.id);
    return {
      providers: oidc.providers.map((provider) => {
        const providerName = `oidc-sso:${provider.id}`;
        const connection = identities.find(
          (identity) => identity.provider === providerName,
        );
        return {
          id: provider.id,
          name: provider.name,
          connected: Boolean(connection),
          connectionId: connection?.id ?? null,
          email: connection?.email ?? null,
          subject: connection?.subject ?? null,
        };
      }),
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
