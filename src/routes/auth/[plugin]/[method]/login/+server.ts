import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';
import { startPluginLogin } from '../../../../../plugins/auth-registry';

export const GET: RequestHandler = async ({ cookies, locals, params, url }) => {
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  if (!params.plugin || !params.method) {
    error(404, text.auth.noLoginMethods);
  }
  let loginUrl: URL | null;
  try {
    loginUrl = await startPluginLogin(
      cookies,
      settings.plugins,
      params.plugin,
      params.method,
      url.origin,
      url.searchParams.get('returnTo'),
      locals.locale,
      settings.i18n.defaultLocale,
      url.searchParams,
    );
  } catch (cause) {
    error(
      400,
      cause instanceof Error ? cause.message : text.auth.noLoginMethods,
    );
  }

  if (!loginUrl) error(404, text.auth.noLoginMethods);
  redirect(302, loginUrl.href);
};
