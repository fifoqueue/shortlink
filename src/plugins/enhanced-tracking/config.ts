import type { PluginConfig } from '$lib/plugin-contracts';
import { isHttpHeaderName, parseDelimitedLines } from '../utils';

export type TrackingVisibility = 1 | 2;

export interface ProxyHeaderMapping extends Record<string, unknown> {
  label: string;
  header: string;
  visibility: TrackingVisibility;
}

export interface EnhancedTrackingConfig extends Record<string, unknown> {
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
  input: { geoipAvailable?: boolean } = {},
): EnhancedTrackingConfig {
  const geoipAvailable = input.geoipAvailable !== false;
  return {
    proxyHeadersEnabled: booleanConfig(config, 'proxyHeadersEnabled'),
    proxyHeaders: stringConfig(config, 'proxyHeaders') || defaultProxyHeaders,
    collectCountry:
      geoipAvailable && booleanConfig(config, 'collectCountry', true),
    exposeCountryToUsers: booleanConfig(config, 'exposeCountryToUsers'),
    collectCity: geoipAvailable && booleanConfig(config, 'collectCity', true),
    exposeCityToUsers: booleanConfig(config, 'exposeCityToUsers'),
    collectAsn: geoipAvailable && booleanConfig(config, 'collectAsn', true),
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
