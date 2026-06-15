import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import { getClientIp } from '$lib/server/client-ip';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import {
  registerUser,
  registrationAvailability,
} from '$lib/server/registration';
import { getSettings, stringValue } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import {
  getPublicPluginStates,
  loadRuntimePluginSlots,
  verifyFormSubmissionPlugins,
} from '../../plugins/server';
import { getAuthLoginMethods } from '../../plugins/auth-registry';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';

function passwordLoginEnabled(
  settings: Awaited<ReturnType<typeof getSettings>>,
  locale: App.Locals['locale'] = settings.i18n.defaultLocale,
  allowedProviders?: readonly string[] | null,
) {
  return getAuthLoginMethods(
    settings.plugins,
    locale,
    settings.i18n.defaultLocale,
    allowedProviders,
  ).some((method) => method.type === 'password');
}

export const load: PageServerLoad = async ({
  getClientAddress,
  locals,
  request,
}) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
  const displaySettings = locals.localizedSettings;
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const availability = await registrationAvailability(settings, {
    passwordLoginEnabled: passwordLoginEnabled(
      settings,
      locals.locale,
      permissions.auth.providers,
    ),
  });
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    plugins: getPublicPluginStates(settings.plugins),
    setupRequired: availability.setupRequired,
    passwordPolicy: passwordPolicyDescription(
      settings.auth.password,
      locals.locale,
    ),
    emailVerificationEnabled:
      settings.auth.emailVerification.enabled && !availability.setupRequired,
    registrationAllowed: availability.allowed,
    registrationUnavailableReason: localizeServerMessage(
      locals.locale,
      availability.reason,
      settings.i18n.defaultLocale,
    ),
    runtimeSlots: await loadRuntimePluginSlots({
      states: settings.plugins,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      user: null,
    }),
  };
};

export const actions: Actions = {
  register: async ({ request, cookies, url, locals, getClientAddress }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const permissions = await effectivePermissionsForEvent({
      locals,
      request,
      getClientAddress,
    });
    const passwordEnabled = passwordLoginEnabled(
      settings,
      locals.locale,
      permissions.auth.providers,
    );
    const availability = await registrationAvailability(settings, {
      passwordLoginEnabled: passwordEnabled,
    });
    if (!availability.allowed) {
      return fail(403, {
        registrationBlocked: true,
        message: localizeServerMessage(
          locals.locale,
          availability.reason,
          settings.i18n.defaultLocale,
        ),
      });
    }

    const form = await request.formData();
    let redirectTo = '';
    const values = {
      email: stringValue(form, 'email'),
      name: stringValue(form, 'name'),
    };
    const verification = await verifyFormSubmissionPlugins({
      action: 'signup',
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
        values,
        message: verification.message
          ? localizeServerMessage(
              locals.locale,
              verification.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.formVerificationFailed,
      });
    }

    try {
      const result = await registerUser({
        settings,
        origin: url.origin,
        ...values,
        password: stringValue(form, 'password'),
        passwordLoginEnabled: passwordEnabled,
      });

      if (result.verificationRequired) {
        return {
          ok: true,
          verificationRequired: true,
          message: text.messages.signupVerificationSent,
        };
      }

      createUserSessionFromModel(
        cookies,
        result.user,
        'password',
        String(result.user.id),
      );
      redirectTo = result.firstUser ? '/admin/core' : '/account';
    } catch (cause) {
      return fail(400, {
        values,
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.signupFailed,
      });
    }
    redirect(303, redirectTo);
  },
};
