import type { PluginState } from '$lib/plugin-contracts';

export type ThemePreset = 'emerald' | 'ocean' | 'violet' | 'sunset' | 'mono';
export type ColorMode = 'light' | 'dark' | 'system';
export type RedirectStatus = 301 | 302 | 307 | 308;
export type ShortLinkDomainScheme = 'http' | 'https';
export type EmailProvider = 'smtp' | 'http';
export type EmailHttpMethod = 'POST' | 'PUT' | 'PATCH';
export type EmailHttpAuthMode = 'none' | 'authorization' | 'basic' | 'headers';
export const siteLocaleKeys = ['ko', 'en'] as const;
export type SiteLocale = (typeof siteLocaleKeys)[number];
export const defaultSiteLocale = siteLocaleKeys[0];
export const siteLocaleNames: Record<string, string> = {
  ko: '한국어',
  en: 'English',
};

export function siteLocaleLabel(locale: string) {
  return siteLocaleNames[locale] ?? locale;
}

export const redirectRuleConditionKeys = [
  'redirectRuleDevice',
  'redirectRuleLanguage',
  'redirectRuleQuery',
  'redirectRuleIp',
  'redirectRuleGeo',
  'redirectRulePercentage',
] as const;
export type RedirectRuleConditionKey =
  (typeof redirectRuleConditionKeys)[number];

const redirectRuleConditionKeySet = new Set<string>(redirectRuleConditionKeys);

export function isRedirectRuleConditionKey(
  key: string,
): key is RedirectRuleConditionKey {
  return redirectRuleConditionKeySet.has(key);
}

export const linkOptionKeys = [
  'customCode',
  'previewTitle',
  'previewDescription',
  'previewImageUrl',
  'themeColor',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'expiresAt',
  'maxClicks',
  'password',
  'tags',
  'redirectRules',
  ...redirectRuleConditionKeys,
] as const;
export type LinkOptionKey = (typeof linkOptionKeys)[number];
export const linkedLinkOptionKeyPairs: readonly (readonly [
  LinkOptionKey,
  LinkOptionKey,
])[] = [];
export const linkEditFieldKeys = [
  'url',
  'previewTitle',
  'previewDescription',
  'previewImageUrl',
  'themeColor',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'expiresAt',
  'maxClicks',
  'password',
  'tags',
  'redirectRules',
  ...redirectRuleConditionKeys,
] as const;
export type LinkEditFieldKey = (typeof linkEditFieldKeys)[number];
export const linkedLinkEditFieldPairs: readonly (readonly [
  LinkEditFieldKey,
  LinkEditFieldKey,
])[] = [];

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  primaryContrast: string;
  border: string;
  radius: number;
  fontFamily: string;
}

export interface LocalizedSiteContent {
  general: {
    siteName: string;
    eyebrow: string;
    headline: string;
    description: string;
    footerText: string;
  };
  seo: {
    title: string;
    description: string;
  };
  legal: {
    termsTitle: string;
    termsContent: string;
    privacyTitle: string;
    privacyContent: string;
  };
}

export interface SiteSettings {
  access: {
    visibility: 'private' | 'public';
  };
  network: {
    trustProxyHeaders: boolean;
    proxyIpHeaders: string[];
    geoip: {
      enabled: boolean;
      headersEnabled: boolean;
      maxmindEnabled: boolean;
      cityDatabasePath: string;
      countryDatabasePath: string;
      asnDatabasePath: string;
      countryCodeHeader: string;
      countryNameHeader: string;
      cityNameHeader: string;
      asnNumberHeader: string;
      asnOrganizationHeader: string;
    };
    outboundProxy: {
      enabled: boolean;
      url: string;
    };
  };
  general: {
    siteName: string;
    eyebrow: string;
    headline: string;
    description: string;
    logoUrl: string;
    faviconUrl: string;
    defaultDomain: string;
    domains: string[];
    domainSchemes: Record<string, ShortLinkDomainScheme>;
    language: string;
    footerText: string;
  };
  seo: {
    title: string;
    description: string;
    ogImageUrl: string;
    indexable: boolean;
    robotsTxt: string;
    customHead: string;
  };
  legal: {
    termsTitle: string;
    termsContent: string;
    privacyTitle: string;
    privacyContent: string;
  };
  i18n: {
    defaultLocale: SiteLocale;
    locales: Record<SiteLocale, LocalizedSiteContent>;
  };
  links: {
    allowCreate: boolean;
    allowCustomCodes: boolean;
    options: Record<LinkOptionKey, boolean>;
    codeMinLength: number;
    codeMaxLength: number;
    generatedCodeLength: number;
    allowedDomains: string[];
    allowUserDelete: boolean;
    userDeleteMaxClicks: number;
    editOwn: boolean;
    viewAll: boolean;
    editAll: boolean;
    deleteAll: boolean;
    statsAll: boolean;
    statsCsv: boolean;
    healthAll: boolean;
    editableFields: LinkEditFieldKey[];
    trackClicks: boolean;
    redirectStatus: RedirectStatus;
    stripUrlHash: boolean;
    allowedSchemes: string[];
    blockedHosts: string[];
  };
  api: {
    enabled: boolean;
    allowCreate: boolean;
    allowList: boolean;
    allowStats: boolean;
    allowDelete: boolean;
    allowUpdate: boolean;
  };
  auth: {
    registration: {
      enabled: boolean;
    };
    password: {
      minLength: number;
      requireLetters: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    emailVerification: {
      enabled: boolean;
      provider: EmailProvider;
      tokenTtlHours: number;
      timeoutMs: number;
      fromEmail: string;
      fromName: string;
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password: string;
      };
      http: {
        endpoint: string;
        method: EmailHttpMethod;
        authMode: EmailHttpAuthMode;
        authorizationHeader: string;
        basicUsername: string;
        basicPassword: string;
        authHeaders: string;
        headers: string;
      };
    };
  };
  theme: {
    preset: ThemePreset;
    mode: ColorMode;
    customTokens: ThemeTokens;
  };
  plugins: Record<string, PluginState>;
}

export const defaultFontFamily =
  "'NanumSquare_ac', ui-sans-serif, system-ui, sans-serif";

export const defaultProxyIpHeaders = [
  'Forwarded',
  'X-Forwarded-For',
  'X-Real-IP',
  'CF-Connecting-IP',
  'True-Client-IP',
];

export const defaultGeoipSettings: SiteSettings['network']['geoip'] = {
  enabled: false,
  headersEnabled: false,
  maxmindEnabled: false,
  cityDatabasePath: '',
  countryDatabasePath: '',
  asnDatabasePath: '',
  countryCodeHeader: 'X-GeoIP-Country-Code',
  countryNameHeader: 'X-GeoIP-Country-Name',
  cityNameHeader: 'X-GeoIP-City',
  asnNumberHeader: 'X-GeoIP-ASN',
  asnOrganizationHeader: 'X-GeoIP-ASN-Organization',
};

export const defaultOutboundProxySettings: SiteSettings['network']['outboundProxy'] =
  {
    enabled: false,
    url: '',
  };

export function geoipSettingsConfigured(
  settings: SiteSettings['network']['geoip'],
) {
  if (!settings.enabled) return false;
  if (settings.headersEnabled) return true;
  return (
    settings.maxmindEnabled &&
    Boolean(
      settings.cityDatabasePath ||
      settings.countryDatabasePath ||
      settings.asnDatabasePath,
    )
  );
}

export function geoipConfigured(settings: SiteSettings) {
  return geoipSettingsConfigured(settings.network.geoip);
}

export const defaultLocalizedContent: Record<string, LocalizedSiteContent> = {
  ko: {
    general: {
      siteName: 'Shortlink',
      eyebrow: 'Simple links, clear insights',
      headline: '긴 링크를 짧고 기억하기 쉽게.',
      description:
        '빠르게 공유하고, 클릭 흐름을 확인할 수 있는 나만의 단축 링크 서비스입니다.',
      footerText: 'Shortlink',
    },
    seo: {
      title: 'Shortlink',
      description: '빠르고 간단한 단축 링크 서비스',
    },
    legal: {
      termsTitle: '이용 약관',
      termsContent: '관리자가 아직 이용 약관을 설정하지 않았습니다.',
      privacyTitle: '개인정보 처리방침',
      privacyContent: '관리자가 아직 개인정보 처리방침을 설정하지 않았습니다.',
    },
  },
  en: {
    general: {
      siteName: 'Shortlink',
      eyebrow: 'Simple links, clear insights',
      headline: 'Short links that are easy to remember.',
      description:
        'Create shareable links and understand click activity in one place.',
      footerText: 'Shortlink',
    },
    seo: {
      title: 'Shortlink',
      description: 'A fast and simple short link service',
    },
    legal: {
      termsTitle: 'Terms of Service',
      termsContent:
        'The administrator has not configured the terms of service yet.',
      privacyTitle: 'Privacy Policy',
      privacyContent:
        'The administrator has not configured the privacy policy yet.',
    },
  },
};

export function defaultLocalizedContentFor(
  locale: SiteLocale,
): LocalizedSiteContent {
  const content =
    defaultLocalizedContent[locale] ??
    defaultLocalizedContent[defaultSiteLocale];
  if (!content) {
    throw new Error('At least one default locale must be configured.');
  }
  return content;
}

const defaultSiteContent = defaultLocalizedContentFor(defaultSiteLocale);

export const themePresets: Record<ThemePreset, ThemeTokens> = {
  emerald: {
    background: '#f4f7f3',
    surface: '#ffffff',
    text: '#14211a',
    muted: '#65736b',
    primary: '#1f7a4d',
    primaryContrast: '#ffffff',
    border: '#dce5df',
    radius: 22,
    fontFamily: defaultFontFamily,
  },
  ocean: {
    background: '#f2f7fb',
    surface: '#ffffff',
    text: '#10243a',
    muted: '#60758a',
    primary: '#146ca4',
    primaryContrast: '#ffffff',
    border: '#d7e4ee',
    radius: 18,
    fontFamily: defaultFontFamily,
  },
  violet: {
    background: '#f8f5fc',
    surface: '#ffffff',
    text: '#281d38',
    muted: '#766887',
    primary: '#7950b2',
    primaryContrast: '#ffffff',
    border: '#e6ddef',
    radius: 26,
    fontFamily: defaultFontFamily,
  },
  sunset: {
    background: '#fff7f1',
    surface: '#ffffff',
    text: '#302019',
    muted: '#806b60',
    primary: '#c55735',
    primaryContrast: '#ffffff',
    border: '#f0ddd3',
    radius: 14,
    fontFamily: defaultFontFamily,
  },
  mono: {
    background: '#f5f5f5',
    surface: '#ffffff',
    text: '#171717',
    muted: '#737373',
    primary: '#171717',
    primaryContrast: '#ffffff',
    border: '#d4d4d4',
    radius: 8,
    fontFamily: defaultFontFamily,
  },
};

export const defaultSettings: SiteSettings = {
  access: {
    visibility: 'private',
  },
  network: {
    trustProxyHeaders: false,
    proxyIpHeaders: defaultProxyIpHeaders,
    geoip: defaultGeoipSettings,
    outboundProxy: defaultOutboundProxySettings,
  },
  general: {
    siteName: defaultSiteContent.general.siteName,
    eyebrow: defaultSiteContent.general.eyebrow,
    headline: defaultSiteContent.general.headline,
    description: defaultSiteContent.general.description,
    logoUrl: '',
    faviconUrl: '/favicon.svg',
    defaultDomain: '',
    domains: [],
    domainSchemes: {},
    language: defaultSiteLocale,
    footerText: defaultSiteContent.general.footerText,
  },
  seo: {
    title: defaultSiteContent.seo.title,
    description: defaultSiteContent.seo.description,
    ogImageUrl: '',
    indexable: true,
    robotsTxt: '',
    customHead: '',
  },
  legal: {
    termsTitle: defaultSiteContent.legal.termsTitle,
    termsContent: defaultSiteContent.legal.termsContent,
    privacyTitle: defaultSiteContent.legal.privacyTitle,
    privacyContent: defaultSiteContent.legal.privacyContent,
  },
  i18n: {
    defaultLocale: defaultSiteLocale,
    locales: defaultLocalizedContent,
  },
  links: {
    allowCreate: true,
    allowCustomCodes: true,
    options: {
      customCode: true,
      previewTitle: true,
      previewDescription: true,
      previewImageUrl: true,
      themeColor: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
      expiresAt: true,
      maxClicks: true,
      password: true,
      tags: true,
      redirectRules: true,
      redirectRuleDevice: true,
      redirectRuleLanguage: true,
      redirectRuleQuery: true,
      redirectRuleIp: true,
      redirectRuleGeo: true,
      redirectRulePercentage: true,
    },
    codeMinLength: 3,
    codeMaxLength: 32,
    generatedCodeLength: 7,
    allowedDomains: [],
    allowUserDelete: false,
    userDeleteMaxClicks: 0,
    editOwn: true,
    viewAll: false,
    editAll: false,
    deleteAll: false,
    statsAll: false,
    statsCsv: true,
    healthAll: false,
    editableFields: [...linkEditFieldKeys],
    trackClicks: true,
    redirectStatus: 302,
    stripUrlHash: true,
    allowedSchemes: ['http', 'https'],
    blockedHosts: [],
  },
  api: {
    enabled: true,
    allowCreate: true,
    allowList: true,
    allowStats: true,
    allowDelete: true,
    allowUpdate: true,
  },
  auth: {
    registration: {
      enabled: true,
    },
    password: {
      minLength: 10,
      requireLetters: false,
      requireNumbers: false,
      requireSymbols: false,
    },
    emailVerification: {
      enabled: false,
      provider: 'smtp',
      tokenTtlHours: 24,
      timeoutMs: 10_000,
      fromEmail: '',
      fromName: 'Shortlink',
      smtp: {
        host: '',
        port: 587,
        secure: false,
        username: '',
        password: '',
      },
      http: {
        endpoint: '',
        method: 'POST',
        authMode: 'authorization',
        authorizationHeader: '',
        basicUsername: '',
        basicPassword: '',
        authHeaders: '',
        headers: '',
      },
    },
  },
  theme: {
    preset: 'emerald',
    mode: 'light',
    customTokens: { ...themePresets.emerald },
  },
  plugins: {},
};
