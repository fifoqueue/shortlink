import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uiText } from '$lib/i18n/ui-text';
import {
  PASSKEY_REGISTER_COOKIE,
  consumeTimedChallenge,
  createPasskeyCredential,
  securityUnlocked,
} from '$lib/server/local-auth-security';
import { getUserById } from '$lib/server/users';
import { verifyRegistrationResponse } from '$lib/server/webauthn';

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

export const POST: RequestHandler = async ({
  cookies,
  locals,
  request,
  url,
}) => {
  const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
  if (!locals.user) throw error(401, text.messages.loginRequired);

  const challenge = consumeTimedChallenge(cookies, PASSKEY_REGISTER_COOKIE);
  if (!challenge?.challenge || challenge.userId !== locals.user.id) {
    throw error(400, text.messages.passkeyRegistrationExpired);
  }

  const storedUser = await getUserById(locals.user.id);
  if (!storedUser) {
    throw error(404, text.messages.userNotFound);
  }
  if (!securityUnlocked(cookies, storedUser.id)) {
    throw error(403, text.messages.securityUnlockRequired);
  }

  const body = recordValue(await request.json().catch(() => ({})));
  const credential = recordValue(body.credential ?? body);
  const verification = verifyRegistrationResponse({
    response: credential,
    challenge: challenge.challenge,
    origin: url.origin,
    rpId: url.hostname,
  });

  await createPasskeyCredential({
    userId: storedUser.id,
    credentialId: verification.credentialId,
    publicKey: verification.publicKey,
    algorithm: verification.algorithm,
    counter: verification.counter,
    transports: stringList(body.transports),
    name: challenge.name ?? '',
  });

  return json({ ok: true, message: text.messages.passkeyCreated });
};
