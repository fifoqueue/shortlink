import { redirect, type RequestHandler } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import { clearPluginSessions } from '../../plugins/auth-registry';

export const GET: RequestHandler = async ({ cookies }) => {
  const settings = await getSettings();
  await clearPluginSessions(cookies, settings.plugins);
  redirect(303, '/');
};
