import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createLink,
  deleteLinks as deleteShortLinks,
  listLinks,
} from '$lib/server/shortener';
import { shortUrl } from '$lib/server/url';
import { requireApiPermissionContext } from '$lib/server/api-permissions';
import {
  deleteLinksMessage,
  linkCodesFromForm,
  linkOperationsFromForm,
  linkPreviewFromForm,
} from '$lib/server/link-form';
import { formDataFromJson, recordValue } from '$lib/server/api-link-input';
import {
  assertCreateOptionsAllowed,
  linkSettingsForPermissions,
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
    short_url: shortUrl(url.origin, link.code),
  }));

  return json({ links });
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
      linkSettings: linkSettingsForPermissions(settings.links, permissions),
      owner: { userId: api.principal.id, ipAddress: clientIp },
      preview: linkPreviewFromForm(form),
      operations: linkOperationsFromForm(form),
    });

    return json(
      {
        link: {
          ...link,
          short_url: shortUrl(url.origin, link.code),
        },
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
      },
      { status: 400 },
    );
  }
};

export const DELETE: RequestHandler = async ({
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

  const body = recordValue(await request.json().catch(() => ({})));
  const codes = linkCodesFromForm(formDataFromJson(body));
  if (codes.length === 0) {
    return json({ message: text.deleteNeedsSelection }, { status: 400 });
  }

  const result = await deleteShortLinks(codes, {
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
