<script lang="ts">
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import type { LinkEditFieldKey, SiteLocale, SiteSettings } from '$lib/config';
  import LinkShareResultPanel from '$lib/components/LinkShareResultPanel.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import { uiText } from '$lib/i18n/ui-text';
  import { siteThemeStyle } from '$lib/theme-vars';

  type LinkSummary = {
    shortUrl: string;
  };

  type ShareAccess = {
    canEdit: boolean;
    canViewStats: boolean;
    editableFields: LinkEditFieldKey[];
    expiresAt: string | null;
  };

  type PageData = {
    mode: 'accepted' | 'inviteExpired';
    link: LinkSummary;
    access?: ShareAccess;
    acceptedAsOwner?: boolean;
    statsHref?: string;
    locale: SiteLocale;
    siteName: string;
    theme: SiteSettings['theme'];
    customHead: string;
  };

  let { data }: { data: PageData } = $props();
  const text = $derived(uiText(data.locale));
</script>

<svelte:head>
  <title>
    {data.mode === 'accepted'
      ? text.linkPermission.acceptedTitle
      : text.linkPermission.inviteExpiredTitle}
    · {data.siteName}
  </title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<div
  class="invite-page site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  <SiteHeader />

  <main>
    <LinkShareResultPanel
      mode={data.mode}
      shortUrl={data.link.shortUrl}
      acceptedAsOwner={data.acceptedAsOwner}
      canViewStats={data.access?.canViewStats}
      statsHref={data.statsHref}
      locale={data.locale}
    />
  </main>
</div>

<style>
  .invite-page {
    min-height: 100dvh;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  main {
    width: min(800px, calc(100% - 48px));
    margin: auto;
    padding: 48px 0 80px;
  }
  @media (max-width: 600px) {
    main {
      width: calc(100% - 32px);
      padding: 32px 0 56px;
    }
  }
</style>
