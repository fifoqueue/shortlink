<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import {
    defaultSettings,
    defaultSiteLocale,
    type SiteLocale,
    type SiteSettings,
  } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { siteThemeStyle } from '$lib/theme-vars';

  type ErrorShell = {
    locale: SiteLocale;
    siteName: string;
    logoUrl: string;
    faviconUrl: string;
    theme: SiteSettings['theme'];
    customHead: string;
  };

  const shell = $derived(page.data?.shell as ErrorShell | undefined);

  const locale = $derived(
    shell?.locale ??
      (page.data?.locale as SiteLocale | undefined) ??
      defaultSiteLocale,
  );
  const theme = $derived(shell?.theme ?? defaultSettings.theme);
  const siteName = $derived(
    shell?.siteName ?? defaultSettings.general.siteName,
  );
  const logoUrl = $derived(shell?.logoUrl ?? defaultSettings.general.logoUrl);
  const faviconUrl = $derived(
    shell?.faviconUrl ?? defaultSettings.general.faviconUrl,
  );
  const customHead = $derived(shell?.customHead ?? '');
  const text = $derived(uiText(locale));
  const message = $derived(page.error?.message ?? text.common.genericError);
  const displayMessage = $derived(
    page.status >= 500 ? text.common.serverError : message,
  );
  const title = $derived(`${message} · ${siteName}`);
  const statusLabel = $derived(`HTTP ${page.status}`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="robots" content="noindex,nofollow" />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <link rel="icon" href={faviconUrl} />
  <meta name="theme-color" content={theme.customTokens.primary} />
</svelte:head>

<SiteThemeStyles {customHead} />

<main
  class="site-theme error-page"
  data-theme-mode={theme.mode}
  data-theme-preset={theme.preset}
  style={siteThemeStyle(theme)}
>
  <section>
    <a class="brand" href={resolve('/')}>
      {#if logoUrl}
        <img src={logoUrl} alt="" />
      {:else}
        <span>{siteName.slice(0, 1).toUpperCase()}</span>
      {/if}
      <strong>{siteName}</strong>
    </a>

    <div class="content">
      <p class="kicker">{statusLabel}</p>
      <h1 class:short-message={displayMessage.length <= 18}>
        {displayMessage}
      </h1>
    </div>

    <a class="home-link" href={resolve('/')}>{text.common.home}</a>
    <LocaleSelect {locale} compact />
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
  }

  main {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--page-primary) 10%, transparent),
        transparent 42%
      ),
      var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }

  section {
    display: grid;
    width: min(430px, 100%);
    gap: 24px;
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 34px;
    background: var(--page-surface);
    box-shadow: 0 28px 80px
      color-mix(in srgb, var(--page-text) 10%, transparent);
  }

  .brand {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    align-items: center;
    gap: 10px;
    color: var(--page-text);
    text-decoration: none;
  }

  .brand img,
  .brand span {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 10px;
  }

  .brand img {
    object-fit: contain;
  }

  .brand span {
    display: grid;
    place-items: center;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
  }

  .brand strong {
    overflow: hidden;
    color: var(--page-text);
    font-size: 0.94rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content {
    display: grid;
    gap: 10px;
  }

  .kicker {
    margin: 0;
    color: var(--page-primary);
    font-size: 0.74rem;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.45rem, 5vw, 1.8rem);
    line-height: 1.18;
  }

  h1.short-message {
    white-space: nowrap;
  }

  .home-link {
    display: inline-flex;
    width: fit-content;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--page-border);
    border-radius: 11px;
    padding: 0 16px;
    background: var(--page-surface);
    color: var(--page-primary);
    font-weight: 850;
    text-decoration: none;
  }

  @media (max-width: 520px) {
    main {
      padding: 16px;
    }

    section {
      padding: 26px;
    }
  }

  @media (max-width: 360px) {
    h1.short-message {
      white-space: normal;
    }
  }
</style>
