import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { acceptLinkShareInvite } from '$lib/server/link-sharing';
import { getSettings } from '$lib/server/settings';
import { shortUrl } from '$lib/server/url';
import { uiText } from '$lib/i18n/ui-text';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const settings = locals.settings ?? (await getSettings());
  const displaySettings = locals.localizedSettings ?? settings;
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const token = (params.code ?? '').trim();
  if (!token) error(404, text.messages.shareInviteInvalid);

  if (!locals.user) {
    redirect(
      303,
      `/login?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
    );
  }

  const result = await acceptLinkShareInvite({
    token,
    userId: locals.user.id,
  });
  if (result.status === 'not_found') {
    error(404, text.messages.shareInviteInvalid);
  }

  const link = {
    code: result.link.code,
    domain: result.link.domain,
    url: result.link.url,
    shortUrl: shortUrl(
      url.origin,
      result.link.code,
      result.link.domain,
      settings,
    ),
  };

  if (result.status === 'expired') {
    return {
      mode: 'inviteExpired' as const,
      link,
      locale: locals.locale,
      siteName: displaySettings.general.siteName,
      theme: displaySettings.theme,
      customHead: displaySettings.seo.customHead,
    };
  }

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
};
