import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { registrationAvailability } from '$lib/server/registration';
import { getSettings } from '$lib/server/settings';
import { getClientIp } from '$lib/server/client-ip';
import {
  effectivePermissions,
  firstAllowedAdminSection,
} from '$lib/server/permissions';
import { adminSections } from '$lib/admin-sections';
import { getAuthLoginMethods } from '../../plugins/auth-registry';

export const load: PageServerLoad = async ({
  locals,
  request,
  getClientAddress,
}) => {
  if (locals.isAdmin) redirect(303, '/admin/core');
  const settings = await getSettings();
  if (!locals.user) {
    const ip = getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    );
    const permissions = await effectivePermissions({
      settings,
      user: null,
      isAdmin: false,
      ip,
    });
    const methods = getAuthLoginMethods(
      settings.plugins,
      locals.locale,
      settings.i18n.defaultLocale,
      permissions.auth.providers,
    );
    const registration = await registrationAvailability(settings, {
      passwordLoginEnabled: methods.some(
        (method) => method.type === 'password',
      ),
    });
    if (registration.setupRequired) redirect(303, '/signup');
    redirect(303, `/login?returnTo=${encodeURIComponent('/admin/core')}`);
  }
  const permissions = await effectivePermissions({
    settings,
    user: locals.user,
    isAdmin: locals.isAdmin,
    ip: getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    ),
  });
  if (permissions.admin.access) {
    const firstSection = firstAllowedAdminSection(permissions);
    const section = adminSections.find((item) => item.id === firstSection);
    if (section) redirect(303, `/admin/${section.slug}`);
  }
  return {
    locale: locals.locale,
    theme: settings.theme,
    customHead: settings.seo.customHead,
    siteName: settings.general.siteName,
    logoUrl: settings.general.logoUrl,
    user: {
      name: locals.user.name,
      email: locals.user.email,
    },
  };
};
