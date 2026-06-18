import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  const settings = locals.localizedSettings;

  return {
    shell: {
      locale: locals.locale,
      siteName: settings.general.siteName,
      logoUrl: settings.general.logoUrl,
      faviconUrl: settings.general.faviconUrl,
      theme: settings.theme,
      customHead: settings.seo.customHead,
    },
  };
};
