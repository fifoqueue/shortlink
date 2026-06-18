import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { finishPluginCallback } from '../../../../plugins/auth-registry';

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
  if (!params.plugin) {
    error(404, text.messages.loginCallbackUnhandled);
  }

  let returnTo: string | null;
  try {
    returnTo = await finishPluginCallback(
      cookies,
      settings.plugins,
      params.plugin,
      url,
      locals.user ?? null,
      locals.locale,
      settings.i18n.defaultLocale,
      permissions.auth.providers,
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
