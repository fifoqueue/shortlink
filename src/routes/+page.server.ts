import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  createLink,
  checkLinkHealth,
  deleteLinks as deleteShortLinks,
  listLinksPage,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import { shortUrl } from '$lib/server/url';
import { canCreateLinks } from '$lib/server/access';
import { getClientIp } from '$lib/server/client-ip';
import { getLinkOwner, getOrCreateLinkOwner } from '$lib/server/link-owner';
import {
  deleteLinksMessage,
  linkCodesFromForm,
  linkOperationsFromForm,
  linkPreviewFromForm,
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
import { formatText, localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { registrationAvailability } from '$lib/server/registration';
import {
  applyCreateUrlPlugins,
  getPublicPluginStates,
  verifyFormSubmissionPlugins,
} from '../plugins/server';
import { getAuthLoginMethods } from '../plugins/auth-registry';

function linkCreateDeniedNotice(
  settings: SiteSettings,
  permissions: EffectivePermissions,
  user: App.Locals['user'],
  text: ReturnType<typeof uiText>,
) {
  if (permissions.links.canCreate) return null;

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
    short_url: shortUrl(url.origin, link.code),
  }));
  const authMethods = getAuthLoginMethods(
    settings.plugins,
    locals.locale,
    settings.i18n.defaultLocale,
  );
  const authEnabled = authMethods.length > 0;
  const registration = await registrationAvailability(settings, {
    passwordLoginEnabled: authMethods.some(
      (method) => method.type === 'password',
    ),
  });
  const displaySettings = locals.localizedSettings;
  const publicSettings = {
    ...displaySettings,
    links: linkSettingsForPermissions(settings.links, permissions),
    plugins: getPublicPluginStates(settings.plugins),
  };
  const canCreate = canCreateLinks(settings, locals, permissions);

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
  };
};

export const actions: Actions = {
  create: async ({ request, url, locals, cookies, getClientAddress }) => {
    const formData = await request.formData();
    const rawUrl = String(formData.get('url') ?? '');
    const rawCode = String(formData.get('code') ?? '');
    const preview = linkPreviewFromForm(formData);
    const operations = linkOperationsFromForm(formData);
    const values = { url: rawUrl, code: rawCode, preview, operations };
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

    const captcha = await verifyFormSubmissionPlugins({
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
    });
    if (!captcha.allowed) {
      return fail(400, {
        ok: false,
        action: 'create',
        message: captcha.message
          ? localizeServerMessage(
              locals.locale,
              captcha.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.captchaFailed,
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
          short_url: shortUrl(url.origin, link.code),
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

    if (
      !locals.isAdmin &&
      !permissions.links.editAll &&
      (!permissions.links.editOwn ||
        !canAccessOwnLinks(settings, permissions, locals.user))
    ) {
      return fail(403, {
        ok: false,
        action: 'updateLink',
        message: text.messages.editDeniedEnvironment,
      });
    }
    if (
      permissions.links.editableFields.length === 0 ||
      (!permissions.links.editAll && !permissions.links.editOwn)
    ) {
      return fail(403, {
        ok: false,
        action: 'updateLink',
        message: text.messages.editOwnOnly,
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
          owner: getLinkOwner({
            cookies,
            userId: locals.user?.id,
            ip: clientIp,
          }),
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
          short_url: shortUrl(url.origin, result.link.code),
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

  checkHealth: async ({ request, locals, cookies, getClientAddress }) => {
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

    const result = await checkLinkHealth(code, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.healthAll,
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
    };
  },

  deleteLinks: async ({ request, locals, cookies, getClientAddress }) => {
    const form = await request.formData();
    const codes = linkCodesFromForm(form);
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
    if (codes.length === 0) {
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

    const result = await deleteShortLinks(codes, {
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
