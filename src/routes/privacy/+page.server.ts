import type { PageServerLoad } from './$types';
import { publicLegalSettings } from '$lib/public-settings';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  const settings = publicLegalSettings(locals.localizedSettings);
  if (settings.legal.privacyUrl) redirect(307, settings.legal.privacyUrl);
  return { settings };
};
