<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import { Menu, Link2 } from '@lucide/svelte';
  import { adminSections } from '$lib/admin-sections';
  import {
    defaultSiteLocale,
    type ColorMode,
    type SiteLocale,
    type ThemeTokens,
  } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { adminThemeStyle } from '$lib/theme-vars';
  import CustomHead from '$lib/components/CustomHead.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import '$lib/styles/admin-theme.css';
  import '$lib/styles/forms.css';
  import type { Snippet } from 'svelte';

  let {
    siteName,
    logoUrl = '',
    theme,
    activeSection,
    title,
    description,
    status,
    sections = adminSections,
    backHref,
    backLabel,
    locale = defaultSiteLocale,
    customHead = '',
    children,
  }: {
    siteName: string;
    logoUrl?: string;
    theme: {
      mode: ColorMode;
      customTokens: ThemeTokens;
    };
    activeSection: string;
    title: string;
    description?: string;
    status?: string;
    sections?: typeof adminSections;
    backHref?: string;
    backLabel?: string;
    locale?: SiteLocale;
    customHead?: string;
    children: Snippet;
  } = $props();

  let menuOpen = $state(false);
  const text = $derived(uiText(locale));
  const displaySections = $derived(
    sections.map((section) => ({
      ...section,
      label:
        text.admin.sections[section.id as keyof typeof text.admin.sections] ??
        section.label,
    })),
  );

  function resolvePath(path: string) {
    return resolve(path as '/');
  }
</script>

<CustomHead html={customHead} />

<div
  class="admin-shell admin-theme"
  data-theme-mode={theme.mode}
  style={adminThemeStyle(theme)}
>
  <aside>
    <a
      class="brand"
      href={resolve('/admin')}
      onclick={() => (menuOpen = false)}
    >
      <div class={logoUrl ? 'mark has-logo' : 'mark'}>
        {#if logoUrl}
          <img src={logoUrl} alt="" />
        {:else}
          <Link2 size={20} aria-hidden="true" />
        {/if}
      </div>
      <div>
        <strong>{siteName}</strong>
        <span>{text.admin.console}</span>
      </div>
    </a>

    <div class="mobile-toggle">
      <Button
        variant="outline"
        size="icon"
        aria-label={text.admin.openMenu}
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
        ><Menu aria-hidden="true" /></Button
      >
    </div>

    <nav class:open={menuOpen} aria-label={text.admin.settingsMenu}>
      {#each displaySections as section (section.id)}
        <a
          href={resolve(`/admin/${section.slug}`)}
          class:active={section.id === activeSection}
          aria-current={section.id === activeSection ? 'page' : undefined}
          onclick={() => (menuOpen = false)}
        >
          {section.label}
        </a>
      {/each}
    </nav>

    <div class="aside-footer">
      <LocaleSelect {locale} compact />
      <a
        href={resolve('/')}
        target="_blank"
        rel="noreferrer"
        onclick={() => (menuOpen = false)}>{text.admin.openSite} ↗</a
      >
      <form method="POST" action="?/logout">
        <Button type="submit" variant="ghost" class="w-full justify-start"
          >{text.common.logout}</Button
        >
      </form>
    </div>
  </aside>

  <main class="workspace">
    <header class="workspace-header">
      <div>
        {#if backHref && backLabel}
          <a class="back-link" href={resolvePath(backHref)}>← {backLabel}</a>
        {/if}

        <h1>{title}</h1>
        {#if description}
          <p class="description">{description}</p>
        {/if}
      </div>
      {#if status}
        <span class="status">{status}</span>
      {/if}
    </header>

    {@render children()}
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: var(--admin-bg);
    color: var(--admin-text);
  }
  :global(button),
  :global(input),
  :global(textarea),
  :global(select) {
    font: inherit;
  }
  .admin-shell {
    --admin-panel: color-mix(
      in srgb,
      var(--admin-surface) 94%,
      var(--admin-bg)
    );
    --admin-sidebar: color-mix(
      in srgb,
      var(--admin-surface) 72%,
      var(--admin-bg)
    );
    --admin-soft: color-mix(
      in srgb,
      var(--admin-primary) 10%,
      var(--admin-surface)
    );
    --admin-shadow: color-mix(in srgb, var(--admin-text) 8%, transparent);
    --pagination-border: var(--admin-border);
    --pagination-surface: var(--admin-surface);
    --pagination-muted: var(--admin-muted);
    --pagination-text: var(--admin-text);
    --pagination-primary: var(--admin-primary);
    --pagination-radius: calc(var(--admin-radius) * 0.5);
    --toggle-label: var(--admin-text);
    --toggle-font-size: 0.82rem;
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
    --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    --notice-success-bg: var(--admin-soft);
    --notice-success-text: var(--admin-primary);
    --notice-margin: 0 0 22px;
    --managed-link-bg: var(--admin-bg);
    --managed-link-surface: var(--admin-panel);
    --managed-link-text: var(--admin-text);
    --managed-link-muted: var(--admin-muted);
    --managed-link-primary: var(--admin-primary);
    --managed-link-primary-contrast: var(--admin-primary-contrast);
    --managed-link-border: var(--admin-border);
    --managed-link-radius: calc(var(--admin-radius) * 0.8);
    --managed-link-danger: var(--admin-danger);
    --managed-link-danger-text: var(--admin-danger-text);
    --managed-link-bulk-padding: 14px 18px 12px;
    --managed-link-bulk-margin-bottom: 0;
    display: grid;
    min-height: 100dvh;
    grid-template-columns: 250px 1fr;
    background: var(--admin-bg);
    color: var(--admin-text);
    font-family: var(--font);
  }
  aside {
    position: sticky;
    top: 0;
    display: flex;
    height: 100dvh;
    flex-direction: column;
    border-right: 1px solid var(--admin-border);
    padding: 24px 16px;
    background: var(--admin-surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 28px;
    color: inherit;
    text-decoration: none;
  }
  .mark {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    flex-shrink: 0;
  }
  .mark img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  .brand strong {
    display: block;
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  .brand span {
    display: block;
    color: var(--admin-muted);
    font-size: 0.72rem;
    margin-top: 4px;
  }
  nav {
    display: grid;
    gap: 4px;
  }
  nav a,
  .aside-footer a {
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    padding: 10px 12px;
    color: var(--admin-muted);
    font-size: 0.85rem;
    font-weight: 500;
    text-decoration: none;
  }
  nav a:hover,
  .aside-footer a:hover {
    background: var(--admin-soft);
    color: var(--admin-text);
  }
  nav a.active {
    background: var(--admin-soft);
    color: var(--admin-text);
    font-weight: 650;
  }
  .aside-footer {
    display: grid;
    gap: 8px;
    margin-top: auto;
    border-top: 1px solid var(--admin-border);
    padding-top: 16px;
  }
  .workspace {
    width: min(1120px, calc(100% - 64px));
    min-width: 0;
    margin: auto;
    padding: 40px 0 80px;
  }
  .workspace-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 32px;
  }
  .back-link {
    display: block;
    margin-bottom: 16px;
    color: var(--admin-muted);
    text-decoration: none;
    font-size: 0.8rem;
  }
  .workspace-header h1 {
    margin: 0;
    font-size: 1.75rem;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.04em;
  }
  .description {
    margin: 10px 0 0;
    max-width: 65ch;
    color: var(--admin-muted);
    line-height: 1.6;
    font-size: 0.85rem;
  }
  .status {
    color: var(--admin-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .mobile-toggle {
    display: none;
  }
  @media (max-width: 900px) {
    .admin-shell {
      grid-template-columns: minmax(0, 1fr);
    }
    aside {
      position: static;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--admin-border);
      padding: 16px 20px;
    }
    .brand {
      padding: 0;
    }
    .mobile-toggle {
      display: block;
    }
    nav {
      display: none;
      grid-column: 1/-1;
      margin-top: 16px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    nav.open {
      display: grid;
    }
    .aside-footer {
      display: none;
    }
    aside:has(nav.open) .aside-footer {
      display: flex;
      grid-column: 1/-1;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 16px;
    }
    .workspace {
      width: calc(100% - 40px);
      padding: 28px 0 60px;
    }
  }
  @media (max-width: 520px) {
    nav {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace {
      width: calc(100% - 32px);
    }
    .workspace-header {
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
