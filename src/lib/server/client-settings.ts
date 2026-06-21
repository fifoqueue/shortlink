import type { SiteSettings } from '$lib/config';

function adminPluginStatesForClient(settings: SiteSettings['plugins']) {
  return Object.fromEntries(
    Object.entries(settings).map(([id, state]) => [
      id,
      {
        enabled: state.enabled,
        config: {},
      },
    ]),
  );
}

export function adminClientSettings(settings: SiteSettings): SiteSettings {
  const clientSettings = structuredClone(settings);
  const email = clientSettings.auth.emailVerification;

  email.smtp.password = '';
  email.http.authorizationHeader = '';
  email.http.basicPassword = '';
  email.http.authHeaders = '';

  clientSettings.security.webActionGuard.bypassTokenHash = clientSettings
    .security.webActionGuard.bypassTokenHash
    ? 'configured'
    : '';

  clientSettings.network.geoip.cityDatabasePath = '';
  clientSettings.network.geoip.countryDatabasePath = '';
  clientSettings.network.geoip.asnDatabasePath = '';
  clientSettings.network.outboundProxy.url = '';
  clientSettings.plugins = adminPluginStatesForClient(settings.plugins);

  return clientSettings;
}
