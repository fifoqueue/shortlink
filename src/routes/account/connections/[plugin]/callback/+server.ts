import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { finishPluginAccountLink } from '../../../../../plugins/auth-registry';
import { getSettings } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { uiText } from '$lib/i18n/ui-text';

export const GET: RequestHandler = async ({
  cookies,
  getClientAddress,
  locals,
  params,
  request,
  url,
}) => {
  if (!locals.user) redirect(303, '/login?returnTo=/account');
  const settings = await getSettings();
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  let returnTo: string | null;
  try {
    returnTo = await finishPluginAccountLink(
      cookies,
      settings.plugins,
      params.plugin,
      url,
      locals.user,
      locals.locale,
      settings.i18n.defaultLocale,
      permissions.auth.providers,
    );
  } catch (cause) {
    error(
      403,
      cause instanceof Error ? cause.message : text.common.genericError,
    );
  }
  redirect(303, returnTo ?? '/account');
};
