import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { finishPluginAccountLink } from '../../../../../plugins/auth-registry';
import { getSettings } from '$lib/server/settings';

export const GET: RequestHandler = async ({ cookies, locals, params, url }) => {
  if (!locals.user) redirect(303, '/login?returnTo=/account');
  const settings = await getSettings();
  const returnTo = await finishPluginAccountLink(
    cookies,
    settings.plugins,
    params.plugin,
    url,
    locals.user,
    locals.locale,
    settings.i18n.defaultLocale,
  );
  redirect(303, returnTo ?? '/account');
};
