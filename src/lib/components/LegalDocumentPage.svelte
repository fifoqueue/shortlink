<script lang="ts">
  import { resolve } from '$app/paths';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { uiText } from '$lib/i18n/ui-text';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from './SiteThemeStyles.svelte';

  let {
    settings,
    title,
    content,
    fallbackContent,
  }: {
    settings: SiteSettings;
    title: string;
    content: string;
    fallbackContent: string;
  } = $props();

  const locale = $derived(settings.general.language as SiteLocale);
  const text = $derived(uiText(locale));
</script>

<svelte:head>
  <title>{title} · {settings.general.siteName}</title>
  <meta
    name="robots"
    content={settings.seo.indexable ? 'index,follow' : 'noindex,nofollow'}
  />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <link rel="icon" href={settings.general.faviconUrl} />
</svelte:head>

<SiteThemeStyles />

<div
  class="legal-page site-theme"
  data-theme-mode={settings.theme.mode}
  data-theme-preset={settings.theme.preset}
  style={siteThemeStyle(settings.theme)}
>
  <header>
    <div class="header-inner">
      <a class="brand" href={resolve('/')}>
        {#if settings.general.logoUrl}
          <img src={settings.general.logoUrl} alt="" />
        {:else}
          <span>{settings.general.siteName.slice(0, 1).toUpperCase()}</span>
        {/if}
        <strong>{settings.general.siteName}</strong>
      </a>
      <LocaleSelect {locale} compact />
    </div>
  </header>

  <main>
    <p class="eyebrow">{settings.general.siteName}</p>
    <h1>{title}</h1>
    <article>{content.trim() || fallbackContent}</article>
  </main>

  <footer>
    <p>© {new Date().getFullYear()} {settings.general.footerText}</p>
    <nav aria-label={text.legal.documentsNav}>
      <a href={resolve('/terms')}
        >{settings.legal.termsTitle || text.legal.terms}</a
      >
      <a href={resolve('/privacy')}
        >{settings.legal.privacyTitle || text.legal.privacy}</a
      >
    </nav>
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  .legal-page {
    min-height: 100vh;
    background: var(--page-bg);
    color: var(--text);
    font-family: var(--font);
  }
  header,
  main,
  footer {
    width: min(920px, calc(100% - 40px));
    margin: 0 auto;
  }
  header {
    height: 84px;
  }
  .header-inner {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
  }
  .brand span,
  .brand img {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: calc(var(--radius) * 0.45);
    background: var(--primary);
    color: var(--primary-contrast);
    object-fit: contain;
  }
  .brand strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  main {
    padding: 52px 0 90px;
  }
  .eyebrow {
    margin: 0 0 12px;
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 6vw, 4.8rem);
    font-weight: 550;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  article {
    margin-top: 34px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: clamp(22px, 4vw, 38px);
    background: var(--surface);
    box-shadow: 0 24px 70px color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--text);
    font-size: 0.95rem;
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--border);
    padding: 28px 0 42px;
    color: var(--muted);
    font-size: 0.78rem;
  }
  footer p {
    margin: 0;
  }
  footer nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
  }
  footer a {
    color: inherit;
    font-weight: 800;
    text-decoration: none;
  }
  footer a:hover {
    color: var(--primary);
  }
  @media (max-width: 560px) {
    header,
    main,
    footer {
      width: min(100% - 28px, 920px);
    }
    main {
      padding: 36px 0 64px;
    }
    footer {
      align-items: flex-start;
      flex-direction: column;
    }
    footer nav {
      justify-content: flex-start;
    }
  }
</style>
