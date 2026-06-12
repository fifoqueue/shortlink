import type { PluginConfig } from '$lib/plugin-contracts';
import { serverMessage } from '$lib/i18n/ui-text';
import { isHttpHeaderName, parseDelimitedLines } from '../utils';

export type TrackingVisibility = 1 | 2;

export interface ProxyHeaderMapping extends Record<string, unknown> {
  label: string;
  header: string;
  visibility: TrackingVisibility;
}

export interface EnhancedTrackingConfig extends Record<string, unknown> {
  geoipEnabled: boolean;
  geoipHeadersEnabled: boolean;
  cityDatabasePath: string;
  countryDatabasePath: string;
  asnDatabasePath: string;
  countryCodeHeader: string;
  countryNameHeader: string;
  cityNameHeader: string;
  asnNumberHeader: string;
  asnOrganizationHeader: string;
  proxyHeadersEnabled: boolean;
  proxyHeaders: string;
  collectCountry: boolean;
  exposeCountryToUsers: boolean;
  collectCity: boolean;
  exposeCityToUsers: boolean;
  collectAsn: boolean;
  exposeAsnToUsers: boolean;
}

export const defaultProxyHeaders = [
  'JA3 | X-SSL-Fingerprint-JA3 | 1',
  'JA3 Hash | X-SSL-Fingerprint-JA3-Hash | 1',
  'JA4 | X-SSL-Fingerprint-JA4 | 1',
  'Client Region | X-Client-Region | 2',
].join('\n');

export const defaultEnhancedTrackingConfig: EnhancedTrackingConfig = {
  geoipEnabled: false,
  geoipHeadersEnabled: false,
  cityDatabasePath: '',
  countryDatabasePath: '',
  asnDatabasePath: '',
  countryCodeHeader: 'X-GeoIP-Country-Code',
  countryNameHeader: 'X-GeoIP-Country-Name',
  cityNameHeader: 'X-GeoIP-City',
  asnNumberHeader: 'X-GeoIP-ASN',
  asnOrganizationHeader: 'X-GeoIP-ASN-Organization',
  proxyHeadersEnabled: false,
  proxyHeaders: defaultProxyHeaders,
  collectCountry: true,
  exposeCountryToUsers: false,
  collectCity: true,
  exposeCityToUsers: false,
  collectAsn: true,
  exposeAsnToUsers: false,
};

function stringConfig(config: PluginConfig, field: string) {
  const value = config[field];
  return typeof value === 'string' ? value : '';
}

function booleanConfig(config: PluginConfig, field: string, fallback = false) {
  const value = config[field];
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeEnhancedTrackingConfig(
  config: PluginConfig,
): EnhancedTrackingConfig {
  return {
    geoipEnabled: booleanConfig(config, 'geoipEnabled'),
    geoipHeadersEnabled: booleanConfig(config, 'geoipHeadersEnabled'),
    cityDatabasePath: stringConfig(config, 'cityDatabasePath'),
    countryDatabasePath: stringConfig(config, 'countryDatabasePath'),
    asnDatabasePath: stringConfig(config, 'asnDatabasePath'),
    countryCodeHeader:
      stringConfig(config, 'countryCodeHeader') ||
      defaultEnhancedTrackingConfig.countryCodeHeader,
    countryNameHeader:
      stringConfig(config, 'countryNameHeader') ||
      defaultEnhancedTrackingConfig.countryNameHeader,
    cityNameHeader:
      stringConfig(config, 'cityNameHeader') ||
      defaultEnhancedTrackingConfig.cityNameHeader,
    asnNumberHeader:
      stringConfig(config, 'asnNumberHeader') ||
      defaultEnhancedTrackingConfig.asnNumberHeader,
    asnOrganizationHeader:
      stringConfig(config, 'asnOrganizationHeader') ||
      defaultEnhancedTrackingConfig.asnOrganizationHeader,
    proxyHeadersEnabled: booleanConfig(config, 'proxyHeadersEnabled'),
    proxyHeaders: stringConfig(config, 'proxyHeaders') || defaultProxyHeaders,
    collectCountry: booleanConfig(config, 'collectCountry', true),
    exposeCountryToUsers: booleanConfig(config, 'exposeCountryToUsers'),
    collectCity: booleanConfig(config, 'collectCity', true),
    exposeCityToUsers: booleanConfig(config, 'exposeCityToUsers'),
    collectAsn: booleanConfig(config, 'collectAsn', true),
    exposeAsnToUsers: booleanConfig(config, 'exposeAsnToUsers'),
  };
}

export function parseProxyHeaderMappings(value: string) {
  return parseDelimitedLines<ProxyHeaderMapping>(
    value,
    [
      {
        key: 'label',
        label: 'display name',
        transform: (label) => label.slice(0, 80),
      },
      {
        key: 'header',
        label: 'header name',
        validate: isHttpHeaderName,
      },
      {
        key: 'visibility',
        label: 'visibility',
        validate: (visibility) => ['1', '2'].includes(visibility),
        transform: (visibility) => (Number(visibility) === 2 ? 2 : 1),
      },
    ],
    { description: 'proxy headers', maxRows: 30 },
  );
}

export function validateGeoipHeaderConfig(config: EnhancedTrackingConfig) {
  if (!config.geoipHeadersEnabled) return;

  for (const [label, header] of [
    ['countryCodeHeader', config.countryCodeHeader],
    ['countryNameHeader', config.countryNameHeader],
    ['cityNameHeader', config.cityNameHeader],
    ['asnNumberHeader', config.asnNumberHeader],
    ['asnOrganizationHeader', config.asnOrganizationHeader],
  ] as const) {
    if (header && !isHttpHeaderName(header)) {
      throw new Error(serverMessage('httpHeaderNameInvalid', { label }));
    }
  }
}
