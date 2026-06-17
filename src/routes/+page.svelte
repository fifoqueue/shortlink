<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import LinkFormOptions from '$lib/components/LinkFormOptions.svelte';
  import ManagedLinkList from '$lib/components/ManagedLinkList.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { LinkEditFieldKey, SiteLocale, SiteSettings } from '$lib/config';
  import {
    LINK_SEARCH_OPTIONS,
    LINK_SEARCH_PARAMS,
    searchPageHref,
    type LinkSearchState,
  } from '$lib/search';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import type {
    AuthenticatedUser,
    RuntimePluginSlotRender,
  } from '$lib/plugin-contracts';
  import { publicPluginRegistry } from '../plugins/public-registry';

  type LinkItem = {
    id: number;
    code: string;
    domain: string;
    url: string;
    preview: {
      title: string;
      description: string;
      imageUrl: string;
      themeColor: string;
    };
    tags: string[];
    short_url: string;
    owned?: boolean;
    created_at: string;
    clicks: number;
    last_clicked_at: string | null;
    smart: {
      expiresAt: string | null;
      maxClicks: number;
      passwordProtected: boolean;
    };
    routing: {
      redirectRules: unknown[];
    };
    health: {
      status: 'unchecked' | 'ok' | 'warning' | 'broken';
      statusCode: number | null;
      checkedAt: string | null;
      error: string;
      responseBody: string;
      latencyMs: number | null;
    };
    share: {
      recipientCount: number;
      access: {
        canEdit: boolean;
        canViewStats: boolean;
        editableFields: LinkEditFieldKey[];
        expiresAt: string | null;
      } | null;
    };
  };

  type PageData = {
    links: LinkItem[];
    settings: SiteSettings;
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
    permissionGroups: Array<{ id: number; name: string; reason: string }>;
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
    runtimeSlots: RuntimePluginSlotRender[];
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
  let menuOpen = $state(false);
  let bookmarkletHref = $state('');
  const locale = $derived(data.settings.general.language as SiteLocale);
  const text = $derived(uiText(locale, data.settings.i18n.defaultLocale));
  const createForm = $derived(
    form?.action === 'deleteLinks' || form?.action === 'updateLink'
      ? undefined
      : form,
  );

  const hasAccountActions = $derived(
    Boolean(
      data.user ||
      data.auth.enabled ||
      !data.canCreate ||
      data.permissions.admin.access,
    ),
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
    return (
      data.permissions.links.share &&
      (data.permissions.links.editAll || link.owned === true)
    );
  }

  function canViewStatsLink(link: LinkItem) {
    return (
      data.permissions.links.statsAll ||
      link.owned === true ||
      link.share.access?.canViewStats === true
    );
  }

  function canCheckHealthLink(link: LinkItem) {
    return data.permissions.links.healthAll || link.owned === true;
  }

  function canDeleteLink(link: { clicks: number; owned?: boolean }) {
    const maxClicks = data.permissions.links.deleteMaxClicks;
    return (
      data.permissions.links.deleteAll ||
      (data.permissions.links.deleteOwn &&
        link.owned === true &&
        (maxClicks <= 0 || link.clicks <= maxClicks))
    );
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

  function deletePolicyMessage() {
    if (data.permissions.links.deleteAll) return '';
    if (data.permissions.links.deleteOwn) {
      if (data.permissions.links.deleteMaxClicks > 0) {
        return formatText(text.home.deletePolicyMaxClicks, {
          count: data.permissions.links.deleteMaxClicks,
        });
      }
      return text.home.deletePolicyOwn;
    }
    return text.home.deletePolicyDisabled;
  }

  function canEditLink(link: LinkItem) {
    return (
      (data.permissions.links.editableFields.length > 0 &&
        (data.permissions.links.editAll ||
          (data.permissions.links.editOwn && link.owned === true))) ||
      link.share.access?.canEdit === true
    );
  }

  function editableFieldsForLink(link: LinkItem) {
    if (
      data.permissions.links.editableFields.length > 0 &&
      (data.permissions.links.editAll ||
        (data.permissions.links.editOwn && link.owned === true))
    ) {
      return data.permissions.links.editableFields;
    }
    return link.share.access?.editableFields ?? [];
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
    registry={publicPluginRegistry}
    states={data.settings.plugins}
    slot="top"
    runtimeSlots={data.runtimeSlots}
    user={data.user}
    {locale}
    fallbackLocale={data.settings.i18n.defaultLocale}
  />

  <header class="site-header">
    <a class="brand" href={resolve('/')}>
      {#if data.settings.general.logoUrl}
        <img src={data.settings.general.logoUrl} alt="" />
      {:else}
        <span>{data.settings.general.siteName.slice(0, 1).toUpperCase()}</span>
      {/if}
      <strong>{data.settings.general.siteName}</strong>
    </a>
    <div class="header-controls">
      <LocaleSelect {locale} compact />
      {#if hasAccountActions}
        <button
          class="menu-toggle"
          type="button"
          aria-label={text.home.menuOpen}
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      {/if}
      {#if hasAccountActions}
        <nav
          class:open={menuOpen}
          class="account-actions"
          aria-label={text.common.account}
        >
          {#if data.user}
            <span class="user-chip" title={data.user.name}
              >{data.user.name}</span
            >
            <a
              class="account-cta"
              href={resolve('/account')}
              onclick={() => (menuOpen = false)}>{text.common.account}</a
            >
            <a
              class="account-cta"
              href={resolve('/logout')}
              data-sveltekit-reload
              onclick={() => (menuOpen = false)}>{text.common.logout}</a
            >
          {:else if data.auth.enabled || !data.canCreate}
            <a
              class="login-cta"
              href={data.auth.setupRequired
                ? resolve('/signup')
                : data.auth.enabled
                  ? resolve('/login')
                  : resolve('/admin')}
              onclick={() => (menuOpen = false)}
              >{data.auth.setupRequired
                ? text.auth.setupTitle
                : text.common.login}</a
            >
          {/if}
          {#if data.permissions.admin.access}
            <a
              class="account-cta danger-cta"
              href={resolve('/admin')}
              onclick={() => (menuOpen = false)}>{text.common.admin}</a
            >
          {/if}
        </nav>
      {/if}
    </div>
  </header>

  <main class="shell">
    <section class="hero">
      <p class="eyebrow">{data.settings.general.eyebrow}</p>
      <h1>{data.settings.general.headline}</h1>
      <p class="subtitle">{data.settings.general.description}</p>
    </section>

    {#if data.permissionGroups.length > 0}
      <section class="permission-reasons">
        <div>
          <p class="eyebrow">{text.home.permissionReasonsTitle}</p>
          <h2>{text.home.permissionReasonsDescription}</h2>
        </div>
        <div class="permission-reason-list">
          {#each data.permissionGroups as group (group.id)}
            <article>
              <strong>{group.name}</strong>
              <p>{group.reason}</p>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.canCreate}
      <section class="composer">
        <form method="POST" action="?/create" use:enhance>
          <div class="primary-fields">
            <label class="url-field">
              <span>{text.home.destinationUrl}</span>
              <input
                name="url"
                type="text"
                inputmode="url"
                autocomplete="url"
                placeholder="https://example.com/very/long/url"
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
                  <i>/</i>
                  <input
                    name="code"
                    type="text"
                    placeholder="my-link"
                    minlength={data.settings.links.codeMinLength}
                    maxlength={data.settings.links.codeMaxLength}
                    pattern="[A-Za-z0-9_-]+"
                    value={createForm?.values?.code ?? ''}
                  />
                </div>
              </label>
            {/if}

            <button class="create" type="submit"
              >{text.home.createLink} <span>→</span></button
            >
          </div>

          <LinkFormOptions
            mode="create"
            collapsible={false}
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
            registry={publicPluginRegistry}
            states={data.settings.plugins}
            slot="form-extra"
            runtimeSlots={data.runtimeSlots}
            user={data.user}
            {locale}
            fallbackLocale={data.settings.i18n.defaultLocale}
          />

          {#if createForm?.ok && createForm.link}
            <div class="feedback success" role="status">
              <span>{text.home.linkReady}</span>
              <!-- eslint-disable svelte/no-navigation-without-resolve -->
              <a
                href={createForm.link.short_url}
                target="_blank"
                rel="noreferrer">{createForm.link.short_url}</a
              >
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
              <button
                type="button"
                onclick={() =>
                  copy(createForm.link!.short_url, createForm.link!.code)}
              >
                {copiedCode === createForm.link.code
                  ? text.common.copied
                  : text.common.copy}
              </button>
            </div>
          {/if}

          <PluginSlotOutlet
            registry={publicPluginRegistry}
            states={data.settings.plugins}
            slot="form-footer"
            runtimeSlots={data.runtimeSlots}
            user={data.user}
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
          <p class="eyebrow">{text.home.myLinksKicker}</p>
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
          policyMessage={deletePolicyMessage()}
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
          <p class="eyebrow">{text.home.quickKicker}</p>
          <h2>{text.home.quickTitle}</h2>
        </div>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={bookmarkletHref}>{text.home.quickSave}</a>
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
      registry={publicPluginRegistry}
      states={data.settings.plugins}
      slot="footer"
      runtimeSlots={data.runtimeSlots}
      user={data.user}
      {locale}
      fallbackLocale={data.settings.i18n.defaultLocale}
    />
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  :global(button),
  :global(input),
  :global(textarea),
  :global(select) {
    font: inherit;
  }
  .site {
    min-height: 100vh;
    background: var(--page-bg);
    color: var(--text);
    font-family: var(--font);
    transition:
      background 0.2s,
      color 0.2s;
  }
  .site-header,
  footer {
    display: flex;
    width: min(1120px, calc(100% - 40px));
    align-items: center;
    justify-content: space-between;
    margin: 0 auto;
  }
  .site-header {
    height: 84px;
  }
  .brand {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
  }
  .brand span,
  .brand img {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: calc(var(--radius) * 0.45);
    background: var(--primary);
    color: var(--primary-contrast);
    object-fit: contain;
  }
  .brand strong {
    overflow: hidden;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-controls {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .account-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .menu-toggle {
    position: relative;
    display: none;
    width: 42px;
    height: 42px;
    flex: none;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0;
    background: color-mix(in srgb, var(--surface) 92%, var(--primary));
    color: var(--text);
    cursor: pointer;
    box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 6%, transparent);
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
  .account-actions .user-chip,
  .account-actions a {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 10px 16px;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1;
    text-decoration: none;
    transition:
      transform 0.15s,
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s;
  }
  .account-actions .user-chip {
    max-width: 190px;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--primary) 18%, var(--border));
    background: color-mix(in srgb, var(--primary) 8%, var(--surface));
    color: var(--text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .account-actions a {
    background: color-mix(in srgb, var(--surface) 92%, var(--primary));
    color: var(--text);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--text) 6%, transparent);
  }
  .account-actions a:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
    box-shadow: 0 14px 34px color-mix(in srgb, var(--text) 8%, transparent);
  }
  .account-actions .login-cta {
    border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
    padding: 11px 18px;
    background: var(--primary);
    color: var(--primary-contrast);
    box-shadow: 0 12px 34px color-mix(in srgb, var(--primary) 24%, transparent);
    font-size: 0.86rem;
    font-weight: 900;
  }
  .account-actions .login-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 42px color-mix(in srgb, var(--primary) 30%, transparent);
  }
  .account-actions .danger-cta {
    border-color: color-mix(in srgb, var(--page-danger) 52%, var(--border));
    background: var(--page-danger);
    color: var(--page-danger-contrast);
    box-shadow: 0 12px 34px
      color-mix(in srgb, var(--page-danger) 22%, transparent);
  }
  .account-actions .danger-cta:hover {
    border-color: color-mix(in srgb, var(--page-danger) 68%, var(--border));
    box-shadow: 0 16px 42px
      color-mix(in srgb, var(--page-danger) 28%, transparent);
  }
  .shell {
    width: min(1120px, calc(100% - 40px));
    margin: 0 auto;
    padding: 72px 0 100px;
  }
  .hero {
    max-width: 900px;
    margin-bottom: 42px;
  }
  .eyebrow {
    margin: 0 0 13px;
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  h1 {
    max-width: 850px;
    margin: 0;
    font-family: var(--font);
    font-size: clamp(3rem, 7vw, 6.2rem);
    font-weight: 500;
    letter-spacing: -0.06em;
    line-height: 0.98;
    text-wrap: balance;
  }
  .subtitle {
    max-width: 650px;
    margin: 24px 0 0;
    color: var(--muted);
    font-size: 1.05rem;
    line-height: 1.75;
  }
  .composer,
  .permission-reasons,
  .empty {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 24px 70px color-mix(in srgb, var(--text) 7%, transparent);
  }
  .composer {
    padding: 12px;
  }
  .permission-reasons {
    display: grid;
    gap: 14px;
    margin-bottom: 18px;
    padding: 18px;
  }
  .permission-reasons h2 {
    margin: 0;
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 750;
    line-height: 1.5;
  }
  .permission-reason-list {
    display: grid;
    gap: 10px;
  }
  .permission-reason-list article {
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.45);
    padding: 12px;
    background: color-mix(in srgb, var(--surface) 88%, var(--primary));
  }
  .permission-reason-list strong,
  .permission-reason-list p {
    display: block;
    margin: 0;
  }
  .permission-reason-list strong {
    font-size: 0.82rem;
  }
  .permission-reason-list p {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.84rem;
    line-height: 1.6;
  }
  .access-locked {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 24px;
  }
  .access-locked strong {
    display: block;
    margin-bottom: 6px;
  }
  .access-locked p {
    margin: 0;
    color: var(--muted);
    font-size: 0.86rem;
  }
  .primary-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(2, minmax(170px, 220px)) auto;
    gap: 10px;
  }
  label {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  label > span {
    display: block;
    margin: 0 0 8px 4px;
  }
  label em {
    color: color-mix(in srgb, var(--muted) 65%, transparent);
    font-style: normal;
    font-weight: 600;
  }
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']) {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.55);
    background: var(--page-bg);
    color: var(--text);
    outline: none;
  }
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']) {
    height: 52px;
    padding: 0 15px;
  }
  select {
    width: 100%;
    height: 52px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.55);
    padding: 0 15px;
    background: var(--page-bg);
    color: var(--text);
    outline: none;
  }
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']):focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }
  select:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }
  .code-input {
    position: relative;
  }
  .code-input i {
    position: absolute;
    top: 50%;
    left: 10px;
    color: var(--muted);
    font-style: normal;
    transform: translateY(-50%);
  }
  .code-input input {
    padding-left: 46px;
  }
  .create {
    align-self: end;
    height: 52px;
    border: 0;
    border-radius: calc(var(--radius) * 0.55);
    padding: 0 22px;
    background: var(--primary);
    color: var(--primary-contrast);
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
  }
  .create span {
    margin-left: 14px;
  }
  .feedback {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 10px 0 0;
    border-radius: calc(var(--radius) * 0.5);
    padding: 13px 15px;
    font-size: 0.86rem;
  }
  .feedback.success {
    background: color-mix(in srgb, var(--primary) 10%, var(--surface));
    color: var(--text);
  }
  .feedback.success span {
    color: var(--muted);
  }
  .feedback.success a {
    overflow: hidden;
    color: var(--primary);
    font-weight: 900;
    text-overflow: ellipsis;
  }
  .feedback.success button {
    margin-left: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .links {
    margin-top: 90px;
  }
  .quick-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 34px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px;
    background: color-mix(in srgb, var(--surface) 86%, var(--primary));
  }
  .quick-tools h2 {
    font-size: 1.35rem;
  }
  .quick-tools a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border-radius: calc(var(--radius) * 0.45);
    padding: 0 16px;
    background: var(--primary);
    color: var(--primary-contrast);
    font-size: 0.82rem;
    font-weight: 900;
    text-decoration: none;
    white-space: nowrap;
  }
  .section-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }
  h2 {
    margin: 0;
    font-family: var(--font);
    font-size: 2rem;
    font-weight: 500;
    letter-spacing: -0.03em;
  }
  .section-header > p {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .empty {
    padding: 50px 20px;
    color: var(--muted);
    text-align: center;
  }
  footer {
    border-top: 1px solid var(--border);
    padding: 28px 0 42px;
    color: var(--muted);
    font-size: 0.78rem;
  }
  footer p {
    margin: 0;
  }
  .legal-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
  }
  .legal-links a {
    color: inherit;
    font-weight: 850;
    text-decoration: none;
  }
  .legal-links a:hover {
    color: var(--primary);
  }
  @media (max-width: 820px) {
    .shell {
      padding-top: 44px;
    }
    .primary-fields {
      grid-template-columns: 1fr;
    }
    .create {
      margin-top: 4px;
    }
  }
  @media (max-width: 560px) {
    .site-header,
    .shell,
    footer {
      width: min(100% - 28px, 1120px);
    }
    footer {
      align-items: flex-start;
      flex-direction: column;
    }
    .legal-links {
      justify-content: flex-start;
    }
    .site-header {
      position: relative;
      height: auto;
      min-height: 70px;
      align-items: center;
      gap: 12px;
      padding: 14px 0;
    }
    .brand {
      max-width: calc(100% - 54px);
    }
    .header-controls {
      margin-left: auto;
    }
    .menu-toggle {
      display: inline-flex;
    }
    .shell {
      padding-bottom: 70px;
    }
    h1 {
      font-size: clamp(2.8rem, 14vw, 4.6rem);
    }
    .composer {
      padding: 10px;
    }
    .access-locked {
      align-items: stretch;
      flex-direction: column;
      padding: 20px;
    }
    .links {
      margin-top: 65px;
    }
    .section-header {
      align-items: start;
      flex-direction: column;
    }
    .quick-tools {
      align-items: stretch;
      flex-direction: column;
    }
    .quick-tools a {
      width: 100%;
    }
    .account-actions {
      position: absolute;
      top: calc(100% - 8px);
      right: 0;
      z-index: 10;
      display: none;
      width: min(260px, calc(100vw - 28px));
      max-width: calc(100vw - 28px);
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) * 0.6);
      padding: 10px;
      background: var(--surface);
      box-shadow: 0 18px 44px color-mix(in srgb, var(--text) 12%, transparent);
    }
    .account-actions.open {
      display: flex;
    }
    .account-actions .user-chip,
    .account-actions a {
      width: 100%;
      min-height: 36px;
      justify-content: center;
      padding: 8px 11px;
      font-size: 0.74rem;
    }
    .account-actions .user-chip {
      max-width: none;
    }
    footer {
      align-items: start;
      flex-direction: column;
      gap: 18px;
    }
  }
</style>
