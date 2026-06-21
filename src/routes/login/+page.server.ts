import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClientIp } from '$lib/server/client-ip';
import { registrationAvailability } from '$lib/server/registration';
import { getSettings } from '$lib/server/settings';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { accountRecoveryAvailability } from '$lib/server/account-recovery';
import {
  effectivePermissions,
  effectivePermissionsForEvent,
} from '$lib/server/permissions';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import { authenticateUser, getUserById } from '$lib/server/users';
import {
  TOTP_LOGIN_COOKIE,
  anyPasskeysExist,
  authenticatedUserFromModel,
  consumeTimedChallenge,
  localPasskeyAllowed,
  localTotpAllowed,
  readTimedChallenge,
  setTimedChallenge,
  totpEnabledForUser,
  userHasLocalPassword,
  verifyUserTotp,
} from '$lib/server/local-auth-security';
import {
  authenticatePluginPassword,
  getAuthLoginMethods,
} from '../../plugins/auth-registry';
import { verifyFormSubmissionPlugins } from '../../plugins/server';
import { loadPublicPluginSlots } from '$lib/server/public-plugin-slots';

function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function localPasswordLoginAvailable(
  settings: Awaited<ReturnType<typeof getSettings>>,
  locale: App.Locals['locale'],
  fallbackLocale: App.Locals['locale'],
  providers: readonly string[] | null,
) {
  return getAuthLoginMethods(
    settings.plugins,
    locale,
    fallbackLocale,
    providers,
  ).some((method) => method.type === 'password');
}

export const load: PageServerLoad = async ({
  locals,
  url,
  request,
  getClientAddress,
}) => {
  if (locals.user)
    redirect(303, safeReturnTo(url.searchParams.get('returnTo')));
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const displaySettings = locals.localizedSettings;
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const methods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
    permissions.auth.providers,
  );
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: methods.some((method) => method.type === 'password'),
  });
  const passwordEnabled = methods.some((method) => method.type === 'password');
  const recovery = accountRecoveryAvailability({
    settings,
    permissions,
    passwordLoginEnabled: passwordEnabled,
  });
  const passkeyEnabled =
    localPasskeyAllowed(permissions) && (await anyPasskeysExist());
  if (registration.setupRequired) redirect(303, '/signup');
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    notice:
      url.searchParams.get('notice') === 'sso-verification-sent'
        ? text.auth.ssoVerificationSent
        : '',
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    passwordEnabled,
    passkeyEnabled,
    registrationAllowed: registration.allowed,
    resendVerificationAvailable: recovery.resendVerification,
    passwordResetAvailable: recovery.passwordReset,
    providers: methods
      .filter((method) => method.type === 'redirect')
      .map(
        ({
          pluginId,
          id,
          label,
          buttonColor,
          buttonTextColor,
          iconUrl,
          identifier,
        }) => ({
          pluginId,
          id,
          label,
          buttonColor,
          buttonTextColor,
          iconUrl,
          identifier,
        }),
      ),
    publicSlots: await loadPublicPluginSlots({
      settings,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      user: null,
      slots: ['login-extra'],
    }),
  };
};

export const actions: Actions = {
  login: async ({ request, cookies, locals, url, getClientAddress }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const permissions = await effectivePermissionsForEvent({
      locals,
      request,
      getClientAddress,
    });
    const form = await request.formData();
    const totpCode = String(form.get('totpCode') ?? '').trim();
    if (totpCode) {
      const challenge = readTimedChallenge(cookies, TOTP_LOGIN_COOKIE);
      const storedUser = challenge?.userId
        ? await getUserById(challenge.userId)
        : null;
      if (
        !challenge ||
        !storedUser ||
        storedUser.enabled !== true ||
        !userHasLocalPassword(storedUser)
      ) {
        return fail(401, { message: text.messages.invalidLogin });
      }
      const authUser = authenticatedUserFromModel(
        storedUser,
        'password',
        String(storedUser.id),
      );
      const userPermissions = await effectivePermissions({
        settings,
        user: authUser,
        isAdmin: authUser.isAdmin,
        ip: getClientIp(
          request,
          getClientAddress,
          settings.network.trustProxyHeaders,
          settings.network.proxyIpHeaders,
        ),
      });
      if (
        !localPasswordLoginAvailable(
          settings,
          locals.locale,
          settings.i18n.defaultLocale,
          userPermissions.auth.providers,
        ) ||
        !localTotpAllowed(userPermissions)
      ) {
        return fail(403, {
          message: text.messages.securityMethodNotAllowed,
        });
      }
      if (!(await verifyUserTotp(storedUser.id, totpCode))) {
        return fail(401, {
          message: text.messages.totpCodeInvalid,
          totpRequired: true,
        });
      }
      consumeTimedChallenge(cookies, TOTP_LOGIN_COOKIE);
      createUserSessionFromModel(
        cookies,
        storedUser,
        'password',
        String(storedUser.id),
      );
      redirect(303, safeReturnTo(challenge.returnTo ?? null));
    }

    const verification = await verifyFormSubmissionPlugins({
      action: 'login',
      form,
      request,
      url,
      states: settings.plugins,
      user: locals.user,
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

    const localPasswordAvailable = localPasswordLoginAvailable(
      settings,
      locals.locale,
      settings.i18n.defaultLocale,
      permissions.auth.providers,
    );
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    if (localPasswordAvailable) {
      const storedUser = await authenticateUser(email, password);
      if (!storedUser)
        return fail(401, {
          message: text.messages.invalidLogin,
        });

      const authUser = authenticatedUserFromModel(
        storedUser,
        'password',
        String(storedUser.id),
      );
      const userPermissions = await effectivePermissions({
        settings,
        user: authUser,
        isAdmin: authUser.isAdmin,
        ip: getClientIp(
          request,
          getClientAddress,
          settings.network.trustProxyHeaders,
          settings.network.proxyIpHeaders,
        ),
      });
      if (
        !localPasswordLoginAvailable(
          settings,
          locals.locale,
          settings.i18n.defaultLocale,
          userPermissions.auth.providers,
        )
      ) {
        return fail(401, {
          message: text.messages.invalidLogin,
        });
      }
      if (
        localTotpAllowed(userPermissions) &&
        (await totpEnabledForUser(storedUser.id))
      ) {
        setTimedChallenge(cookies, TOTP_LOGIN_COOKIE, {
          userId: storedUser.id,
          returnTo: safeReturnTo(String(form.get('returnTo') ?? '')),
        });
        return fail(401, {
          message: text.auth.totpRequired,
          totpRequired: true,
        });
      }
      createUserSessionFromModel(
        cookies,
        storedUser,
        'password',
        String(storedUser.id),
      );
      redirect(303, safeReturnTo(String(form.get('returnTo') ?? '')));
    }

    const user = await authenticatePluginPassword(
      cookies,
      settings.plugins,
      email,
      password,
      locals.locale,
      settings.i18n.defaultLocale,
      permissions.auth.providers,
    );
    if (!user)
      return fail(401, {
        message: text.messages.invalidLogin,
      });

    redirect(303, safeReturnTo(String(form.get('returnTo') ?? '')));
  },
};
