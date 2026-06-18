import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uiText } from '$lib/i18n/ui-text';
import {
  PASSKEY_SECURITY_UNLOCK_COOKIE,
  consumeTimedChallenge,
  findPasskeyCredential,
  setSecurityUnlock,
  updatePasskeyUse,
} from '$lib/server/local-auth-security';
import { getUserById } from '$lib/server/users';
import type { StoredPasskeyPublicKey } from '$lib/server/webauthn';
import { verifyAuthenticationResponse } from '$lib/server/webauthn';

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const POST: RequestHandler = async ({
  cookies,
  locals,
  request,
  url,
}) => {
  const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
  if (!locals.user) throw error(401, text.messages.loginRequired);

  const challenge = consumeTimedChallenge(
    cookies,
    PASSKEY_SECURITY_UNLOCK_COOKIE,
  );
  if (!challenge?.challenge || challenge.userId !== locals.user.id) {
    throw error(400, text.messages.passkeyLoginExpired);
  }

  const body = recordValue(await request.json().catch(() => ({})));
  const credentialId = typeof body.rawId === 'string' ? body.rawId : '';
  const passkey = credentialId
    ? await findPasskeyCredential(credentialId)
    : null;
  if (!passkey || passkey.userId !== locals.user.id) {
    throw error(401, text.messages.invalidLogin);
  }

  const storedUser = await getUserById(locals.user.id);
  if (!storedUser || storedUser.enabled !== true) {
    throw error(401, text.messages.invalidLogin);
  }

  const verified = await verifyAuthenticationResponse({
    response: body,
    publicKey: passkey.publicKey as unknown as StoredPasskeyPublicKey,
    challenge: challenge.challenge,
    origin: url.origin,
    rpId: url.hostname,
  });
  if (
    verified.counter > 0 &&
    passkey.counter > 0 &&
    verified.counter <= passkey.counter
  ) {
    throw error(401, text.messages.invalidLogin);
  }

  await updatePasskeyUse(passkey.credentialId, verified.counter);
  setSecurityUnlock(cookies, locals.user.id);
  return json({ ok: true, message: text.messages.securityUnlocked });
};
