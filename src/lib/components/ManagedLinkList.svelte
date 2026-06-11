<script lang="ts">
  import { enhance } from '$app/forms';
  import { keepFormValues } from '$lib/forms';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import {
    defaultSiteLocale,
    linkOptionKeys,
    type LinkEditFieldKey,
    type LinkOptionKey,
    type SiteLocale,
    type SiteSettings,
  } from '$lib/config';
  import type { SearchOption } from '$lib/search';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import DangerConfirmButton from './DangerConfirmButton.svelte';
  import LinkFormOptions from './LinkFormOptions.svelte';
  import LinkQr from './LinkQr.svelte';
  import Pagination from './Pagination.svelte';
  import SearchForm from './SearchForm.svelte';
  import ToggleField from './ToggleField.svelte';

  type ManagedLinkItem = {
    id: number;
    code: string;
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
    smart: {
      expiresAt: string | null;
      maxClicks: number;
      passwordProtected: boolean;
    };
    routing: {
      mobileUrl: string;
      desktopUrl: string;
      abUrl: string;
      abPercent: number;
    };
    health: {
      status: 'unchecked' | 'ok' | 'warning' | 'broken';
      statusCode: number | null;
      checkedAt: string | null;
      error: string;
      latencyMs: number | null;
    };
  };

  type SearchConfig = {
    baseHref: string;
    field: string;
    query: string;
    options: SearchOption[];
    fieldName?: string;
    queryName?: string;
    label?: string;
    placeholder?: string;
    submitLabel?: string;
    clearLabel?: string;
  };

  let {
    links,
    accessDenied = false,
    accessDeniedMessage,
    emptyMessage,
    deleteFormId,
    deleteAction,
    updateAction,
    healthAction,
    statsHref,
    canDelete,
    canEdit = () => true,
    editableFields = [
      'url',
      'previewTitle',
      'previewDescription',
      'previewImageUrl',
      'themeColor',
      'utmSource',
      'utmMedium',
      'utmCampaign',
      'utmTerm',
      'utmContent',
      'expiresAt',
      'maxClicks',
      'password',
      'tags',
      'mobileUrl',
      'desktopUrl',
      'abUrl',
      'abPercent',
    ],
    deleteDisabledReason = () => '',
    policyMessage = '',
    page,
    totalPages,
    getPageHref,
    pageLabel,
    search,
    brandName = 'Shortlink',
    accentColor = '#171717',
    seo,
    locale = defaultSiteLocale,
  }: {
    links: ManagedLinkItem[];
    accessDenied?: boolean;
    accessDeniedMessage?: string;
    emptyMessage?: string;
    deleteFormId: string;
    deleteAction: string;
    updateAction: string;
    healthAction?: string;
    statsHref: (code: string) => string;
    canDelete: (link: ManagedLinkItem) => boolean;
    canEdit?: (link: ManagedLinkItem) => boolean;
    editableFields?: LinkEditFieldKey[];
    deleteDisabledReason?: (link: ManagedLinkItem) => string;
    policyMessage?: string;
    page: number;
    totalPages: number;
    getPageHref: (page: number) => string;
    pageLabel: string;
    search?: SearchConfig;
    brandName?: string;
    accentColor?: string;
    seo?: Pick<SiteSettings['seo'], 'title' | 'description' | 'ogImageUrl'>;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
  const resolvedAccessDeniedMessage = $derived(
    accessDeniedMessage ?? text.managedLinks.accessDenied,
  );
  const resolvedEmptyMessage = $derived(
    emptyMessage ?? text.managedLinks.empty,
  );
  let copiedCode = $state<string | null>(null);
  let selectedCodes = $state<string[]>([]);

  const deletableCodes = $derived(
    links.filter(canDelete).map((link) => link.code),
  );
  const selectedCount = $derived(
    selectedAllowedCount(selectedCodes, deletableCodes),
  );
  const allDeletableSelected = $derived(
    allAllowedSelected(selectedCodes, deletableCodes),
  );

  $effect(() => {
    const next = reconcileSelection(selectedCodes, deletableCodes);
    if (next.length !== selectedCodes.length) selectedCodes = next;
  });

  async function copy(text: string, code: string) {
    await navigator.clipboard.writeText(text);
    copiedCode = code;
    setTimeout(() => {
      if (copiedCode === code) copiedCode = null;
    }, 1400);
  }

  function toggleCode(code: string, checked: boolean) {
    selectedCodes = toggleSelection(selectedCodes, code, checked);
  }

  function toggleAll(checked: boolean) {
    selectedCodes = selectAll(deletableCodes, checked);
  }

  function healthText(link: ManagedLinkItem) {
    if (link.health.status === 'ok') {
      return link.health.statusCode
        ? `${text.common.healthy} ${link.health.statusCode}`
        : text.common.healthy;
    }
    if (link.health.status === 'warning') {
      return link.health.statusCode
        ? `${text.common.warning} ${link.health.statusCode}`
        : text.common.warning;
    }
    if (link.health.status === 'broken') return text.common.broken;
    return text.common.notChecked;
  }

  function smartLabels(link: ManagedLinkItem) {
    return [
      link.smart.expiresAt ? text.managedLinks.expiresAt : '',
      link.smart.maxClicks > 0
        ? formatText(text.managedLinks.maxClicksLimit, {
            count: link.smart.maxClicks,
          })
        : '',
      link.smart.passwordProtected ? text.managedLinks.password : '',
      link.routing.mobileUrl || link.routing.desktopUrl
        ? text.managedLinks.deviceRouting
        : '',
      link.routing.abUrl && link.routing.abPercent > 0
        ? `A/B ${link.routing.abPercent}%`
        : '',
    ].filter(Boolean);
  }

  function fieldEditable(field: LinkEditFieldKey) {
    return editableFields.includes(field);
  }

  function canEditLink(link: ManagedLinkItem) {
    return canEdit(link) && editableFields.length > 0;
  }

  function editAllowedOptions(): Partial<Record<LinkOptionKey, boolean>> {
    return Object.fromEntries(
      linkOptionKeys.map((key) => [
        key,
        key !== 'customCode' && fieldEditable(key as LinkEditFieldKey),
      ]),
    ) as Partial<Record<LinkOptionKey, boolean>>;
  }
</script>

{#if search && !accessDenied}
  <SearchForm {...search} {locale} />
{/if}

{#if accessDenied}
  <div class="empty">{resolvedAccessDeniedMessage}</div>
{:else if links.length === 0}
  <div class="empty">{resolvedEmptyMessage}</div>
{:else}
  <form
    id={deleteFormId}
    method="POST"
    action={deleteAction}
    use:enhance
  ></form>
  <div class="bulk-actions">
    <ToggleField
      form={deleteFormId}
      checked={allDeletableSelected}
      disabled={deletableCodes.length === 0}
      label={formatText(text.managedLinks.selected, { count: selectedCount })}
      onchange={(event) => toggleAll(event.currentTarget.checked)}
    />
    <DangerConfirmButton
      formId={deleteFormId}
      label={text.managedLinks.bulkDelete}
      title={text.managedLinks.bulkDeleteTitle}
      message={formatText(text.managedLinks.bulkDeleteMessage, {
        count: selectedCount,
      })}
      confirmLabel={text.managedLinks.bulkDeleteConfirm}
      {locale}
      disabled={selectedCount === 0}
    />
    {#if policyMessage}
      <p>{policyMessage}</p>
    {/if}
  </div>

  <div class="link-list">
    {#each links as link (link.id)}
      {@const deleteReason = deleteDisabledReason(link)}
      <article class="link-row">
        <ToggleField
          form={deleteFormId}
          class="row-check"
          name="codes"
          value={link.code}
          ariaLabel={formatText(text.managedLinks.selectLink, {
            code: link.code,
          })}
          checked={selectedCodes.includes(link.code)}
          disabled={!canDelete(link)}
          onchange={(event) =>
            toggleCode(link.code, event.currentTarget.checked)}
        />
        <div class="link-mark">↗</div>
        <div class="link-copy">
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <a
            class="short"
            href={link.short_url}
            target="_blank"
            rel="noreferrer"
          >
            {link.short_url}
          </a>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
          <p class="long">{link.url}</p>
          {#if link.preview.title || link.preview.description || link.preview.imageUrl || link.preview.themeColor}
            <p class="preview-meta">
              {link.preview.title || text.managedLinks.previewTitleEmpty} ·
              {link.preview.imageUrl
                ? text.managedLinks.imageConfigured
                : text.managedLinks.imageEmpty} ·
              {link.preview.themeColor || text.managedLinks.themeColorEmpty}
            </p>
          {/if}
          {#if link.tags.length > 0 || smartLabels(link).length > 0}
            <div class="link-badges">
              {#each link.tags as tag (tag)}
                <span>#{tag}</span>
              {/each}
              {#each smartLabels(link) as label (label)}
                <span class="smart">{label}</span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="meta">
          <span>{link.clicks} clicks</span>
          <span>{new Date(link.created_at).toLocaleDateString()}</span>
          <span
            class:ok={link.health.status === 'ok'}
            class:broken={link.health.status === 'broken'}
          >
            {healthText(link)}
          </span>
        </div>
        <div class="actions">
          <button type="button" onclick={() => copy(link.short_url, link.code)}>
            {copiedCode === link.code
              ? text.managedLinks.copied
              : text.managedLinks.copy}
          </button>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={statsHref(link.code)}>{text.managedLinks.stats}</a>
          {#if healthAction}
            <form
              class="inline-form"
              method="POST"
              action={healthAction}
              use:enhance
            >
              <input type="hidden" name="code" value={link.code} />
              <button type="submit">{text.managedLinks.health}</button>
            </form>
          {/if}
          <DangerConfirmButton
            formId={deleteFormId}
            label={text.managedLinks.delete}
            size="small"
            name="singleCode"
            value={link.code}
            disabled={!canDelete(link)}
            buttonTitle={deleteReason}
            title={formatText(text.managedLinks.deleteTitle, {
              code: link.code,
            })}
            message={text.managedLinks.deleteMessage}
            confirmLabel={text.managedLinks.deleteConfirm}
            {locale}
          />
        </div>
        <div class="qr-wrap">
          <LinkQr
            value={link.short_url}
            code={link.code}
            {brandName}
            {accentColor}
            {locale}
          />
        </div>
        {#if canEditLink(link)}
          <details class="link-editor">
            <summary>{text.managedLinks.edit}</summary>
            <form
              class="edit-form"
              method="POST"
              action={updateAction}
              use:enhance={keepFormValues}
            >
              <input type="hidden" name="code" value={link.code} />
              {#if fieldEditable('url')}
                <label class="wide">
                  <span>{text.managedLinks.destinationUrl}</span>
                  <input name="url" type="text" value={link.url} required />
                </label>
              {:else}
                <input type="hidden" name="url" value={link.url} />
              {/if}
              <LinkFormOptions
                mode="edit"
                collapsible={false}
                idPrefix={`edit-link-options-${link.id}`}
                allowedOptions={editAllowedOptions()}
                {seo}
                values={{
                  preview: link.preview,
                  tags: link.tags,
                  expiresAt: link.smart.expiresAt,
                  maxClicks: link.smart.maxClicks,
                  passwordProtected: link.smart.passwordProtected,
                  mobileUrl: link.routing.mobileUrl,
                  desktopUrl: link.routing.desktopUrl,
                  abUrl: link.routing.abUrl,
                  abPercent: link.routing.abPercent,
                }}
                {locale}
              />
              <div class="edit-actions">
                <button type="submit">{text.managedLinks.saveChanges}</button>
              </div>
            </form>
          </details>
        {/if}
      </article>
    {/each}
  </div>

  <Pagination
    {page}
    {totalPages}
    getHref={getPageHref}
    label={pageLabel}
    {locale}
  />
{/if}

<style>
  .link-list,
  .empty {
    border: 1px solid var(--managed-link-border, var(--border));
    border-radius: var(--managed-link-radius, var(--radius));
    background: var(--managed-link-surface, var(--surface));
    box-shadow: 0 24px 70px
      color-mix(in srgb, var(--managed-link-text, var(--text)) 7%, transparent);
  }
  .link-list {
    overflow: hidden;
  }
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: var(--managed-link-bulk-margin-bottom, 12px);
    padding: var(--managed-link-bulk-padding, 0);
  }
  .bulk-actions p {
    margin: 0 0 0 auto;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.78rem;
  }
  .bulk-actions,
  .link-row {
    --toggle-border: var(--managed-link-border, var(--border));
    --toggle-surface: var(--managed-link-surface, var(--surface));
    --toggle-primary: var(--managed-link-primary, var(--primary));
    --toggle-label: var(--managed-link-text, var(--text));
    --toggle-font-size: 0.82rem;
    --toggle-min-height: 38px;
  }
  .link-row {
    display: grid;
    grid-template-columns: 18px 36px minmax(0, 1fr) auto auto 112px;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
  }
  .link-row + .link-row {
    border-top: 1px solid var(--managed-link-border, var(--border));
  }
  .link-mark {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--managed-link-primary, var(--primary)) 9%,
      var(--managed-link-surface, var(--surface))
    );
    color: var(--managed-link-primary, var(--primary));
  }
  .short {
    color: var(--managed-link-text, var(--text));
    font-weight: 850;
    text-decoration: none;
  }
  .long {
    max-width: 580px;
    margin: 5px 0 0;
    overflow: hidden;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-meta {
    max-width: 580px;
    margin: 5px 0 0;
    overflow: hidden;
    color: var(--managed-link-primary, var(--primary));
    font-size: 0.74rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .link-badges span {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    border: 1px solid
      color-mix(
        in srgb,
        var(--managed-link-primary, var(--primary)) 18%,
        var(--managed-link-border, var(--border))
      );
    border-radius: 999px;
    padding: 4px 8px;
    background: color-mix(
      in srgb,
      var(--managed-link-primary, var(--primary)) 7%,
      var(--managed-link-surface, var(--surface))
    );
    color: var(--managed-link-text, var(--text));
    font-size: 0.7rem;
    font-weight: 850;
  }
  .link-badges .smart {
    border-color: var(--managed-link-border, var(--border));
    color: var(--managed-link-muted, var(--muted));
  }
  .meta {
    display: flex;
    gap: 16px;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.75rem;
  }
  .meta .ok {
    color: var(--managed-link-primary, var(--primary));
    font-weight: 900;
  }
  .meta .broken {
    color: var(--managed-link-danger, var(--page-danger));
    font-weight: 900;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .inline-form {
    display: contents;
  }
  .actions button,
  .actions a,
  .link-editor summary {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--managed-link-border, var(--border));
    border-radius: 8px;
    padding: 7px 10px;
    background: transparent;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
  }
  .link-editor {
    grid-column: 1 / -1;
    border-top: 1px solid var(--managed-link-border, var(--border));
    padding-top: 14px;
  }
  .qr-wrap {
    justify-self: end;
  }
  .link-editor summary {
    width: fit-content;
    list-style: none;
  }
  .link-editor summary::-webkit-details-marker {
    display: none;
  }
  .edit-form {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }
  .edit-form > label {
    display: grid;
    gap: 8px;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.78rem;
    font-weight: 800;
  }
  .edit-form > label > span {
    display: block;
    margin: 0 0 2px 4px;
  }
  .edit-form > label > input {
    width: 100%;
    border: 1px solid var(--managed-link-border, var(--border));
    border-radius: calc(var(--managed-link-radius, var(--radius)) * 0.45);
    background: var(--managed-link-bg, var(--page-bg));
    color: var(--managed-link-text, var(--text));
    outline: none;
    min-height: 44px;
    padding: 0 12px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .edit-actions {
    display: flex;
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
  .edit-actions button {
    border: 0;
    border-radius: calc(var(--managed-link-radius, var(--radius)) * 0.45);
    padding: 10px 14px;
    background: var(--managed-link-primary, var(--primary));
    color: var(--managed-link-primary-contrast, var(--primary-contrast));
    font-size: 0.8rem;
    font-weight: 850;
    cursor: pointer;
  }
  .empty {
    padding: 50px 20px;
    color: var(--managed-link-muted, var(--muted));
    text-align: center;
  }
  @media (max-width: 820px) {
    .link-row {
      grid-template-columns: 18px 36px 1fr auto;
    }
    .meta {
      display: none;
    }
    .qr-wrap {
      grid-column: 3 / -1;
      justify-self: start;
    }
  }
  @media (max-width: 560px) {
    .link-row {
      grid-template-columns: 1fr;
    }
    :global(.row-check) {
      justify-self: start;
    }
    .link-mark {
      display: none;
    }
    .actions {
      margin-top: 3px;
    }
    .qr-wrap {
      grid-column: auto;
    }
    .bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .bulk-actions p {
      margin-left: 0;
    }
  }
  @media (max-width: 360px) {
    .actions {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
    }
    .actions button,
    .actions a {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
  }
</style>
