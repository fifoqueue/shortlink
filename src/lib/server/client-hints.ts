const USER_AGENT_CLIENT_HINT_HEADERS = [
  'Sec-CH-UA',
  'Sec-CH-UA-Arch',
  'Sec-CH-UA-Bitness',
  'Sec-CH-UA-Full-Version',
  'Sec-CH-UA-Full-Version-List',
  'Sec-CH-UA-Mobile',
  'Sec-CH-UA-Model',
  'Sec-CH-UA-Platform',
  'Sec-CH-UA-Platform-Version',
  'Sec-CH-UA-WoW64',
  'Sec-CH-UA-Form-Factors',
] as const;

const DEVICE_CLIENT_HINT_HEADERS = [
  'Device-Memory',
  'DPR',
  'Width',
  'Viewport-Width',
  'Downlink',
  'ECT',
  'RTT',
  'Save-Data',
] as const;

const PREFERENCE_CLIENT_HINT_HEADERS = [
  'Sec-CH-Forced-Colors',
  'Sec-CH-Prefers-Color-Scheme',
  'Sec-CH-Prefers-Contrast',
  'Sec-CH-Prefers-Reduced-Data',
  'Sec-CH-Prefers-Reduced-Motion',
  'Sec-CH-Prefers-Reduced-Transparency',
] as const;

export const CLIENT_HINT_HEADERS = [
  ...USER_AGENT_CLIENT_HINT_HEADERS,
  ...DEVICE_CLIENT_HINT_HEADERS,
  ...PREFERENCE_CLIENT_HINT_HEADERS,
] as const;

const CLIENT_HINT_PERMISSION_DIRECTIVES = [
  'ch-ua',
  'ch-ua-arch',
  'ch-ua-bitness',
  'ch-ua-full-version',
  'ch-ua-full-version-list',
  'ch-ua-mobile',
  'ch-ua-model',
  'ch-ua-platform',
  'ch-ua-platform-version',
  'ch-ua-wow64',
  'ch-ua-form-factors',
  'ch-device-memory',
  'ch-dpr',
  'ch-width',
  'ch-viewport-width',
  'ch-downlink',
  'ch-ect',
  'ch-rtt',
  'ch-save-data',
  'ch-forced-colors',
  'ch-prefers-color-scheme',
  'ch-prefers-contrast',
  'ch-prefers-reduced-data',
  'ch-prefers-reduced-motion',
  'ch-prefers-reduced-transparency',
] as const;

type ClientHintHeader = (typeof CLIENT_HINT_HEADERS)[number];

function appendHeaderValues(headers: Headers, name: string, values: string[]) {
  const existing = headers
    .get(name)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const merged = new Set([...(existing ?? []), ...values]);
  headers.set(name, [...merged].join(', '));
}

export function applyClientHintResponseHeaders(headers: Headers) {
  try {
    appendHeaderValues(headers, 'Accept-CH', [...CLIENT_HINT_HEADERS]);
    appendHeaderValues(headers, 'Critical-CH', [
      'Sec-CH-UA',
      'Sec-CH-UA-Mobile',
      'Sec-CH-UA-Platform',
      'Sec-CH-UA-Full-Version-List',
    ]);
    appendHeaderValues(headers, 'Permissions-Policy', [
      ...CLIENT_HINT_PERMISSION_DIRECTIVES.map(
        (directive) => `${directive}=(self)`,
      ),
    ]);
    appendHeaderValues(headers, 'Vary', [...CLIENT_HINT_HEADERS]);
  } catch {
    // Some externally constructed responses can have immutable headers.
  }
}

export function shouldApplyClientHintResponseHeaders(pathname: string) {
  if (
    pathname === '/robots.txt' ||
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/')
  ) {
    return false;
  }

  return true;
}

export function clientHintsFromHeaders(headers: Headers) {
  const hints: Partial<Record<ClientHintHeader, string>> = {};
  for (const header of CLIENT_HINT_HEADERS) {
    const value = headers.get(header)?.trim();
    if (value) hints[header] = value.slice(0, 500);
  }
  return hints;
}

function clientHintsFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.clientHints;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const hints: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') hints[key.toLowerCase()] = raw;
  }
  return hints;
}

function hintValue(hints: Record<string, string>, header: ClientHintHeader) {
  return hints[header.toLowerCase()]?.trim() ?? '';
}

function brandEntries(value: string) {
  const entries: Array<{ brand: string; version: string }> = [];
  const pattern = /"([^"]+)";\s*v="([^"]*)"/g;
  for (const match of value.matchAll(pattern)) {
    entries.push({ brand: match[1], version: match[2] });
  }
  return entries;
}

function brandLabel(brand: string) {
  const normalized = brand.toLowerCase();
  if (normalized.includes('microsoft edge')) return 'Edge';
  if (normalized.includes('google chrome')) return 'Chrome';
  if (normalized.includes('samsung internet')) return 'Samsung Internet';
  if (normalized.includes('opera')) return 'Opera';
  if (normalized.includes('brave')) return 'Brave';
  if (normalized.includes('firefox')) return 'Firefox';
  if (normalized.includes('safari')) return 'Safari';
  if (normalized.includes('chromium')) return 'Chromium';
  return '';
}

function browserLabelFromBrands(value: string) {
  const entries = brandEntries(value).filter(
    (entry) => !/not|brand/i.test(entry.brand),
  );
  for (const entry of entries) {
    const label = brandLabel(entry.brand);
    if (label) return label;
  }
  return '';
}

export function browserLabelFromClientHints(
  metadata: Record<string, unknown>,
): string | null {
  const hints = clientHintsFromMetadata(metadata);
  const label =
    browserLabelFromBrands(hintValue(hints, 'Sec-CH-UA-Full-Version-List')) ||
    browserLabelFromBrands(hintValue(hints, 'Sec-CH-UA'));
  if (!label) return null;

  const mobile = hintValue(hints, 'Sec-CH-UA-Mobile') === '?1';
  if (
    mobile &&
    ['Chrome', 'Chromium', 'Edge', 'Firefox', 'Opera', 'Safari'].includes(label)
  ) {
    return `${label} Mobile`;
  }
  return label;
}
