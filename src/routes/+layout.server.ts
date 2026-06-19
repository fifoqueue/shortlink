import type { LayoutServerLoad } from './$types';
import {
  createCsrfToken,
  createWebActionToken,
  CSRF_TOKEN_FIELD,
  WEB_ACTION_TOKEN_FIELD,
} from '$lib/server/web-action-guard';

export const load: LayoutServerLoad = (event) => {
  const { locals } = event;
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
    securityFormTokens: {
      csrf: locals.settings.security.csrf.enabled
        ? {
            name: CSRF_TOKEN_FIELD,
            value: createCsrfToken(event),
          }
        : null,
      webAction: locals.settings.security.webActionGuard.enabled
        ? {
            name: WEB_ACTION_TOKEN_FIELD,
            value: createWebActionToken(event),
          }
        : null,
    },
  };
};
