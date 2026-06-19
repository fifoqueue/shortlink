import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { stringify } from 'devalue';
import { decodeSigned, encodeSigned, SESSION_COOKIE } from './auth-session';

export const WEB_ACTION_TOKEN_FIELD = '__shortlink_web_action_token';
export const CSRF_TOKEN_FIELD = '__shortlink_csrf_token';
export const WEB_ACTION_BYPASS_HEADER = 'x-shortlink-web-action-bypass';

const unsafeMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);
const formContentTypes = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];
const allowedFetchSites = new Set(['none', 'same-origin', 'same-site']);
const allowedFetchModes = new Set([
  'cors',
  'navigate',
  'no-cors',
  'same-origin',
]);
const allowedFetchDests = new Set(['document', 'empty']);

type WebActionTokenPayload = {
  actor: string;
  expiresAt: number;
  path: string;
  v: 1;
};

type CsrfTokenPayload = {
  actor: string;
  expiresAt: number;
  v: 1;
};

type GuardEvent = Pick<RequestEvent, 'cookies' | 'locals' | 'request' | 'url'>;

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}

export function hashWebActionBypassToken(value: string) {
  return hashValue(value);
}

function actorForEvent(event: GuardEvent) {
  if (event.locals.user) return `user:${event.locals.user.id}`;
  const session = event.cookies.get(SESSION_COOKIE);
  if (session) return `session:${hashValue(session).slice(0, 32)}`;
  return 'anonymous';
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function sameOrigin(value: string, expectedOrigin: string) {
  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function actionNameFromUrl(url: URL) {
  if (url.search.startsWith('?/')) {
    return decodeURIComponent(url.search.slice(2).split(/[&=]/, 1)[0] ?? '');
  }
  for (const key of url.searchParams.keys()) {
    if (key.startsWith('/')) return key.slice(1);
  }
  return '';
}

function expectsActionJson(event: GuardEvent) {
  return (
    event.request.method === 'POST' &&
    (event.request.headers.get('accept') ?? '')
      .toLowerCase()
      .includes('application/json')
  );
}

function actionFailurePayload(event: GuardEvent, message: string) {
  const action = actionNameFromUrl(event.url);
  return {
    ok: false,
    ...(action ? { action } : {}),
    message,
  };
}

function forbidden(event: GuardEvent, message: string) {
  if (expectsActionJson(event)) {
    return new Response(
      JSON.stringify({
        type: 'failure',
        status: 403,
        data: stringify(actionFailurePayload(event, message)),
      }),
      {
        status: 403,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      },
    );
  }

  return new Response(message, {
    status: 403,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function isApiPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isGuardedWebMutation(event: GuardEvent) {
  return (
    unsafeMethods.has(event.request.method) && !isApiPath(event.url.pathname)
  );
}

function isNamedFormAction(url: URL) {
  if (url.search.startsWith('?/')) return true;
  for (const key of url.searchParams.keys()) {
    if (key.startsWith('/')) return true;
  }
  return false;
}

function hasBypass(event: GuardEvent) {
  const provided = event.request.headers.get(WEB_ACTION_BYPASS_HEADER)?.trim();
  if (!provided) return false;

  const guard = event.locals.settings.security.webActionGuard;
  if (
    guard.bypassTokenHash &&
    safeEqual(hashWebActionBypassToken(provided), guard.bypassTokenHash)
  ) {
    return true;
  }

  return guard.adminBypass && event.locals.isAdmin && provided === 'admin';
}

function verifyFetchMetadata(event: GuardEvent) {
  const headers = event.request.headers;
  const expectedOrigin = event.locals.requestOrigin ?? event.url.origin;
  const fetchSite = headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite && !allowedFetchSites.has(fetchSite)) {
    return false;
  }

  const fetchMode = headers.get('sec-fetch-mode')?.toLowerCase();
  if (fetchMode && !allowedFetchModes.has(fetchMode)) {
    return false;
  }

  const fetchDest = headers.get('sec-fetch-dest')?.toLowerCase();
  if (fetchDest && !allowedFetchDests.has(fetchDest)) {
    return false;
  }

  const origin = headers.get('origin');
  if (origin) return sameOrigin(origin, expectedOrigin);

  const referer = headers.get('referer');
  if (referer) return sameOrigin(referer, expectedOrigin);

  return fetchSite === 'same-origin' || fetchSite === 'none';
}

function isFormRequest(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  return formContentTypes.some((type) => contentType.startsWith(type));
}

function tokenFromFormData(formData: FormData, name: string) {
  const token = formData.get(name);
  return typeof token === 'string' ? token : '';
}

async function verifyWebActionToken(event: GuardEvent) {
  let formData: FormData;
  try {
    formData = await event.request.clone().formData();
  } catch {
    return false;
  }

  const token = tokenFromFormData(formData, WEB_ACTION_TOKEN_FIELD);
  if (!token) return false;

  const payload = decodeSigned<WebActionTokenPayload>(token);
  if (!payload || payload.v !== 1) return false;
  if (payload.expiresAt < Date.now()) return false;
  if (payload.path !== event.url.pathname) return false;
  return payload.actor === actorForEvent(event);
}

async function verifyCsrfToken(event: GuardEvent) {
  let token = event.request.headers.get('x-csrf-token')?.trim() ?? '';
  if (!token && isFormRequest(event.request)) {
    try {
      token = tokenFromFormData(
        await event.request.clone().formData(),
        CSRF_TOKEN_FIELD,
      );
    } catch {
      return false;
    }
  }
  if (!token) return false;

  const payload = decodeSigned<CsrfTokenPayload>(token);
  if (!payload || payload.v !== 1) return false;
  if (payload.expiresAt < Date.now()) return false;
  return payload.actor === actorForEvent(event);
}

export function createWebActionToken(event: GuardEvent) {
  const now = Date.now();
  return encodeSigned({
    actor: actorForEvent(event),
    expiresAt:
      now +
      event.locals.settings.security.webActionGuard.tokenTtlSeconds * 1000,
    path: event.url.pathname,
    v: 1,
  } satisfies WebActionTokenPayload);
}

export function createCsrfToken(event: GuardEvent) {
  const now = Date.now();
  return encodeSigned({
    actor: actorForEvent(event),
    expiresAt: now + event.locals.settings.security.csrf.tokenTtlSeconds * 1000,
    v: 1,
  } satisfies CsrfTokenPayload);
}

export async function enforceWebActionGuard(event: GuardEvent) {
  if (!isGuardedWebMutation(event)) return null;
  const { csrf, webActionGuard } = event.locals.settings.security;
  if (!csrf.enabled && !webActionGuard.enabled) return null;
  if (hasBypass(event)) return null;

  if (webActionGuard.enabled && !verifyFetchMetadata(event)) {
    return forbidden(event, 'Blocked web mutation request metadata.');
  }

  if (
    webActionGuard.enabled &&
    isNamedFormAction(event.url) &&
    !(await verifyWebActionToken(event))
  ) {
    return forbidden(event, 'Missing or invalid web action token.');
  }

  if (
    csrf.enabled &&
    isFormRequest(event.request) &&
    !(await verifyCsrfToken(event))
  ) {
    return forbidden(event, 'Missing or invalid CSRF token.');
  }

  return null;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formAttributeValue(formTag: string, name: string) {
  const match = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(formTag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function formAction(formTag: string) {
  return formAttributeValue(formTag, 'action');
}

function formMethodIsPost(formTag: string) {
  return formAttributeValue(formTag, 'method').toLowerCase() === 'post';
}

function sameOriginFormAction(action: string, origin: string) {
  const trimmed = action.trim();
  try {
    return new URL(trimmed || '.', origin).origin === origin;
  } catch {
    return false;
  }
}

function shouldInjectIntoPostForm(formTag: string, origin: string) {
  return (
    formMethodIsPost(formTag) &&
    sameOriginFormAction(formAction(formTag), origin)
  );
}

const formTagPattern = /<form\b[^>]*>/gi;

export function injectWebActionTokens(
  html: string,
  input: {
    csrfToken?: string | null;
    origin: string;
    webActionToken?: string | null;
  },
) {
  if (!html.toLowerCase().includes('<form')) return html;

  const csrfInput = input.csrfToken
    ? `<input type="hidden" name="${CSRF_TOKEN_FIELD}" value="${escapeAttribute(input.csrfToken)}">`
    : '';
  const webActionInput = input.webActionToken
    ? `<input type="hidden" name="${WEB_ACTION_TOKEN_FIELD}" value="${escapeAttribute(input.webActionToken)}">`
    : '';

  return html.replace(formTagPattern, (formTag) => {
    if (!shouldInjectIntoPostForm(formTag, input.origin)) return formTag;
    return `${formTag}${csrfInput}${webActionInput}`;
  });
}
