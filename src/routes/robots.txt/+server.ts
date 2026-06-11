import type { RequestHandler } from './$types';
import { robotsTxtForSettings } from '$lib/server/robots';
import { getSettings } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
  const settings = await getSettings();

  return new Response(`${robotsTxtForSettings(settings)}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
