import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  accountRecoveryAvailability,
  requestVerificationResend,
} from '$lib/server/account-recovery';
import { getClientIp } from '$lib/server/client-ip';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { getSettings, stringValue } from '$lib/server/settings';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';

function disabledMessage(
  settings: Awaited<ReturnType<typeof getSettings>>,
  locale: App.Locals['locale'],
) {
  return localizeServerMessage(
    locale,
    'resendVerificationDisabled',
    settings.i18n.defaultLocale,
  );
}

export const load: PageServerLoad = async ({
  locals,
  request,
  getClientAddress,
}) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const available = accountRecoveryAvailability({
    settings,
    permissions,
    passwordLoginEnabled: true,
  }).resendVerification;
  const displaySettings = locals.localizedSettings;
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    available,
    unavailableReason: available
      ? ''
      : disabledMessage(settings, locals.locale),
  };
};

export const actions: Actions = {
  request: async ({ request, locals, url, getClientAddress }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const permissions = await effectivePermissionsForEvent({
      locals,
      request,
      getClientAddress,
    });
    const available = accountRecoveryAvailability({
      settings,
      permissions,
      passwordLoginEnabled: true,
    }).resendVerification;
    const form = await request.formData();
    const values = { email: stringValue(form, 'email') };
    if (!available) {
      return fail(403, {
        values,
        message: disabledMessage(settings, locals.locale),
      });
    }

    try {
      await requestVerificationResend({
        settings,
        permissions,
        origin: url.origin,
        ip: getClientIp(
          request,
          getClientAddress,
          settings.network.trustProxyHeaders,
          settings.network.proxyIpHeaders,
        ),
        email: values.email,
      });
      return {
        ok: true,
        values,
        message: text.messages.resendVerificationRequested,
      };
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
            : text.messages.resendVerificationFailed,
      });
    }
  },
};
