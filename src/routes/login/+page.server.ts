import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClientIp } from '$lib/server/client-ip';
import { registrationAvailability } from '$lib/server/registration';
import { getSettings } from '$lib/server/settings';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import {
  authenticatePluginPassword,
  getAuthLoginMethods,
} from '../../plugins/auth-registry';
import {
  getPublicPluginStates,
  verifyFormSubmissionPlugins,
} from '../../plugins/server';

function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user)
    redirect(303, safeReturnTo(url.searchParams.get('returnTo')));
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const displaySettings = locals.localizedSettings;
  const methods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
  );
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: methods.some((method) => method.type === 'password'),
  });
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
    plugins: getPublicPluginStates(settings.plugins),
    passwordEnabled: methods.some((method) => method.type === 'password'),
    registrationAllowed: registration.allowed,
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
  };
};

export const actions: Actions = {
  login: async ({ request, cookies, locals, url, getClientAddress }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
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

    const user = await authenticatePluginPassword(
      cookies,
      settings.plugins,
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
      locals.locale,
      settings.i18n.defaultLocale,
    );
    if (!user)
      return fail(401, {
        message: text.messages.invalidLogin,
      });

    redirect(303, safeReturnTo(String(form.get('returnTo') ?? '')));
  },
};
