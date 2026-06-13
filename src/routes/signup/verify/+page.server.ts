import type { PageServerLoad } from './$types';
import {
  registrationAvailability,
  verifySignupEmail,
} from '$lib/server/registration';
import { getSettings } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { getAuthLoginMethods } from '../../../plugins/auth-registry';

export const load: PageServerLoad = async ({
  getClientAddress,
  locals,
  request,
  url,
}) => {
  const settings = await getSettings();
  const displaySettings = locals.localizedSettings;
  const token = url.searchParams.get('token') ?? '';
  const result = token ? await verifySignupEmail(token) : null;
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const methods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
    permissions.auth.providers,
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
