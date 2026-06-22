<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
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
    linkEditFieldKeys,
    linkOptionKeys,
    type LinkEditFieldKey,
    type LinkOptionKey,
    type SiteLocale,
    type SiteSettings,
  } from '$lib/config';
  import type { ManagedLinkItem } from '$lib/link-types';
  import type { SearchOption } from '$lib/search';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import DangerConfirmButton from './DangerConfirmButton.svelte';
  import LinkFormOptions from './LinkFormOptions.svelte';
  import LinkQr from './LinkQr.svelte';
  import Pagination from './Pagination.svelte';
  import SearchForm from './SearchForm.svelte';
  import ToggleField from './ToggleField.svelte';

  type HealthActionData = Record<string, unknown> & {
    healthResponseBody?: string;
    healthStatusCode?: number | null;
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
    permissionHref = () => null,
    canDelete,
    canViewStats = () => true,
    canCheckHealth = () => true,
    canEdit = () => true,
    editableFields = [...linkEditFieldKeys],
    editableFieldsForLink = () => editableFields,
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
    statsHref: (link: ManagedLinkItem) => string;
    permissionHref?: (link: ManagedLinkItem) => string | null;
    canDelete: (link: ManagedLinkItem) => boolean;
    canViewStats?: (link: ManagedLinkItem) => boolean;
    canCheckHealth?: (link: ManagedLinkItem) => boolean;
    canEdit?: (link: ManagedLinkItem) => boolean;
    editableFields?: LinkEditFieldKey[];
    editableFieldsForLink?: (link: ManagedLinkItem) => LinkEditFieldKey[];
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
  let copiedLink = $state<string | null>(null);
  let selectedLinks = $state<string[]>([]);
  let healthResponseModal = $state<{
    title: string;
    body: string;
  } | null>(null);

  const deletableLinks = $derived(
    links.filter(canDelete).map((link) => linkSelectionValue(link)),
  );
  const selectedCount = $derived(
    selectedAllowedCount(selectedLinks, deletableLinks),
  );
  const allDeletableSelected = $derived(
    allAllowedSelected(selectedLinks, deletableLinks),
  );

  $effect(() => {
    const next = reconcileSelection(selectedLinks, deletableLinks);
    if (next.length !== selectedLinks.length) selectedLinks = next;
  });

  async function copy(text: string, link: ManagedLinkItem) {
    const key = linkSelectionValue(link);
    await navigator.clipboard.writeText(text);
    copiedLink = key;
    setTimeout(() => {
      if (copiedLink === key) copiedLink = null;
    }, 1400);
  }

  function linkSelectionValue(link: Pick<ManagedLinkItem, 'code' | 'domain'>) {
    return `${link.domain}\t${link.code}`;
  }

  function toggleLink(link: ManagedLinkItem, checked: boolean) {
    selectedLinks = toggleSelection(
      selectedLinks,
      linkSelectionValue(link),
      checked,
    );
  }

  function toggleAll(checked: boolean) {
    selectedLinks = selectAll(deletableLinks, checked);
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
      link.routing.redirectRules.length > 0
        ? text.managedLinks.dynamicRouting
        : '',
    ].filter(Boolean);
  }

  function fieldEditable(link: ManagedLinkItem, field: LinkEditFieldKey) {
    return editableFieldsForLink(link).includes(field);
  }

  function canEditLink(link: ManagedLinkItem) {
    return canEdit(link) && editableFieldsForLink(link).length > 0;
  }

  function healthResponseTitle(
    link: ManagedLinkItem,
    statusCode: number | null = link.health.statusCode,
  ) {
    return formatText(text.managedLinks.healthResponseTitle, {
      code: link.code,
      status: statusCode ?? text.common.notChecked,
    });
  }

  function openHealthResponse(link: ManagedLinkItem, body: string) {
    const textBody = body.trim();
    if (!textBody) return;
    healthResponseModal = {
      title: healthResponseTitle(link),
      body: textBody,
    };
  }

  function healthCheckEnhance(link: ManagedLinkItem): SubmitFunction {
    return () =>
      async ({ result, update }) => {
        await update();
        if (result.type !== 'success' && result.type !== 'failure') return;
        const data = result.data as HealthActionData | undefined;
        if (data?.healthResponseBody?.trim()) {
          healthResponseModal = {
            title: healthResponseTitle(link, data.healthStatusCode ?? null),
            body: data.healthResponseBody.trim(),
          };
        }
      };
  }

  function editAllowedOptions(
    link: ManagedLinkItem,
  ): Partial<Record<LinkOptionKey, boolean>> {
    return Object.fromEntries(
      linkOptionKeys.map((key) => [
        key,
        key !== 'customCode' && fieldEditable(link, key as LinkEditFieldKey),
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
      disabled={deletableLinks.length === 0}
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
      {@const permissionUrl = permissionHref(link)}
      <article class="link-row">
        <ToggleField
          form={deleteFormId}
          class="row-check"
          name="links"
          value={linkSelectionValue(link)}
          ariaLabel={formatText(text.managedLinks.selectLink, {
            code: link.code,
          })}
          checked={selectedLinks.includes(linkSelectionValue(link))}
          disabled={!canDelete(link)}
          onchange={(event) => toggleLink(link, event.currentTarget.checked)}
        />
        <div class="link-mark">↗</div>
        <div class="link-copy">
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <a
            class="short"
            href={link.shortUrl}
            target="_blank"
            rel="noreferrer"
          >
            {link.shortUrl}
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
          {#if link.share.recipientCount > 0}
            <p class="share-summary">
              {formatText(text.managedLinks.sharedWithCount, {
                count: link.share.recipientCount,
              })}
            </p>
          {/if}
        </div>
        <div class="meta">
          <span
            >{formatText(text.managedLinks.clickCount, {
              count: link.clicks,
            })}</span
          >
          <span>{new Date(link.createdAt).toLocaleDateString()}</span>
          <span
            class:ok={link.health.status === 'ok'}
            class:broken={link.health.status === 'broken'}
          >
            {healthText(link)}
          </span>
        </div>
        <div class="actions">
          <button type="button" onclick={() => copy(link.shortUrl, link)}>
            {copiedLink === linkSelectionValue(link)
              ? text.managedLinks.copied
              : text.managedLinks.copy}
          </button>
          {#if canViewStats(link)}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={statsHref(link)}>{text.managedLinks.stats}</a>
          {/if}
          {#if permissionUrl}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={permissionUrl}>{text.managedLinks.sharePermissions}</a>
          {/if}
          {#if healthAction && canCheckHealth(link)}
            <form
              class="inline-form"
              method="POST"
              action={healthAction}
              use:enhance={healthCheckEnhance(link)}
            >
              <input type="hidden" name="code" value={link.code} />
              <input type="hidden" name="domain" value={link.domain} />
              <button type="submit">{text.managedLinks.health}</button>
            </form>
          {/if}
          {#if link.health.responseBody}
            <button
              type="button"
              onclick={() => openHealthResponse(link, link.health.responseBody)}
            >
              {text.managedLinks.healthResponse}
            </button>
          {/if}
          <DangerConfirmButton
            formId={deleteFormId}
            label={text.managedLinks.delete}
            size="small"
            name="singleLink"
            value={linkSelectionValue(link)}
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
            value={link.shortUrl}
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
              <input type="hidden" name="domain" value={link.domain} />
              {#if fieldEditable(link, 'url')}
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
                allowedOptions={editAllowedOptions(link)}
                {seo}
                values={{
                  preview: link.preview,
                  tags: link.tags,
                  expiresAt: link.smart.expiresAt,
                  maxClicks: link.smart.maxClicks,
                  passwordProtected: link.smart.passwordProtected,
                  redirectRules: link.routing.redirectRules,
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

{#if healthResponseModal}
  <div class="modal-backdrop" role="presentation">
    <div
      class="health-modal"
      role="dialog"
      aria-modal="true"
      aria-label={healthResponseModal.title}
    >
      <div class="modal-head">
        <h2>{healthResponseModal.title}</h2>
        <button type="button" onclick={() => (healthResponseModal = null)}>
          {text.managedLinks.closeHealthResponse}
        </button>
      </div>
      <pre>{healthResponseModal.body}</pre>
    </div>
  </div>
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
  .share-summary {
    margin: 8px 0 0;
    color: var(--managed-link-primary, var(--primary));
    font-size: 0.74rem;
    font-weight: 850;
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
  .modal-backdrop {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(
      in srgb,
      var(--managed-link-text, var(--text)) 45%,
      transparent
    );
  }
  .health-modal {
    display: grid;
    width: min(760px, 100%);
    max-height: min(760px, 86vh);
    overflow: hidden;
    border: 1px solid var(--managed-link-border, var(--border));
    border-radius: var(--managed-link-radius, var(--radius));
    background: var(--managed-link-surface, var(--surface));
    color: var(--managed-link-text, var(--text));
    box-shadow: 0 24px 80px
      color-mix(in srgb, var(--managed-link-text, var(--text)) 20%, transparent);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--managed-link-border, var(--border));
    padding: 14px 16px;
  }
  .modal-head h2 {
    margin: 0;
    font-size: 0.98rem;
  }
  .modal-head button {
    min-height: 34px;
    border: 1px solid var(--managed-link-border, var(--border));
    border-radius: 8px;
    padding: 7px 10px;
    background: transparent;
    color: var(--managed-link-muted, var(--muted));
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
  }
  .health-modal pre {
    max-height: calc(86vh - 70px);
    margin: 0;
    overflow: auto;
    padding: 16px;
    color: var(--managed-link-text, var(--text));
    font:
      0.82rem/1.55 ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace;
    white-space: pre-wrap;
    word-break: break-word;
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
