import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createLink,
  deleteLinks as deleteShortLinks,
  listLinks,
} from '$lib/server/shortener';
import {
  selectedShortLinkDomainForCreate,
  shortLinkLookupDomain,
  shortUrl,
} from '$lib/server/url';
import { requireApiPermissionContext } from '$lib/server/api-permissions';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
  linkSelectionsFromForm,
} from '$lib/server/link-form';
import { formDataFromJson, recordValue } from '$lib/server/api-link-input';
import {
  assertCreateOptionsAllowed,
  linkSettingsForPermissions,
  publicPermissionGroupReasons,
} from '$lib/server/permissions';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { applyCreateUrlPlugins } from '../../../plugins/server';

export const GET: RequestHandler = async ({
  request,
  url,
  locals,
  getClientAddress,
}) => {
  const settings = locals.settings;
  const api = await requireApiPermissionContext(
    request,
    settings,
    'list',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { permissions } = api;

  const currentOwner = { userId: api.principal.id };
  const owner = permissions.links.viewAll ? undefined : currentOwner;
  const links = (await listLinks(30, owner, currentOwner)).map((link) => ({
    ...link,
    short_url: shortUrl(url.origin, link.code, link.domain, settings),
  }));

  return json({
    links,
    permission_groups: publicPermissionGroupReasons(permissions),
  });
};

export const POST: RequestHandler = async ({
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
    'create',
    getClientAddress,
  );
  if (api.error) return api.error;
  const { clientIp, permissions } = api;

  try {
    const body = recordValue(await request.json().catch(() => ({})));
    const form = formDataFromJson(body);
    const rawUrl = String(form.get('url') ?? '');
    const rawCode = String(form.get('code') ?? '');
    const rawDomain = String(form.get('domain') ?? '');
    assertCreateOptionsAllowed(form, permissions);

    const parsed = new URL(
      /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    );
    const targetUrl = applyCreateUrlPlugins(
      parsed,
      form,
      settings.plugins,
    ).toString();

    const link = await createLink(targetUrl, rawCode, {
      isAdmin: api.principal.isAdmin,
      domain: selectedShortLinkDomainForCreate(
        rawDomain,
        permissions.links.domains,
        settings.general.defaultDomain,
        settings.general.domains,
      ),
      linkSettings: linkSettingsForPermissions(settings.links, permissions),
      owner: { userId: api.principal.id, ipAddress: clientIp },
      preview: linkPreviewFromForm(form),
      operations: linkOperationsFromForm(form),
    });

    return json(
      {
        link: {
          ...link,
          short_url: shortUrl(url.origin, link.code, link.domain, settings),
        },
        permission_groups: publicPermissionGroupReasons(permissions),
      },
      { status: 201 },
    );
  } catch (error) {
    return json(
      {
        message:
          error instanceof Error
            ? localizeServerMessage(
                settings.i18n.defaultLocale,
                error.message,
                settings.i18n.defaultLocale,
              )
            : text.createFailed,
        permission_groups: publicPermissionGroupReasons(permissions),
      },
      { status: 400 },
    );
  }
};

export const DELETE: RequestHandler = async ({
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

  const body = recordValue(await request.json().catch(() => ({})));
  const form = formDataFromJson(body);
  const links = linkSelectionsFromForm(form);
  if (links.length === 0) {
    return json(
      {
        message: text.deleteNeedsSelection,
        permission_groups: publicPermissionGroupReasons(permissions),
      },
      { status: 400 },
    );
  }

  const result = await deleteShortLinks(links, {
    isAdmin: api.principal.isAdmin,
    allowAnyOwner: permissions.links.deleteAll,
    owner: { userId: api.principal.id },
    allowUserDelete: permissions.links.deleteOwn,
    maxClicks: permissions.links.deleteMaxClicks,
    domain: shortLinkLookupDomain(
      settings,
      String(form.get('domain') || url.searchParams.get('domain') || ''),
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
        permission_groups: publicPermissionGroupReasons(permissions),
      },
      { status: 403 },
    );
  }

  return json({
    ok: true,
    message,
    result,
    permission_groups: publicPermissionGroupReasons(permissions),
  });
};
