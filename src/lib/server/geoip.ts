import {
  open,
  validate,
  type AsnResponse,
  type CityResponse,
  type CountryResponse,
  type Reader,
  type Response as MaxMindResponse,
} from 'maxmind';
import { geoipSettingsConfigured, type SiteSettings } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';
import { isHttpHeaderName } from '$lib/delimited';

export type GeoCountry = {
  code: string;
  name: string;
};

export type GeoCity = {
  name: string;
  countryCode: string;
};

export type GeoAsn = {
  number: number;
  organization: string;
};

export type GeoipMetadata = {
  country?: GeoCountry;
  city?: GeoCity;
  asn?: GeoAsn;
};

const readerCache = new Map<string, Promise<Reader<MaxMindResponse>>>();
const warnedPaths = new Set<string>();

function cleanPath(value: string) {
  return value.trim();
}

function cleanIp(value: string) {
  const ip = value.trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function headerValue(request: Request, header: string) {
  return header ? request.headers.get(header)?.trim() || '' : '';
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

export function geoipMetadataForRules(metadata: GeoipMetadata) {
  return {
    geoCountryCode: metadata.country?.code ?? '',
    geoCountryName: metadata.country?.name ?? '',
    geoCityName: metadata.city?.name ?? '',
  };
}

function collectGeoipHeaders(
  request: Request,
  settings: SiteSettings['network']['geoip'],
) {
  const countryCode = headerValue(request, settings.countryCodeHeader);
  const countryName = headerValue(request, settings.countryNameHeader);
  const cityName = headerValue(request, settings.cityNameHeader);
  const rawAsnNumber = headerValue(request, settings.asnNumberHeader);
  const asnNumber = rawAsnNumber ? Number(rawAsnNumber) : NaN;
  const asnOrganization = headerValue(request, settings.asnOrganizationHeader);
  const metadata: GeoipMetadata = {};

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

async function collectMaxmindGeoip(
  ip: string,
  settings: SiteSettings['network']['geoip'],
) {
  const normalizedIp = cleanIp(ip);
  if (!validate(normalizedIp)) return {};

  const cityReader = settings.cityDatabasePath
    ? await getReader<CityResponse>(settings.cityDatabasePath)
    : null;
  const countryReader =
    cityReader ||
    (settings.countryDatabasePath
      ? await getReader<CountryResponse>(settings.countryDatabasePath)
      : null);
  const asnReader = settings.asnDatabasePath
    ? await getReader<AsnResponse>(settings.asnDatabasePath)
    : null;
  const cityResponse = cityReader?.get(normalizedIp) ?? null;
  const countryResponse =
    cityResponse ?? countryReader?.get(normalizedIp) ?? null;
  const asnResponse = asnReader?.get(normalizedIp) ?? null;
  const metadata: GeoipMetadata = {};

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

export async function collectGeoipMetadata(input: {
  request: Request;
  ip: string;
  settings: SiteSettings;
}) {
  const geoip = input.settings.network.geoip;
  if (!geoipSettingsConfigured(geoip)) return {};

  if (geoip.headersEnabled) {
    return collectGeoipHeaders(input.request, geoip);
  }

  if (geoip.maxmindEnabled) {
    return collectMaxmindGeoip(input.ip, geoip);
  }

  return {};
}

export function validateGeoipSettings(
  settings: SiteSettings['network']['geoip'],
) {
  for (const [label, header] of [
    ['countryCodeHeader', settings.countryCodeHeader],
    ['countryNameHeader', settings.countryNameHeader],
    ['cityNameHeader', settings.cityNameHeader],
    ['asnNumberHeader', settings.asnNumberHeader],
    ['asnOrganizationHeader', settings.asnOrganizationHeader],
  ] as const) {
    if (header && !isHttpHeaderName(header)) {
      throw new Error(serverMessage('httpHeaderNameInvalid', { label }));
    }
  }
}
