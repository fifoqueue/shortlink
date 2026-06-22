import type { SiteLocale, SiteSettings } from '$lib/config';
import { localizeServerMessage } from '$lib/i18n/ui-text';
import { getClientIp } from '$lib/server/client-ip';
import { getAuthLoginMethods } from '../../plugins/auth-registry';

export function passwordLoginEnabled(
  settings: SiteSettings,
  locale: SiteLocale = settings.i18n.defaultLocale,
  allowedProviders?: readonly string[] | null,
) {
  return getAuthLoginMethods(
    settings.plugins,
    locale,
    settings.i18n.defaultLocale,
    allowedProviders,
  ).some((method) => method.type === 'password');
}

export function publicAuthPageData(settings: SiteSettings, locals: App.Locals) {
  const displaySettings = locals.localizedSettings ?? settings;
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
  };
}

export function localizedAuthMessage(
  settings: SiteSettings,
  locale: SiteLocale,
  key: string,
) {
  return localizeServerMessage(locale, key, settings.i18n.defaultLocale);
}

export function requestClientIp(
  settings: SiteSettings,
  request: Request,
  getClientAddress: () => string,
) {
  return getClientIp(
    request,
    getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
}
