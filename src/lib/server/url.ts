import { env } from '$env/dynamic/private';
import type { ShortLinkDomainScheme, SiteSettings } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';

export function baseUrl(origin: string) {
  return (env.PRIVATE_BASE_URL || origin).replace(/\/$/, '');
}

function cleanOrigin(origin: string) {
  return origin.replace(/\/$/, '');
}

export function normalizeShortLinkDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
    throw new Error(serverMessage('shortLinkDomainOriginOnly'));
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed}`);
  } catch {
    throw new Error(serverMessage('shortLinkDomainInvalid'));
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(serverMessage('shortLinkDomainSchemeInvalid'));
  }
  if (!parsed.hostname) {
    throw new Error(serverMessage('shortLinkDomainHostRequired'));
  }
  if (parsed.username || parsed.password) {
    throw new Error(serverMessage('shortLinkDomainInvalid'));
  }
  if (
    (parsed.pathname && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(serverMessage('shortLinkDomainOriginOnly'));
  }

  return parsed.host.toLowerCase();
}

export function shortLinkHostnameFromOrigin(origin: string) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return normalizeShortLinkDomain(origin);
  }
}

export function normalizeShortLinkDomainScheme(
  value: unknown,
  fallback: ShortLinkDomainScheme = 'https',
): ShortLinkDomainScheme {
  const scheme = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/:$/, '');
  if (scheme === 'http' || scheme === 'https') return scheme;
  return fallback;
}

export function shortLinkDomainSchemeFromOrigin(origin: string) {
  try {
    return normalizeShortLinkDomainScheme(new URL(origin).protocol);
  } catch {
    return 'https';
  }
}

export function normalizeShortLinkDomains(values: Iterable<unknown>) {
  const domains: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeShortLinkDomain(String(value ?? ''));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    domains.push(normalized);
    if (domains.length >= 100) break;
  }

  return domains;
}

export function normalizeShortLinkDomainSettings(input: {
  defaultDomain?: string | null;
  domains?: Iterable<unknown>;
  domainSchemes?: Record<string, unknown>;
}) {
  const domains = normalizeShortLinkDomains(input.domains ?? []);
  const explicitDefault = normalizeShortLinkDomain(input.defaultDomain ?? '');
  const defaultDomain = explicitDefault || domains[0] || '';

  if (defaultDomain && !domains.includes(defaultDomain)) {
    domains.unshift(defaultDomain);
  }

  const rawSchemes = input.domainSchemes ?? {};
  const inputSchemes = Object.fromEntries(
    Object.entries(rawSchemes)
      .map(([key, value]) => {
        try {
          const domain = normalizeShortLinkDomain(key);
          return domain
            ? [domain, normalizeShortLinkDomainScheme(value)]
            : undefined;
        } catch {
          return undefined;
        }
      })
      .filter(
        (entry): entry is [string, ShortLinkDomainScheme] =>
          entry !== undefined,
      ),
  );
  const domainSchemes = Object.fromEntries(
    domains.map((domain) => [
      domain,
      inputSchemes[domain] ?? ('https' satisfies ShortLinkDomainScheme),
    ]),
  ) as Record<string, ShortLinkDomainScheme>;

  return {
    defaultDomain,
    domains,
    domainSchemes,
  };
}

export function selectedShortLinkDomain(
  value: string,
  allowedDomains: readonly string[],
  defaultDomain = '',
) {
  if (allowedDomains.length === 0) {
    throw new Error(serverMessage('shortLinkDomainNotAllowed'));
  }

  const requested = value.trim()
    ? normalizeShortLinkDomain(value)
    : defaultDomain && allowedDomains.includes(defaultDomain)
      ? defaultDomain
      : allowedDomains[0];
  if (!allowedDomains.includes(requested)) {
    throw new Error(serverMessage('shortLinkDomainNotAllowed'));
  }
  return requested;
}

export function selectedShortLinkDomainForCreate(
  value: string,
  allowedDomains: readonly string[],
  defaultDomain: string,
  configuredDomains: readonly string[],
) {
  if (configuredDomains.length > 0 && allowedDomains.length === 0) {
    throw new Error(serverMessage('shortLinkDomainNotAllowed'));
  }
  return selectedShortLinkDomain(value, allowedDomains, defaultDomain);
}

export function shortLinkDomainForOrigin(
  settings: SiteSettings,
  origin: string,
) {
  const current = shortLinkHostnameFromOrigin(origin);
  if (settings.general.domains.includes(current)) return current;
  return current;
}

export function shortLinkLookupDomain(
  settings: SiteSettings,
  value: string | null | undefined,
  origin?: string,
) {
  const raw = String(value ?? '').trim();
  if (raw) return normalizeShortLinkDomain(raw);
  if (origin) return shortLinkDomainForOrigin(settings, origin);
  return settings.general.defaultDomain || settings.general.domains[0] || '';
}

export function isDefaultShortLinkDomain(
  settings: SiteSettings,
  origin: string,
) {
  return (
    Boolean(settings.general.defaultDomain) &&
    shortLinkHostnameFromOrigin(origin) === settings.general.defaultDomain
  );
}

function baseProtocol(origin: string) {
  try {
    return new URL(baseUrl(origin)).protocol;
  } catch {
    return new URL(origin).protocol;
  }
}

function protocolForShortLinkDomain(
  domain: string,
  origin: string,
  settings?: SiteSettings,
) {
  if (!settings) return baseProtocol(origin);
  const normalized = normalizeShortLinkDomain(domain);
  return `${normalizeShortLinkDomainScheme(
    settings.general.domainSchemes[normalized],
  )}:`;
}

export function shortLinkDomainOrigin(
  domain: string,
  origin: string,
  settings?: SiteSettings,
) {
  const normalized = normalizeShortLinkDomain(domain);
  return `${protocolForShortLinkDomain(normalized, origin, settings)}//${normalized}`;
}

export function shortUrl(
  origin: string,
  code: string,
  linkDomain?: string | null,
  settings?: SiteSettings,
) {
  const shortOrigin = linkDomain
    ? shortLinkDomainOrigin(linkDomain, origin, settings)
    : baseUrl(origin);
  return `${cleanOrigin(shortOrigin)}/${code}`;
}
