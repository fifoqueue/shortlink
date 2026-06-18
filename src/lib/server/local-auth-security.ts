import { env } from '$env/dynamic/private';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { AuthenticatedUser } from '$lib/plugin-contracts';
import { canUseAuthProvider } from './permissions';
import {
  authCookieOptions,
  decodeSigned,
  encodeSigned,
  getUserFromSession,
} from './auth-session';
import {
  ensureDatabase,
  UserPasskeyCredentialModel,
  UserTotpSecretModel,
} from './database';
import type { UserModel } from './models';
import type { StoredPasskeyPublicKey } from './webauthn';

export const LOCAL_AUTH_PROVIDER_ID = 'local-auth';
export const TOTP_METHOD_ID = 'totp';
export const PASSKEY_METHOD_ID = 'passkey';
export const TOTP_SETUP_COOKIE = 'shortlink_totp_setup';
export const TOTP_LOGIN_COOKIE = 'shortlink_totp_login';
export const PASSKEY_REGISTER_COOKIE = 'shortlink_passkey_register';
export const PASSKEY_LOGIN_COOKIE = 'shortlink_passkey_login';
export const PASSKEY_SECURITY_UNLOCK_COOKIE =
  'shortlink_passkey_security_unlock';
export const SECURITY_UNLOCK_COOKIE = 'shortlink_security_unlock';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CHALLENGE_TTL_SECONDS = 5 * 60;

export interface TimedChallenge {
  userId?: number;
  challenge?: string;
  secret?: string;
  name?: string;
  returnTo?: string;
  expiresAt: number;
}

type AuthPermissions = { auth: { providers: readonly string[] | null } };

function encryptionKey() {
  if (!env.AUTH_SESSION_SECRET) {
    throw new Error('AUTH_SESSION_SECRET environment variable is required.');
  }
  return createHash('sha256').update(env.AUTH_SESSION_SECRET).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) {
    throw new Error('Invalid encrypted TOTP secret');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function localTotpAllowed(permissions: AuthPermissions) {
  return canUseAuthProvider(
    permissions,
    LOCAL_AUTH_PROVIDER_ID,
    TOTP_METHOD_ID,
  );
}

export function localPasskeyAllowed(permissions: AuthPermissions) {
  return canUseAuthProvider(
    permissions,
    LOCAL_AUTH_PROVIDER_ID,
    PASSKEY_METHOD_ID,
  );
}

export function localAuthProviderKey(methodId: string) {
  return `${LOCAL_AUTH_PROVIDER_ID}:${methodId}`;
}

export async function getLocalAuthUser(cookies: Cookies) {
  return getUserFromSession(
    cookies,
    (provider) => provider === localAuthProviderKey(PASSKEY_METHOD_ID),
  );
}

export function setSecurityUnlock(cookies: Cookies, userId: number) {
  setTimedChallenge(cookies, SECURITY_UNLOCK_COOKIE, { userId });
}

export function securityUnlocked(cookies: Cookies, userId: number) {
  return readTimedChallenge(cookies, SECURITY_UNLOCK_COOKIE)?.userId === userId;
}

export function userHasLocalPassword(user: Pick<UserModel, 'passwordHash'>) {
  return user.passwordHash.startsWith('scrypt:');
}

export function authenticatedUserFromModel(
  user: Pick<UserModel, 'id' | 'email' | 'name' | 'isAdmin'>,
  provider: string,
  subject = String(user.id),
): AuthenticatedUser {
  return {
    id: user.id,
    provider,
    subject,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin === true,
  };
}

export function challengeCookieOptions() {
  return authCookieOptions(CHALLENGE_TTL_SECONDS);
}

export function setTimedChallenge(
  cookies: Cookies,
  name: string,
  challenge: Omit<TimedChallenge, 'expiresAt'>,
) {
  cookies.set(
    name,
    encodeSigned({
      ...challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
    }),
    challengeCookieOptions(),
  );
}

export function consumeTimedChallenge(cookies: Cookies, name: string) {
  const challenge = decodeSigned<TimedChallenge>(cookies.get(name));
  cookies.delete(name, { path: '/' });
  if (!challenge || challenge.expiresAt < Date.now()) return null;
  return challenge;
}

export function readTimedChallenge(cookies: Cookies, name: string) {
  const challenge = decodeSigned<TimedChallenge>(cookies.get(name));
  if (!challenge || challenge.expiresAt < Date.now()) return null;
  return challenge;
}

function base32Encode(value: Uint8Array) {
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string) {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of value.replace(/=+$/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

export function totpOtpAuthUrl(input: {
  issuer: string;
  accountName: string;
  secret: string;
}) {
  const issuer = input.issuer.trim() || 'Shortlink';
  const label = `${issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params}`;
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, '0');
}

export function verifyTotpCode(secret: string, code: string) {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  const received = Buffer.from(normalized);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const expected = Buffer.from(hotp(secret, currentCounter + offset));
    if (
      expected.length === received.length &&
      timingSafeEqual(expected, received)
    ) {
      return true;
    }
  }
  return false;
}

export async function totpEnabledForUser(userId: number) {
  await ensureDatabase();
  return Boolean(
    await UserTotpSecretModel.findOne({ where: { userId, enabled: true } }),
  );
}

export async function verifyUserTotp(userId: number, code: string) {
  await ensureDatabase();
  const record = await UserTotpSecretModel.findOne({
    where: { userId, enabled: true },
  });
  if (!record) return false;
  return verifyTotpCode(decryptSecret(record.secret), code);
}

export async function saveUserTotpSecret(userId: number, secret: string) {
  await ensureDatabase();
  const encrypted = encryptSecret(secret);
  const [record] = await UserTotpSecretModel.findOrCreate({
    where: { userId },
    defaults: { userId, secret: encrypted, enabled: true },
  });
  if (record.secret !== encrypted || !record.enabled) {
    await record.update({ secret: encrypted, enabled: true });
  }
  return record;
}

export async function removeUserTotpSecret(userId: number) {
  await ensureDatabase();
  return UserTotpSecretModel.destroy({ where: { userId } });
}

export function normalizePasskeyName(value: string) {
  return value.trim().slice(0, 120) || 'Passkey';
}

export async function listUserPasskeys(userId: number) {
  await ensureDatabase();
  const passkeys = await UserPasskeyCredentialModel.findAll({
    where: { userId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });
  return passkeys.map((passkey) => ({
    id: passkey.id,
    credentialId: passkey.credentialId,
    name: passkey.name,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function userPasskeyCredentialIds(userId: number) {
  await ensureDatabase();
  const passkeys = await UserPasskeyCredentialModel.findAll({
    attributes: ['credentialId'],
    where: { userId },
  });
  return passkeys.map((passkey) => passkey.credentialId);
}

export async function anyPasskeysExist() {
  await ensureDatabase();
  return (await UserPasskeyCredentialModel.count()) > 0;
}

export async function findPasskeyCredential(credentialId: string) {
  await ensureDatabase();
  return UserPasskeyCredentialModel.findOne({ where: { credentialId } });
}

export async function createPasskeyCredential(input: {
  userId: number;
  credentialId: string;
  publicKey: StoredPasskeyPublicKey;
  algorithm: number;
  counter: number;
  transports: string[];
  name: string;
}) {
  await ensureDatabase();
  return UserPasskeyCredentialModel.create({
    userId: input.userId,
    credentialId: input.credentialId,
    publicKey: input.publicKey as unknown as Record<string, unknown>,
    algorithm: input.algorithm,
    counter: input.counter,
    transports: input.transports,
    name: normalizePasskeyName(input.name),
  });
}

export async function updatePasskeyUse(credentialId: string, counter: number) {
  const passkey = await findPasskeyCredential(credentialId);
  if (!passkey) return null;
  await passkey.update({
    counter: Math.max(passkey.counter, counter),
    lastUsedAt: new Date(),
  });
  return passkey;
}

export async function removeUserPasskey(userId: number, passkeyId: number) {
  await ensureDatabase();
  return UserPasskeyCredentialModel.destroy({
    where: { id: passkeyId, userId },
  });
}
