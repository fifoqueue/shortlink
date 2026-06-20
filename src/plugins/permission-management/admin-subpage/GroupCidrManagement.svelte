<script lang="ts">
  import { enhance } from '$app/forms';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { keepFormValues } from '$lib/forms';
  import type { SiteLocale } from '$lib/config';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import type { CidrSearch, UserSearch } from './types';

  let {
    cidrs,
    members,
    addableUsers,
    locale,
    t,
    formatText,
    expiresAtLabel,
    submitGroupSearch,
    groupPageHref,
  }: {
    cidrs: CidrSearch | undefined;
    members: UserSearch | undefined;
    addableUsers: UserSearch | undefined;
    locale: SiteLocale;
    t: (key: PluginLocaleKey) => string;
    formatText: (
      key: PluginLocaleKey,
      values: Record<string, string | number>,
    ) => string;
    expiresAtLabel: (expiresAt?: string | null) => string;
    submitGroupSearch: (event: SubmitEvent) => void;
    groupPageHref: (page: number, pageName: string) => string;
  } = $props();

  const selectableCidrKeys = $derived(
    (cidrs?.cidrs ?? []).map((rule) => rule.cidr),
  );
  let selectedCidrKeys = $state<string[]>([]);
  const selectedCidrCount = $derived(
    selectedAllowedCount(selectedCidrKeys, selectableCidrKeys),
  );
  const allCidrsSelected = $derived(
    allAllowedSelected(selectedCidrKeys, selectableCidrKeys),
  );

  $effect(() => {
    const next = reconcileSelection(selectedCidrKeys, selectableCidrKeys);
    if (next.length !== selectedCidrKeys.length) selectedCidrKeys = next;
  });

  function toggleCidr(cidr: string, checked: boolean) {
    selectedCidrKeys = toggleSelection(selectedCidrKeys, cidr, checked);
  }

  function toggleAllCidrs(checked: boolean) {
    selectedCidrKeys = selectAll(selectableCidrKeys, checked);
  }
</script>

<section class="member-management">
  <h2>{t('admin.cidrManagement')}</h2>
  <form
    class="search-users cidr-search"
    method="GET"
    onsubmit={submitGroupSearch}
  >
    {#if members?.query}
      <input type="hidden" name="memberQ" value={members.query} />
    {/if}
    {#if addableUsers?.query}
      <input type="hidden" name="addUserQ" value={addableUsers.query} />
    {/if}
    <input
      name="cidrQ"
      placeholder={t('admin.searchCidr')}
      value={cidrs?.query ?? ''}
    />
    <button type="submit">{t('admin.searchCidr')}</button>
  </form>
  <form
    class="add-cidr-form"
    method="POST"
    action="?/pluginAction"
    use:enhance={keepFormValues}
  >
    <input type="hidden" name="pluginAction" value="addGroupCidr" />
    <label>
      CIDR
      <input name="cidr" placeholder="203.0.113.0/24" required />
    </label>
    <label class="expires-field">
      {t('admin.expirationDateTime')}
      <input name="expiresAt" type="datetime-local" step="60" />
    </label>
    <button type="submit">{t('admin.addCidr')}</button>
  </form>
  {#if cidrs?.cidrs?.length}
    <form
      id="group-cidr-bulk-remove-form"
      class="hidden-form"
      method="POST"
      action="?/pluginAction"
      use:enhance
    >
      <input type="hidden" name="pluginAction" value="removeGroupCidrs" />
    </form>
  {/if}
  <div class="list-heading">
    <h3>{t('admin.registeredCidrs')} <em>{cidrs?.total ?? 0}</em></h3>
    {#if cidrs?.cidrs?.length}
      <div class="bulk-actions">
        <ToggleField
          form="group-cidr-bulk-remove-form"
          checked={allCidrsSelected}
          disabled={selectableCidrKeys.length === 0}
          label={formatText('admin.selectedCount', {
            count: selectedCidrCount,
          })}
          onchange={(event) => toggleAllCidrs(event.currentTarget.checked)}
        />
        <DangerConfirmButton
          formId="group-cidr-bulk-remove-form"
          label={t('admin.deleteSelected')}
          {locale}
          title={t('admin.deleteSelectedCidrsTitle')}
          message={formatText('admin.deleteSelectedCidrsMessage', {
            count: selectedCidrCount,
          })}
          confirmLabel={t('admin.deleteSelectedCidrsConfirm')}
          disabled={selectedCidrCount === 0}
        />
      </div>
    {/if}
  </div>
  <div class="cidr-list list-grid">
    {#each cidrs?.cidrs ?? [] as rule (rule.cidr)}
      <article class="cidr-row">
        <ToggleField
          form="group-cidr-bulk-remove-form"
          name="cidrs"
          value={rule.cidr}
          ariaLabel={formatText('admin.selectCidr', { cidr: rule.cidr })}
          checked={selectedCidrKeys.includes(rule.cidr)}
          onchange={(event) =>
            toggleCidr(rule.cidr, event.currentTarget.checked)}
        />
        <span>
          <strong>{rule.cidr}</strong>
          <em>{expiresAtLabel(rule.expiresAt)}</em>
        </span>
        <form
          class="inline-form"
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginAction" value="removeGroupCidr" />
          <input type="hidden" name="cidr" value={rule.cidr} />
          <button type="submit">{t('admin.remove')}</button>
        </form>
      </article>
    {/each}
    {#if !cidrs?.cidrs?.length}
      <p class="empty">
        {cidrs?.query
          ? t('admin.emptyCidrSearch')
          : t('admin.emptyRegisteredCidrs')}
      </p>
    {/if}
  </div>
  <Pagination
    page={cidrs?.page ?? 1}
    totalPages={cidrs?.totalPages ?? 1}
    getHref={(page) => groupPageHref(page, 'cidrPage')}
    label={t('admin.cidrManagementPage')}
    {locale}
  />
</section>
