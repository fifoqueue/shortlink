import {
  defaultLocalizedContentFor,
  defaultSiteLocale,
  siteLocaleKeys,
  type LocalizedSiteContent,
  type SiteLocale,
  type SiteSettings,
} from '$lib/config';

const siteLocaleSet = new Set<string>(siteLocaleKeys);
export const localeCookieName = 'shortlink_locale';

function isSiteLocale(value: string): value is SiteLocale {
  return siteLocaleSet.has(value);
}

export function localeFromValue(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return isSiteLocale(normalized) ? normalized : null;
}

function mergeContent(
  locale: SiteLocale,
  content: Partial<LocalizedSiteContent> | undefined,
): LocalizedSiteContent {
  const fallback = defaultLocalizedContentFor(locale);
  return {
    general: {
      ...fallback.general,
      ...(content?.general ?? {}),
    },
    seo: {
      ...fallback.seo,
      ...(content?.seo ?? {}),
    },
    legal: {
      ...fallback.legal,
      ...(content?.legal ?? {}),
    },
  };
}

export function localeFromAcceptLanguage(
  value: string | null,
  fallbackLocale: SiteLocale = defaultSiteLocale,
): SiteLocale {
  const ranges = (value ?? '')
    .split(',')
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(';');
      const qualityParam = params.find((param) =>
        param.trim().toLowerCase().startsWith('q='),
      );
      const quality = qualityParam ? Number(qualityParam.split('=')[1]) : 1;
      return {
        index,
        tag: rawTag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((range) => range.tag && range.quality > 0)
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index,
    );

  for (const range of ranges) {
    const exact = siteLocaleKeys.find(
      (locale) => locale.toLowerCase() === range.tag,
    );
    if (exact) return exact;

    const primaryTag = range.tag.split('-')[0];
    const primaryMatch = siteLocaleKeys.find(
      (locale) => locale.toLowerCase().split('-')[0] === primaryTag,
    );
    if (primaryMatch) return primaryMatch;
  }

  return fallbackLocale;
}

export function localeFromMetadata(input: {
  acceptLanguage: string | null;
  cookieLocale?: string | null;
  fallbackLocale?: SiteLocale;
}): SiteLocale {
  return (
    localeFromValue(input.cookieLocale) ??
    localeFromAcceptLanguage(input.acceptLanguage, input.fallbackLocale)
  );
}

export function localizedContent(
  settings: SiteSettings,
  locale: SiteLocale,
): LocalizedSiteContent {
  const requestedLocale = isSiteLocale(locale)
    ? locale
    : settings.i18n.defaultLocale;
  const fallbackLocale = settings.i18n.defaultLocale;
  const content =
    settings.i18n.locales[requestedLocale] ??
    settings.i18n.locales[fallbackLocale] ??
    defaultLocalizedContentFor(fallbackLocale);
  return mergeContent(requestedLocale, content);
}

export function localizedSettings(
  settings: SiteSettings,
  locale: SiteLocale,
): SiteSettings {
  const content = localizedContent(settings, locale);
  return {
    ...settings,
    general: {
      ...settings.general,
      ...content.general,
      language: locale,
    },
    seo: {
      ...settings.seo,
      ...content.seo,
    },
    legal: {
      ...settings.legal,
      ...content.legal,
    },
    i18n: {
      ...settings.i18n,
      defaultLocale: settings.i18n.defaultLocale,
      locales: settings.i18n.locales,
    },
  };
}
