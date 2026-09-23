<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { ArrowRight, Link2 } from '@lucide/svelte';
  import LinkFormOptions from '$lib/components/LinkFormOptions.svelte';
  import ManagedLinkList from '$lib/components/ManagedLinkList.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { LinkEditFieldKey, SiteLocale } from '$lib/config';
  import type { PublicHomeSettings } from '$lib/public-settings';
  import type { PublicPluginSlots } from '$lib/public-plugin-slots';
  import {
    LINK_SEARCH_OPTIONS,
    LINK_SEARCH_PARAMS,
    searchPageHref,
    type LinkSearchState,
  } from '$lib/search';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import {
    editableFieldsForManagedLink,
    linkCanCheckHealth,
    linkCanDelete,
    linkCanEdit,
    linkCanManagePermission,
    linkCanViewStats,
    type ManagedLinkItem,
  } from '$lib/link-types';
  import type { AuthenticatedUser } from '$lib/plugin-contracts';

  type LinkItem = ManagedLinkItem;

  type PageData = {
    links: LinkItem[];
    settings: PublicHomeSettings;
    permissions: {
      links: {
        options: Record<string, boolean>;
        deleteOwn: boolean;
        deleteAll: boolean;
        deleteMaxClicks: number;
        editOwn: boolean;
        editAll: boolean;
        share: boolean;
        statsAll: boolean;
        healthAll: boolean;
        editableFields: LinkEditFieldKey[];
      };
      admin: {
        access: boolean;
      };
    };
    canCreate: boolean;
    createDenied: {
      title: string;
      detail: string;
    } | null;
    user: AuthenticatedUser | null;
    linksAccessDenied: boolean;
    search: LinkSearchState;
    prefillUrl: string;
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
    auth: { enabled: boolean; setupRequired: boolean };
    publicSlots: PublicPluginSlots;
  };
  type ActionData = {
    ok?: boolean;
    action?: 'create' | 'deleteLinks' | 'updateLink';
    message?: string;
    values?: {
      url?: string;
      code?: string;
      domain?: string;
      preview?: Partial<LinkItem['preview']>;
      operations?: {
        tags?: string[] | string;
        expiresAt?: string | null;
        maxClicks?: string | number | null;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmTerm?: string;
        utmContent?: string;
        redirectRules?: string | unknown[] | null;
      };
    };
    link?: LinkItem;
  };

  let { data, form }: { data: PageData; form?: ActionData } = $props();
  let copiedCode = $state<string | null>(null);
  let bookmarkletHref = $state('');
  const locale = $derived(data.settings.general.language as SiteLocale);
  const text = $derived(uiText(locale, data.settings.i18n.defaultLocale));
  const createForm = $derived(
    form?.action === 'deleteLinks' || form?.action === 'updateLink'
      ? undefined
      : form,
  );

  onMount(() => {
    bookmarkletHref = `javascript:(()=>{const u=encodeURIComponent(location.href);open('${window.location.origin}/?url='+u,'_blank')})()`;
  });

  async function copy(text: string, code: string) {
    await navigator.clipboard.writeText(text);
    copiedCode = code;
    setTimeout(() => {
      if (copiedCode === code) copiedCode = null;
    }, 1400);
  }

  function pageHref(page: number) {
    return resolve(searchPageHref('/', data.search, page) as '/');
  }

  function statsHref(link: Pick<LinkItem, 'code' | 'domain'>) {
    const params = new SvelteURLSearchParams({
      returnTo: pageHref(data.pagination.page),
    });
    if (link.domain) params.set('domain', link.domain);
    return resolve(`/${link.code}/statistics?${params.toString()}`);
  }

  function permissionHref(link: LinkItem) {
    if (!canManageLinkPermission(link)) return null;
    const params = new SvelteURLSearchParams({
      returnTo: pageHref(data.pagination.page),
    });
    if (link.domain) params.set('domain', link.domain);
    return resolve(`/${link.code}/permission?${params.toString()}`);
  }

  function canManageLinkPermission(link: LinkItem) {
    return linkCanManagePermission(link, data.permissions);
  }

  function canViewStatsLink(link: LinkItem) {
    return linkCanViewStats(link, data.permissions);
  }

  function canCheckHealthLink(link: LinkItem) {
    return linkCanCheckHealth(link, data.permissions);
  }

  function canDeleteLink(link: { clicks: number; owned?: boolean }) {
    return linkCanDelete(link, data.permissions);
  }

  function deleteDisabledReason(link: { clicks: number; owned?: boolean }) {
    if (data.permissions.links.deleteAll) return '';
    if (!data.permissions.links.deleteOwn) return text.home.deleteDisabled;
    if (link.owned !== true) return text.home.deleteSharedOnly;
    if (
      data.permissions.links.deleteMaxClicks > 0 &&
      link.clicks > data.permissions.links.deleteMaxClicks
    ) {
      return formatText(text.home.deleteMaxClicks, {
        count: data.permissions.links.deleteMaxClicks,
      });
    }
    return '';
  }

  function canEditLink(link: LinkItem) {
    return linkCanEdit(link, data.permissions);
  }

  function editableFieldsForLink(link: LinkItem) {
    return editableFieldsForManagedLink(link, data.permissions);
  }
</script>

<svelte:head>
  <title>{data.settings.seo.title}</title>
  <meta name="description" content={data.settings.seo.description} />
  <meta property="og:title" content={data.settings.seo.title} />
  <meta property="og:description" content={data.settings.seo.description} />
  {#if data.settings.seo.ogImageUrl}
    <meta property="og:image" content={data.settings.seo.ogImageUrl} />
  {/if}
  <meta
    name="robots"
    content={data.settings.seo.indexable ? 'index,follow' : 'noindex,nofollow'}
  />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <link rel="icon" href={data.settings.general.faviconUrl} />
</svelte:head>

<SiteThemeStyles customHead={data.settings.seo.customHead} />

<div
  class="site site-theme"
  data-theme-mode={data.settings.theme.mode}
  data-theme-preset={data.settings.theme.preset}
  style={siteThemeStyle(data.settings.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} {locale} />
    {/key}
  {/if}

  <PluginSlotOutlet
    slots={data.publicSlots}
    slot="top"
    {locale}
    fallbackLocale={data.settings.i18n.defaultLocale}
  />

  <SiteHeader
    siteName={data.settings.general.siteName}
    logoUrl={data.settings.general.logoUrl}
    {locale}
    userName={data.user?.name}
    admin={data.permissions.admin.access}
    loginHref={data.auth.setupRequired
      ? '/signup'
      : data.auth.enabled
        ? '/login'
        : !data.canCreate
          ? '/admin'
          : undefined}
    loginLabel={data.auth.setupRequired
      ? text.auth.setupTitle
      : text.common.login}
  />

  <main class="shell">
    <section class="hero">
      {#if data.settings.general.eyebrow}<p class="brand-note">
          {data.settings.general.eyebrow}
        </p>{/if}
      <h1>{data.settings.general.headline}</h1>
      <p class="subtitle">{data.settings.general.description}</p>
    </section>

    {#if data.canCreate}
      <section class="composer">
        <form method="POST" action="?/create" use:enhance>
          <div class="primary-fields">
            <label class="url-field">
              <span>{text.home.destinationUrl}</span>
              <Input
                name="url"
                type="text"
                inputmode="url"
                autocomplete="url"
                placeholder="https://example.com"
                value={createForm?.values?.url ?? data.prefillUrl}
                required
              />
            </label>

            {#if data.settings.general.domains.length > 1}
              <label class="domain-field">
                <span>{text.home.shortLinkDomain}</span>
                <select
                  name="domain"
                  value={createForm?.values?.domain ||
                    data.settings.general.domains[0]}
                >
                  {#each data.settings.general.domains as domain (domain)}
                    <option value={domain}>{domain}</option>
                  {/each}
                </select>
              </label>
            {/if}

            {#if data.permissions.links.options.customCode}
              <label class="code-field">
                <span
                  >{text.home.customCode} <em>{text.common.optional}</em></span
                >
                <div class="code-input">
                  <Input
                    name="code"
                    type="text"
                    placeholder="my-link"
                    pattern="[A-Za-z0-9_-]+"
                    value={createForm?.values?.code ?? ''}
                  />
                </div>
              </label>
            {/if}

            <Button class="create h-11" type="submit"
              >{text.home.createLink}<ArrowRight
                size={16}
                aria-hidden="true"
              /></Button
            >
          </div>

          <LinkFormOptions
            mode="create"
            collapsible={true}
            idPrefix="create-link-options"
            allowedOptions={data.permissions.links.options}
            values={{
              preview: createForm?.values?.preview,
              operations: createForm?.values?.operations,
            }}
            seo={data.settings.seo}
            {locale}
          />

          <PluginSlotOutlet
            slots={data.publicSlots}
            slot="form-extra"
            {locale}
            fallbackLocale={data.settings.i18n.defaultLocale}
          />

          {#if createForm?.ok && createForm.link}
            <div class="result" role="status">
              <span>{text.home.linkReady}</span>
              <!-- eslint-disable svelte/no-navigation-without-resolve -->
              <a
                href={createForm.link.shortUrl}
                target="_blank"
                rel="noreferrer">{createForm.link.shortUrl}</a
              >
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
              <Button
                type="button"
                onclick={() =>
                  copy(createForm.link!.shortUrl, createForm.link!.code)}
              >
                {copiedCode === createForm.link.code
                  ? text.common.copied
                  : text.common.copy}
              </Button>
            </div>
          {/if}

          <PluginSlotOutlet
            slots={data.publicSlots}
            slot="form-footer"
            {locale}
            fallbackLocale={data.settings.i18n.defaultLocale}
          />
        </form>
      </section>
    {:else}
      <section class="composer access-locked">
        <div>
          <strong
            >{data.createDenied?.title ?? text.home.createDeniedTitle}</strong
          >
          <p>
            {data.createDenied?.detail ?? text.home.createDeniedDetail}
          </p>
        </div>
      </section>
    {/if}

    <section class="links">
      <div class="section-header">
        <div>
          <h2>{text.home.myLinksTitle}</h2>
        </div>
        <p>
          {formatText(text.home.showingCount, {
            total: data.pagination.totalItems,
            shown: data.links.length,
            pageSize: data.pagination.pageSize,
          })}
        </p>
      </div>
      {#if data.linksAccessDenied}
        <div class="empty">
          {text.home.linksAccessDenied}
        </div>
      {:else}
        <ManagedLinkList
          links={data.links}
          emptyMessage={data.search.query
            ? text.home.emptySearch
            : text.home.emptyLinks}
          deleteFormId="link-delete-form"
          deleteAction="?/deleteLinks"
          updateAction="?/updateLink"
          {statsHref}
          {permissionHref}
          canDelete={canDeleteLink}
          canViewStats={canViewStatsLink}
          canCheckHealth={canCheckHealthLink}
          canEdit={canEditLink}
          editableFields={data.permissions.links.editableFields}
          {editableFieldsForLink}
          {deleteDisabledReason}
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          getPageHref={pageHref}
          pageLabel={text.home.pageLabel}
          {locale}
          search={{
            baseHref: '/',
            field: data.search.field,
            query: data.search.query,
            options: LINK_SEARCH_OPTIONS.map((option) => ({
              ...option,
              label:
                text.search.linkFields[
                  option.value as keyof typeof text.search.linkFields
                ] ?? option.label,
            })),
            fieldName: LINK_SEARCH_PARAMS.field,
            queryName: LINK_SEARCH_PARAMS.query,
            label: text.home.searchLabel,
            placeholder: text.home.searchPlaceholder,
            submitLabel: text.common.search,
            clearLabel: text.common.all,
          }}
          healthAction="?/checkHealth"
          brandName={data.settings.general.siteName}
          accentColor={data.settings.theme.customTokens.primary}
          seo={data.settings.seo}
        />
      {/if}
    </section>

    {#if bookmarkletHref}
      <section class="quick-tools">
        <div>
          <p>{text.home.quickTitle}</p>
        </div>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={bookmarkletHref} title={text.home.quickHelp}
          ><Link2 size={14} aria-hidden="true" />{text.home.quickSave}</a
        >
      </section>
    {/if}
  </main>

  <footer>
    <p>© {new Date().getFullYear()} {data.settings.general.footerText}</p>
    <nav class="legal-links" aria-label={text.legal.documentsNav}>
      <a href={resolve('/terms')}
        >{data.settings.legal.termsTitle || text.legal.terms}</a
      >
      <a href={resolve('/privacy')}
        >{data.settings.legal.privacyTitle || text.legal.privacy}</a
      >
    </nav>
    <PluginSlotOutlet
      slots={data.publicSlots}
      slot="footer"
      {locale}
      fallbackLocale={data.settings.i18n.defaultLocale}
    />
  </footer>
</div>

<style>
  .site {
    min-height: 100dvh;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  .shell {
    width: min(1040px, calc(100% - 48px));
    margin: auto;
    padding: 52px 0 64px;
  }
  .brand-note {
    margin: 0 0 12px;
    color: var(--page-muted);
    font-size: 0.8rem;
  }
  .hero {
    margin-bottom: 28px;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    line-height: 1.3;
    letter-spacing: -0.045em;
    font-weight: 650;
  }
  .subtitle {
    margin: 10px 0 0;
    color: var(--page-muted);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .composer {
    padding: 24px;
    border: 1px solid var(--page-border);
    border-radius: var(--ui-radius, 8px);
    background: var(--page-surface);
  }
  .primary-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(140px, 180px) auto;
    align-items: end;
    gap: 16px;
  }
  .primary-fields:has(.domain-field) {
    grid-template-columns:
      minmax(0, 1fr) minmax(140px, 170px) minmax(120px, 150px)
      auto;
  }
  .primary-fields:not(:has(.code-field)):not(:has(.domain-field)) {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  label {
    display: grid;
    gap: 9px;
    font-size: 0.82rem;
    font-weight: 550;
  }
  label span {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  em {
    color: var(--page-muted);
    font-size: 0.75rem;
    font-style: normal;
    font-weight: 400;
  }
  .code-input {
    min-width: 0;
  }
  .primary-fields :global(input),
  select {
    height: 44px;
  }
  select {
    width: 100%;
    border: 1px solid var(--page-border);
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    padding: 0 12px;
    background: var(--page-surface);
    color: var(--page-text);
  }
  .result {
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--page-border);
    padding-top: 20px;
  }
  .result span {
    color: var(--page-muted);
    font-size: 0.8rem;
  }
  .result a {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--page-text);
    font-weight: 600;
  }
  .result :global(button) {
    margin-left: auto;
  }
  .access-locked strong {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .access-locked p {
    margin: 8px 0 0;
    color: var(--page-muted);
    font-size: 0.85rem;
  }
  .links {
    margin-top: 44px;
  }
  .section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  .section-header p {
    margin: 0;
    color: var(--page-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    padding: 48px 20px;
    border: 1px solid var(--page-border);
    border-radius: var(--ui-radius, 8px);
    text-align: center;
    color: var(--page-muted);
    font-size: 0.875rem;
  }
  .quick-tools {
    margin-top: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    font-size: 0.8rem;
    color: var(--page-muted);
  }
  .quick-tools p {
    margin: 0;
  }
  .quick-tools a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--page-text);
    text-underline-offset: 4px;
  }
  footer {
    width: min(1120px, calc(100% - 48px));
    margin: auto;
    padding: 24px 0;
    border-top: 1px solid var(--page-border);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--page-muted);
    font-size: 0.75rem;
  }
  footer p {
    margin: 0;
  }
  .legal-links {
    display: flex;
    gap: 20px;
  }
  .legal-links a {
    color: inherit;
    text-decoration: none;
  }
  .legal-links a:hover {
    text-decoration: underline;
  }
  @media (max-width: 800px) {
    .primary-fields,
    .primary-fields:has(.domain-field) {
      grid-template-columns: 1fr 1fr;
    }
    .url-field {
      grid-column: 1/-1;
    }
    .primary-fields :global(.create) {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 520px) {
    .shell {
      width: calc(100% - 32px);
      padding: 32px 0 48px;
    }
    .composer {
      padding: 18px;
    }
    .primary-fields,
    .primary-fields:has(.domain-field),
    .primary-fields:not(:has(.code-field)):not(:has(.domain-field)) {
      grid-template-columns: minmax(0, 1fr);
    }
    .section-header {
      align-items: start;
    }
    .section-header p {
      max-width: 55%;
      text-align: right;
    }
    .quick-tools {
      align-items: start;
      flex-direction: column;
      gap: 8px;
    }
    footer {
      width: calc(100% - 32px);
    }
  }
</style>
