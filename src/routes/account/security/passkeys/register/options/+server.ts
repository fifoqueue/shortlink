import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uiText } from '$lib/i18n/ui-text';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import { getUserById } from '$lib/server/users';
import {
  PASSKEY_REGISTER_COOKIE,
  localPasskeyAllowed,
  normalizePasskeyName,
  securityUnlocked,
  setTimedChallenge,
  userPasskeyCredentialIds,
} from '$lib/server/local-auth-security';
import { randomChallenge, registrationOptions } from '$lib/server/webauthn';

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export const POST: RequestHandler = async (event) => {
  const { cookies, locals, request, url } = event;
  const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
  if (!locals.user) throw error(401, text.messages.loginRequired);

  const [storedUser, permissions, body] = await Promise.all([
    getUserById(locals.user.id),
    effectivePermissionsForEvent(event),
    request.json().catch(() => ({})),
  ]);
  if (!storedUser) {
    throw error(404, text.messages.userNotFound);
  }
  if (!localPasskeyAllowed(permissions)) {
    throw error(403, text.messages.securityMethodNotAllowed);
  }
  if (!securityUnlocked(cookies, storedUser.id)) {
    throw error(403, text.messages.securityUnlockRequired);
  }

  const challenge = randomChallenge();
  const input = recordValue(body);
  const name = normalizePasskeyName(stringValue(input.name));
  setTimedChallenge(cookies, PASSKEY_REGISTER_COOKIE, {
    userId: storedUser.id,
    challenge,
    name,
  });

  return json(
    registrationOptions({
      challenge,
      rpId: url.hostname,
      rpName: locals.localizedSettings.general.siteName,
      userId: storedUser.id,
      userName: storedUser.email,
      displayName: storedUser.name,
      excludeCredentialIds: await userPasskeyCredentialIds(storedUser.id),
    }),
  );
};
