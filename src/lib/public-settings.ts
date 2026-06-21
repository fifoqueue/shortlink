import type { SiteSettings } from '$lib/config';

export type PublicLegalSettings = Pick<
  SiteSettings,
  'general' | 'seo' | 'legal' | 'theme'
>;

export type PublicHomeSettings = PublicLegalSettings &
  Pick<SiteSettings, 'i18n' | 'plugins'> & {
    links: Pick<SiteSettings['links'], 'codeMinLength' | 'codeMaxLength'>;
  };

export function publicLegalSettings(
  settings: SiteSettings,
): PublicLegalSettings {
  return {
    general: settings.general,
    seo: settings.seo,
    legal: settings.legal,
    theme: settings.theme,
  };
}

export function publicLinkSettings(
  settings: SiteSettings['links'],
): PublicHomeSettings['links'] {
  return {
    codeMinLength: settings.codeMinLength,
    codeMaxLength: settings.codeMaxLength,
  };
}

export function publicHomeSettings(
  settings: SiteSettings,
  overrides: {
    general?: SiteSettings['general'];
    links?: PublicHomeSettings['links'];
    plugins?: SiteSettings['plugins'];
  } = {},
): PublicHomeSettings {
  return {
    ...publicLegalSettings(settings),
    general: overrides.general ?? settings.general,
    i18n: settings.i18n,
    links: overrides.links ?? publicLinkSettings(settings.links),
    plugins: overrides.plugins ?? {},
  };
}
