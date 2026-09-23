<script lang="ts">
  import { resolve } from '$app/paths';
  import type { SiteLocale } from '$lib/config';
  import type { PublicLegalSettings } from '$lib/public-settings';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { uiText } from '$lib/i18n/ui-text';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import SiteThemeStyles from './SiteThemeStyles.svelte';

  let {
    settings,
    title,
    content,
    fallbackContent,
  }: {
    settings: PublicLegalSettings;
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

<SiteThemeStyles customHead={settings.seo.customHead} />

<div
  class="legal-page site-theme"
  data-theme-mode={settings.theme.mode}
  data-theme-preset={settings.theme.preset}
  style={siteThemeStyle(settings.theme)}
>
  <SiteHeader />

  <main>
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
  .legal-page {
    min-height: 100dvh;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  main {
    width: min(800px, calc(100% - 48px));
    margin: 0 auto;
    padding: 48px 0 80px;
  }
  h1 {
    margin: 0 0 32px;
    font-size: 1.8rem;
    font-weight: 650;
    letter-spacing: -0.04em;
    line-height: 1.3;
  }
  article {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.95rem;
    line-height: 1.85;
  }
  footer {
    width: min(1120px, calc(100% - 48px));
    margin: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--page-border);
    padding: 24px 0;
    color: var(--page-muted);
    font-size: 0.75rem;
  }
  footer p {
    margin: 0;
  }
  footer nav {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }
  footer a {
    color: inherit;
    text-decoration: none;
  }
  footer a:hover {
    text-decoration: underline;
  }
  @media (max-width: 600px) {
    main {
      width: calc(100% - 32px);
      padding: 32px 0 56px;
    }
    footer {
      width: calc(100% - 32px);
    }
  }
</style>
