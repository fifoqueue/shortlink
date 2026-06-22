import type { PageServerLoad } from './$types';
import {
  registrationAvailability,
  verifySignupEmail,
} from '$lib/server/registration';
import {
  passwordLoginEnabled,
  publicAuthPageData,
} from '$lib/server/auth-page';
import { getSettings } from '$lib/server/settings';
import { effectivePermissionsForEvent } from '$lib/server/permissions';

export const load: PageServerLoad = async ({
  getClientAddress,
  locals,
  request,
  url,
}) => {
  const settings = await getSettings();
  const token = url.searchParams.get('token') ?? '';
  const result = token ? await verifySignupEmail(token) : null;
  const permissions = await effectivePermissionsForEvent({
    locals,
    request,
    getClientAddress,
  });
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: passwordLoginEnabled(
      settings,
      locals.locale,
      permissions.auth.providers,
    ),
  });
  return {
    ...publicAuthPageData(settings, locals),
    ok: Boolean(result),
    purpose: result?.purpose ?? 'signup',
    registrationAllowed: registration.allowed,
  };
};
