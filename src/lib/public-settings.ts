import type { SiteSettings } from '$lib/config';

export type PublicLegalSettings = Pick<
  SiteSettings,
  'general' | 'seo' | 'legal' | 'theme'
>;

export type PublicHomeSettings = PublicLegalSettings &
  Pick<SiteSettings, 'i18n'>;

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

export function publicHomeSettings(
  settings: SiteSettings,
  overrides: {
    general?: SiteSettings['general'];
  } = {},
): PublicHomeSettings {
  return {
    ...publicLegalSettings(settings),
    general: overrides.general ?? settings.general,
    i18n: settings.i18n,
  };
}
