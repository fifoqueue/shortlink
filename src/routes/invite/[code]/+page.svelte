<script lang="ts">
  import { resolve } from '$app/paths';
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
  const homeHref = $derived(resolve('/'));
</script>

<svelte:head>
  <title>
    {data.mode === 'accepted'
      ? text.linkPermission.acceptedTitle
      : text.linkPermission.inviteExpiredTitle}
  </title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<div
  class="invite-page site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  <header>
    <a class="brand" href={homeHref}>
      <span>{data.siteName.slice(0, 1).toUpperCase()}</span>
      <strong>{data.siteName}</strong>
    </a>
    <a class="back-link" href={homeHref}>{text.common.home}</a>
  </header>

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
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  .invite-page {
    min-height: 100vh;
    background: var(--page-bg);
    color: var(--text);
    font-family: var(--font);
  }
  header,
  main {
    width: min(980px, calc(100% - 40px));
    margin: 0 auto;
  }
  header {
    display: flex;
    min-height: 82px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand,
  .back-link {
    color: inherit;
    text-decoration: none;
  }
  .brand {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }
  .brand span {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: calc(var(--radius) * 0.45);
    background: var(--primary);
    color: var(--primary-contrast);
    font-weight: 900;
  }
  .brand strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .back-link {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.4);
    padding: 0 14px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 850;
  }
  main {
    display: grid;
    gap: 18px;
    padding: 56px 0 90px;
  }
  @media (max-width: 720px) {
    header,
    main {
      width: min(100% - 28px, 980px);
    }
    main {
      padding-top: 36px;
    }
  }
</style>
