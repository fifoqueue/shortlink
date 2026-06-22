import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { resetPasswordFromToken } from '$lib/server/account-recovery';
import {
  localizedAuthMessage,
  passwordLoginEnabled,
  publicAuthPageData,
} from '$lib/server/auth-page';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import { getSettings, stringValue } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { uiText } from '$lib/i18n/ui-text';

export const load: PageServerLoad = async ({
  getClientAddress,
  locals,
  request,
  url,
}) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
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
    ...publicAuthPageData(settings, locals),
    token,
    available,
    unavailableReason: passwordEnabled
      ? uiText(locals.locale, settings.i18n.defaultLocale).messages
          .passwordResetTokenInvalid
      : localizedAuthMessage(settings, locals.locale, 'passwordResetDisabled'),
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
        message: localizedAuthMessage(
          settings,
          locals.locale,
          'passwordResetDisabled',
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
            ? localizedAuthMessage(settings, locals.locale, cause.message)
            : text.messages.passwordResetFailed,
      });
    }
  },
};
