<script lang="ts">
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
  }: {
    data: {
      locale: SiteLocale;
      ok: boolean;
      purpose: 'signup' | 'email-change';
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      registrationAllowed: boolean;
    };
  } = $props();

  const text = $derived(uiText(data.locale));
</script>

<svelte:head>
  <title>{text.auth.verifyTitle} · {data.siteName}</title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  <section>
    <div class="topline">
      <p class="kicker">{data.siteName}</p>
      <LocaleSelect locale={data.locale} compact />
    </div>
    {#if data.ok}
      <h1>{text.auth.verifyOk}</h1>
      <p>
        {data.purpose === 'email-change'
          ? text.auth.emailChanged
          : text.auth.accountActivated}
      </p>
      <div class="actions">
        <a class="action-button primary" href={resolve('/login')}
          >{text.common.login}</a
        >
        <a class="action-button" href={resolve('/')}>{text.common.home}</a>
      </div>
    {:else}
      <h1>{text.auth.verifyFailed}</h1>
      <p>{text.auth.verifyFailedDetail}</p>
      <div class:single={!data.registrationAllowed} class="actions">
        {#if data.registrationAllowed}
          <a class="action-button primary" href={resolve('/signup')}
            >{text.auth.signupAgain}</a
          >
        {/if}
        <a class="action-button" href={resolve('/')}>{text.common.home}</a>
      </div>
    {/if}
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
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  section {
    width: min(460px, 100%);
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 38px;
    background: var(--page-surface);
  }
  .topline {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .kicker {
    margin: 0 0 8px;
    color: var(--page-primary);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .topline .kicker {
    margin-bottom: 0;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 2rem;
  }
  p {
    margin: 0;
    color: var(--page-muted);
    line-height: 1.6;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 24px;
  }
  .actions.single {
    grid-template-columns: 1fr;
  }
  .action-button {
    display: grid;
    min-height: 48px;
    place-items: center;
    border: 1px solid var(--page-border);
    border-radius: 11px;
    background: var(--page-surface);
    color: var(--page-primary);
    font-weight: 900;
    text-decoration: none;
  }
  .action-button.primary {
    border-color: var(--page-primary);
    background: var(--page-primary);
    color: var(--page-primary-contrast);
  }
  @media (max-width: 520px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
