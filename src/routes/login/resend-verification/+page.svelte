<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { siteThemeStyle } from '$lib/theme-vars';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      available: boolean;
      unavailableReason: string;
    };
    form?: {
      ok?: boolean;
      message?: string;
      values?: { email?: string };
    };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<svelte:head>
  <title>{text.auth.resendVerificationTitle} · {data.siteName}</title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} locale={data.locale} />
    {/key}
  {/if}

  <section>
    <div class="topline">
      <p class="kicker">{data.siteName}</p>
      <LocaleSelect locale={data.locale} compact />
    </div>
    <h1>{text.auth.resendVerificationTitle}</h1>
    <p class="muted">{text.auth.resendVerificationDescription}</p>

    {#if !data.available}
      <div class="inline-note">{data.unavailableReason}</div>
    {:else}
      <form method="POST" action="?/request" use:enhance>
        <label>
          {text.auth.email}
          <input
            type="email"
            name="email"
            autocomplete="email"
            value={form?.values?.email ?? ''}
            required
          />
        </label>
        <button type="submit">{text.auth.sendVerificationEmail}</button>
      </form>
    {/if}

    <div class="links">
      <a class="link-button primary" href={resolve('/login')}
        >{text.common.login}</a
      >
      <a class="link-button" href={resolve('/')}>{text.common.home}</a>
    </div>
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
    box-shadow: 0 28px 80px
      color-mix(in srgb, var(--page-text) 10%, transparent);
  }
  .topline {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .kicker {
    margin: 0;
    color: var(--page-primary);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  .muted {
    margin: 12px 0 26px;
    color: var(--page-muted);
    line-height: 1.6;
  }
  form,
  label {
    display: grid;
    gap: 10px;
  }
  label {
    color: var(--page-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  input,
  button,
  .link-button {
    min-height: 48px;
    border-radius: 11px;
    font: inherit;
  }
  input {
    border: 1px solid var(--page-border);
    padding: 0 14px;
    background: var(--page-surface);
    color: var(--page-text);
  }
  button {
    display: grid;
    place-items: center;
    border: 0;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
    cursor: pointer;
  }
  .inline-note {
    margin-bottom: 18px;
    border-radius: 11px;
    padding: 13px 14px;
    background: var(--notice-error-bg);
    color: var(--notice-error-text);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 22px;
  }
  .link-button {
    display: grid;
    place-items: center;
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-primary);
    font-size: 0.82rem;
    font-weight: 900;
    text-decoration: none;
  }
  .link-button.primary {
    border-color: var(--page-primary);
    background: var(--page-primary);
    color: var(--page-primary-contrast);
  }
  @media (max-width: 520px) {
    .links {
      grid-template-columns: 1fr;
    }
  }
</style>
