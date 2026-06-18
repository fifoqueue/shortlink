<script lang="ts">
  import { resolve } from '$app/paths';
  import type { LinkEditFieldKey, SiteLocale, SiteSettings } from '$lib/config';
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
    {#if data.mode === 'accepted'}
      <section class="result-panel">
        <p>{text.linkPermission.acceptedKicker}</p>
        <h1>
          {data.acceptedAsOwner
            ? text.linkPermission.ownerAcceptedTitle
            : text.linkPermission.acceptedTitle}
        </h1>
        <span>{data.link.shortUrl}</span>
        <div class="result-actions">
          <a href={homeHref}>{text.linkPermission.openLinkList}</a>
          {#if data.access?.canViewStats && data.statsHref}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={data.statsHref}>{text.managedLinks.stats}</a>
          {/if}
        </div>
      </section>
    {:else}
      <section class="result-panel">
        <p>{text.linkPermission.acceptedKicker}</p>
        <h1>{text.linkPermission.inviteExpiredTitle}</h1>
        <span>{data.link.shortUrl}</span>
        <p>{text.linkPermission.inviteExpiredDescription}</p>
        <div class="result-actions">
          <a href={homeHref}>{text.common.home}</a>
        </div>
      </section>
    {/if}
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
  .back-link,
  .result-actions a {
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
  .back-link,
  .result-actions a {
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
  .result-panel {
    display: grid;
    max-width: 680px;
    gap: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 70px auto 0;
    padding: 22px;
    background: var(--surface);
    box-shadow: 0 22px 64px color-mix(in srgb, var(--text) 7%, transparent);
  }
  .result-panel > p:first-child {
    margin: 0;
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  h1,
  p {
    margin-top: 0;
  }
  h1 {
    max-width: 780px;
    margin-bottom: 0;
    font-size: clamp(2.2rem, 6vw, 4rem);
    font-weight: 500;
    line-height: 1;
  }
  .result-panel > span {
    color: var(--muted);
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }
  .result-panel p:not(:first-child) {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .result-actions a:first-child {
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
    background: var(--primary);
    color: var(--primary-contrast);
  }
  @media (max-width: 720px) {
    header,
    main {
      width: min(100% - 28px, 980px);
    }
    main {
      padding-top: 36px;
    }
    .result-actions {
      display: grid;
    }
    .result-actions a {
      width: 100%;
    }
  }
</style>
