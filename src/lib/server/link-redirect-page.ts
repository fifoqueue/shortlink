import { defaultSiteLocale, type SiteLocale, type SiteSettings } from '$lib/config';
import { uiText } from '$lib/i18n/ui-text';
import { shortUrl } from './url';

type RedirectLink = {
  code: string;
  url: string;
  preview: {
    title: string;
    description: string;
    imageUrl: string;
    themeColor: string;
  };
};

export type LinkBlockReason = 'expired' | 'max_clicks';

export function publicRedirectSettings(settings: SiteSettings) {
  return {
    general: settings.general,
    seo: settings.seo,
    theme: settings.theme,
  };
}

export function publicRedirectLink(link: RedirectLink) {
  return {
    code: link.code,
  };
}

export function blockedLinkTitle(
  reason: LinkBlockReason,
  locale: SiteLocale = defaultSiteLocale,
) {
  const text = uiText(locale).redirect;
  return reason === 'expired' ? text.expired : text.maxClicks;
}

export function hasExplicitOpenGraphMetadata(link: RedirectLink) {
  return Boolean(
    link.preview.title.trim() ||
    link.preview.description.trim() ||
    link.preview.imageUrl.trim() ||
    link.preview.themeColor.trim(),
  );
}

export function openGraphMetadata(
  link: RedirectLink,
  settings: SiteSettings,
  origin: string,
) {
  const title = link.preview.title || settings.seo.title || `/${link.code}`;
  const description = link.preview.description || settings.seo.description;
  const imageUrl = link.preview.imageUrl || settings.seo.ogImageUrl;
  const themeColor =
    link.preview.themeColor || settings.theme.customTokens.primary;

  return {
    title,
    description,
    imageUrl,
    themeColor,
    canonicalUrl: shortUrl(origin, link.code),
    targetUrl: link.url,
  };
}
