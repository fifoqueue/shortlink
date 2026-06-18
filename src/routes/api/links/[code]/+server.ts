import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  canViewStats,
  checkLinkHealth,
  deleteLinks as deleteShortLinks,
  getStatsForLink,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import { shortLinkLookupDomain, shortUrl } from '$lib/server/url';
import type { SiteSettings } from '$lib/config';
import { formDataFromJson, recordValue } from '$lib/server/api-link-input';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
  partialLinkOperationsFromForm,
  partialLinkPreviewFromForm,
} from '$lib/server/link-form';
import {
  linkSettingsForPermissions,
  publicPermissionGroupReasons,
} from '$lib/server/permissions';
import { requireApiPermissionContext } from '$lib/server/api-permissions';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import {
  combineClickMetadataDisplayLists,
  formatCoreClickMetadataList,
} from '$lib/server/click-metadata';
import { formatClickMetadataListPlugins } from '../../../../plugins/server';

export const GET: RequestHandler = async ({
  params,
  request,
  url,
  locals,
  getClientAddress,
}) => {
  const settings = locals.settings;
  const text = uiText(settings.i18n.defaultLocale).messages;
  const api = await requireApiPermissionContext(
    request,
    settings,
    'stats',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { permissions } = api;
  const code = params.code;
  if (!code) error(404, text.linkNotFound);
  const domain = shortLinkLookupDomain(
    settings,
    url.searchParams.get('domain'),
    url.origin,
  );
  const access = await canViewStats({
    code,
    domain,
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.statsAll,
    owner: { userId: api.principal.id },
    sharedUserId: api.principal.id,
  });
  if (!access.link) error(404, text.linkNotFound);
  if (!access.allowed) {
    return json(
      {
        message: text.statsViewDenied,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 403 },
    );
  }

  const stats = await getStatsForLink(access.link, {
    isAdmin: api.principal.isAdmin,
    creatorVisibility: api.principal.isAdmin
      ? 'admin'
      : permissions.links.statsAll
        ? 'name'
        : 'none',
  });
  const metadataItems = stats.clickEvents.map((click) => click.metadata);
  const coreDetails = formatCoreClickMetadataList({
    metadataItems,
    locale: settings.i18n.defaultLocale,
    fallbackLocale: settings.i18n.defaultLocale,
  });
  const pluginDetails = await formatClickMetadataListPlugins({
    metadataItems,
    states: settings.plugins,
    isAdmin: api.principal.isAdmin,
    isOwner: access.isOwner,
  });
  const clickDetails = combineClickMetadataDisplayLists(
    coreDetails,
    pluginDetails,
  );
  const clickEvents = stats.clickEvents.map((click, index) => ({
    createdAt: click.createdAt,
    ip: click.ip,
    browser: click.browser,
    userAgent: click.userAgent,
    referer: click.referer,
    details: clickDetails[index] ?? [],
  }));

  return json({
    link: {
      ...stats,
      clickEvents,
      shortUrl: shortUrl(url.origin, stats.code, stats.domain, settings),
    },
    permissionGroups: publicPermissionGroupReasons(permissions),
  });
};

async function updateApiLink(
  code: string | undefined,
  request: Request,
  url: URL,
  settings: SiteSettings,
  getClientAddress: () => string,
  options: { partial?: boolean } = {},
) {
  const api = await requireApiPermissionContext(
    request,
    settings,
    'update',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { permissions } = api;
  const text = uiText(settings.i18n.defaultLocale).messages;
  if (!code) error(404, text.linkNotFound);
  try {
    const body = recordValue(await request.json().catch(() => ({})));
    const form = formDataFromJson(body);
    const partial = options.partial === true;
    const domain = shortLinkLookupDomain(
      settings,
      String(form.get('domain') || url.searchParams.get('domain') || ''),
      url.origin,
    );
    const result = await updateShortLink(
      code,
      {
        url: partial
          ? form.has('url')
            ? String(form.get('url') ?? '')
            : undefined
          : String(form.get('url') ?? ''),
        preview: partial
          ? partialLinkPreviewFromForm(form)
          : linkPreviewFromForm(form),
        operations: partial
          ? partialLinkOperationsFromForm(form)
          : linkOperationsFromForm(form),
      },
      {
        isAdmin: api.principal.isAdmin,
        allowAnyOwner: permissions.links.editAll,
        editableFields: permissions.links.editableFields,
        linkSettings: linkSettingsForPermissions(settings.links, permissions),
        owner: permissions.links.editOwn
          ? { userId: api.principal.id }
          : undefined,
        sharedUserId: api.principal.id,
        domain,
        partial,
      },
    );

    if (result.status === 'not_found') {
      return json(
        {
          message: text.linkNotFound,
          permissionGroups: publicPermissionGroupReasons(permissions),
        },
        { status: 404 },
      );
    }
    if (result.status === 'denied') {
      return json(
        {
          message: text.editOwnOnly,
          permissionGroups: publicPermissionGroupReasons(permissions),
        },
        { status: 403 },
      );
    }

    return json({
      link: {
        ...result.link,
        shortUrl: shortUrl(
          url.origin,
          result.link.code,
          result.link.domain,
          settings,
        ),
      },
      permissionGroups: publicPermissionGroupReasons(permissions),
    });
  } catch (cause) {
    return json(
      {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                settings.i18n.defaultLocale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.editFailed,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 400 },
    );
  }
}

export const PATCH: RequestHandler = async ({
  params,
  request,
  url,
  locals,
  getClientAddress,
}) =>
  updateApiLink(params.code, request, url, locals.settings, getClientAddress, {
    partial: true,
  });

export const PUT: RequestHandler = async ({
  params,
  request,
  url,
  locals,
  getClientAddress,
}) =>
  updateApiLink(params.code, request, url, locals.settings, getClientAddress);

export const POST: RequestHandler = async ({
  params,
  request,
  url,
  locals,
  getClientAddress,
}) => {
  const settings = locals.settings;
  const text = uiText(settings.i18n.defaultLocale).messages;
  const api = await requireApiPermissionContext(
    request,
    settings,
    'update',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { permissions } = api;
  const code = params.code;
  if (!code) error(404, text.linkNotFound);

  const body = recordValue(await request.json().catch(() => ({})));
  if (String(body.action ?? '') !== 'check-health') {
    return json(
      {
        message: text.unsupportedAction,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 400 },
    );
  }

  const domain = shortLinkLookupDomain(
    settings,
    String(body.domain || url.searchParams.get('domain') || ''),
    url.origin,
  );
  const result = await checkLinkHealth(code, {
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.healthAll,
    siteSettings: settings,
    domain,
    owner: { userId: api.principal.id },
  });
  if (result.status === 'not_found') {
    return json(
      {
        message: text.linkNotFound,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 404 },
    );
  }
  if (result.status === 'denied') {
    return json(
      {
        message: text.healthOwnOnly,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 403 },
    );
  }

  return json({
    link: {
      ...result.link,
      shortUrl: shortUrl(
        url.origin,
        result.link.code,
        result.link.domain,
        settings,
      ),
    },
    permissionGroups: publicPermissionGroupReasons(permissions),
  });
};

export const DELETE: RequestHandler = async ({
  params,
  request,
  url,
  locals,
  getClientAddress,
}) => {
  const settings = locals.settings;
  const text = uiText(settings.i18n.defaultLocale).messages;
  const api = await requireApiPermissionContext(
    request,
    settings,
    'delete',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { permissions } = api;

  const code = params.code;
  if (!code) error(404, text.linkNotFound);

  const result = await deleteShortLinks([code], {
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.deleteAll,
    owner: { userId: api.principal.id },
    allowUserDelete: permissions.links.deleteOwn,
    maxClicks: permissions.links.deleteMaxClicks,
    domain: shortLinkLookupDomain(
      settings,
      url.searchParams.get('domain'),
      url.origin,
    ),
  });
  const message = deleteLinksMessage(result, { text });
  if (result.deleted === 0) {
    return json(
      {
        ok: false,
        message: message || text.deleteNoLinks,
        result,
        permissionGroups: publicPermissionGroupReasons(permissions),
      },
      { status: 403 },
    );
  }

  return json({
    ok: true,
    message,
    result,
    permissionGroups: publicPermissionGroupReasons(permissions),
  });
};
