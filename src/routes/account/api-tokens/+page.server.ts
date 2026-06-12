import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '$lib/server/api-tokens';
import { requirePageUser } from '$lib/server/auth-guards';
import { stringValue } from '$lib/server/settings';
import { uiText } from '$lib/i18n/ui-text';

export const load: PageServerLoad = async ({ locals }) => {
  const user = requirePageUser(locals, '/account/api-tokens');
  const displaySettings = locals.localizedSettings;
  return {
    locale: locals.locale,
    user,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    tokens: await listApiTokens(user.id),
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account/api-tokens');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const result = await createApiToken(user.id, stringValue(form, 'name'));
    return {
      ok: true,
      message: text.messages.tokenIssued,
      token: result.token,
    };
  },

  revoke: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account/api-tokens');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const removed = await revokeApiToken(
      user.id,
      Number(stringValue(form, 'id', '0')),
    );
    if (!removed) {
      return fail(404, { message: text.messages.tokenNotFound });
    }
    return { ok: true, message: text.messages.tokenRevoked };
  },
};
