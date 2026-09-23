<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
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

  <div class="auth-frame">
    <div class="topline">
      <a href={resolve('/')} class="brand">{siteName}</a><LocaleSelect
        {locale}
        compact
      />
    </div>
    <Card.Root
      class="gap-0 rounded-xl border border-border bg-card p-0 shadow-none ring-0"
    >
      <Card.Header class="p-7 pb-6">
        <h1>{title}</h1>
        {#if description}<Card.Description>{description}</Card.Description>{/if}
      </Card.Header>
      <Card.Content class="px-7 pb-7"
        ><div class="auth-fields">
          {#if children}{@render children()}{/if}
        </div></Card.Content
      >
      {#if links.length > 0}
        <Card.Footer
          class="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-7 py-4"
        >
          {#each links as link (link.href)}<Button
              variant="link"
              class="h-auto p-0 text-xs"
              href={resolvePath(link.href)}>{link.label}</Button
            >{/each}
        </Card.Footer>
      {/if}
    </Card.Root>
  </div>
</main>

<style>
  .auth-page {
    display: grid;
    min-height: 100dvh;
    align-items: start;
    justify-items: center;
    padding: clamp(40px, 10vh, 100px) 20px 60px;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  .auth-frame {
    width: min(420px, 100%);
  }
  .topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 28px;
  }
  .brand {
    color: var(--page-text);
    text-decoration: none;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.6rem;
    font-weight: 650;
    letter-spacing: -0.04em;
  }
  .auth-fields :global(form),
  .auth-fields :global(label) {
    display: grid;
    gap: 8px;
  }
  .auth-fields :global(form) {
    gap: 18px;
  }
  .auth-fields :global(label) {
    font-size: 0.85rem;
    font-weight: 500;
  }
  .auth-fields :global(label span),
  .auth-fields :global(.hint) {
    color: var(--page-muted);
    font-size: 0.78rem;
    line-height: 1.6;
  }
  .auth-fields :global(.hint) {
    margin: 18px 0 0;
  }
  .auth-fields :global(input:not([type='hidden'])) {
    width: 100%;
    min-height: 42px;
    border: 1px solid var(--page-border);
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    padding: 0 12px;
    background: var(--page-surface);
    color: var(--page-text);
  }
  .auth-fields :global(button:not([data-slot])) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border: 1px solid transparent;
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    padding: 0 16px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-size: 0.85rem;
    font-weight: 550;
    cursor: pointer;
  }
  .auth-fields :global(.inline-note) {
    padding: 12px;
    margin-bottom: 16px;
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    background: var(--notice-error-bg);
    color: var(--notice-error-text);
    font-size: 0.8rem;
  }
  .auth-fields :global(.inline-note.ok) {
    background: var(--notice-success-bg);
    color: var(--notice-success-text);
  }
</style>
