import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  createLink,
  checkLinkHealth,
  deleteLinks as deleteShortLinks,
  listLinksPage,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import {
  selectedShortLinkDomainForCreate,
  shortLinkLookupDomain,
  shortUrl,
} from '$lib/server/url';
import { canCreateLinks } from '$lib/server/access';
import { getClientIp } from '$lib/server/client-ip';
import { getLinkOwner, getOrCreateLinkOwner } from '$lib/server/link-owner';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
  linkSelectionsFromForm,
} from '$lib/server/link-form';
import { parseLinkSearch } from '$lib/server/link-search';
import { DEFAULT_PAGE_SIZE, pageParam } from '$lib/server/pagination';
import {
  assertCreateOptionsAllowed,
  effectivePermissions,
  linkSettingsForPermissions,
  publicPermissionGroupReasons,
  type EffectivePermissions,
} from '$lib/server/permissions';
import type { SiteSettings } from '$lib/config';
import { publicHomeSettings, publicLinkSettings } from '$lib/public-settings';
import { formatText, localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { registrationAvailability } from '$lib/server/registration';
import {
  applyCreateUrlPlugins,
  getPublicPluginStates,
  loadRuntimePluginSlots,
  verifyFormSubmissionPlugins,
} from '../plugins/server';
import { getAuthLoginMethods } from '../plugins/auth-registry';

function linkCreateDeniedNotice(
  settings: SiteSettings,
  permissions: EffectivePermissions,
  user: App.Locals['user'],
  text: ReturnType<typeof uiText>,
) {
  if (permissions.links.canCreate && permissions.links.domains.length > 0) {
    return null;
  }

  if (!settings.links.allowCreate) {
    return {
      title: text.messages.createDisabledTitle,
      detail: text.messages.createDisabledDetail,
    };
  }

  if (
    settings.access.visibility === 'private' &&
    !user &&
    permissions.matchedGroups.length === 0
  ) {
    return {
      title: text.messages.createPrivateDeniedTitle,
      detail: text.messages.createPrivateDeniedDetail,
    };
  }

  if (permissions.matchedGroups.length > 0) {
    return {
      title: text.messages.createGroupDeniedTitle,
      detail: text.messages.createGroupDeniedDetail,
    };
  }

  return {
    title: text.messages.createNoPermissionTitle,
    detail: text.messages.createNoPermissionDetail,
  };
}

function canAccessOwnLinks(
  settings: SiteSettings,
  permissions: EffectivePermissions,
  user: App.Locals['user'],
) {
  return (
    settings.access.visibility === 'public' ||
    Boolean(user) ||
    permissions.links.canCreate ||
    permissions.matchedGroups.length > 0
  );
}

export const load: PageServerLoad = async ({
  url,
  locals,
  cookies,
  request,
  getClientAddress,
}) => {
  const settings = locals.settings;
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const clientIp = getClientIp(
    request,
    getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  const permissions = await effectivePermissions({
    settings,
    user: locals.user,
    isAdmin: locals.isAdmin,
    ip: clientIp,
  });
  const search = parseLinkSearch(url);
  const prefillUrl = (url.searchParams.get('url') ?? '').trim().slice(0, 2_000);
  const linksAccessDenied =
    !permissions.links.viewAll &&
    !canAccessOwnLinks(settings, permissions, locals.user);
  const currentOwner = getLinkOwner({
    cookies,
    userId: locals.user?.id,
    ip: clientIp,
  });
  const owner = permissions.links.viewAll
    ? undefined
    : !linksAccessDenied
      ? currentOwner
      : undefined;
  const linkPage = !linksAccessDenied
    ? await listLinksPage(
        pageParam(url),
        DEFAULT_PAGE_SIZE,
        owner,
        search,
        currentOwner,
        locals.user?.id,
      )
    : {
        items: [],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems: 0,
        totalPages: 1,
      };
  const links = linkPage.items.map((link) => ({
    ...link,
    shortUrl: shortUrl(url.origin, link.code, link.domain, settings),
  }));
  const authMethods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
    permissions.auth.providers,
  );
  const authEnabled = authMethods.length > 0;
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: authMethods.some(
      (method) => method.type === 'password',
    ),
  });
  const displaySettings = locals.localizedSettings;
  const publicDomains = permissions.links.domains;
  const permissionLinkSettings = linkSettingsForPermissions(
    settings.links,
    permissions,
  );
  const publicSettings = publicHomeSettings(displaySettings, {
    general: {
      ...displaySettings.general,
      defaultDomain: publicDomains.includes(settings.general.defaultDomain)
        ? settings.general.defaultDomain
        : (publicDomains[0] ?? ''),
      domains: publicDomains,
      domainSchemes: Object.fromEntries(
        publicDomains.map((domain) => [
          domain,
          settings.general.domainSchemes[domain] ?? 'https',
        ]),
      ),
    },
    links: publicLinkSettings(permissionLinkSettings),
    plugins: getPublicPluginStates(settings.plugins),
  });
  const canCreate =
    canCreateLinks(settings, locals, permissions) &&
    permissions.links.domains.length > 0;

  return {
    links,
    settings: publicSettings,
    permissions,
    permissionGroups: publicPermissionGroupReasons(permissions),
    canCreate,
    createDenied: canCreate
      ? null
      : linkCreateDeniedNotice(settings, permissions, locals.user, text),
    user: locals.user,
    linksAccessDenied,
    search,
    prefillUrl,
    pagination: {
      page: linkPage.page,
      pageSize: linkPage.pageSize,
      totalItems: linkPage.totalItems,
      totalPages: linkPage.totalPages,
    },
    auth: {
      enabled: authEnabled,
      setupRequired: registration.setupRequired,
    },
    runtimeSlots: await loadRuntimePluginSlots({
      states: settings.plugins,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      user: locals.user,
    }),
  };
};

export const actions: Actions = {
  create: async ({ request, url, locals, cookies, getClientAddress }) => {
    const formData = await request.formData();
    const rawUrl = String(formData.get('url') ?? '');
    const rawCode = String(formData.get('code') ?? '');
    const rawDomain = String(formData.get('domain') ?? '');
    const preview = linkPreviewFromForm(formData);
    const operations = linkOperationsFromForm(formData);
    const values = {
      url: rawUrl,
      code: rawCode,
      domain: rawDomain,
      preview,
      operations,
    };
    const settings = locals.settings;
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const clientIp = getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    );

    const permissions = await effectivePermissions({
      settings,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
    });

    if (!canCreateLinks(settings, locals, permissions)) {
      const notice = linkCreateDeniedNotice(
        settings,
        permissions,
        locals.user,
        text,
      );
      return fail(403, {
        ok: false,
        action: 'create',
        message: notice
          ? `${notice.title} ${notice.detail}`
          : text.home.createDeniedTitle,
        values,
      });
    }

    const verification = await verifyFormSubmissionPlugins({
      action: 'link-create',
      form: formData,
      request,
      url,
      states: settings.plugins,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
      locale: locals.locale,
      fallbackLocale: settings.i18n.defaultLocale,
      settings,
    });
    if (!verification.allowed) {
      return fail(400, {
        ok: false,
        action: 'create',
        message: verification.message
          ? localizeServerMessage(
              locals.locale,
              verification.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.formVerificationFailed,
        values,
      });
    }

    try {
      assertCreateOptionsAllowed(formData, permissions);
      const parsed = new URL(
        /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
      );
      const targetUrl = applyCreateUrlPlugins(
        parsed,
        formData,
        settings.plugins,
      ).toString();

      const link = await createLink(targetUrl, rawCode, {
        isAdmin: locals.isAdmin,
        domain: selectedShortLinkDomainForCreate(
          rawDomain,
          permissions.links.domains,
          settings.general.defaultDomain,
          settings.general.domains,
        ),
        linkSettings: linkSettingsForPermissions(settings.links, permissions),
        owner: getOrCreateLinkOwner({
          cookies,
          userId: locals.user?.id,
          ip: clientIp,
        }),
        preview,
        operations,
      });
      return {
        ok: true,
        action: 'create',
        link: {
          ...link,
          shortUrl: shortUrl(url.origin, link.code, link.domain, settings),
        },
      };
    } catch (error) {
      return fail(400, {
        ok: false,
        action: 'create',
        message:
          error instanceof Error
            ? localizeServerMessage(
                locals.locale,
                error.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.createFailed,
        values,
      });
    }
  },

  updateLink: async ({ request, url, locals, cookies, getClientAddress }) => {
    const form = await request.formData();
    const code = String(form.get('code') ?? '').trim();
    const domain = shortLinkLookupDomain(
      locals.settings,
      String(form.get('domain') ?? ''),
      url.origin,
    );
    const rawUrl = String(form.get('url') ?? '');
    const preview = linkPreviewFromForm(form);
    const operations = linkOperationsFromForm(form);
    const settings = locals.settings;
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const clientIp = getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    );
    const permissions = await effectivePermissions({
      settings,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
    });
    if (!code) {
      return fail(400, {
        ok: false,
        action: 'updateLink',
        message: text.messages.editNeedsSelection,
      });
    }

    try {
      const result = await updateShortLink(
        code,
        { url: rawUrl, preview, operations },
        {
          isAdmin: locals.isAdmin,
          allowAnyOwner: permissions.links.editAll,
          editableFields: permissions.links.editableFields,
          linkSettings: linkSettingsForPermissions(settings.links, permissions),
          owner:
            permissions.links.editOwn &&
            canAccessOwnLinks(settings, permissions, locals.user)
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
          ok: false,
          action: 'updateLink',
          message: text.messages.linkNotFound,
        });
      }
      if (result.status === 'denied') {
        return fail(403, {
          ok: false,
          action: 'updateLink',
          message: text.messages.editOwnOnly,
        });
      }

      return {
        ok: true,
        action: 'updateLink',
        message: formatText(text.messages.linkEdited, {
          code: result.link.code,
        }),
        link: {
          ...result.link,
          shortUrl: shortUrl(
            url.origin,
            result.link.code,
            result.link.domain,
            settings,
          ),
        },
      };
    } catch (error) {
      return fail(400, {
        ok: false,
        action: 'updateLink',
        message:
          error instanceof Error
            ? localizeServerMessage(
                locals.locale,
                error.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.editFailed,
      });
    }
  },

  checkHealth: async ({ request, url, locals, cookies, getClientAddress }) => {
    const form = await request.formData();
    const code = String(form.get('code') ?? '').trim();
    const settings = locals.settings;
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const clientIp = getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    );
    const permissions = await effectivePermissions({
      settings,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
    });

    if (!code) {
      return fail(400, {
        ok: false,
        action: 'updateLink',
        message: text.messages.healthNeedsSelection,
      });
    }

    const domain = shortLinkLookupDomain(
      settings,
      String(form.get('domain') ?? ''),
      url.origin,
    );
    const result = await checkLinkHealth(code, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.healthAll,
      siteSettings: settings,
      domain,
      owner: getLinkOwner({
        cookies,
        userId: locals.user?.id,
        ip: clientIp,
      }),
    });

    if (result.status === 'not_found') {
      return fail(404, {
        ok: false,
        action: 'updateLink',
        message: text.messages.linkNotFound,
      });
    }
    if (result.status === 'denied') {
      return fail(403, {
        ok: false,
        action: 'updateLink',
        message: text.messages.healthOwnOnly,
      });
    }

    return {
      ok: true,
      action: 'updateLink',
      message: formatText(text.messages.healthChecked, {
        code: result.link.code,
      }),
      healthResponseBody: result.link.health.responseBody,
      healthStatus: result.link.health.status,
      healthStatusCode: result.link.health.statusCode,
    };
  },

  deleteLinks: async ({ request, locals, cookies, getClientAddress }) => {
    const form = await request.formData();
    const links = linkSelectionsFromForm(form);
    const settings = locals.settings;
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const clientIp = getClientIp(
      request,
      getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    );
    const permissions = await effectivePermissions({
      settings,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
    });
    if (links.length === 0) {
      return fail(400, {
        ok: false,
        action: 'deleteLinks',
        message: text.messages.deleteNeedsSelection,
      });
    }

    if (
      !locals.isAdmin &&
      !permissions.links.deleteAll &&
      !canAccessOwnLinks(settings, permissions, locals.user)
    ) {
      return fail(403, {
        ok: false,
        action: 'deleteLinks',
        message: text.messages.deleteDeniedEnvironment,
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
    const message = deleteLinksMessage(result, { text: text.messages });

    if (result.deleted === 0) {
      return fail(403, {
        ok: false,
        action: 'deleteLinks',
        message: message
          ? localizeServerMessage(
              locals.locale,
              message,
              settings.i18n.defaultLocale,
            )
          : text.messages.deleteNoLinks,
      });
    }

    return {
      ok: true,
      action: 'deleteLinks',
      message: localizeServerMessage(
        locals.locale,
        message,
        settings.i18n.defaultLocale,
      ),
    };
  },
};
