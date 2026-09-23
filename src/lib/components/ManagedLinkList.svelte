<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Link2 } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
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
        <div class="link-mark"><Link2 size={16} aria-hidden="true" /></div>
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
          {#if link.preview.title}<p class="preview-meta">
              {link.preview.title}
            </p>{/if}
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
          <Button
            variant="outline"
            type="button"
            onclick={() => copy(link.shortUrl, link)}
          >
            {copiedLink === linkSelectionValue(link)
              ? text.managedLinks.copied
              : text.managedLinks.copy}
          </Button>
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
              <Button type="submit">{text.managedLinks.health}</Button>
            </form>
          {/if}
          {#if link.health.responseBody}
            <Button
              variant="outline"
              type="button"
              onclick={() => openHealthResponse(link, link.health.responseBody)}
            >
              {text.managedLinks.healthResponse}
            </Button>
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
          <Dialog.Root>
            <Dialog.Trigger
              >{#snippet child({ props })}<Button
                  {...props}
                  variant="outline"
                  size="sm">{text.common.qrCode}</Button
                >{/snippet}</Dialog.Trigger
            >
            <Dialog.Content
              portalProps={{ disabled: true }}
              showCloseButton={false}
              class="sm:max-w-sm"
            >
              <Dialog.Header
                ><Dialog.Title>{text.common.qrCode}</Dialog.Title
                ><Dialog.Description>{link.shortUrl}</Dialog.Description
                ></Dialog.Header
              >
              <div class="qr-preview">
                <LinkQr
                  value={link.shortUrl}
                  code={link.code}
                  {brandName}
                  {accentColor}
                  {locale}
                />
              </div>
              <Dialog.Close
                >{#snippet child({ props })}<Button {...props} variant="outline"
                    >{text.common.close}</Button
                  >{/snippet}</Dialog.Close
              >
            </Dialog.Content>
          </Dialog.Root>
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
                  <Input name="url" type="text" value={link.url} required />
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
                <Button type="submit">{text.managedLinks.saveChanges}</Button>
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

<Dialog.Root
  open={Boolean(healthResponseModal)}
  onOpenChange={(open) => {
    if (!open) healthResponseModal = null;
  }}
>
  <Dialog.Content
    portalProps={{ disabled: true }}
    showCloseButton={false}
    class="sm:max-w-2xl"
  >
    <Dialog.Header
      ><Dialog.Title
        >{healthResponseModal?.title ??
          text.managedLinks.healthResponse}</Dialog.Title
      ></Dialog.Header
    >
    <pre class="health-body">{healthResponseModal?.body ?? ''}</pre>
    <Dialog.Close
      >{#snippet child({ props })}<Button {...props} variant="outline"
          >{text.common.close}</Button
        >{/snippet}</Dialog.Close
    >
  </Dialog.Content>
</Dialog.Root>

<style>
  .link-list,
  .empty {
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius, 8px);
    background: var(--ui-card);
  }
  .empty {
    padding: 48px 24px;
    text-align: center;
    color: var(--ui-muted-foreground);
    font-size: 0.875rem;
  }
  .bulk-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .bulk-actions p {
    margin: 0 0 0 auto;
    color: var(--ui-muted-foreground);
    font-size: 0.75rem;
  }
  .link-row {
    display: grid;
    grid-template-columns: 20px 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 20px;
  }
  .link-row + .link-row {
    border-top: 1px solid var(--ui-border);
  }
  .link-mark {
    color: var(--ui-muted-foreground);
    display: grid;
    place-items: center;
  }
  .link-copy {
    min-width: 0;
  }
  .short {
    color: var(--ui-foreground);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .short:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .long {
    margin: 4px 0 0;
    color: var(--ui-muted-foreground);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-meta,
  .share-summary {
    margin: 6px 0 0;
    font-size: 0.75rem;
    color: var(--ui-muted-foreground);
    overflow-wrap: anywhere;
  }
  .link-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .link-badges span {
    padding: 2px 6px;
    background: var(--ui-muted);
    border-radius: calc(var(--ui-radius, 8px) * 0.5);
    color: var(--ui-muted-foreground);
    font-size: 0.7rem;
  }
  .link-badges .smart {
    border: 1px solid var(--ui-border);
    background: transparent;
  }
  .meta {
    display: grid;
    gap: 4px;
    justify-items: end;
    color: var(--ui-muted-foreground);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .meta .ok {
    color: var(--ui-foreground);
  }
  .meta .broken {
    color: var(--ui-destructive);
  }
  .actions {
    grid-column: 3;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .actions :global(button) {
    height: 32px;
    min-height: 32px;
    padding: 0 10px;
    font-size: 0.75rem;
  }
  .actions a,
  .link-editor summary {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--ui-border);
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    color: var(--ui-foreground);
    font-size: 0.75rem;
    text-decoration: none;
    cursor: pointer;
  }
  .actions a:hover,
  .link-editor summary:hover {
    background: var(--ui-muted);
  }
  .inline-form {
    display: contents;
  }
  .qr-wrap {
    justify-self: end;
  }
  .qr-preview {
    --qr-size: 180px;
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }
  .link-editor {
    grid-column: 3/-1;
  }
  .link-editor summary {
    list-style: none;
    width: fit-content;
  }
  .link-editor summary::-webkit-details-marker {
    display: none;
  }
  .edit-form {
    display: grid;
    gap: 16px;
    margin-top: 16px;
    border-top: 1px solid var(--ui-border);
    padding-top: 16px;
  }
  .edit-form > label {
    display: grid;
    gap: 8px;
    font-size: 0.8rem;
  }
  .wide,
  .edit-actions {
    grid-column: 1/-1;
  }
  .edit-actions {
    display: flex;
    justify-content: flex-end;
  }
  .health-body {
    max-height: 60dvh;
    overflow: auto;
    margin: 0;
    padding: 16px;
    background: var(--ui-muted);
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    font-size: 0.8rem;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 640px) {
    .link-row {
      grid-template-columns: 20px minmax(0, 1fr) auto;
      padding: 16px;
      gap: 12px 8px;
    }
    .link-mark {
      display: none;
    }
    .link-copy {
      grid-column: 2/-1;
    }
    .meta {
      grid-column: 2/-1;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-items: start;
    }
    .actions {
      grid-column: 2/-1;
    }
    .qr-wrap {
      grid-column: 2/-1;
      justify-self: start;
    }
    .link-editor {
      grid-column: 2/-1;
    }
  }
</style>
