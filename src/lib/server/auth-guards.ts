import { json, redirect } from '@sveltejs/kit';
import { uiText } from '$lib/i18n/ui-text';

export function requirePageUser(locals: App.Locals, returnTo: string) {
  if (!locals.user) {
    const query = new URLSearchParams({ returnTo });
    redirect(303, `/login?${query}`);
  }
  return locals.user;
}

export function requireJsonUser(locals: App.Locals) {
  if (!locals.user) {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    return json({ message: text.messages.loginRequired }, { status: 401 });
  }
  return null;
}
