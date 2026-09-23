<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Link2, Menu } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import LocaleSelect from './LocaleSelect.svelte';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    siteName,
    logoUrl,
    locale,
    userName,
    admin,
    loginHref,
    loginLabel,
  }: {
    siteName?: string;
    logoUrl?: string;
    locale?: SiteLocale;
    userName?: string;
    admin?: boolean;
    loginHref?: string;
    loginLabel?: string;
  } = $props();
  const shell = $derived(page.data.shell);
  const headerName = $derived(siteName ?? shell.siteName);
  const headerLogo = $derived(logoUrl ?? shell.logoUrl);
  const headerLocale = $derived(locale ?? shell.locale);
  const headerUser = $derived(userName ?? shell.userName);
  const headerAdmin = $derived(admin ?? shell.canAccessAdmin);
  const headerLogin = $derived(loginHref ?? '/login');
  const text = $derived(uiText(headerLocale));
</script>

<header class="app-header">
  <div class="header-inner">
    <a class="brand" href={resolve('/')}>
      {#if headerLogo}<img src={headerLogo} alt="" />{:else}<Link2
          size={21}
          strokeWidth={2}
          aria-hidden="true"
        />{/if}
      <span>{headerName}</span>
    </a>
    <div class="header-actions">
      <LocaleSelect locale={headerLocale} compact />
      {#if headerUser || headerAdmin}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="icon"
                aria-label={text.home.menuOpen}
                ><Menu aria-hidden="true" /></Button
              >
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" portalProps={{ disabled: true }}>
            {#if headerUser}
              <DropdownMenu.Label>{headerUser}</DropdownMenu.Label>
              <DropdownMenu.Item
                >{#snippet child({ props })}<a
                    {...props}
                    href={resolve('/account')}>{text.common.account}</a
                  >{/snippet}</DropdownMenu.Item
              >
            {/if}
            {#if headerAdmin}<DropdownMenu.Item
                >{#snippet child({ props })}<a
                    {...props}
                    href={resolve('/admin')}>{text.common.admin}</a
                  >{/snippet}</DropdownMenu.Item
              >{/if}
            {#if headerUser}
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                >{#snippet child({ props })}<a
                    {...props}
                    href={resolve('/logout')}
                    data-sveltekit-reload>{text.common.logout}</a
                  >{/snippet}</DropdownMenu.Item
              >
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else if headerLogin}
        <Button href={resolve(headerLogin as '/')} variant="outline"
          >{loginLabel ?? text.common.login}</Button
        >
      {/if}
    </div>
  </div>
</header>

<style>
  .app-header {
    border-bottom: 1px solid var(--page-border);
    background: var(--page-surface);
  }
  .header-inner {
    width: min(1120px, calc(100% - 48px));
    min-height: 68px;
    margin: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    color: var(--page-text);
    text-decoration: none;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .brand img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  .brand span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  @media (max-width: 600px) {
    .header-inner {
      width: calc(100% - 32px);
      min-height: 60px;
      gap: 12px;
    }
    .header-actions {
      gap: 8px;
    }
  }
</style>
