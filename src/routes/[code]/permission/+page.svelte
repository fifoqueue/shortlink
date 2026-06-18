<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    linkEditFieldKeys,
    type LinkEditFieldKey,
    type SiteLocale,
    type SiteSettings,
  } from '$lib/config';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import SearchForm from '$lib/components/SearchForm.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { keepFormValues } from '$lib/forms';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import {
    RECIPIENT_SEARCH_PARAMS,
    type RecipientSearchState,
    type SearchOption,
  } from '$lib/search';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import { siteThemeStyle } from '$lib/theme-vars';
  import '$lib/styles/content-page.css';

  type LinkSummary = {
    code: string;
    domain: string;
    url: string;
    shortUrl: string;
  };

  type ShareAccess = {
    canEdit: boolean;
    canViewStats: boolean;
    editableFields: LinkEditFieldKey[];
    expiresAt: string | null;
  };

  type ShareDetails = {
    id: number;
    token: string;
    expiresAt: string | null;
    canViewStats: boolean;
    editableFields: LinkEditFieldKey[];
    recipientCount: number;
    recipients: Array<{
      id: number;
      userId: number;
      name: string;
      email: string | null;
      acceptedAt: string;
      active: boolean;
      access: ShareAccess;
    }>;
    inviteActive: boolean;
  };

  type RecipientSearchData = RecipientSearchState & {
    page: number;
    pageSize: number;
    totalItems: number;
    totalRecipients: number;
    totalPages: number;
    baseHref: string;
    pageHrefBase: string;
  };

  type PageData = {
    mode: 'manage' | 'accepted' | 'inviteExpired';
    link: LinkSummary;
    access?: ShareAccess;
    acceptedAsOwner?: boolean;
    statsHref?: string;
    share?: ShareDetails | null;
    recipientSearch?: RecipientSearchData;
    inviteUrl?: string | null;
    mailtoHref?: string | null;
    returnTo?: string;
    locale: SiteLocale;
    siteName: string;
    theme: SiteSettings['theme'];
    customHead: string;
  };

  type ActionData = {
    ok?: boolean;
    message?: string;
  };

  let { data, form }: { data: PageData; form?: ActionData } = $props();
  const text = $derived(uiText(data.locale));
  const homeHref = $derived(resolve('/'));
  const recipientSearch = $derived(
    data.recipientSearch ?? {
      field: 'all',
      query: '',
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalRecipients: 0,
      totalPages: 1,
      baseHref: '/',
      pageHrefBase: '/',
    },
  );
  const hasRecipientSearch = $derived(recipientSearch.query.trim().length > 0);
  const showRecipientSearch = $derived(
    recipientSearch.totalRecipients > 0 || hasRecipientSearch,
  );
  let copiedInvite = $state(false);
  let selectedRecipientIds = $state<string[]>([]);
  const defaultEditableFields: LinkEditFieldKey[] = ['url'];
  const recipientBulkRevokeFormId = 'share-recipient-bulk-revoke-form';
  const selectableRecipientIds = $derived(
    (data.share?.recipients ?? []).map((recipient) => String(recipient.id)),
  );
  const selectedRecipientCount = $derived(
    selectedAllowedCount(selectedRecipientIds, selectableRecipientIds),
  );
  const allRecipientsSelected = $derived(
    allAllowedSelected(selectedRecipientIds, selectableRecipientIds),
  );

  $effect(() => {
    const next = reconcileSelection(
      selectedRecipientIds,
      selectableRecipientIds,
    );
    if (next.length !== selectedRecipientIds.length) {
      selectedRecipientIds = next;
    }
  });

  function resolvePath(path: string) {
    return resolve(path as '/');
  }

  function copyInvite() {
    if (!data.inviteUrl) return;
    void navigator.clipboard.writeText(data.inviteUrl);
    copiedInvite = true;
    setTimeout(() => {
      copiedInvite = false;
    }, 1400);
  }

  function expiresAtInput(value: string | null | undefined) {
    return value ? value.slice(0, 16) : '';
  }

  function selectedEditableFields() {
    const fields = data.share?.editableFields ?? defaultEditableFields;
    if ((data.share?.canViewStats ?? true) || fields.length > 0) {
      return fields;
    }
    return defaultEditableFields;
  }

  function recipientRevokeFormId(recipientId: number) {
    return `share-recipient-revoke-${recipientId}`;
  }

  function toggleRecipient(recipientId: number, checked: boolean) {
    selectedRecipientIds = toggleSelection(
      selectedRecipientIds,
      String(recipientId),
      checked,
    );
  }

  function toggleAllRecipients(checked: boolean) {
    selectedRecipientIds = selectAll(selectableRecipientIds, checked);
  }

  function ensureSharePermission(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const form = input.form;
    if (!form) return;
    const hasStats = Boolean(
      form.querySelector('input[name="canViewStats"]:checked'),
    );
    const hasEditableField = Boolean(
      form.querySelector('input[name="editableFields"]:checked'),
    );
    if (!hasStats && !hasEditableField) input.checked = true;
  }

  function editableFieldInputs(fieldset: HTMLFieldSetElement) {
    return Array.from(
      fieldset.querySelectorAll<HTMLInputElement>(
        'input[name="editableFields"]',
      ),
    );
  }

  function updateEditableFieldsToggle(fieldset: HTMLFieldSetElement) {
    const toggle = fieldset.querySelector<HTMLInputElement>(
      'input[data-editable-fields-toggle]',
    );
    if (!toggle) return;

    const inputs = editableFieldInputs(fieldset);
    const checkedCount = inputs.filter((input) => input.checked).length;
    toggle.checked = inputs.length > 0 && checkedCount === inputs.length;
    toggle.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
  }

  function editableFieldsToggleState(node: HTMLInputElement) {
    const fieldset = node.closest('fieldset');
    if (!(fieldset instanceof HTMLFieldSetElement)) return;

    const update = () => updateEditableFieldsToggle(fieldset);
    const handleChange = (event: Event) => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.name === 'editableFields'
      ) {
        update();
      }
    };

    fieldset.addEventListener('change', handleChange);
    queueMicrotask(update);

    return {
      destroy() {
        fieldset.removeEventListener('change', handleChange);
      },
    };
  }

  function toggleEditableFields(event: Event) {
    const toggle = event.currentTarget as HTMLInputElement;
    const fieldset = toggle.closest('fieldset');
    const form = toggle.form;
    if (!(fieldset instanceof HTMLFieldSetElement) || !form) return;

    const inputs = editableFieldInputs(fieldset);
    for (const input of inputs) input.checked = toggle.checked;

    const hasStats = Boolean(
      form.querySelector('input[name="canViewStats"]:checked'),
    );
    if (!toggle.checked && !hasStats && inputs[0]) {
      inputs[0].checked = true;
    }

    updateEditableFieldsToggle(fieldset);
  }

  function fieldLabel(field: LinkEditFieldKey) {
    const labels = text.admin.settings;
    const fieldLabels: Record<LinkEditFieldKey, string> = {
      url: labels.destinationUrl,
      previewTitle: labels.previewTitle,
      previewDescription: labels.previewDescriptionLabel,
      previewImageUrl: labels.previewImageUrl,
      themeColor: labels.themeColor,
      utmSource: labels.utmSource,
      utmMedium: labels.utmMedium,
      utmCampaign: labels.utmCampaign,
      utmTerm: labels.utmTerm,
      utmContent: labels.utmContent,
      expiresAt: labels.expirationDate,
      maxClicks: labels.maxClicks,
      password: labels.password,
      tags: labels.tags,
      redirectRules: labels.redirectRules,
      redirectRuleDevice: labels.redirectRuleDevice,
      redirectRuleLanguage: labels.redirectRuleLanguage,
      redirectRuleQuery: labels.redirectRuleQuery,
      redirectRuleIp: labels.redirectRuleIp,
      redirectRuleGeo: labels.redirectRuleGeo,
      redirectRulePercentage: labels.redirectRulePercentage,
    };
    return fieldLabels[field];
  }

  const editableFieldOptions = $derived(
    linkEditFieldKeys.map((field) => ({
      value: field,
      label: fieldLabel(field),
    })),
  );
  const recipientSearchOptions = $derived([
    { value: 'all', label: text.common.all },
    { value: 'name', label: text.linkPermission.recipientSearchName },
    { value: 'email', label: text.linkPermission.recipientSearchEmail },
  ] satisfies SearchOption[]);

  function recipientPageHref(page: number) {
    const totalPages = Math.max(1, recipientSearch.totalPages);
    const nextPage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
    const target = new URL(
      recipientSearch.pageHrefBase || '/',
      'http://shortlink.local',
    );

    if (nextPage > 1) {
      target.searchParams.set(RECIPIENT_SEARCH_PARAMS.page, String(nextPage));
    } else {
      target.searchParams.delete(RECIPIENT_SEARCH_PARAMS.page);
    }

    return resolvePath(`${target.pathname}${target.search}`);
  }
</script>

<svelte:head>
  <title>
    {data.mode === 'manage'
      ? formatText(text.linkPermission.title, { code: data.link.code })
      : text.linkPermission.acceptedTitle} · {data.siteName}
  </title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<div
  class="permission-page site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} locale={data.locale} />
    {/key}
  {/if}

  <main class="content-page">
    <header class="content-card content-page-header">
      <div>
        {#if data.mode === 'manage'}
          <a
            class="content-back-button"
            href={resolvePath(data.returnTo ?? '/')}>← {text.common.back}</a
          >
        {:else}
          <a class="content-back-button" href={homeHref}>← {text.common.home}</a
          >
        {/if}
        <h1 class="content-page-title">
          {formatText(text.linkPermission.title, { code: data.link.code })}
        </h1>
        <p class="content-page-subtitle">
          {data.mode === 'manage' ? data.link.url : data.link.shortUrl}
        </p>
      </div>
      <LocaleSelect locale={data.locale} compact />
    </header>

    {#if data.mode === 'manage'}
      <section class="link-panel">
        <div>
          <strong>{text.linkPermission.destination}</strong>
          <p>{data.link.url}</p>
        </div>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={data.link.shortUrl} target="_blank" rel="noreferrer">
          {text.redirect.openLink}
        </a>
      </section>

      <section class="share-panel">
        <div class="panel-head">
          <div>
            <p>{text.linkPermission.inviteKicker}</p>
            <h2>{text.linkPermission.inviteTitle}</h2>
          </div>
          {#if data.share}
            <span>
              {formatText(text.linkPermission.recipientCount, {
                count: data.share.recipientCount,
              })}
            </span>
          {/if}
        </div>

        {#if data.inviteUrl}
          <CopyValue
            value={data.inviteUrl}
            copied={copiedInvite}
            label={text.linkPermission.inviteLink}
            onclick={copyInvite}
            locale={data.locale}
          />
          <div class="invite-actions">
            {#if data.mailtoHref}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
              <a href={data.mailtoHref}>{text.linkPermission.emailShare}</a>
            {/if}
            <form method="POST" action="?/rotate" use:enhance={keepFormValues}>
              <input type="hidden" name="domain" value={data.link.domain} />
              <button type="submit">{text.linkPermission.rotateInvite}</button>
            </form>
          </div>
        {:else}
          <p class="empty-note">{text.linkPermission.noInvite}</p>
        {/if}

        <form
          class="settings-form"
          method="POST"
          action="?/save"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="domain" value={data.link.domain} />

          <label class="wide">
            <span>{text.linkPermission.expiresAt}</span>
            <input
              name="expiresAt"
              type="datetime-local"
              value={expiresAtInput(data.share?.expiresAt)}
            />
            <small>{text.linkPermission.noExpirationHint}</small>
          </label>

          <label class="check-row wide">
            <input
              name="canViewStats"
              type="checkbox"
              checked={data.share?.canViewStats ?? true}
              onchange={ensureSharePermission}
            />
            <span>{text.linkPermission.canViewStats}</span>
          </label>

          <fieldset class="wide">
            <legend>{text.linkPermission.editableFields}</legend>
            <label class="check-row editable-fields-toggle-row">
              <input
                type="checkbox"
                checked={selectedEditableFields().length ===
                  linkEditFieldKeys.length}
                data-editable-fields-toggle
                use:editableFieldsToggleState
                onchange={toggleEditableFields}
              />
              <span>{text.linkPermission.toggleEditableFields}</span>
            </label>
            <div class="field-grid">
              {#each editableFieldOptions as option (option.value)}
                <label class="check-row">
                  <input
                    name="editableFields"
                    type="checkbox"
                    value={option.value}
                    checked={selectedEditableFields().includes(option.value)}
                    onchange={ensureSharePermission}
                  />
                  <span>{option.label}</span>
                </label>
              {/each}
            </div>
            <small class="permission-hint">
              {text.messages.shareNeedsPermission}
            </small>
          </fieldset>

          <div class="form-actions wide">
            <button type="submit">
              {data.share?.inviteActive
                ? text.linkPermission.saveShare
                : text.linkPermission.createShare}
            </button>
          </div>
        </form>

        {#if data.share?.inviteActive}
          <form
            id="share-cancel-form"
            method="POST"
            action="?/cancel"
            use:enhance={keepFormValues}
          >
            <input type="hidden" name="domain" value={data.link.domain} />
          </form>
          <div class="danger-zone">
            <DangerConfirmButton
              formId="share-cancel-form"
              label={text.linkPermission.cancelShare}
              title={text.linkPermission.cancelShareTitle}
              message={text.linkPermission.cancelShareMessage}
              confirmLabel={text.linkPermission.cancelShareConfirm}
              locale={data.locale}
            />
          </div>
        {/if}
      </section>

      <section class="recipients-panel">
        <div class="panel-head">
          <div>
            <p>{text.linkPermission.recipientsKicker}</p>
            <h2>{text.linkPermission.recipientsTitle}</h2>
          </div>
        </div>
        {#if data.share && showRecipientSearch}
          <div class="recipient-tools">
            <SearchForm
              baseHref={recipientSearch.baseHref}
              field={recipientSearch.field}
              query={recipientSearch.query}
              options={recipientSearchOptions}
              fieldName={RECIPIENT_SEARCH_PARAMS.field}
              queryName={RECIPIENT_SEARCH_PARAMS.query}
              pageName={RECIPIENT_SEARCH_PARAMS.page}
              label={text.linkPermission.recipientSearchLabel}
              placeholder={text.linkPermission.recipientSearchPlaceholder}
              submitLabel={text.common.search}
              clearLabel={text.common.all}
              locale={data.locale}
            />
            <p class="recipient-result-count">
              {formatText(text.home.showingCount, {
                total: recipientSearch.totalItems,
                shown: data.share.recipients.length,
                pageSize: recipientSearch.pageSize,
              })}
            </p>
          </div>

          {#if data.share.recipients.length > 0}
            <form
              id={recipientBulkRevokeFormId}
              class="recipient-revoke-form"
              method="POST"
              action="?/bulkRevoke"
              use:enhance
            >
              <input type="hidden" name="domain" value={data.link.domain} />
            </form>
            <div class="recipient-bulk-actions">
              <ToggleField
                form={recipientBulkRevokeFormId}
                checked={allRecipientsSelected}
                disabled={selectableRecipientIds.length === 0}
                label={formatText(text.linkPermission.selectedRecipients, {
                  count: selectedRecipientCount,
                })}
                onchange={(event) =>
                  toggleAllRecipients(event.currentTarget.checked)}
              />
              <DangerConfirmButton
                formId={recipientBulkRevokeFormId}
                label={text.linkPermission.bulkRevokeRecipientAccess}
                title={text.linkPermission.bulkRevokeRecipientTitle}
                message={formatText(
                  text.linkPermission.bulkRevokeRecipientMessage,
                  {
                    count: selectedRecipientCount,
                  },
                )}
                confirmLabel={text.linkPermission.bulkRevokeRecipientConfirm}
                size="small"
                locale={data.locale}
                disabled={selectedRecipientCount === 0}
              />
            </div>
            <div class="recipient-list">
              {#each data.share.recipients as recipient (recipient.id)}
                <article class:inactive={!recipient.active}>
                  <div class="recipient-summary">
                    <ToggleField
                      form={recipientBulkRevokeFormId}
                      class="recipient-check"
                      name="grantIds"
                      value={recipient.id}
                      ariaLabel={formatText(
                        text.linkPermission.selectRecipient,
                        {
                          name: recipient.name,
                        },
                      )}
                      checked={selectedRecipientIds.includes(
                        String(recipient.id),
                      )}
                      onchange={(event) =>
                        toggleRecipient(
                          recipient.id,
                          event.currentTarget.checked,
                        )}
                    />
                    <div>
                      <strong>{recipient.name}</strong>
                      <span>{recipient.email ?? text.common.none}</span>
                    </div>
                    <div>
                      <em>
                        {recipient.active
                          ? text.linkPermission.recipientActive
                          : text.linkPermission.recipientExpired}
                      </em>
                      <time datetime={recipient.acceptedAt}>
                        {new Date(recipient.acceptedAt).toLocaleString()}
                      </time>
                    </div>
                  </div>

                  <form
                    class="recipient-form"
                    method="POST"
                    action="?/grant"
                    use:enhance={keepFormValues}
                  >
                    <input
                      type="hidden"
                      name="domain"
                      value={data.link.domain}
                    />
                    <input type="hidden" name="grantId" value={recipient.id} />

                    <label>
                      <span>{text.linkPermission.recipientExpiresAt}</span>
                      <input
                        name="expiresAt"
                        type="datetime-local"
                        value={recipient.active
                          ? expiresAtInput(recipient.access.expiresAt)
                          : ''}
                      />
                    </label>

                    <label class="check-row">
                      <input
                        name="canViewStats"
                        type="checkbox"
                        checked={recipient.access.canViewStats}
                        onchange={ensureSharePermission}
                      />
                      <span>{text.linkPermission.canViewStats}</span>
                    </label>

                    <details class="recipient-fields-details">
                      <summary>{text.linkPermission.editableFields}</summary>
                      <fieldset aria-label={text.linkPermission.editableFields}>
                        <label class="check-row editable-fields-toggle-row">
                          <input
                            type="checkbox"
                            checked={recipient.access.editableFields.length ===
                              linkEditFieldKeys.length}
                            data-editable-fields-toggle
                            use:editableFieldsToggleState
                            onchange={toggleEditableFields}
                          />
                          <span>{text.linkPermission.toggleEditableFields}</span
                          >
                        </label>
                        <div class="field-grid">
                          {#each editableFieldOptions as option (option.value)}
                            <label class="check-row">
                              <input
                                name="editableFields"
                                type="checkbox"
                                value={option.value}
                                checked={recipient.access.editableFields.includes(
                                  option.value,
                                )}
                                onchange={ensureSharePermission}
                              />
                              <span>{option.label}</span>
                            </label>
                          {/each}
                        </div>
                      </fieldset>
                    </details>

                    <div class="form-actions">
                      <button type="submit">
                        {text.linkPermission.saveRecipientAccess}
                      </button>
                    </div>
                  </form>

                  <form
                    id={recipientRevokeFormId(recipient.id)}
                    class="recipient-revoke-form"
                    method="POST"
                    action="?/revoke"
                    use:enhance={keepFormValues}
                  >
                    <input
                      type="hidden"
                      name="domain"
                      value={data.link.domain}
                    />
                    <input type="hidden" name="grantId" value={recipient.id} />
                  </form>
                  <div class="recipient-danger">
                    <DangerConfirmButton
                      formId={recipientRevokeFormId(recipient.id)}
                      label={text.linkPermission.revokeRecipientAccess}
                      title={text.linkPermission.revokeRecipientTitle}
                      message={text.linkPermission.revokeRecipientMessage}
                      confirmLabel={text.linkPermission.revokeRecipientConfirm}
                      size="small"
                      locale={data.locale}
                    />
                  </div>
                </article>
              {/each}
            </div>
            <Pagination
              page={recipientSearch.page}
              totalPages={recipientSearch.totalPages}
              getHref={recipientPageHref}
              label={text.linkPermission.recipientPageLabel}
              locale={data.locale}
            />
          {:else}
            <p class="empty-note">
              {hasRecipientSearch
                ? text.linkPermission.emptyRecipientSearch
                : text.linkPermission.emptyRecipients}
            </p>
          {/if}
        {:else}
          <p class="empty-note">{text.linkPermission.emptyRecipients}</p>
        {/if}
      </section>
    {:else if data.mode === 'accepted'}
      <section class="result-panel">
        <p>{text.linkPermission.acceptedKicker}</p>
        <h1>
          {data.acceptedAsOwner
            ? text.linkPermission.ownerAcceptedTitle
            : text.linkPermission.acceptedTitle}
        </h1>
        <span>{data.link.shortUrl}</span>
        <div class="result-actions">
          <a href={homeHref}>{text.linkPermission.openLinkList}</a>
          {#if data.access?.canViewStats && data.statsHref}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={data.statsHref}>{text.managedLinks.stats}</a>
          {/if}
        </div>
      </section>
    {:else}
      <section class="result-panel">
        <p>{text.linkPermission.acceptedKicker}</p>
        <h1>{text.linkPermission.inviteExpiredTitle}</h1>
        <span>{data.link.shortUrl}</span>
        <p>{text.linkPermission.inviteExpiredDescription}</p>
        <div class="result-actions">
          <a href={homeHref}>{text.common.home}</a>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  :global(button),
  :global(input) {
    font: inherit;
  }
  .permission-page {
    min-height: 100vh;
    background: var(--page-bg);
    color: var(--text);
    font-family: var(--font);
  }
  main {
    --pagination-border: var(--border);
    --pagination-surface: var(--surface);
    --pagination-muted: var(--muted);
    --pagination-text: var(--text);
    --pagination-primary: var(--primary);
    --pagination-radius: 10px;
    --search-border: var(--border);
    --search-input-bg: var(--page-bg);
    --search-muted: var(--muted);
    --search-primary: var(--primary);
    --search-primary-contrast: var(--primary-contrast);
    --search-radius: 12px;
    --search-surface: color-mix(in srgb, var(--page-bg) 62%, var(--surface));
    --search-text: var(--text);
  }
  .link-panel a,
  .invite-actions a,
  .result-actions a {
    color: var(--primary);
    text-decoration: none;
  }
  .link-panel a,
  .invite-actions a,
  .invite-actions button,
  .form-actions button,
  .result-actions a {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.4);
    padding: 0 14px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 850;
    cursor: pointer;
  }
  .panel-head p,
  .result-panel > p {
    margin: 0;
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  h1,
  h2,
  p {
    margin-top: 0;
  }
  h2 {
    margin-bottom: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }
  .result-panel > span {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .link-panel,
  .share-panel,
  .recipients-panel,
  .result-panel {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 22px 64px color-mix(in srgb, var(--text) 7%, transparent);
  }
  .link-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px;
  }
  .link-panel strong {
    display: block;
    margin-bottom: 6px;
    font-size: 0.78rem;
  }
  .link-panel p {
    max-width: 680px;
    margin-bottom: 0;
    color: var(--muted);
    font-size: 0.86rem;
    overflow-wrap: anywhere;
  }
  .share-panel,
  .recipients-panel,
  .result-panel {
    display: grid;
    gap: 18px;
    padding: 22px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .panel-head > span {
    color: var(--primary);
    font-size: 0.8rem;
    font-weight: 900;
    white-space: nowrap;
  }
  .invite-actions,
  .form-actions,
  .result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .invite-actions form {
    display: contents;
  }
  .form-actions,
  .danger-zone {
    justify-content: flex-end;
  }
  .form-actions button,
  .result-actions a:first-child {
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
    background: var(--primary);
    color: var(--primary-contrast);
  }
  .settings-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  label {
    display: grid;
    gap: 8px;
    color: var(--text);
    font-size: 0.84rem;
    font-weight: 800;
  }
  label > small {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
  input:not([type='checkbox']) {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.4);
    padding: 0 12px;
    background: var(--page-bg);
    color: var(--text);
    outline: none;
  }
  input[type='datetime-local'] {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    display: block;
    height: 46px;
    min-height: 46px;
    line-height: 1.2;
    padding-top: 0;
    padding-bottom: 0;
  }
  input[type='datetime-local']::-webkit-date-and-time-value {
    display: flex;
    min-height: 44px;
    align-items: center;
    padding: 0;
    line-height: 1.2;
    text-align: left;
  }
  input[type='datetime-local']::-webkit-datetime-edit {
    display: flex;
    min-height: 44px;
    align-items: center;
    padding: 0;
  }
  input[type='datetime-local']::-webkit-datetime-edit-fields-wrapper {
    display: flex;
    align-items: center;
  }
  input[type='datetime-local']::-webkit-calendar-picker-indicator {
    margin-inline-start: auto;
  }
  fieldset {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.5);
    margin: 0;
    padding: 14px;
  }
  legend {
    padding: 0 6px;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 850;
  }
  .permission-hint {
    display: block;
    margin-top: 12px;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
  .editable-fields-toggle-row {
    width: fit-content;
    margin: 4px 0 12px;
    color: var(--text);
    font-weight: 900;
  }
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .check-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .check-row input {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    accent-color: var(--primary);
  }
  .empty-note {
    border: 1px dashed var(--border);
    border-radius: calc(var(--radius) * 0.45);
    margin: 0;
    padding: 14px;
    color: var(--muted);
    font-size: 0.84rem;
  }
  .recipient-tools {
    display: grid;
    gap: 8px;
  }
  .recipient-tools :global(.search-form) {
    margin-bottom: 0;
  }
  .recipient-result-count {
    margin: 0;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 750;
  }
  .recipient-bulk-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    --toggle-border: var(--border);
    --toggle-surface: var(--surface);
    --toggle-primary: var(--primary);
    --toggle-label: var(--text);
    --toggle-font-size: 0.82rem;
    --toggle-min-height: 38px;
  }
  .recipient-list {
    display: grid;
    gap: 10px;
  }
  .recipient-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.45);
    padding: 12px;
    background: color-mix(in srgb, var(--surface) 88%, var(--primary));
  }
  .recipient-list article.inactive {
    background: color-mix(in srgb, var(--surface) 96%, var(--primary));
  }
  .recipient-summary {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    --toggle-border: var(--border);
    --toggle-surface: var(--surface);
    --toggle-primary: var(--primary);
  }
  .recipient-summary :global(.recipient-check) {
    margin-top: 2px;
  }
  .recipient-summary > div {
    display: grid;
    min-width: 0;
    gap: 4px;
  }
  .recipient-summary > div:last-child {
    justify-items: end;
  }
  .recipient-summary strong,
  .recipient-summary span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recipient-summary em {
    color: var(--primary);
    font-size: 0.76rem;
    font-style: normal;
    font-weight: 900;
  }
  .recipient-summary span,
  .recipient-summary time,
  .result-panel p:not(:first-child) {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .recipient-form {
    display: contents;
  }
  .recipient-form > label,
  .recipient-form > .recipient-fields-details {
    grid-column: 1 / -1;
  }
  .recipient-form fieldset {
    padding: 12px;
  }
  .recipient-fields-details {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.45);
    background: color-mix(in srgb, var(--surface) 86%, var(--page-bg));
    overflow: hidden;
  }
  .recipient-fields-details summary {
    display: flex;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 12px;
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 900;
    cursor: pointer;
    list-style: none;
  }
  .recipient-fields-details summary::-webkit-details-marker {
    display: none;
  }
  .recipient-fields-details summary::after {
    width: 7px;
    height: 7px;
    flex: none;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg) translateY(-2px);
    transition: transform 0.15s;
    content: '';
  }
  .recipient-fields-details[open] summary {
    border-bottom: 1px solid var(--border);
  }
  .recipient-fields-details[open] summary::after {
    transform: rotate(225deg) translate(-2px, -1px);
  }
  .recipient-fields-details fieldset {
    border: 0;
    border-radius: 0;
  }
  .recipient-form .field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .recipient-form .form-actions {
    grid-column: 1;
    justify-content: stretch;
  }
  .recipient-form .form-actions button,
  .recipient-danger :global(.danger-confirm-trigger) {
    width: 100%;
    min-height: 42px;
  }
  .recipient-revoke-form {
    display: none;
  }
  .recipient-danger {
    display: grid;
    grid-column: 2;
    align-items: stretch;
  }
  .result-panel {
    max-width: 680px;
    margin: 70px auto 0;
  }
  .result-panel h1 {
    font-size: clamp(2.2rem, 6vw, 4rem);
  }
  @media (max-width: 720px) {
    .link-panel,
    .panel-head {
      align-items: stretch;
      flex-direction: column;
    }
    .settings-form,
    .field-grid,
    .recipient-list article,
    .recipient-summary,
    .recipient-form .field-grid {
      grid-template-columns: 1fr;
    }
    .recipient-bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .recipient-summary > div:last-child {
      justify-items: start;
    }
    .wide {
      grid-column: auto;
    }
    .form-actions,
    .danger-zone,
    .recipient-danger,
    .invite-actions,
    .result-actions {
      display: grid;
    }
    .form-actions button,
    .recipient-danger :global(.danger-confirm-trigger),
    .invite-actions a,
    .invite-actions button,
    .result-actions a,
    .link-panel a {
      width: 100%;
    }
  }
</style>
