import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';
import { finishPluginLogin } from '../../../../plugins/auth-registry';

export const GET: RequestHandler = async ({ cookies, locals, params, url }) => {
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  if (!params.plugin) {
    error(404, text.messages.loginCallbackUnhandled);
  }

  let returnTo: string | null;
  try {
    returnTo = await finishPluginLogin(
      cookies,
      settings.plugins,
      params.plugin,
      url,
      locals.locale,
      settings.i18n.defaultLocale,
    );
  } catch (cause) {
    error(
      401,
      cause instanceof Error ? cause.message : text.messages.loginFailed,
    );
  }

  if (!returnTo) error(404, text.messages.loginCallbackUnhandled);
  redirect(302, returnTo);
};
