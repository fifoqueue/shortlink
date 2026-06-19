import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { SiteSettings } from '$lib/config';
import { enqueueClick } from '$lib/server/click-queue';
import {
  getRedirectLinkByCode,
  linkAccessBlockReason,
  protectedLinkCookieName,
  protectedLinkCookieValue,
  redirectResultForRequest,
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
import { redirectRuleClickMetadata } from '$lib/server/click-metadata';
import { effectivePermissions } from '$lib/server/permissions';
import { redirectRuleConditionTypes } from '$lib/server/redirect-rules';
import { getSettings } from '$lib/server/settings';
import { shortLinkDomainForOrigin } from '$lib/server/url';
import { shouldRenderOpenGraphPreview } from '$lib/server/user-agent';
import { uiText } from '$lib/i18n/ui-text';
import { getPluginUser } from '../../plugins/auth-registry';

async function ensureLocalsUser(
  locals: App.Locals,
  cookies: Cookies,
  settings: SiteSettings,
) {
  if (locals.user) return locals.user;
  const user = await getPluginUser(cookies, settings.plugins);
  locals.user = user;
  locals.isAdmin = user?.isAdmin === true;
  return user;
}

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

  const requestOrigin = locals.requestOrigin ?? url.origin;
  const domain = shortLinkDomainForOrigin(settings, requestOrigin);
  const link = await getRedirectLinkByCode(code, domain);
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
    (permissionsPromise ??= (async () => {
      const user = await ensureLocalsUser(locals, cookies, settings);
      return effectivePermissions({
        settings,
        user,
        isAdmin: locals.isAdmin,
        ip: clientIp,
      });
    })());

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

  if (
    shouldRenderOpenGraphPreview(request.headers.get('user-agent')) &&
    hasExplicitOpenGraphMetadata(link)
  ) {
    if (settings.links.trackClicks) {
      enqueueClick({
        linkId: link.id,
        request,
        getClientAddress,
        settings,
      });
    }

    return {
      mode: 'preview' as const,
      link: publicLink,
      settings: publicSettings,
      metadata: openGraphMetadata(link, displaySettings, requestOrigin),
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
  const redirectResult = redirectResultForRequest(link, request, {
    ip: clientIp,
    metadata: redirectRuleMetadata,
  });

  if (settings.links.trackClicks) {
    enqueueClick({
      linkId: link.id,
      request,
      getClientAddress,
      settings,
      metadata: redirectRuleClickMetadata({
        ruleCount: link.routing.redirectRules.length,
        destinationUrl: redirectResult.url,
        matchedRule: redirectResult.matchedRule,
      }),
    });
  }

  redirect(settings.links.redirectStatus, redirectResult.url);
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

    const requestOrigin = locals.requestOrigin ?? url.origin;
    const domain = shortLinkDomainForOrigin(settings, requestOrigin);
    const link = await getRedirectLinkByCode(code, domain);
    if (!link) error(404, text.messages.linkNotFound);

    const blockReason = linkAccessBlockReason(link);
    let bypassesExpired = false;
    if (blockReason === 'expired') {
      await ensureLocalsUser(locals, cookies, settings);
      const permissions = await effectivePermissions({
        settings,
        user: locals.user,
        isAdmin: locals.isAdmin,
        ip: getClientIp(
          request,
          getClientAddress,
          settings.network.trustProxyHeaders,
          settings.network.proxyIpHeaders,
        ),
      });
      bypassesExpired = permissions.links.expiresAtBypass;
    }
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
        secure: new URL(requestOrigin).protocol === 'https:',
      },
    );

    redirect(303, `/${link.code}`);
  },
};
