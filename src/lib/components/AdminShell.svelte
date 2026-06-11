<script lang="ts">
  import { resolve } from '$app/paths';
  import { adminSections } from '$lib/admin-sections';
  import {
    defaultSiteLocale,
    type ColorMode,
    type SiteLocale,
    type ThemeTokens,
  } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { adminThemeStyle } from '$lib/theme-vars';
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
    kicker,
    description,
    status,
    sections = adminSections,
    backHref,
    backLabel,
    locale = defaultSiteLocale,
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
    kicker?: string;
    description?: string;
    status?: string;
    sections?: typeof adminSections;
    backHref?: string;
    backLabel?: string;
    locale?: SiteLocale;
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
      <div class="mark">
        {#if logoUrl}
          <img src={logoUrl} alt="" />
        {:else}
          <span>{siteName.slice(0, 1).toUpperCase()}</span>
        {/if}
      </div>
      <div>
        <strong>{siteName}</strong>
        <span>{text.admin.console}</span>
      </div>
    </a>

    <button
      class="menu-toggle"
      type="button"
      aria-label={text.admin.openMenu}
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span></span>
      <span></span>
      <span></span>
    </button>

    <nav class:open={menuOpen} aria-label={text.admin.settingsMenu}>
      {#each displaySections as section (section.id)}
        <a
          href={resolve(`/admin/${section.slug}`)}
          class:active={section.id === activeSection}
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
        <button type="submit">{text.common.logout}</button>
      </form>
    </div>
  </aside>

  <main class="workspace">
    <header class="workspace-header">
      <div>
        {#if backHref && backLabel}
          <a class="back-link" href={resolvePath(backHref)}>← {backLabel}</a>
        {/if}
        <p class="kicker">{kicker ?? text.admin.controlCenter}</p>
        <h1>{title}</h1>
        {#if description}
          <p class="description">{description}</p>
        {/if}
      </div>
      {#if status}
        <span class="status"><i></i>{status}</span>
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
    min-height: 100vh;
    grid-template-columns: 250px 1fr;
    background: var(--admin-bg);
    color: var(--admin-text);
    font-family: var(--font);
  }
  aside {
    position: sticky;
    top: 0;
    display: flex;
    height: 100vh;
    flex-direction: column;
    border-right: 1px solid var(--admin-border);
    padding: 28px 20px;
    background: var(--admin-sidebar);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px 28px;
    color: inherit;
    text-decoration: none;
  }
  .mark {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: calc(var(--admin-radius) * 0.6);
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font-family: inherit;
    font-size: 1.45rem;
    font-weight: 700;
  }
  .mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .brand strong,
  .brand span {
    display: block;
  }
  .brand span {
    margin-top: 3px;
    color: var(--admin-muted);
    font-size: 0.76rem;
  }
  nav {
    display: grid;
    gap: 4px;
  }
  .menu-toggle {
    position: relative;
    display: none;
    width: 42px;
    height: 42px;
    flex: none;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.5);
    padding: 0;
    background: var(--admin-surface);
    color: var(--admin-text);
    cursor: pointer;
    box-shadow: 0 10px 28px var(--admin-shadow);
  }
  .menu-toggle span {
    position: absolute;
    width: 17px;
    height: 2px;
    border-radius: 99px;
    background: currentColor;
  }
  .menu-toggle span:nth-child(1) {
    transform: translateY(-6px);
  }
  .menu-toggle span:nth-child(3) {
    transform: translateY(6px);
  }
  nav a,
  .aside-footer button,
  .aside-footer a {
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 11px 13px;
    background: transparent;
    color: var(--admin-muted);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 750;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  nav a.active {
    background: var(--admin-surface);
    color: var(--admin-primary);
    box-shadow: 0 6px 24px var(--admin-shadow);
  }
  .aside-footer {
    display: grid;
    gap: 3px;
    margin-top: auto;
  }
  .workspace {
    min-width: 0;
    width: min(1120px, calc(100% - 56px));
    margin: 0 auto;
    padding: 42px 0 100px;
  }
  .workspace-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 30px;
  }
  .back-link {
    color: var(--admin-primary);
    font-size: 0.82rem;
    font-weight: 800;
    text-decoration: none;
  }
  .kicker {
    margin: 12px 0 8px;
    color: var(--admin-primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .workspace-header h1 {
    margin: 0;
    font-family: inherit;
    font-size: 2.5rem;
    font-weight: 500;
  }
  .description {
    margin: 8px 0 0;
    color: var(--admin-muted);
    line-height: 1.6;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--admin-muted);
    font-size: 0.8rem;
  }
  .status i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--admin-primary);
    box-shadow: 0 0 0 4px
      color-mix(in srgb, var(--admin-primary) 14%, transparent);
  }
  @media (max-width: 900px) {
    .admin-shell {
      grid-template-columns: 1fr;
    }
    aside {
      position: static;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--admin-border);
      padding: 16px;
    }
    .brand {
      min-width: 0;
      padding: 0;
    }
    .brand > div:last-child {
      min-width: 0;
    }
    .brand strong,
    .brand span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .menu-toggle {
      display: inline-flex;
    }
    nav {
      display: none;
      grid-column: 1 / -1;
      gap: 6px;
      margin-top: 12px;
      border: 1px solid var(--admin-border);
      border-radius: calc(var(--admin-radius) * 0.65);
      padding: 10px;
      background: var(--admin-panel);
      box-shadow: 0 14px 38px var(--admin-shadow);
    }
    nav.open {
      display: grid;
    }
    nav a,
    .aside-footer button,
    .aside-footer a {
      text-align: center;
    }
    .aside-footer {
      display: none;
      grid-column: 1 / -1;
      justify-items: center;
      gap: 6px;
      margin-top: 8px;
      border: 1px solid var(--admin-border);
      border-radius: calc(var(--admin-radius) * 0.65);
      padding: 10px;
      background: var(--admin-panel);
    }
    .aside-footer :global(.locale-select) {
      justify-self: center;
    }
    nav.open + .aside-footer {
      display: grid;
    }
    .workspace {
      width: min(100% - 32px, 1120px);
      padding-top: 32px;
    }
  }
  @media (max-width: 640px) {
    .workspace-header {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
