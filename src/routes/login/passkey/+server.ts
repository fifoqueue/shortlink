import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uiText } from '$lib/i18n/ui-text';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import { getClientIp } from '$lib/server/client-ip';
import {
  effectivePermissions,
  effectivePermissionsForEvent,
} from '$lib/server/permissions';
import { getUserById } from '$lib/server/users';
import {
  PASSKEY_LOGIN_COOKIE,
  PASSKEY_METHOD_ID,
  anyPasskeysExist,
  authenticatedUserFromModel,
  consumeTimedChallenge,
  findPasskeyCredential,
  localAuthProviderKey,
  localPasskeyAllowed,
  setTimedChallenge,
  updatePasskeyUse,
} from '$lib/server/local-auth-security';
import type { StoredPasskeyPublicKey } from '$lib/server/webauthn';
import {
  authenticationOptions,
  randomChallenge,
  verifyAuthenticationResponse,
} from '$lib/server/webauthn';

function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const GET: RequestHandler = async (event) => {
  const { cookies, locals, url } = event;
  const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
  if (locals.user) throw error(409, text.messages.unsupportedAction);

  const permissions = await effectivePermissionsForEvent(event);
  if (!localPasskeyAllowed(permissions)) {
    throw error(403, text.messages.securityMethodNotAllowed);
  }
  if (!(await anyPasskeysExist())) {
    throw error(404, text.messages.passkeyNotFound);
  }

  const challenge = randomChallenge();
  setTimedChallenge(cookies, PASSKEY_LOGIN_COOKIE, {
    challenge,
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
  });

  return json(authenticationOptions({ challenge, rpId: url.hostname }));
};

export const POST: RequestHandler = async (event) => {
  const { cookies, getClientAddress, locals, request, url } = event;
  const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
  const challenge = consumeTimedChallenge(cookies, PASSKEY_LOGIN_COOKIE);
  if (!challenge?.challenge) {
    throw error(400, text.messages.passkeyLoginExpired);
  }

  const body = recordValue(await request.json().catch(() => ({})));
  const credentialId = typeof body.rawId === 'string' ? body.rawId : '';
  const passkey = credentialId
    ? await findPasskeyCredential(credentialId)
    : null;
  if (!passkey) throw error(401, text.messages.invalidLogin);

  const storedUser = await getUserById(passkey.userId);
  if (!storedUser || storedUser.enabled !== true) {
    throw error(401, text.messages.invalidLogin);
  }

  const authUser = authenticatedUserFromModel(
    storedUser,
    localAuthProviderKey(PASSKEY_METHOD_ID),
    passkey.credentialId,
  );
  const permissions = await effectivePermissions({
    settings: locals.settings,
    user: authUser,
    isAdmin: authUser.isAdmin,
    ip: getClientIp(
      request,
      getClientAddress,
      locals.settings.network.trustProxyHeaders,
      locals.settings.network.proxyIpHeaders,
    ),
  });
  if (!localPasskeyAllowed(permissions)) {
    throw error(403, text.messages.securityMethodNotAllowed);
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
  createUserSessionFromModel(
    cookies,
    storedUser,
    localAuthProviderKey(PASSKEY_METHOD_ID),
    passkey.credentialId,
  );
  return json({ ok: true, returnTo: challenge.returnTo ?? '/' });
};
