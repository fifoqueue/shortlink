import type { Handle, HandleServerError } from '@sveltejs/kit';
import {
  localeCookieName,
  localeFromMetadata,
  localizedSettings,
} from '$lib/i18n';
import { uiText } from '$lib/i18n/ui-text';
import { defaultSiteLocale } from '$lib/config';
import { setClickMetadataCollector } from '$lib/server/click-queue';
import {
  applyClientHintResponseHeaders,
  shouldApplyClientHintResponseHeaders,
} from '$lib/server/client-hints';
import { getClientIp } from '$lib/server/client-ip';
import { getSettings, setPluginStateNormalizer } from '$lib/server/settings';
import { getPluginUser } from './plugins/auth-registry';
import {
  collectClickMetadataPlugins,
  handleRequestPlugins,
  normalizePluginStates,
} from './plugins/server';

setPluginStateNormalizer(normalizePluginStates);
setClickMetadataCollector(collectClickMetadataPlugins);

export const handle: Handle = async ({ event, resolve }) => {
  const settings = await getSettings();
  const locale = localeFromMetadata({
    acceptLanguage: event.request.headers.get('accept-language'),
    cookieLocale: event.cookies.get(localeCookieName),
    fallbackLocale: settings.i18n.defaultLocale,
  });
  event.locals.settings = settings;
  event.locals.locale = locale;
  event.locals.localizedSettings = localizedSettings(settings, locale);
  event.locals.user = await getPluginUser(event.cookies, settings.plugins);
  event.locals.isAdmin = event.locals.user?.isAdmin === true;
  const ip = getClientIp(
    event.request,
    event.getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  const pluginResponse = await handleRequestPlugins({
    event,
    states: settings.plugins,
    user: event.locals.user,
    isAdmin: event.locals.isAdmin,
    ip,
  });
  const shouldRequestClientHints = shouldApplyClientHintResponseHeaders(
    event.url.pathname,
  );
  if (pluginResponse) {
    if (shouldRequestClientHints) {
      applyClientHintResponseHeaders(pluginResponse.headers);
    }
    return pluginResponse;
  }

  const isAdminPath =
    event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/');
  const response = await resolve(event, {
    preload: ({ type }) => !isAdminPath && (type === 'js' || type === 'css'),
    transformPageChunk: ({ html }) =>
      html.replace('<html lang="ko">', `<html lang="${locale}">`),
  });
  if (shouldRequestClientHints) {
    applyClientHintResponseHeaders(response.headers);
  }
  return response;
};

export const handleError: HandleServerError = ({ error, event, status }) => {
  console.error(
    `[${status}] ${event.request.method} ${event.url.pathname}`,
    error,
  );
  const locale =
    event.locals.locale ??
    event.locals.settings?.i18n.defaultLocale ??
    defaultSiteLocale;
  const fallbackLocale = event.locals.settings?.i18n.defaultLocale ?? locale;
  return {
    message: uiText(locale, fallbackLocale).common.serverError,
  };
};
