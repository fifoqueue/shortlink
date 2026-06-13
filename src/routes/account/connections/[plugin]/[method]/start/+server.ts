import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startPluginAccountLink } from '../../../../../../plugins/auth-registry';
import { getSettings } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';

export const GET: RequestHandler = async ({ cookies, locals, params, url }) => {
  if (!locals.user) redirect(303, '/login?returnTo=/account');
  const settings = await getSettings();
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  let target: URL | null;
  try {
    target = await startPluginAccountLink(
      cookies,
      settings.plugins,
      params.plugin,
      params.method,
      url.origin,
      locals.user,
      url.searchParams.get('returnTo'),
      locals.locale,
      settings.i18n.defaultLocale,
      url.searchParams,
    );
  } catch (cause) {
    error(
      400,
      cause instanceof Error ? cause.message : text.common.genericError,
    );
  }
  if (!target) redirect(303, '/account');
  redirect(303, target.toString());
};
