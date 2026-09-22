import { applySettingsForm } from '$lib/server/admin-settings';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  checkLinkHealth,
  countLinksByDomain,
  deleteLinks as deleteShortLinks,
  listLinksPage,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
  linkSelectionsFromForm,
} from '$lib/server/link-form';
import { parseLinkSearch } from '$lib/server/link-search';
import { DEFAULT_PAGE_SIZE, pageParam } from '$lib/server/pagination';
import { getClientIp } from '$lib/server/client-ip';
import { adminClientSettings } from '$lib/server/client-settings';
import { getLinkOwner } from '$lib/server/link-owner';
import {
  canAccessAdminSection,
  canManageAdminSection,
  effectivePermissions,
  linkSettingsForPermissions,
  type AdminSectionKey,
  type EffectivePermissions,
} from '$lib/server/permissions';
import { getSettings, stringValue, updateSettings } from '$lib/server/settings';
import { type SiteLocale, themePresets } from '$lib/config';
import { localizedPluginMeta } from '$lib/i18n/plugin';
import { formatText, localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { shortLinkLookupDomain, shortUrl } from '$lib/server/url';
import { clearPluginSessions } from '../../../plugins/auth-registry';
import { pluginDefinitions } from '../../../plugins/server';

function actionErrorMessage(
  cause: unknown,
  locale: SiteLocale,
  fallbackLocale: SiteLocale,
  fallback: string,
) {
  return cause instanceof Error
    ? localizeServerMessage(locale, cause.message, fallbackLocale)
    : fallback;
}

const sectionIds = {
  core: 'general',
  'link-and-api': 'links',
  security: 'security',
  theme: 'theme',
  plugins: 'plugins',
  links: 'data',
} as const;

async function permissionContext(input: {
  locals: App.Locals;
  request: Request;
  getClientAddress: () => string;
}) {
  const settings = input.locals.settings;
  const clientIp = getClientIp(
    input.request,
    input.getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  const permissions = await effectivePermissions({
    settings,
    user: input.locals.user,
    isAdmin: input.locals.isAdmin,
    ip: clientIp,
  });
  return { clientIp, permissions };
}

function requireAdminAccess(permissions: EffectivePermissions) {
  if (!permissions.admin.access) redirect(303, '/admin');
}

function requireSectionAccess(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
) {
  requireAdminAccess(permissions);
  if (!canAccessAdminSection(permissions, section)) redirect(303, '/admin');
}

function requireSectionManage(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
  deniedMessage: string,
) {
  requireSectionAccess(permissions, section);
  if (!canManageAdminSection(permissions, section)) {
    throw new Error(deniedMessage);
  }
}

export const load: PageServerLoad = async ({
  locals,
  url,
  params,
  cookies,
  request,
  getClientAddress,
}) => {
  if (!(params.section in sectionIds)) redirect(303, '/admin/core');
  const section = sectionIds[
    params.section as keyof typeof sectionIds
  ] as AdminSectionKey;
  const { clientIp, permissions } = await permissionContext({
    locals,
    request,
    getClientAddress,
  });
  requireSectionAccess(permissions, section);

  const search = parseLinkSearch(url);
  const currentOwner = getLinkOwner({
    cookies,
    userId: locals.user?.id,
    ip: clientIp,
  });
  const owner = permissions.links.viewAll ? undefined : currentOwner;
  const settings = locals.settings;
  const [linkPage, domainLinkCounts] = await Promise.all([
    listLinksPage(
      pageParam(url),
      DEFAULT_PAGE_SIZE,
      owner,
      search,
      currentOwner,
      locals.user?.id,
    ),
    countLinksByDomain(settings.general.domains),
  ]);

  return {
    authenticated: true as const,
    locale: locals.locale,
    section,
    settings: adminClientSettings(settings),
    plugins: pluginDefinitions.map((definition) =>
      localizedPluginMeta(
        definition,
        locals.locale,
        settings.i18n.defaultLocale,
      ),
    ),
    permissions,
    themePresets,
    search,
    links: linkPage.items.map((link) => ({
      ...link,
      shortUrl: shortUrl(url.origin, link.code, link.domain, settings),
    })),
    domainLinkCounts,
    pagination: {
      page: linkPage.page,
      pageSize: linkPage.pageSize,
      totalItems: linkPage.totalItems,
      totalPages: linkPage.totalPages,
    },
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const settings = await getSettings();
    await clearPluginSessions(cookies, settings.plugins);
    redirect(303, '/admin');
  },

  saveGeneral: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'general',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveGeneral',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    try {
      await updateSettings((settings) =>
        applySettingsForm('general', form, settings),
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveGeneral',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.generalSettingsFailed,
        ),
      });
    }
    return {
      ok: true,
      action: 'saveGeneral',
      message: text.admin.messages.generalSettingsSaved,
    };
  },

  saveLinks: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'links',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveLinks',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    try {
      await updateSettings((settings) =>
        applySettingsForm('links', form, settings),
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveLinks',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    return {
      ok: true,
      action: 'saveLinks',
      message: text.admin.messages.linksSettingsSaved,
    };
  },

  saveSecurity: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'security',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveSecurity',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }

    const form = await request.formData();
    try {
      await updateSettings((settings) =>
        applySettingsForm('security', form, settings),
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveSecurity',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.securitySettingsFailed,
        ),
      });
    }
    return {
      ok: true,
      action: 'saveSecurity',
      message: text.admin.messages.securitySettingsSaved,
    };
  },

  saveTheme: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'theme',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    try {
      await updateSettings((settings) =>
        applySettingsForm('theme', form, settings),
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    return {
      ok: true,
      action: 'saveTheme',
      message: text.admin.messages.themeSettingsSaved,
    };
  },

  resetTheme: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'theme',
        text.admin.messages.themeResetDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'resetTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.themeResetDenied,
        ),
      });
    }
    const form = await request.formData();
    try {
      await updateSettings((settings) =>
        applySettingsForm('resetTheme', form, settings),
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'resetTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.themeResetDenied,
        ),
      });
    }
    return {
      ok: true,
      action: 'resetTheme',
      message: text.admin.messages.themeReset,
    };
  },

  deleteLink: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const links = linkSelectionsFromForm(form);
    if (links.length === 0) {
      return fail(400, {
        action: 'deleteLink',
        message: text.messages.deleteNeedsSelection,
      });
    }

    const result = await deleteShortLinks(links, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.deleteAll,
      owner: getLinkOwner({
        cookies,
        userId: locals.user?.id,
        ip: clientIp,
      }),
      allowUserDelete: permissions.links.deleteOwn,
      maxClicks: permissions.links.deleteMaxClicks,
    });
    if (result.deleted === 0) {
      return fail(404, {
        action: 'deleteLink',
        message:
          deleteLinksMessage(result, {
            includePolicyDetails: false,
            text: text.messages,
          }) || text.messages.linkNotFound,
      });
    }
    return {
      ok: true,
      action: 'deleteLink',
      message: deleteLinksMessage(result, {
        includePolicyDetails: false,
        text: text.messages,
      }),
    };
  },

  updateLink: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const settings = locals.settings;
    const code = stringValue(form, 'code');
    const domain = shortLinkLookupDomain(
      settings,
      stringValue(form, 'domain'),
      new URL(request.url).origin,
    );
    if (!code) {
      return fail(400, {
        action: 'updateLink',
        message: text.messages.editNeedsSelection,
      });
    }
    try {
      const result = await updateShortLink(
        code,
        {
          url: stringValue(form, 'url'),
          preview: linkPreviewFromForm(form),
          operations: linkOperationsFromForm(form),
        },
        {
          isAdmin: locals.isAdmin,
          allowAnyOwner: permissions.links.editAll,
          editableFields: permissions.links.editableFields,
          linkSettings: linkSettingsForPermissions(settings.links, permissions),
          owner: permissions.links.editOwn
            ? getLinkOwner({
                cookies,
                userId: locals.user?.id,
                ip: clientIp,
              })
            : undefined,
          sharedUserId: locals.user?.id,
          domain,
        },
      );

      if (result.status === 'not_found') {
        return fail(404, {
          action: 'updateLink',
          message: text.messages.linkNotFound,
        });
      }
      if (result.status === 'denied') {
        return fail(403, {
          action: 'updateLink',
          message: text.admin.messages.linkEditDenied,
        });
      }

      return {
        ok: true,
        action: 'updateLink',
        message: formatText(text.messages.linkEdited, {
          code: result.link.code,
        }),
      };
    } catch (error) {
      return fail(400, {
        action: 'updateLink',
        message:
          error instanceof Error ? error.message : text.messages.editFailed,
      });
    }
  },

  checkHealth: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const code = stringValue(form, 'code');
    const domain = shortLinkLookupDomain(
      locals.settings,
      stringValue(form, 'domain'),
      new URL(request.url).origin,
    );
    if (!code) {
      return fail(400, {
        action: 'checkHealth',
        message: text.messages.healthNeedsSelection,
      });
    }

    const result = await checkLinkHealth(code, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.healthAll,
      siteSettings: locals.settings,
      domain,
      owner: getLinkOwner({
        cookies,
        userId: locals.user?.id,
        ip: clientIp,
      }),
    });
    if (result.status === 'not_found') {
      return fail(404, {
        action: 'checkHealth',
        message: text.messages.linkNotFound,
      });
    }
    if (result.status === 'denied') {
      return fail(403, {
        action: 'checkHealth',
        message: text.messages.healthOwnOnly,
      });
    }

    return {
      ok: true,
      action: 'checkHealth',
      message: formatText(text.messages.healthChecked, {
        code: result.link.code,
      }),
      healthResponseBody: result.link.health.responseBody,
      healthStatus: result.link.health.status,
      healthStatusCode: result.link.health.statusCode,
    };
  },
};
