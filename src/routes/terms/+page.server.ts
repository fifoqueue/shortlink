import type { PageServerLoad } from './$types';
import { publicLegalSettings } from '$lib/public-settings';

export const load: PageServerLoad = async ({ locals }) => ({
  settings: publicLegalSettings(locals.localizedSettings),
});
