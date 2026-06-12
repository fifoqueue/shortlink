import type { PageServerLoad } from './$types';
import {
  registrationAvailability,
  verifySignupEmail,
} from '$lib/server/registration';
import { getSettings } from '$lib/server/settings';
import { getAuthLoginMethods } from '../../../plugins/auth-registry';

export const load: PageServerLoad = async ({ locals, url }) => {
  const settings = await getSettings();
  const displaySettings = locals.localizedSettings;
  const token = url.searchParams.get('token') ?? '';
  const result = token ? await verifySignupEmail(token) : null;
  const methods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
  );
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: methods.some((method) => method.type === 'password'),
  });
  return {
    locale: locals.locale,
    ok: Boolean(result),
    purpose: result?.purpose ?? 'signup',
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    registrationAllowed: registration.allowed,
  };
};
