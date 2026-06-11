import {
  open,
  validate,
  type AsnResponse,
  type CityResponse,
  type CountryResponse,
  type Reader,
  type Response as MaxMindResponse,
} from 'maxmind';
import type {
  ClickMetadataDisplayItem,
  ClickMetadataSearchField,
  PluginDefinition,
} from '$lib/plugin-contracts';
import {
  normalizeEnhancedTrackingConfig,
  parseProxyHeaderMappings,
  type EnhancedTrackingConfig,
  type TrackingVisibility,
} from './config';

type GeoCountry = {
  code: string;
  name: string;
};

type GeoCity = {
  name: string;
  countryCode: string;
};

type GeoAsn = {
  number: number;
  organization: string;
};

type ProxyHeader = {
  label: string;
  value: string;
  visibility: TrackingVisibility;
};

type EnhancedTrackingMetadata = {
  country?: GeoCountry;
  city?: GeoCity;
  asn?: GeoAsn;
  proxyHeaders?: ProxyHeader[];
};

const readerCache = new Map<string, Promise<Reader<MaxMindResponse>>>();
const warnedPaths = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanPath(value: string) {
  return value.trim();
}

function cleanIp(value: string) {
  const ip = value.trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

async function getReader<T extends MaxMindResponse>(path: string) {
  const filepath = cleanPath(path);
  if (!filepath) return null;

  let reader = readerCache.get(filepath);
  if (!reader) {
    reader = open<T>(filepath, {
      watchForUpdates: true,
      watchForUpdatesNonPersistent: true,
    });
    readerCache.set(filepath, reader);
  }

  try {
    return (await reader) as Reader<T>;
  } catch (error) {
    readerCache.delete(filepath);
    if (!warnedPaths.has(filepath)) {
      warnedPaths.add(filepath);
      console.warn('Failed to open GeoIP2 database.', filepath, error);
    }
    return null;
  }
}

function countryFromResponse(
  response: CityResponse | CountryResponse | null,
): GeoCountry | undefined {
  const country = response?.country ?? response?.registered_country;
  if (!country?.iso_code) return undefined;
  return {
    code: country.iso_code,
    name: country.names?.en ?? country.iso_code,
  };
}

async function collectGeoip(ip: string, config: EnhancedTrackingConfig) {
  const normalizedIp = cleanIp(ip);
  if (!validate(normalizedIp)) return {};

  const cityReader = await getReader<CityResponse>(config.cityDatabasePath);
  const countryReader =
    cityReader ||
    (await getReader<CountryResponse>(config.countryDatabasePath));
  const asnReader = await getReader<AsnResponse>(config.asnDatabasePath);
  const cityResponse = cityReader?.get(normalizedIp) ?? null;
  const countryResponse =
    cityResponse ?? countryReader?.get(normalizedIp) ?? null;
  const asnResponse = asnReader?.get(normalizedIp) ?? null;
  const metadata: EnhancedTrackingMetadata = {};

  const country = countryFromResponse(countryResponse);
  if (country) metadata.country = country;

  if (cityResponse?.city?.names?.en) {
    metadata.city = {
      name: cityResponse.city.names.en,
      countryCode: cityResponse.country?.iso_code ?? country?.code ?? '',
    };
  }

  if (asnResponse?.autonomous_system_number) {
    metadata.asn = {
      number: asnResponse.autonomous_system_number,
      organization: asnResponse.autonomous_system_organization,
    };
  }

  return metadata;
}

function headerValue(request: Request, header: string) {
  return header ? request.headers.get(header)?.trim() || '' : '';
}

function collectGeoipHeaders(request: Request, config: EnhancedTrackingConfig) {
  const countryCode = headerValue(request, config.countryCodeHeader);
  const countryName = headerValue(request, config.countryNameHeader);
  const cityName = headerValue(request, config.cityNameHeader);
  const rawAsnNumber = headerValue(request, config.asnNumberHeader);
  const asnNumber = rawAsnNumber ? Number(rawAsnNumber) : NaN;
  const asnOrganization = headerValue(request, config.asnOrganizationHeader);
  const metadata: EnhancedTrackingMetadata = {};

  if (countryCode || countryName) {
    metadata.country = {
      code: countryCode || countryName,
      name: countryName || countryCode,
    };
  }

  if (cityName) {
    metadata.city = {
      name: cityName,
      countryCode,
    };
  }

  if ((rawAsnNumber && Number.isFinite(asnNumber)) || asnOrganization) {
    metadata.asn = {
      number: rawAsnNumber && Number.isFinite(asnNumber) ? asnNumber : 0,
      organization: asnOrganization,
    };
  }

  return metadata;
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

function canDisplay(
  config: EnhancedTrackingConfig,
  showField: keyof EnhancedTrackingConfig,
  exposeField: keyof EnhancedTrackingConfig,
  isAdmin: boolean,
  isOwner: boolean,
) {
  return (
    config[showField] === true &&
    (isAdmin || (config[exposeField] === true && isOwner))
  );
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

function formatCountry(country: GeoCountry) {
  return country.name === country.code
    ? country.code
    : `${country.name} (${country.code})`;
}

function formatCity(city: GeoCity) {
  return city.countryCode ? `${city.name}, ${city.countryCode}` : city.name;
}

const serverPlugin = {
  async collectClickMetadata({ request, ip, state }) {
    const config = normalizeEnhancedTrackingConfig(state.config);
    const metadata: EnhancedTrackingMetadata = {};

    if (config.geoipHeadersEnabled) {
      Object.assign(metadata, collectGeoipHeaders(request, config));
    } else if (config.geoipEnabled) {
      Object.assign(metadata, await collectGeoip(ip, config));
    }

    if (config.proxyHeadersEnabled) {
      const proxyHeaders = collectProxyHeaders(request, config);
      if (proxyHeaders) metadata.proxyHeaders = proxyHeaders;
    }

    return metadata;
  },

  formatClickMetadata({ metadata, state, isAdmin, isOwner }) {
    const config = normalizeEnhancedTrackingConfig(state.config);
    const value = metadataRecord(metadata);
    const entries: ClickMetadataDisplayItem[] = [];

    if (
      value.country &&
      canDisplay(
        config,
        'showCountry',
        'exposeCountryToUsers',
        isAdmin,
        isOwner,
      )
    ) {
      entries.push({ label: 'Country', value: formatCountry(value.country) });
    }

    if (
      value.city &&
      canDisplay(config, 'showCity', 'exposeCityToUsers', isAdmin, isOwner)
    ) {
      entries.push({ label: 'City', value: formatCity(value.city) });
    }

    if (
      value.asn &&
      canDisplay(config, 'showAsn', 'exposeAsnToUsers', isAdmin, isOwner)
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

    if (
      canDisplay(
        config,
        'showCountry',
        'exposeCountryToUsers',
        isAdmin,
        isOwner,
      )
    ) {
      fields.push({
        id: 'country',
        label: 'Country',
        paths: [
          ['country', 'code'],
          ['country', 'name'],
        ],
      });
    }

    if (canDisplay(config, 'showCity', 'exposeCityToUsers', isAdmin, isOwner)) {
      fields.push({
        id: 'city',
        label: 'City',
        paths: [
          ['city', 'name'],
          ['city', 'countryCode'],
        ],
      });
    }

    if (canDisplay(config, 'showAsn', 'exposeAsnToUsers', isAdmin, isOwner)) {
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
