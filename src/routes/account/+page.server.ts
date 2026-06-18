import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import {
  clearPluginSessions,
  getAuthSecurityUnlockMethods,
  startPluginSecurityUnlock,
} from '../../plugins/auth-registry';
import {
  getPublicPluginStates,
  loadRuntimePluginSlots,
  pluginDefinitions,
  verifyFormSubmissionPlugins,
} from '../../plugins/server';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import { pluginActionName } from '$lib/server/plugin-actions';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import {
  createApiToken,
  listApiTokens,
  revokeApiTokens,
} from '$lib/server/api-tokens';
import { requirePageUser } from '$lib/server/auth-guards';
import {
  changeOwnPassword,
  deleteUser,
  rotateUserSessionVersion,
  getUserById,
  updateOwnProfile,
  verifyPassword,
} from '$lib/server/users';
import { getSettings, stringValue } from '$lib/server/settings';
import {
  effectivePermissions,
  listUserPermissionGroups,
} from '$lib/server/permissions';
import { getClientIp } from '$lib/server/client-ip';
import { formatText, localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import {
  PASSKEY_SECURITY_UNLOCK_COOKIE,
  TOTP_SETUP_COOKIE,
  consumeTimedChallenge,
  createTotpSecret,
  listUserPasskeys,
  localPasskeyAllowed,
  localTotpAllowed,
  removeUserPasskey,
  removeUserTotpSecret,
  readTimedChallenge,
  saveUserTotpSecret,
  securityUnlocked,
  setSecurityUnlock,
  setTimedChallenge,
  totpEnabledForUser,
  totpOtpAuthUrl,
  userHasLocalPassword,
  verifyTotpCode,
  verifyUserTotp,
} from '$lib/server/local-auth-security';
import { authenticationOptions, randomChallenge } from '$lib/server/webauthn';

async function loadIntegrations(
  user: NonNullable<App.Locals['user']>,
  url: URL,
  locale: App.Locals['locale'],
  settings: Awaited<ReturnType<typeof getSettings>>,
  permissions: Awaited<ReturnType<typeof effectivePermissions>>,
) {
  const fallbackLocale = settings.i18n.defaultLocale;
  const integrations = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const state = settings.plugins[definition.meta.id];
      if (!state?.enabled) return null;
      const runtimeUi = definition.runtime?.account;
      if (!definition.loadAccountData && !runtimeUi) return null;
      const strings = pluginLocaleStrings(definition, locale, fallbackLocale);
      const data = definition.loadAccountData
        ? await definition.loadAccountData({
            user,
            state,
            url,
            locale,
            fallbackLocale,
            strings,
            permissions,
          })
        : null;
      const runtimeSchema =
        runtimeUi?.mode === 'schema'
          ? ((await definition.accountSchema?.({
              user,
              state,
              url,
              locale,
              fallbackLocale,
              strings,
              data,
              permissions,
            })) ??
            runtimeUi.schema ??
            null)
          : null;
      return {
        pluginId: definition.meta.id,
        pluginName: definition.meta.name,
        config: state.config,
        strings,
        runtimeUi: runtimeUi ?? null,
        runtimeSchema,
        data,
      };
    }),
  );
  return {
    integrations: integrations.filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    ),
  };
}

export const load: PageServerLoad = async ({
  cookies,
  getClientAddress,
  locals,
  request,
  url,
}) => {
  const user = requirePageUser(locals, '/account');
  const settings = await getSettings();
  const permissions = await effectivePermissions({
    settings,
    user,
    isAdmin: locals.isAdmin,
    ip: getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    ),
  });
  const { integrations } = await loadIntegrations(
    user,
    url,
    locals.locale,
    settings,
    permissions,
  );
  const displaySettings = locals.localizedSettings;
  const [storedUser, permissionGroups] = await Promise.all([
    getUserById(user.id),
    listUserPermissionGroups(user.id),
  ]);
  const passwordAvailable = storedUser
    ? userHasLocalPassword(storedUser)
    : false;
  const unlocked = storedUser ? securityUnlocked(cookies, user.id) : false;
  const passkeys = storedUser ? await listUserPasskeys(user.id) : [];
  const totpEnabled = storedUser ? await totpEnabledForUser(user.id) : false;
  const externalUnlockMethods = storedUser
    ? await getAuthSecurityUnlockMethods(
        settings.plugins,
        user,
        locals.locale,
        settings.i18n.defaultLocale,
        permissions.auth.providers,
      )
    : [];
  const security = storedUser
    ? {
        passwordAvailable,
        unlocked,
        totpAvailable: localTotpAllowed(permissions),
        passkeyAvailable: localPasskeyAllowed(permissions),
        totpEnabled,
        passkeyCount: passkeys.length,
        passkeys: unlocked ? passkeys : [],
        externalUnlockMethods,
      }
    : {
        passwordAvailable: false,
        unlocked: false,
        totpAvailable: false,
        passkeyAvailable: false,
        totpEnabled: false,
        passkeyCount: 0,
        passkeys: [],
        externalUnlockMethods: [],
      };
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    user,
    integrations,
    tokens: await listApiTokens(user.id),
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    pendingEmail: storedUser?.pendingEmail ?? null,
    permissionGroups,
    security,
    plugins: getPublicPluginStates(settings.plugins),
    runtimeSlots: await loadRuntimePluginSlots({
      states: settings.plugins,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      user,
    }),
    passwordMinLength: settings.auth.password.minLength,
    passwordPolicy: passwordPolicyDescription(
      settings.auth.password,
      locals.locale,
    ),
  };
};

async function requireSecurityManagement(input: {
  cookies: import('@sveltejs/kit').Cookies;
  locals: App.Locals;
  request: Request;
  getClientAddress: () => string;
  provider: 'totp' | 'passkey';
}) {
  const user = requirePageUser(input.locals, '/account');
  const settings = await getSettings();
  const text = uiText(input.locals.locale, settings.i18n.defaultLocale);
  const [storedUser, permissions] = await Promise.all([
    getUserById(user.id),
    effectivePermissions({
      settings,
      user,
      isAdmin: input.locals.isAdmin,
      ip: getClientIp(
        input.request,
        input.getClientAddress,
        settings.network.trustProxyHeaders,
        settings.network.proxyIpHeaders,
      ),
    }),
  ]);
  if (!storedUser) {
    throw new Error(text.messages.userNotFound);
  }
  if (!securityUnlocked(input.cookies, user.id)) {
    throw new Error(text.messages.securityUnlockRequired);
  }
  const allowed =
    input.provider === 'totp'
      ? localTotpAllowed(permissions)
      : localPasskeyAllowed(permissions);
  if (!allowed) throw new Error(text.messages.securityMethodNotAllowed);
  return { user, settings, text, storedUser };
}

export const actions: Actions = {
  profile: async ({ request, locals, url }) => {
    const user = requirePageUser(locals, '/account');
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
    try {
      const result = await updateOwnProfile({
        id: user.id,
        email: stringValue(form, 'email'),
        name: stringValue(form, 'name'),
        settings,
        origin: url.origin,
      });
      return {
        ok: true,
        message: result.emailVerificationRequired
          ? text.messages.profileEmailVerification
          : text.messages.profileSaved,
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.profileSaveFailed,
      });
    }
  },

  password: async ({ request, locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
    try {
      const storedUser = await getUserById(user.id);
      if (!storedUser) {
        return fail(404, { message: text.messages.userNotFound });
      }
      if (
        !userHasLocalPassword(storedUser) &&
        !securityUnlocked(cookies, user.id)
      ) {
        return fail(403, { message: text.messages.securityUnlockRequired });
      }
      await changeOwnPassword({
        id: user.id,
        currentPassword: stringValue(form, 'currentPassword'),
        nextPassword: stringValue(form, 'nextPassword'),
        passwordPolicy: settings.auth.password,
      });
      return { ok: true, message: text.messages.passwordChanged };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.passwordChangeFailed,
      });
    }
  },

  logoutOtherSessions: async ({ locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    try {
      const storedUser = await rotateUserSessionVersion(user.id);
      createUserSessionFromModel(
        cookies,
        storedUser,
        user.provider,
        user.subject,
      );
      return {
        ok: true,
        message: text.messages.otherSessionsLoggedOut,
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : text.messages.otherSessionsFailed,
      });
    }
  },

  unlockSecurity: async ({
    request,
    locals,
    cookies,
    url,
    getClientAddress,
  }) => {
    const user = requirePageUser(locals, '/account');
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
    const verification = await verifyFormSubmissionPlugins({
      action: 'account-security-unlock',
      form,
      request,
      url,
      states: settings.plugins,
      user,
      isAdmin: locals.isAdmin,
      ip: getClientIp(
        request,
        getClientAddress,
        settings.network.trustProxyHeaders,
        settings.network.proxyIpHeaders,
      ),
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      settings,
    });
    if (!verification.allowed) {
      return fail(400, {
        message: verification.message
          ? localizeServerMessage(
              locals.locale,
              verification.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.formVerificationFailed,
      });
    }

    const [storedUser, totpEnabled, passkeys] = await Promise.all([
      getUserById(user.id),
      totpEnabledForUser(user.id),
      listUserPasskeys(user.id),
    ]);
    if (!storedUser) return fail(404, { message: text.messages.userNotFound });

    const passwordAvailable = userHasLocalPassword(storedUser);
    const method = stringValue(form, 'securityMethod');
    let verified = false;

    if (method === 'password' && passwordAvailable) {
      verified = verifyPassword(
        stringValue(form, 'securityPassword'),
        storedUser.passwordHash,
      );
    } else if (method === 'totp' && totpEnabled) {
      verified = await verifyUserTotp(
        user.id,
        stringValue(form, 'securityTotpCode'),
      );
    } else if (method === 'passkey' && passkeys.length > 0) {
      const challenge = randomChallenge();
      setTimedChallenge(cookies, PASSKEY_SECURITY_UNLOCK_COOKIE, {
        userId: user.id,
        challenge,
      });
      return {
        ok: true,
        message: text.messages.securityPasskeyPrompt,
        passkeyUnlock: authenticationOptions({
          challenge,
          rpId: url.hostname,
        }),
      };
    } else if (
      method === 'external' &&
      !passwordAvailable &&
      !totpEnabled &&
      passkeys.length === 0
    ) {
      const providerValue = stringValue(form, 'securityProvider');
      const separator = providerValue.indexOf(':');
      const pluginId = separator >= 0 ? providerValue.slice(0, separator) : '';
      const providerId =
        separator >= 0 ? providerValue.slice(separator + 1) : providerValue;
      const target = await startPluginSecurityUnlock(
        cookies,
        settings.plugins,
        pluginId,
        providerId,
        url.origin,
        user,
        '/account',
        locals.locale,
        settings.i18n.defaultLocale,
        url.searchParams,
        (
          await effectivePermissions({
            settings,
            user,
            isAdmin: locals.isAdmin,
            ip: getClientIp(
              request,
              getClientAddress,
              settings.network.trustProxyHeaders,
              settings.network.proxyIpHeaders,
            ),
          })
        ).auth.providers,
      );
      if (!target) {
        return fail(403, { message: text.messages.securityMethodNotAllowed });
      }
      redirect(303, target.toString());
    }

    if (!verified) {
      return fail(401, { message: text.messages.securityUnlockFailed });
    }
    setSecurityUnlock(cookies, user.id);
    return { ok: true, message: text.messages.securityUnlocked };
  },

  startTotp: async ({ request, locals, cookies, getClientAddress }) => {
    const fallbackText = uiText(
      locals.locale,
      locals.settings.i18n.defaultLocale,
    );
    try {
      const { user, text } = await requireSecurityManagement({
        cookies,
        locals,
        request,
        getClientAddress,
        provider: 'totp',
      });
      const secret = createTotpSecret();
      const otpauthUrl = totpOtpAuthUrl({
        issuer: locals.localizedSettings.general.siteName,
        accountName: user.email ?? user.name,
        secret,
      });
      setTimedChallenge(cookies, TOTP_SETUP_COOKIE, {
        userId: user.id,
        secret,
      });
      return {
        ok: true,
        message: text.messages.totpSetupStarted,
        setupTotp: {
          secret,
          otpauthUrl,
          qrDataUrl: await QRCode.toDataURL(otpauthUrl, {
            margin: 1,
            width: 220,
          }),
        },
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : fallbackText.messages.securityUpdateFailed,
      });
    }
  },

  enableTotp: async ({ request, locals, cookies, getClientAddress }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const settings = await getSettings();
    const permissions = await effectivePermissions({
      settings,
      user,
      isAdmin: locals.isAdmin,
      ip: getClientIp(
        request,
        getClientAddress,
        settings.network.trustProxyHeaders,
        settings.network.proxyIpHeaders,
      ),
    });
    if (!securityUnlocked(cookies, user.id)) {
      return fail(403, { message: text.messages.securityUnlockRequired });
    }
    if (!localTotpAllowed(permissions)) {
      return fail(403, { message: text.messages.securityMethodNotAllowed });
    }
    const challenge = readTimedChallenge(cookies, TOTP_SETUP_COOKIE);
    if (
      !challenge?.secret ||
      challenge.userId !== user.id ||
      !verifyTotpCode(challenge.secret, stringValue(form, 'totpCode'))
    ) {
      return fail(400, { message: text.messages.totpCodeInvalid });
    }
    consumeTimedChallenge(cookies, TOTP_SETUP_COOKIE);
    await saveUserTotpSecret(user.id, challenge.secret);
    return { ok: true, message: text.messages.totpEnabled };
  },

  disableTotp: async ({ request, locals, cookies, getClientAddress }) => {
    const fallbackText = uiText(
      locals.locale,
      locals.settings.i18n.defaultLocale,
    );
    try {
      const { user, text } = await requireSecurityManagement({
        cookies,
        locals,
        request,
        getClientAddress,
        provider: 'totp',
      });
      await removeUserTotpSecret(user.id);
      return { ok: true, message: text.messages.totpDisabled };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : fallbackText.messages.securityUpdateFailed,
      });
    }
  },

  revokePasskey: async ({ request, locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    if (!securityUnlocked(cookies, user.id)) {
      return fail(403, { message: text.messages.securityUnlockRequired });
    }
    const form = await request.formData();
    const removed = await removeUserPasskey(
      user.id,
      Number(stringValue(form, 'id', '0')),
    );
    if (!removed) return fail(404, { message: text.messages.passkeyNotFound });
    return { ok: true, message: text.messages.passkeyRemoved };
  },

  createToken: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const result = await createApiToken(user.id, stringValue(form, 'name'));
    return {
      ok: true,
      message: text.messages.tokenIssued,
      token: result.token,
    };
  },

  revokeTokens: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const tokenIds = form.getAll('ids').map((value) => Number(String(value)));
    if (tokenIds.length === 0) {
      return fail(400, { message: text.messages.tokenSelectionRequired });
    }
    const removed = await revokeApiTokens(user.id, tokenIds);
    if (removed === 0) {
      return fail(404, { message: text.messages.tokenNotFound });
    }
    return {
      ok: true,
      message: formatText(text.messages.tokensRevoked, { count: removed }),
    };
  },

  delete: async ({ locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    try {
      await deleteUser(user.id);
      const settings = await getSettings();
      await clearPluginSessions(cookies, settings.plugins);
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : text.messages.deleteAccountFailed,
      });
    }
    redirect(303, '/');
  },

  pluginAction: async ({ request, locals, url }) => {
    const user = requirePageUser(locals, '/account');
    const form = await request.formData();
    const pluginId = String(form.get('pluginId') ?? '');
    const action = pluginActionName(form);
    const definition = pluginDefinitions.find(
      (plugin) => plugin.meta.id === pluginId,
    );
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const state = settings.plugins[pluginId];
    if (!definition?.handleAccountAction || !state?.enabled) {
      return fail(404, { message: text.messages.integrationNotFound });
    }
    try {
      const result = await definition.handleAccountAction({
        user,
        action,
        form,
        state,
        url,
        locale: locals.locale,
        fallbackLocale: settings.i18n.defaultLocale,
        strings: pluginLocaleStrings(
          definition,
          locals.locale,
          settings.i18n.defaultLocale,
        ),
      });
      return {
        ok: result.ok ?? true,
        message: result.message
          ? localizeServerMessage(
              locals.locale,
              result.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.integrationHandled,
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.integrationFailed,
      });
    }
  },
};
