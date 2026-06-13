import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { resetPasswordFromToken } from '$lib/server/account-recovery';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import { getSettings, stringValue } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { getAuthLoginMethods } from '../../../plugins/auth-registry';

function passwordLoginEnabled(
  settings: Awaited<ReturnType<typeof getSettings>>,
  locale: App.Locals['locale'],
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
  url,
}) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
  const displaySettings = locals.localizedSettings;
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
  const token = url.searchParams.get('token') ?? '';
  const available = passwordEnabled && Boolean(token);
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    token,
    available,
    unavailableReason: passwordEnabled
      ? uiText(locals.locale, settings.i18n.defaultLocale).messages
          .passwordResetTokenInvalid
      : localizeServerMessage(
          locals.locale,
          'passwordResetDisabled',
          settings.i18n.defaultLocale,
        ),
    passwordPolicy: passwordPolicyDescription(
      settings.auth.password,
      locals.locale,
    ),
  };
};

export const actions: Actions = {
  reset: async ({ getClientAddress, request, locals }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const permissions = await effectivePermissionsForEvent({
      locals,
      request,
      getClientAddress,
    });
    if (
      !passwordLoginEnabled(settings, locals.locale, permissions.auth.providers)
    ) {
      return fail(403, {
        message: localizeServerMessage(
          locals.locale,
          'passwordResetDisabled',
          settings.i18n.defaultLocale,
        ),
      });
    }

    const form = await request.formData();
    const token = stringValue(form, 'token');
    try {
      const user = await resetPasswordFromToken({
        settings,
        token,
        password: stringValue(form, 'password'),
      });
      if (!user) {
        return fail(400, {
          message: text.messages.passwordResetTokenInvalid,
        });
      }
      return {
        ok: true,
        message: text.messages.passwordResetComplete,
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
            : text.messages.passwordResetFailed,
      });
    }
  },
};
