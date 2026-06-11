import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  canViewStats,
  checkLinkHealth,
  deleteLinks as deleteShortLinks,
  getStatsForLink,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import { shortUrl } from '$lib/server/url';
import type { SiteSettings } from '$lib/config';
import { formDataFromJson, recordValue } from '$lib/server/api-link-input';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
} from '$lib/server/link-form';
import { linkSettingsForPermissions } from '$lib/server/permissions';
import { requireApiPermissionContext } from '$lib/server/api-permissions';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
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
  const access = await canViewStats({
    code,
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.statsAll,
    owner: { userId: api.principal.id },
  });
  if (!access.link) error(404, text.linkNotFound);
  if (!access.allowed) {
    return json({ message: text.statsViewDenied }, { status: 403 });
  }

  const stats = await getStatsForLink(access.link, {
    isAdmin: api.principal.isAdmin,
    creatorVisibility: api.principal.isAdmin
      ? 'admin'
      : permissions.links.statsAll
        ? 'name'
        : 'none',
  });
  const clickDetails = await formatClickMetadataListPlugins({
    metadataItems: stats.click_events.map((click) => click.metadata),
    states: settings.plugins,
    isAdmin: api.principal.isAdmin,
    isOwner: access.isOwner,
  });
  const clickEvents = stats.click_events.map((click, index) => ({
    created_at: click.created_at,
    ip: click.ip,
    user_agent: click.user_agent,
    referer: click.referer,
    details: clickDetails[index] ?? [],
  }));

  return json({
    link: {
      ...stats,
      click_events: clickEvents,
      short_url: shortUrl(url.origin, stats.code),
    },
  });
};

async function updateApiLink(
  code: string | undefined,
  request: Request,
  url: URL,
  settings: SiteSettings,
  getClientAddress: () => string,
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
  if (
    permissions.links.editableFields.length === 0 ||
    (!permissions.links.editAll && !permissions.links.editOwn)
  ) {
    return json({ message: text.editOwnOnly }, { status: 403 });
  }

  try {
    const body = recordValue(await request.json().catch(() => ({})));
    const form = formDataFromJson(body);
    const result = await updateShortLink(
      code,
      {
        url: String(form.get('url') ?? ''),
        preview: linkPreviewFromForm(form),
        operations: linkOperationsFromForm(form),
      },
      {
        isAdmin: api.principal.isAdmin,
        allowAnyOwner: permissions.links.editAll,
        editableFields: permissions.links.editableFields,
        linkSettings: linkSettingsForPermissions(settings.links, permissions),
        owner: { userId: api.principal.id },
      },
    );

    if (result.status === 'not_found') {
      return json({ message: text.linkNotFound }, { status: 404 });
    }
    if (result.status === 'denied') {
      return json({ message: text.editOwnOnly }, { status: 403 });
    }

    return json({
      link: {
        ...result.link,
        short_url: shortUrl(url.origin, result.link.code),
      },
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
  updateApiLink(params.code, request, url, locals.settings, getClientAddress);

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
    return json({ message: text.unsupportedAction }, { status: 400 });
  }

  const result = await checkLinkHealth(code, {
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.healthAll,
    owner: { userId: api.principal.id },
  });
  if (result.status === 'not_found') {
    return json({ message: text.linkNotFound }, { status: 404 });
  }
  if (result.status === 'denied') {
    return json({ message: text.healthOwnOnly }, { status: 403 });
  }

  return json({
    link: {
      ...result.link,
      short_url: shortUrl(url.origin, result.link.code),
    },
  });
};

export const DELETE: RequestHandler = async ({
  params,
  request,
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
  });
  const message = deleteLinksMessage(result, { text });
  if (result.deleted === 0) {
    return json(
      {
        ok: false,
        message: message || text.deleteNoLinks,
        result,
      },
      { status: 403 },
    );
  }

  return json({ ok: true, message, result });
};
