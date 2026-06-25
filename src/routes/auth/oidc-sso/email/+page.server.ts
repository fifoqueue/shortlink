import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formatText, uiText } from '$lib/i18n/ui-text';
import { pluginLocaleStrings, pluginText } from '$lib/i18n/plugin';
import {
  localizedAuthMessage,
  publicAuthPageData,
} from '$lib/server/auth-page';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { getSettings } from '$lib/server/settings';
import oidcPlugin from '$plugins/oidc-sso/plugin';
import {
  finishManualEmailLogin,
  pendingManualEmailLogin,
} from '$plugins/oidc-sso/auth';

const pluginId = 'oidc-sso';

function strings(
  locale: App.Locals['locale'],
  fallbackLocale: App.Locals['locale'],
) {
  return pluginLocaleStrings(oidcPlugin, locale, fallbackLocale);
}

export const load: PageServerLoad = async ({ cookies, locals }) => {
  if (locals.user) redirect(303, '/account');
  const settings = await getSettings();
  const state = settings.plugins[pluginId];
  const pending = state?.enabled
    ? pendingManualEmailLogin(
        cookies,
        state.config,
        settings.auth.emailVerification.enabled,
      )
    : null;
  if (!pending) redirect(303, '/login');

  const pluginStrings = strings(locals.locale, settings.i18n.defaultLocale);
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  return {
    ...publicAuthPageData(settings, locals),
    title: pluginText(pluginStrings, 'auth.manualEmailTitle'),
    description: formatText(
      pluginText(pluginStrings, 'auth.manualEmailDescription'),
      { provider: pending.providerName },
    ),
    submitLabel: pluginText(pluginStrings, 'auth.manualEmailSubmit'),
    verificationNotice: pending.emailVerificationRequired
      ? pluginText(pluginStrings, 'auth.manualEmailVerificationRequired')
      : '',
    emailLabel: text.auth.email,
    loginLabel: text.common.login,
  };
};

export const actions: Actions = {
  default: async ({ cookies, getClientAddress, locals, request, url }) => {
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const state = settings.plugins[pluginId];
    if (!state?.enabled) {
      return fail(404, { message: text.messages.loginCallbackUnhandled });
    }

    const permissions = await effectivePermissionsForEvent({
      locals,
      request,
      getClientAddress,
    });
    const form = await request.formData();
    let returnTo = '';
    try {
      returnTo = await finishManualEmailLogin(
        cookies,
        url,
        state.config,
        String(form.get('email') ?? ''),
        {
          locale: locals.locale,
          fallbackLocale: settings.i18n.defaultLocale,
          strings: strings(locals.locale, settings.i18n.defaultLocale),
        },
        permissions.auth.providers,
      );
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizedAuthMessage(settings, locals.locale, cause.message)
            : text.messages.loginFailed,
        value: String(form.get('email') ?? ''),
      });
    }
    redirect(303, returnTo);
  },
};
