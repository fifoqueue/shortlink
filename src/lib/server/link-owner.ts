import { createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export interface LinkOwner {
  userId?: number;
  sessionId?: string;
  ipHash?: string;
  ipAddress?: string;
}

const COOKIE_NAME = 'shortlink_creator';
const COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60;

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    maxAge: COOKIE_TTL_SECONDS,
  };
}

function hashIp(ip: string) {
  return createHash('sha256').update(ip).digest('hex');
}

export function getOrCreateLinkOwner(input: {
  cookies: Cookies;
  userId?: number | null;
  ip?: string | null;
}) {
  if (input.userId) {
    return {
      userId: input.userId,
      ipAddress: input.ip ?? undefined,
    } satisfies LinkOwner;
  }

  let sessionId = input.cookies.get(COOKIE_NAME);
  if (!sessionId || !/^[A-Za-z0-9_-]{24,64}$/.test(sessionId)) {
    sessionId = randomBytes(24).toString('base64url');
    input.cookies.set(COOKIE_NAME, sessionId, cookieOptions());
  }

  return {
    sessionId,
    ipHash: input.ip ? hashIp(input.ip) : undefined,
    ipAddress: input.ip ?? undefined,
  } satisfies LinkOwner;
}

export function getLinkOwner(input: {
  cookies: Cookies;
  userId?: number | null;
  ip?: string | null;
}) {
  if (input.userId) {
    return {
      userId: input.userId,
      ipAddress: input.ip ?? undefined,
    } satisfies LinkOwner;
  }
  const sessionId = input.cookies.get(COOKIE_NAME);
  return {
    sessionId:
      sessionId && /^[A-Za-z0-9_-]{24,64}$/.test(sessionId)
        ? sessionId
        : undefined,
    ipHash: input.ip ? hashIp(input.ip) : undefined,
    ipAddress: input.ip ?? undefined,
  } satisfies LinkOwner;
}
