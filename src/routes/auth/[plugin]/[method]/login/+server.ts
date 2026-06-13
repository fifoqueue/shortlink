import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { startPluginLogin } from '../../../../../plugins/auth-registry';

export const GET: RequestHandler = async ({
  cookies,
  getClientAddress,
  locals,
  params,
  request,
  url,
}) => {
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
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
      permissions.auth.providers,
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
