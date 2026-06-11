import type { SiteSettings } from '$lib/config';

export function robotsTxtForSettings(settings: SiteSettings) {
  const custom = settings.seo.robotsTxt.trim();
  if (custom) return custom;

  return settings.seo.indexable
    ? [
        'User-agent: *',
        'Disallow: /admin/',
        'Disallow: /api/',
        'Allow: /',
      ].join('\n')
    : ['User-agent: *', 'Disallow: /'].join('\n');
}
