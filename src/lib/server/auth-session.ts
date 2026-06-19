import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import type { AuthenticatedUser } from '$lib/plugin-contracts';
import { getUserById } from './users';
import type { UserModel } from './models';

export const SESSION_COOKIE = 'shortlink_user';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_USER_CACHE_TTL_MS = numberEnv(
  'SESSION_USER_CACHE_TTL_MS',
  5_000,
  0,
  60_000,
);
const SESSION_USER_CACHE_LIMIT = numberEnv(
  'SESSION_USER_CACHE_LIMIT',
  10_000,
  0,
  100_000,
);

type SessionUser = AuthenticatedUser & {
  expiresAt: number;
  sessionVersion?: number;
};

const sessionUserCache = new Map<
  string,
  { expiresAt: number; user: AuthenticatedUser }
>();

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function secret() {
  const value = env.AUTH_SESSION_SECRET;
  if (!value)
    throw new Error('AUTH_SESSION_SECRET environment variable is required.');
  return value;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSigned(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSigned<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export function authCookieOptions(maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    maxAge,
  };
}

export function sessionUserFromModel(
  storedUser: UserModel,
  provider: string,
  subject: string,
): AuthenticatedUser {
  return {
    id: storedUser.id,
    provider,
    subject,
    name: storedUser.name,
    email: storedUser.email,
    isAdmin: storedUser.isAdmin === true,
  };
}

export function createUserSession(
  cookies: Cookies,
  user: AuthenticatedUser,
  sessionVersion = 0,
) {
  cookies.set(
    SESSION_COOKIE,
    encodeSigned({
      ...user,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      sessionVersion,
    }),
    authCookieOptions(SESSION_TTL_SECONDS),
  );
}

export function createUserSessionFromModel(
  cookies: Cookies,
  storedUser: UserModel,
  provider: string,
  subject: string,
) {
  const user = sessionUserFromModel(storedUser, provider, subject);
  cookies.set(
    SESSION_COOKIE,
    encodeSigned({
      ...user,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
      sessionVersion: storedUser.sessionVersion,
    }),
    authCookieOptions(SESSION_TTL_SECONDS),
  );
  return user;
}

export function clearUserSession(cookies: Cookies) {
  const token = cookies.get(SESSION_COOKIE);
  if (token) sessionUserCache.delete(token);
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

function cachedSessionUser(token: string) {
  const entry = sessionUserCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sessionUserCache.delete(token);
    return null;
  }
  sessionUserCache.delete(token);
  sessionUserCache.set(token, entry);
  return entry.user;
}

function rememberSessionUser(token: string, user: AuthenticatedUser) {
  if (SESSION_USER_CACHE_TTL_MS <= 0 || SESSION_USER_CACHE_LIMIT <= 0) return;
  sessionUserCache.set(token, {
    expiresAt: Date.now() + SESSION_USER_CACHE_TTL_MS,
    user,
  });
  while (sessionUserCache.size > SESSION_USER_CACHE_LIMIT) {
    const oldestKey = sessionUserCache.keys().next().value;
    if (oldestKey === undefined) break;
    sessionUserCache.delete(oldestKey);
  }
}

export async function getUserFromSession(
  cookies: Cookies,
  isProviderAllowed: (provider: string) => boolean = () => true,
): Promise<AuthenticatedUser | null> {
  const token = cookies.get(SESSION_COOKIE);
  const user = decodeSigned<SessionUser>(token);
  if (!user || user.expiresAt < Date.now() || !isProviderAllowed(user.provider))
    return null;

  if (token) {
    const cached = cachedSessionUser(token);
    if (cached) return cached;
  }

  const storedUser = await getUserById(user.id);
  if (!storedUser?.enabled) return null;
  if ((user.sessionVersion ?? 0) !== storedUser.sessionVersion) return null;

  const authenticatedUser = sessionUserFromModel(
    storedUser,
    user.provider,
    user.subject,
  );
  if (token) rememberSessionUser(token, authenticatedUser);
  return authenticatedUser;
}
