import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClientIp } from '$lib/server/client-ip';
import { getLinkOwner } from '$lib/server/link-owner';
import {
  acceptLinkShareInvite,
  cancelLinkShare,
  getLinkShareDetails,
  getShareableLinkAccess,
  type LinkShareDetails,
  type LinkShareRecipient,
  linkShareInviteUrl,
  revokeLinkShareGrant,
  revokeLinkShareGrants,
  rotateLinkShareToken,
  saveLinkShareGrant,
  saveLinkShare,
} from '$lib/server/link-sharing';
import { effectivePermissions } from '$lib/server/permissions';
import { getSettings, parseBoolean, stringValue } from '$lib/server/settings';
import { shortLinkLookupDomain, shortUrl } from '$lib/server/url';
import { formatText, localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { pageParam, paginateItems } from '$lib/server/pagination';
import {
  isRecipientSearchField,
  RECIPIENT_SEARCH_PARAMS,
  type RecipientSearchState,
} from '$lib/search';

const RECIPIENT_PAGE_SIZE = 10;

function cleanReturnTo(value: string | null, url: URL) {
  if (!value) return '/';
  try {
    const parsed = new URL(value, url.origin);
    if (parsed.origin !== url.origin) return '/';
    if (parsed.pathname === url.pathname) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function managementMailtoHref(input: {
  siteName: string;
  code: string;
  shortUrl: string;
  inviteUrl: string;
  text: ReturnType<typeof uiText>;
}) {
  const subject = formatText(input.text.linkPermission.emailSubject, {
    siteName: input.siteName,
    code: input.code,
  });
  const body = formatText(input.text.linkPermission.emailBody, {
    shortUrl: input.shortUrl,
    inviteUrl: input.inviteUrl,
  });
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function idValue(form: FormData, name: string) {
  const value = Number(stringValue(form, name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function idValues(form: FormData, name: string) {
  return [
    ...new Set(
      form
        .getAll(name)
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];
}

function hrefWithSearch(url: URL, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

function hrefWithoutParams(url: URL, names: string[]) {
  const searchParams = new URLSearchParams(url.search);
  for (const name of names) searchParams.delete(name);
  return hrefWithSearch(url, searchParams);
}

function parseRecipientSearch(url: URL): RecipientSearchState {
  const requestedField =
    url.searchParams.get(RECIPIENT_SEARCH_PARAMS.field) ?? '';
  return {
    field: isRecipientSearchField(requestedField) ? requestedField : 'all',
    query: (url.searchParams.get(RECIPIENT_SEARCH_PARAMS.query) ?? '')
      .trim()
      .slice(0, 200),
  };
}

function normalizedSearchText(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase();
}

function recipientMatchesSearch(
  recipient: LinkShareRecipient,
  search: RecipientSearchState,
) {
  const query = normalizedSearchText(search.query);
  if (!query) return true;

  const fields =
    search.field === 'name'
      ? [recipient.name]
      : search.field === 'email'
        ? [recipient.email]
        : [recipient.name, recipient.email];

  return fields.some((field) => normalizedSearchText(field).includes(query));
}

function paginatedShareRecipients(share: LinkShareDetails | null, url: URL) {
  const search = parseRecipientSearch(url);
  const recipients = share?.recipients ?? [];
  const filteredRecipients = recipients.filter((recipient) =>
    recipientMatchesSearch(recipient, search),
  );
  const pagination = paginateItems(
    filteredRecipients,
    pageParam(url, RECIPIENT_SEARCH_PARAMS.page),
    RECIPIENT_PAGE_SIZE,
  );

  return {
    share: share ? { ...share, recipients: pagination.items } : null,
    recipientSearch: {
      ...search,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: pagination.totalItems,
      totalRecipients: recipients.length,
      totalPages: pagination.totalPages,
      baseHref: hrefWithoutParams(url, [
        RECIPIENT_SEARCH_PARAMS.field,
        RECIPIENT_SEARCH_PARAMS.query,
        RECIPIENT_SEARCH_PARAMS.page,
      ]),
      pageHrefBase: hrefWithoutParams(url, [RECIPIENT_SEARCH_PARAMS.page]),
    },
  };
}

async function permissionContext(input: {
  params: { code?: string };
  url: URL;
  locals: App.Locals;
  cookies: Cookies;
  request: Request;
  getClientAddress: () => string;
  domain?: string | null;
}) {
  const settings = input.locals.settings ?? (await getSettings());
  const text = uiText(input.locals.locale, settings.i18n.defaultLocale);
  const code = input.params.code;
  if (!code) error(404, text.messages.linkNotFound);

  const domain = shortLinkLookupDomain(
    settings,
    input.domain ?? input.url.searchParams.get('domain'),
    input.url.origin,
  );
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
  const owner = getLinkOwner({
    cookies: input.cookies,
    userId: input.locals.user?.id,
    ip: clientIp,
  });

  return { settings, text, code, domain, clientIp, permissions, owner };
}

async function requireManagedShare(input: {
  params: { code?: string };
  url: URL;
  locals: App.Locals;
  cookies: Cookies;
  request: Request;
  getClientAddress: () => string;
  domain?: string | null;
}) {
  const context = await permissionContext(input);
  const access = await getShareableLinkAccess({
    code: context.code,
    domain: context.domain,
    owner: context.owner,
    isAdmin: input.locals.isAdmin,
    allowAnyOwner: context.permissions.links.editAll,
  });
  if (access.status === 'not_found') {
    error(404, context.text.messages.linkNotFound);
  }
  if (access.status === 'denied') {
    error(403, context.text.messages.shareManageDenied);
  }
  if (!context.permissions.links.share) {
    error(403, context.text.messages.shareManageDenied);
  }
  return { ...context, link: access.link };
}

export const load: PageServerLoad = async ({
  params,
  url,
  locals,
  cookies,
  request,
  getClientAddress,
}) => {
  const context = await permissionContext({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  });
  const displaySettings = locals.localizedSettings ?? context.settings;
  const inviteToken = (url.searchParams.get('invite') ?? '').trim();

  if (inviteToken) {
    if (!locals.user) {
      redirect(
        303,
        `/login?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
      );
    }

    const result = await acceptLinkShareInvite({
      code: context.code,
      domain: context.domain,
      token: inviteToken,
      userId: locals.user.id,
    });
    if (result.status === 'not_found') {
      error(404, context.text.messages.shareInviteInvalid);
    }

    if (result.status === 'expired') {
      return {
        mode: 'inviteExpired' as const,
        link: {
          code: result.link.code,
          domain: result.link.domain,
          url: result.link.url,
          short_url: shortUrl(
            url.origin,
            result.link.code,
            result.link.domain,
            context.settings,
          ),
        },
        locale: locals.locale,
        siteName: displaySettings.general.siteName,
        theme: displaySettings.theme,
        customHead: displaySettings.seo.customHead,
      };
    }

    const link = {
      code: result.link.code,
      domain: result.link.domain,
      url: result.link.url,
      short_url: shortUrl(
        url.origin,
        result.link.code,
        result.link.domain,
        context.settings,
      ),
    };
    const statsParams = new URLSearchParams({ domain: link.domain });
    return {
      mode: 'accepted' as const,
      acceptedAsOwner: result.status === 'owner',
      link,
      access: result.access,
      statsHref: `/${link.code}/statistics?${statsParams.toString()}`,
      locale: locals.locale,
      siteName: displaySettings.general.siteName,
      theme: displaySettings.theme,
      customHead: displaySettings.seo.customHead,
    };
  }

  const managed = await requireManagedShare({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  });
  const link = {
    code: managed.link.code,
    domain: managed.link.domain,
    url: managed.link.url,
    short_url: shortUrl(
      url.origin,
      managed.link.code,
      managed.link.domain,
      managed.settings,
    ),
  };
  const shareDetails = await getLinkShareDetails(managed.link.id);
  const { share, recipientSearch } = paginatedShareRecipients(
    shareDetails,
    url,
  );
  const inviteUrl =
    share?.inviteActive && share.token
      ? linkShareInviteUrl(url.origin, share.token)
      : null;

  return {
    mode: 'manage' as const,
    link,
    share,
    recipientSearch,
    inviteUrl,
    mailtoHref: inviteUrl
      ? managementMailtoHref({
          siteName: displaySettings.general.siteName,
          code: link.code,
          shortUrl: link.short_url,
          inviteUrl,
          text: managed.text,
        })
      : null,
    returnTo: cleanReturnTo(url.searchParams.get('returnTo'), url),
    locale: locals.locale,
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
  };
};

export const actions: Actions = {
  save: async ({ params, url, locals, cookies, request, getClientAddress }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    try {
      await saveLinkShare({
        linkId: managed.link.id,
        createdByUserId: locals.user?.id,
        expiresAt: stringValue(form, 'expiresAt'),
        canViewStats: parseBoolean(form, 'canViewStats'),
        editableFields: form.getAll('editableFields'),
      });
      return {
        ok: true,
        message: managed.text.messages.shareSaved,
      };
    } catch (cause) {
      return fail(400, {
        ok: false,
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                managed.settings.i18n.defaultLocale,
              )
            : managed.text.messages.shareSaveFailed,
      });
    }
  },

  rotate: async ({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    const share = await rotateLinkShareToken(managed.link.id);
    if (!share) {
      return fail(404, {
        ok: false,
        message: managed.text.messages.shareInviteInvalid,
      });
    }
    return {
      ok: true,
      message: managed.text.messages.shareRotated,
    };
  },

  cancel: async ({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    await cancelLinkShare(managed.link.id);
    return {
      ok: true,
      message: managed.text.messages.shareCanceled,
    };
  },

  grant: async ({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    const grantId = idValue(form, 'grantId');
    if (!grantId) {
      return fail(400, {
        ok: false,
        message: managed.text.messages.shareRecipientInvalid,
      });
    }

    try {
      const grant = await saveLinkShareGrant({
        linkId: managed.link.id,
        grantId,
        expiresAt: stringValue(form, 'expiresAt'),
        canViewStats: parseBoolean(form, 'canViewStats'),
        editableFields: form.getAll('editableFields'),
      });
      if (!grant) {
        return fail(404, {
          ok: false,
          message: managed.text.messages.shareRecipientInvalid,
        });
      }
      return {
        ok: true,
        message: managed.text.messages.shareGrantSaved,
      };
    } catch (cause) {
      return fail(400, {
        ok: false,
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                managed.settings.i18n.defaultLocale,
              )
            : managed.text.messages.shareSaveFailed,
      });
    }
  },

  revoke: async ({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    const grantId = idValue(form, 'grantId');
    if (!grantId) {
      return fail(400, {
        ok: false,
        message: managed.text.messages.shareRecipientInvalid,
      });
    }

    const count = await revokeLinkShareGrant({
      linkId: managed.link.id,
      grantId,
    });
    if (count === 0) {
      return fail(404, {
        ok: false,
        message: managed.text.messages.shareRecipientInvalid,
      });
    }
    return {
      ok: true,
      message: managed.text.messages.shareGrantRevoked,
    };
  },

  bulkRevoke: async ({
    params,
    url,
    locals,
    cookies,
    request,
    getClientAddress,
  }) => {
    const form = await request.formData();
    const managed = await requireManagedShare({
      params,
      url,
      locals,
      cookies,
      request,
      getClientAddress,
      domain: stringValue(form, 'domain'),
    });
    const grantIds = idValues(form, 'grantIds');
    if (grantIds.length === 0) {
      return fail(400, {
        ok: false,
        message: managed.text.messages.shareRecipientInvalid,
      });
    }

    const count = await revokeLinkShareGrants({
      linkId: managed.link.id,
      grantIds,
    });
    if (count === 0) {
      return fail(404, {
        ok: false,
        message: managed.text.messages.shareRecipientInvalid,
      });
    }
    return {
      ok: true,
      message: formatText(managed.text.messages.shareGrantsRevoked, {
        count,
      }),
    };
  },
};
