import type { RequestHandler } from './$types';
import { getSettings } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
  return new Response((await getSettings()).theme.customCss, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
