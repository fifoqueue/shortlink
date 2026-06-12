<script lang="ts">
  import { resolve } from '$app/paths';
  import CustomHead from '$lib/components/CustomHead.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import { adminThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import '$lib/styles/admin-theme.css';

  let {
    data,
  }: {
    data: {
      locale: SiteLocale;
      theme: import('$lib/config').SiteSettings['theme'];
      customHead: string;
      siteName: string;
      logoUrl: string;
      user: {
        name: string;
        email: string | null;
      };
    };
  } = $props();

  const text = $derived(uiText(data.locale));
</script>

<svelte:head>
  <title>{text.admin.adminRequiredPageTitle} · {data.siteName}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<CustomHead html={data.customHead} />

<main
  class="admin-theme"
  data-theme-mode={data.theme.mode}
  style={adminThemeStyle(data.theme)}
>
  <section>
    <div class="mark">
      {#if data.logoUrl}
        <img src={data.logoUrl} alt="" />
      {:else}
        <span>{data.siteName.slice(0, 1).toUpperCase()}</span>
      {/if}
    </div>
    <div class="locale-row">
      <LocaleSelect locale={data.locale} compact />
    </div>
    <p class="kicker">{data.siteName} ADMIN</p>
    <h1>{text.admin.adminRequiredTitle}</h1>
    <p class="muted">{text.admin.adminRequiredDescription}</p>
    <div class="account">
      <span>{text.admin.currentAccount}</span>
      <strong>{data.user.name}</strong>
      {#if data.user.email}<small>{data.user.email}</small>{/if}
    </div>
    <div class="actions">
      <a class="primary" href={resolve('/logout')} data-sveltekit-reload
        >{text.common.logout}</a
      >
      <a href={resolve('/')}>{text.admin.publicPage}</a>
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
    --admin-panel: color-mix(
      in srgb,
      var(--admin-surface) 94%,
      var(--admin-bg)
    );
    --admin-shadow: color-mix(in srgb, var(--admin-text) 10%, transparent);
    --toggle-label: var(--admin-text);
    --toggle-font-size: 0.82rem;
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
    --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background: var(--admin-bg);
    color: var(--admin-text);
    font-family: var(--font);
  }
  section {
    width: min(460px, 100%);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius);
    padding: 38px;
    background: var(--admin-panel);
    box-shadow: 0 28px 80px var(--admin-shadow);
  }
  .mark {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: calc(var(--admin-radius) * 0.55);
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font-weight: 900;
  }
  .mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .kicker {
    margin: 26px 0 8px;
    color: var(--admin-primary);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .locale-row {
    display: flex;
    justify-content: flex-end;
    margin-top: -42px;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: -0.04em;
  }
  .muted {
    margin: 12px 0 24px;
    color: var(--admin-muted);
    line-height: 1.65;
  }
  .account {
    display: grid;
    gap: 4px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.55);
    padding: 14px;
    background: var(--admin-surface);
  }
  .account span,
  .account small {
    color: var(--admin-muted);
    font-size: 0.78rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 22px;
  }
  .actions a {
    display: grid;
    min-height: 44px;
    place-items: center;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.5);
    padding: 0 15px;
    color: var(--admin-primary);
    font-weight: 850;
    text-decoration: none;
  }
  .actions .primary {
    border-color: var(--admin-primary);
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
  }
</style>
