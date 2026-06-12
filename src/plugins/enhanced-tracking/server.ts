import type {
  ClickMetadataDisplayItem,
  ClickMetadataSearchField,
  PluginDefinition,
} from '$lib/plugin-contracts';
import { geoipConfigured } from '$lib/config';
import { collectGeoipMetadata } from '$lib/server/geoip';
import {
  normalizeEnhancedTrackingConfig,
  parseProxyHeaderMappings,
  type EnhancedTrackingConfig,
  type TrackingVisibility,
} from './config';

type ProxyHeader = {
  label: string;
  value: string;
  visibility: TrackingVisibility;
};

type EnhancedTrackingMetadata = {
  country?: {
    code: string;
    name: string;
  };
  city?: {
    name: string;
    countryCode: string;
  };
  asn?: {
    number: number;
    organization: string;
  };
  proxyHeaders?: ProxyHeader[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectProxyHeaders(request: Request, config: EnhancedTrackingConfig) {
  const values = parseProxyHeaderMappings(config.proxyHeaders)
    .map(({ label, header, visibility }) => ({
      label,
      value: request.headers.get(header)?.trim() ?? '',
      visibility,
    }))
    .filter(({ value }) => value.length > 0)
    .slice(0, 20);

  return values.length > 0 ? values : undefined;
}

function shouldCollectGeoip(config: EnhancedTrackingConfig) {
  return config.collectCountry || config.collectCity || config.collectAsn;
}

function canDisplayToViewer(
  config: EnhancedTrackingConfig,
  exposeField: keyof EnhancedTrackingConfig,
  isAdmin: boolean,
  isOwner: boolean,
) {
  return isAdmin || (config[exposeField] === true && isOwner);
}

function canDisplayProxyHeader(
  header: ProxyHeader,
  isAdmin: boolean,
  isOwner: boolean,
) {
  return isAdmin || (header.visibility === 2 && isOwner);
}

function metadataRecord(value: unknown): EnhancedTrackingMetadata {
  if (!isRecord(value)) return {};
  return value as EnhancedTrackingMetadata;
}

function formatCountry(
  country: NonNullable<EnhancedTrackingMetadata['country']>,
) {
  return country.name === country.code
    ? country.code
    : `${country.name} (${country.code})`;
}

function formatCity(city: NonNullable<EnhancedTrackingMetadata['city']>) {
  return city.countryCode ? `${city.name}, ${city.countryCode}` : city.name;
}

async function collectEnhancedTrackingMetadata(
  request: Request,
  ip: string,
  config: EnhancedTrackingConfig,
  settings: Parameters<
    NonNullable<PluginDefinition['collectClickMetadata']>
  >[0]['settings'],
) {
  const metadata: EnhancedTrackingMetadata = {};

  if (shouldCollectGeoip(config) && geoipConfigured(settings)) {
    const geoip = await collectGeoipMetadata({ request, ip, settings });
    if (config.collectCountry && geoip.country) {
      metadata.country = geoip.country;
    }
    if (config.collectCity && geoip.city) {
      metadata.city = geoip.city;
    }
    if (config.collectAsn && geoip.asn) {
      metadata.asn = geoip.asn;
    }
  }

  if (config.proxyHeadersEnabled) {
    const proxyHeaders = collectProxyHeaders(request, config);
    if (proxyHeaders) metadata.proxyHeaders = proxyHeaders;
  }

  return metadata;
}

const serverPlugin = {
  loadAdminData({ settings }) {
    return {
      geoipAvailable: geoipConfigured(settings),
    };
  },

  async collectClickMetadata({ request, ip, state, settings }) {
    const config = normalizeEnhancedTrackingConfig(state.config, {
      geoipAvailable: geoipConfigured(settings),
    });
    return collectEnhancedTrackingMetadata(request, ip, config, settings);
  },

  formatClickMetadata({ metadata, state, isAdmin, isOwner }) {
    const config = normalizeEnhancedTrackingConfig(state.config);
    const value = metadataRecord(metadata);
    const entries: ClickMetadataDisplayItem[] = [];

    if (
      value.country &&
      canDisplayToViewer(config, 'exposeCountryToUsers', isAdmin, isOwner)
    ) {
      entries.push({ label: 'Country', value: formatCountry(value.country) });
    }

    if (
      value.city &&
      canDisplayToViewer(config, 'exposeCityToUsers', isAdmin, isOwner)
    ) {
      entries.push({ label: 'City', value: formatCity(value.city) });
    }

    if (
      value.asn &&
      canDisplayToViewer(config, 'exposeAsnToUsers', isAdmin, isOwner)
    ) {
      const asnLabel =
        value.asn.number > 0
          ? `AS${value.asn.number} ${value.asn.organization}`.trim()
          : value.asn.organization;
      entries.push({
        label: 'ASN',
        value: asnLabel,
      });
    }

    for (const header of value.proxyHeaders ?? []) {
      if (canDisplayProxyHeader(header, isAdmin, isOwner)) {
        entries.push({
          label: header.label,
          value: header.value,
        });
      }
    }

    return entries;
  },

  getClickMetadataSearchFields({ state, isAdmin, isOwner }) {
    const config = normalizeEnhancedTrackingConfig(state.config);
    const fields: ClickMetadataSearchField[] = [];

    if (canDisplayToViewer(config, 'exposeCountryToUsers', isAdmin, isOwner)) {
      fields.push({
        id: 'country',
        label: 'Country',
        paths: [
          ['country', 'code'],
          ['country', 'name'],
        ],
      });
    }

    if (canDisplayToViewer(config, 'exposeCityToUsers', isAdmin, isOwner)) {
      fields.push({
        id: 'city',
        label: 'City',
        paths: [
          ['city', 'name'],
          ['city', 'countryCode'],
        ],
      });
    }

    if (canDisplayToViewer(config, 'exposeAsnToUsers', isAdmin, isOwner)) {
      fields.push({
        id: 'asn',
        label: 'ASN',
        paths: [
          ['asn', 'number'],
          ['asn', 'organization'],
        ],
      });
    }

    if (isAdmin && config.proxyHeadersEnabled) {
      fields.push({
        id: 'proxyHeaders',
        label: 'Proxy Headers',
        paths: [['proxyHeaders']],
      });
    }

    return fields;
  },
} satisfies Partial<PluginDefinition>;

export default serverPlugin;
