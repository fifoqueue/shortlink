<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { siteThemeStyle } from '$lib/theme-vars';

  type ToastData = {
    ok?: boolean;
    message: string;
  };

  type AuthLink = {
    href: string;
    label: string;
    primary?: boolean;
  };

  let {
    locale,
    siteName,
    theme,
    customHead,
    title,
    documentTitle = title,
    description,
    toast,
    links = [],
    children,
  }: {
    locale: SiteLocale;
    siteName: string;
    theme: SiteSettings['theme'];
    customHead: string;
    title: string;
    documentTitle?: string;
    description: string;
    toast?: ToastData;
    links?: AuthLink[];
    children?: Snippet;
  } = $props();

  function resolvePath(path: string) {
    return resolve(path as '/');
  }
</script>

<svelte:head>
  <title>{documentTitle} · {siteName}</title>
</svelte:head>

<SiteThemeStyles {customHead} />

<main
  class="auth-page site-theme"
  data-theme-mode={theme.mode}
  data-theme-preset={theme.preset}
  style={siteThemeStyle(theme)}
>
  {#if toast?.message}
    {#key toast.message}
      <ToastNotice message={toast.message} ok={toast.ok} {locale} />
    {/key}
  {/if}

  <section class="auth-card">
    <div class="topline">
      <p class="kicker">{siteName}</p>
      <LocaleSelect {locale} compact />
    </div>
    <h1>{title}</h1>
    <p class="muted">{description}</p>

    {#if children}
      {@render children()}
    {/if}

    {#if links.length > 0}
      <div class:single={links.length === 1} class="links">
        {#each links as link (link.href)}
          <a
            class:primary={link.primary}
            class="link-button"
            href={resolvePath(link.href)}>{link.label}</a
          >
        {/each}
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
  .auth-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  .auth-card {
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
  .muted,
  .auth-card :global(.hint),
  .auth-card :global(label span) {
    color: var(--page-muted);
  }
  .muted {
    margin: 12px 0 26px;
    line-height: 1.6;
  }
  .auth-card :global(form),
  .auth-card :global(label) {
    display: grid;
    gap: 10px;
  }
  .auth-card :global(form) {
    gap: 14px;
  }
  .auth-card :global(label) {
    color: var(--page-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  .auth-card :global(label span) {
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.5;
  }
  .auth-card :global(input),
  .auth-card :global(button),
  .link-button {
    min-height: 48px;
    border-radius: 11px;
    font: inherit;
  }
  .auth-card :global(input) {
    border: 1px solid var(--page-border);
    padding: 0 14px;
    background: var(--page-surface);
    color: var(--page-text);
  }
  .auth-card :global(button) {
    display: grid;
    place-items: center;
    border: 0;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
    cursor: pointer;
  }
  .auth-card :global(.inline-note) {
    margin-bottom: 18px;
    border-radius: 11px;
    padding: 13px 14px;
    background: var(--notice-error-bg);
    color: var(--notice-error-text);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .auth-card :global(.inline-note.ok) {
    background: color-mix(
      in srgb,
      var(--page-primary) 12%,
      var(--page-surface)
    );
    color: var(--page-primary);
  }
  .auth-card :global(.hint) {
    margin: 16px 0 0;
    font-size: 0.8rem;
    line-height: 1.6;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 22px;
  }
  .links.single {
    grid-template-columns: 1fr;
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
