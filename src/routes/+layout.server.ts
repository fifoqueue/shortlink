import type { LayoutServerLoad } from './$types';
import { effectivePermissionsForEvent } from '$lib/server/permissions';
import {
  createCsrfToken,
  createWebActionToken,
  CSRF_TOKEN_FIELD,
  WEB_ACTION_TOKEN_FIELD,
} from '$lib/server/web-action-guard';

export const load: LayoutServerLoad = async (event) => {
  const { locals } = event;
  const settings = locals.localizedSettings;
  const permissions = await effectivePermissionsForEvent(event);

  return {
    shell: {
      locale: locals.locale,
      siteName: settings.general.siteName,
      logoUrl: settings.general.logoUrl,
      faviconUrl: settings.general.faviconUrl,
      theme: settings.theme,
      customHead: settings.seo.customHead,
      userName: locals.user?.name,
      canAccessAdmin: permissions.admin.access,
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
