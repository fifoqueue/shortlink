import type { Handle, HandleServerError } from '@sveltejs/kit';
import {
  localeCookieName,
  localeFromMetadata,
  localizedSettings,
} from '$lib/i18n';
import { uiText } from '$lib/i18n/ui-text';
import {
  defaultSiteLocale,
  type SiteLocale,
  type SiteSettings,
} from '$lib/config';
import { setClickMetadataCollector } from '$lib/server/click-queue';
import {
  applyClientHintResponseHeaders,
  shouldApplyClientHintResponseHeaders,
} from '$lib/server/client-hints';
import { getClientIp } from '$lib/server/client-ip';
import {
  getSettings,
  invalidateSettingsCache,
  setPluginStateNormalizer,
} from '$lib/server/settings';
import {
  isDefaultShortLinkDomain,
  shortLinkHostnameFromOrigin,
  shortLinkDomainOrigin,
} from '$lib/server/url';
import { getPluginUser } from './plugins/auth-registry';
import {
  collectClickMetadataPlugins,
  hasEnabledRequestPlugin,
  handleRequestPlugins,
  normalizePluginStates,
  refreshRuntimePlugins,
} from './plugins/server';

setPluginStateNormalizer(normalizePluginStates);
setClickMetadataCollector(collectClickMetadataPlugins);

const appRouteSegments = new Set([
  '_app',
  'account',
  'admin',
  'api',
  'assets',
  'auth',
  'favicon.ico',
  'favicon.svg',
  'language',
  'login',
  'logout',
  'privacy',
  'robots.txt',
  'runtime-plugins',
  'signup',
  'sitemap.xml',
  'terms',
]);
const localizedSettingsCache = new WeakMap<
  SiteSettings,
  Map<SiteLocale, SiteSettings>
>();

function cachedLocalizedSettings(settings: SiteSettings, locale: SiteLocale) {
  const localeCache = localizedSettingsCache.get(settings) ?? new Map();
  const cached = localeCache.get(locale);
  if (cached) return cached;

  const value = localizedSettings(settings, locale);
  localeCache.set(locale, value);
  localizedSettingsCache.set(settings, localeCache);
  return value;
}

function decodedPathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function staticAssetPath(pathname: string) {
  const lastSegment = pathname.split('/').pop() ?? '';
  return (
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/assets/') ||
    /\.[A-Za-z0-9]{2,8}$/.test(lastSegment)
  );
}

function shortLinkCodeFromPath(pathname: string) {
  if (staticAssetPath(pathname)) return null;
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('/')) return null;
  const segment = decodedPathSegment(trimmed);
  if (appRouteSegments.has(segment.toLowerCase())) return null;
  return /^[A-Za-z0-9_-]+$/.test(segment) ? segment : null;
}

function requestOrigin(url: URL, headers: Headers) {
  const host = headers.get('host')?.split(',')[0]?.trim();
  if (!host) return url.origin;
  try {
    return `${url.protocol}//${shortLinkHostnameFromOrigin(host)}`;
  } catch {
    return url.origin;
  }
}

function defaultDomainRedirect(
  settings: Awaited<ReturnType<typeof getSettings>>,
  url: URL,
  origin: string,
  staticAsset: boolean,
  shortLinkCode: string | null,
) {
  if (!settings.general.defaultDomain) return null;
  if (isDefaultShortLinkDomain(settings, origin)) return null;
  if (staticAsset) return null;
  if (shortLinkCode) return null;

  const target = new URL(
    `${url.pathname}${url.search}`,
    shortLinkDomainOrigin(settings.general.defaultDomain, origin, settings),
  );
  return Response.redirect(target, 302);
}

export const handle: Handle = async ({ event, resolve }) => {
  if (await refreshRuntimePlugins()) {
    invalidateSettingsCache({ redis: true, publish: true });
  }
  const settings = await getSettings();
  const origin = requestOrigin(event.url, event.request.headers);
  const locale = localeFromMetadata({
    acceptLanguage: event.request.headers.get('accept-language'),
    cookieLocale: event.cookies.get(localeCookieName),
    fallbackLocale: settings.i18n.defaultLocale,
  });
  const staticAsset = staticAssetPath(event.url.pathname);
  const shortLinkCode = shortLinkCodeFromPath(event.url.pathname);
  const hasRequestPlugins = hasEnabledRequestPlugin(settings.plugins);
  const shouldLoadUser = hasRequestPlugins || (!staticAsset && !shortLinkCode);
  event.locals.settings = settings;
  event.locals.requestOrigin = origin;
  event.locals.locale = locale;
  event.locals.localizedSettings = cachedLocalizedSettings(settings, locale);
  const redirectResponse = defaultDomainRedirect(
    settings,
    event.url,
    origin,
    staticAsset,
    shortLinkCode,
  );
  if (redirectResponse) return redirectResponse;
  event.locals.user = shouldLoadUser
    ? await getPluginUser(event.cookies, settings.plugins)
    : null;
  event.locals.isAdmin = event.locals.user?.isAdmin === true;
  const pluginResponse = hasRequestPlugins
    ? await handleRequestPlugins({
        event,
        states: settings.plugins,
        user: event.locals.user,
        isAdmin: event.locals.isAdmin,
        ip: getClientIp(
          event.request,
          event.getClientAddress,
          settings.network.trustProxyHeaders,
          settings.network.proxyIpHeaders,
        ),
      })
    : null;
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
