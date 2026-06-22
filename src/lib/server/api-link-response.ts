import { json } from '@sveltejs/kit';
import type { SiteLocale, SiteSettings } from '$lib/config';
import { localizeServerMessage } from '$lib/i18n/ui-text';
import { deleteLinksMessage } from '$lib/server/link-form';
import {
  publicPermissionGroupReasons,
  type EffectivePermissions,
} from '$lib/server/permissions';
import {
  deleteLinks as deleteShortLinks,
  type LinkCodeSelection,
} from '$lib/server/shortener';
import { shortUrl } from '$lib/server/url';

type LinkIdentity = {
  code: string;
  domain: string;
};

export function linkWithShortUrl<T extends LinkIdentity>(
  link: T,
  origin: string,
  settings: SiteSettings,
) {
  return {
    ...link,
    shortUrl: shortUrl(origin, link.code, link.domain, settings),
  };
}

export function apiLinkJson<T extends Record<string, unknown>>(
  body: T,
  permissions: EffectivePermissions,
  init?: ResponseInit,
) {
  return json(
    {
      ...body,
      permissionGroups: publicPermissionGroupReasons(permissions),
    },
    init,
  );
}

export function apiLinkMessageJson(
  message: string,
  permissions: EffectivePermissions,
  status: number,
) {
  return apiLinkJson({ message }, permissions, { status });
}

export function apiLinkErrorMessage(
  cause: unknown,
  fallback: string,
  locale: SiteLocale,
  fallbackLocale: SiteLocale,
) {
  return cause instanceof Error
    ? localizeServerMessage(locale, cause.message, fallbackLocale)
    : fallback;
}

export async function deleteApiLinksJson(input: {
  links: Array<string | LinkCodeSelection>;
  domain: string;
  principal: { id: number; isAdmin: boolean };
  permissions: EffectivePermissions;
  text: Parameters<typeof deleteLinksMessage>[1]['text'];
}) {
  const result = await deleteShortLinks(input.links, {
    isAdmin: input.principal.isAdmin,
    allowAnyOwner: input.permissions.links.deleteAll,
    owner: { userId: input.principal.id },
    allowUserDelete: input.permissions.links.deleteOwn,
    maxClicks: input.permissions.links.deleteMaxClicks,
    domain: input.domain,
  });
  const message = deleteLinksMessage(result, { text: input.text });

  if (result.deleted === 0) {
    return apiLinkJson(
      {
        ok: false,
        message: message || input.text.deleteNoLinks,
        result,
      },
      input.permissions,
      { status: 403 },
    );
  }

  return apiLinkJson({ ok: true, message, result }, input.permissions);
}
