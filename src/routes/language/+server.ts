import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { localeCookieName, localeFromValue } from '$lib/i18n';
import type { SiteLocale } from '$lib/config';
import { getSettings } from '$lib/server/settings';

function safeReturnTo(value: string | null, origin: string) {
  if (!value) return '/';
  try {
    const parsed = new URL(value, origin);
    return parsed.origin === origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/';
  } catch {
    return value.startsWith('/') && !value.startsWith('//') ? value : '/';
  }
}

function parseLocale(
  value: FormDataEntryValue | null,
  fallbackLocale: SiteLocale,
): SiteLocale {
  return localeFromValue(String(value ?? '')) ?? fallbackLocale;
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const form = await request.formData();
  const settings = await getSettings();
  const locale = parseLocale(form.get('locale'), settings.i18n.defaultLocale);
  const returnTo = safeReturnTo(String(form.get('returnTo') ?? ''), url.origin);

  cookies.set(localeCookieName, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
  });

  if (request.headers.get('accept')?.includes('application/json')) {
    return json({ ok: true, locale });
  }

  redirect(303, returnTo);
};
