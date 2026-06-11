<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  const locale = $derived(
    (page.data?.locale as SiteLocale | undefined) ?? defaultSiteLocale,
  );
  const text = $derived(uiText(locale));
</script>

<main>
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? text.common.genericError}</p>
  <a href={resolve('/')}>{text.common.backHome}</a>
</main>

<style>
  main {
    display: grid;
    min-height: 100vh;
    place-content: center;
    gap: 12px;
    padding: 24px;
    font-family: var(--font, ui-sans-serif, system-ui, sans-serif);
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 5rem;
  }

  p {
    margin: 0;
    color: #4b5563;
  }
</style>
