import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import {
  localizedAuthMessage,
  passwordLoginEnabled,
  publicAuthPageData,
  requestClientIp,
} from '$lib/server/auth-page';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import {
  registerUser,
  registrationAvailability,
} from '$lib/server/registration';
import { getSettings, stringValue } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { verifyFormSubmissionPlugins } from '../../plugins/server';
import { uiText } from '$lib/i18n/ui-text';
import { loadPublicPluginSlots } from '$lib/server/public-plugin-slots';

export const load: PageServerLoad = async ({
  getClientAddress,
  locals,
  request,
}) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
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
    ...publicAuthPageData(settings, locals),
    setupRequired: availability.setupRequired,
    passwordPolicy: passwordPolicyDescription(
      settings.auth.password,
      locals.locale,
    ),
    emailVerificationEnabled:
      settings.auth.emailVerification.enabled && !availability.setupRequired,
    registrationAllowed: availability.allowed,
    registrationUnavailableReason: localizedAuthMessage(
      settings,
      locals.locale,
      availability.reason,
    ),
    publicSlots: await loadPublicPluginSlots({
      settings,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      user: null,
      slots: ['signup-extra'],
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
        message: localizedAuthMessage(
          settings,
          locals.locale,
          availability.reason,
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
      ip: requestClientIp(settings, request, getClientAddress),
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      settings,
    });
    if (!verification.allowed) {
      return fail(400, {
        values,
        message: verification.message
          ? localizedAuthMessage(settings, locals.locale, verification.message)
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
            ? localizedAuthMessage(settings, locals.locale, cause.message)
            : text.messages.signupFailed,
      });
    }
    redirect(303, redirectTo);
  },
};
