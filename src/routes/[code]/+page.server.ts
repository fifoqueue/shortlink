import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { enqueueClick } from '$lib/server/click-queue';
import {
  destinationForRequest,
  getRedirectLinkByCode,
  linkAccessBlockReason,
  protectedLinkCookieName,
  protectedLinkCookieValue,
  verifyLinkPassword,
} from '$lib/server/shortener';
import {
  blockedLinkTitle,
  hasExplicitOpenGraphMetadata,
  openGraphMetadata,
  publicRedirectLink,
  publicRedirectSettings,
} from '$lib/server/link-redirect-page';
import { getClientIp } from '$lib/server/client-ip';
import { collectGeoipMetadata, geoipMetadataForRules } from '$lib/server/geoip';
import { effectivePermissions } from '$lib/server/permissions';
import { redirectRuleConditionTypes } from '$lib/server/redirect-rules';
import { getSettings } from '$lib/server/settings';
import { shouldRenderOpenGraphPreview } from '$lib/server/user-agent';
import { uiText } from '$lib/i18n/ui-text';

export const load: PageServerLoad = async ({
  params,
  request,
  url,
  getClientAddress,
  locals,
  cookies,
}) => {
  const code = params.code;
  const settings = locals.settings ?? (await getSettings());
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  if (!code) error(404, text.messages.linkNotFound);

  const link = await getRedirectLinkByCode(code);
  if (!link) error(404, text.messages.linkNotFound);

  const displaySettings = locals.localizedSettings ?? settings;
  const publicSettings = publicRedirectSettings(displaySettings);
  const publicLink = publicRedirectLink(link);
  const blockReason = linkAccessBlockReason(link);
  const clientIp = getClientIp(
    request,
    getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  let permissionsPromise: ReturnType<typeof effectivePermissions> | undefined;
  const permissionsForRequest = () =>
    (permissionsPromise ??= effectivePermissions({
      settings,
      user: locals.user,
      isAdmin: locals.isAdmin,
      ip: clientIp,
    }));

  if (
    blockReason &&
    (blockReason !== 'expired' ||
      !(await permissionsForRequest()).links.expiresAtBypass)
  ) {
    return {
      mode: 'blocked' as const,
      reason: blockReason,
      title: blockedLinkTitle(blockReason, locals.locale),
      link: publicLink,
      settings: publicSettings,
    };
  }

  if (link.smart.passwordProtected) {
    const permissions = await permissionsForRequest();
    const cookie = cookies.get(protectedLinkCookieName(link.code));
    if (
      !permissions.links.passwordBypass &&
      cookie !== protectedLinkCookieValue(link)
    ) {
      return {
        mode: 'password' as const,
        link: publicLink,
        settings: publicSettings,
      };
    }
  }

  if (settings.links.trackClicks) {
    await enqueueClick({
      linkId: link.id,
      request,
      getClientAddress,
      settings,
    });
  }

  if (
    shouldRenderOpenGraphPreview(request.headers.get('user-agent')) &&
    hasExplicitOpenGraphMetadata(link)
  ) {
    return {
      mode: 'preview' as const,
      link: publicLink,
      settings: publicSettings,
      metadata: openGraphMetadata(link, displaySettings, url.origin),
    };
  }

  const conditionTypes = redirectRuleConditionTypes(link.routing.redirectRules);
  const needsGeoip = conditionTypes.some(
    (type) => type === 'geo-country' || type === 'geo-city',
  );
  const redirectRuleMetadata = needsGeoip
    ? geoipMetadataForRules(
        await collectGeoipMetadata({
          request,
          ip: clientIp,
          settings,
        }),
      )
    : {};

  redirect(
    settings.links.redirectStatus,
    destinationForRequest(link, request, {
      ip: clientIp,
      metadata: redirectRuleMetadata,
    }),
  );
};

export const actions: Actions = {
  unlock: async ({
    params,
    request,
    cookies,
    url,
    locals,
    getClientAddress,
  }) => {
    const code = params.code;
    const settings = locals.settings ?? (await getSettings());
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    if (!code) error(404, text.messages.linkNotFound);

    const link = await getRedirectLinkByCode(code);
    if (!link) error(404, text.messages.linkNotFound);

    const blockReason = linkAccessBlockReason(link);
    const bypassesExpired =
      blockReason === 'expired' &&
      (
        await effectivePermissions({
          settings,
          user: locals.user,
          isAdmin: locals.isAdmin,
          ip: getClientIp(
            request,
            getClientAddress,
            settings.network.trustProxyHeaders,
            settings.network.proxyIpHeaders,
          ),
        })
      ).links.expiresAtBypass;
    if (blockReason && !bypassesExpired) {
      return fail(410, {
        message: blockedLinkTitle(blockReason, locals.locale),
      });
    }

    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    if (!verifyLinkPassword(link, password)) {
      return fail(403, {
        message: text.messages.unlockInvalidPassword,
      });
    }

    cookies.set(
      protectedLinkCookieName(link.code),
      protectedLinkCookieValue(link),
      {
        httpOnly: true,
        maxAge: 60 * 60 * 12,
        path: `/${link.code}`,
        sameSite: 'lax',
        secure: url.protocol === 'https:',
      },
    );

    redirect(303, `/${link.code}`);
  },
};
