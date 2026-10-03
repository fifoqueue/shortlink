<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import type { SiteLocale } from '$lib/config';
  import type { PublicLegalSettings } from '$lib/public-settings';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    settings,
    extra,
  }: {
    settings: Pick<PublicLegalSettings, 'general' | 'legal'>;
    extra?: Snippet;
  } = $props();

  const text = $derived(uiText(settings.general.language as SiteLocale));
</script>

<footer>
  <p>© {new Date().getFullYear()} {settings.general.footerText}</p>
  <nav aria-label={text.legal.documentsNav}>
    <!-- External legal URLs set by the operator cannot go through resolve(). -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      href={settings.legal.termsUrl || resolve('/terms')}
      data-sveltekit-reload={!!settings.legal.termsUrl}
      >{settings.legal.termsTitle || text.legal.terms}</a
    >
    <a
      href={settings.legal.privacyUrl || resolve('/privacy')}
      data-sveltekit-reload={!!settings.legal.privacyUrl}
      >{settings.legal.privacyTitle || text.legal.privacy}</a
    >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </nav>
  {@render extra?.()}
</footer>

<style>
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
  p {
    margin: 0;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  @media (max-width: 800px) {
    footer {
      width: calc(100% - 32px);
    }
  }
</style>
