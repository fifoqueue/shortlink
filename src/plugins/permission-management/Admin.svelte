<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { defaultSiteLocale } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { pluginText } from '$lib/i18n/plugin';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import { formatText } from '$lib/i18n/ui-text';
  import { SvelteURLSearchParams } from 'svelte/reactivity';

  type User = {
    id: number;
    item: string;
    email: string;
    name: string;
    isAdmin: boolean;
    enabled: boolean;
  };

  type Group = {
    id: number;
    item: string;
    name: string;
    description: string;
    priority: number;
    enabled: boolean;
    userCount: number;
    cidrCount: number;
  };

  type UserSearch = {
    query: string;
    page: number;
    total: number;
    totalPages: number;
    users: User[];
  };

  type AdminData = {
    passwordMinLength: number;
    passwordPolicy: string;
    userSearch: UserSearch;
    groups: Group[];
  };

  let {
    adminData,
    locale = defaultSiteLocale,
    strings = {},
  }: PluginComponentProps = $props();

  const data = $derived((adminData ?? {}) as Partial<AdminData>);
  const selectableGroupIds = $derived(
    (data.groups ?? []).map((group) => String(group.id)),
  );
  let selectedGroupIds = $state<string[]>([]);

  const selectedGroupCount = $derived(
    selectedAllowedCount(selectedGroupIds, selectableGroupIds),
  );
  const allGroupsSelected = $derived(
    allAllowedSelected(selectedGroupIds, selectableGroupIds),
  );

  $effect(() => {
    const next = reconcileSelection(selectedGroupIds, selectableGroupIds);
    if (next.length !== selectedGroupIds.length) selectedGroupIds = next;
  });

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }

  function tf(
    key: PluginLocaleKey,
    values: Record<string, string | number | null | undefined>,
  ) {
    return formatText(t(key), values);
  }

  function userPageHref(page: number) {
    const params = new SvelteURLSearchParams();
    const query = data.userSearch?.query ?? '';
    if (query) params.set('userQ', query);
    if (page > 1) params.set('userPage', String(page));
    const search = params.toString();
    return resolve(
      `/admin/plugins/permission-management${search ? `?${search}` : ''}`,
    );
  }

  function toggleGroup(id: number, checked: boolean) {
    selectedGroupIds = toggleSelection(selectedGroupIds, String(id), checked);
  }

  function toggleAllGroups(checked: boolean) {
    selectedGroupIds = selectAll(selectableGroupIds, checked);
  }
</script>

<div class="stack">
  <section>
    <div class="section-heading">
      <div>
        <h2>{t('admin.permissionGroups')}</h2>
        <p>{t('admin.permissionGroupsDescription')}</p>
      </div>
    </div>
    <form
      class="create-group"
      method="POST"
      action="?/pluginAction"
      use:enhance={keepFormValues}
    >
      <input type="hidden" name="pluginAction" value="createGroup" />
      <input name="name" placeholder={t('admin.groupName')} required />
      <input name="description" placeholder={t('admin.description')} />
      <input name="priority" type="number" min="0" max="10000" value="100" />
      <input type="hidden" name="enabled" value="on" />
      <button type="submit">{t('admin.addGroup')}</button>
    </form>
    {#if data.groups?.length}
      <form
        id="permission-group-delete-form"
        method="POST"
        action="?/pluginAction"
        use:enhance
      >
        <input type="hidden" name="pluginAction" value="deleteGroups" />
      </form>
      <div class="bulk-actions">
        <ToggleField
          form="permission-group-delete-form"
          checked={allGroupsSelected}
          disabled={selectableGroupIds.length === 0}
          label={tf('admin.selectedCount', { count: selectedGroupCount })}
          onchange={(event) => toggleAllGroups(event.currentTarget.checked)}
        />
        <DangerConfirmButton
          formId="permission-group-delete-form"
          label={t('admin.deleteSelected')}
          {locale}
          title={t('admin.deleteSelectedGroupsTitle')}
          message={tf('admin.deleteSelectedGroupsMessage', {
            count: selectedGroupCount,
          })}
          confirmLabel={t('admin.deleteSelectedGroupsConfirm')}
          disabled={selectedGroupCount === 0}
        />
      </div>
      <div class="items group-items">
        {#each data.groups as group (group.id)}
          <article class="item-row group-row">
            <ToggleField
              form="permission-group-delete-form"
              class="row-check"
              name="groupIds"
              value={group.id}
              ariaLabel={tf('admin.selectGroup', { name: group.name })}
              checked={selectedGroupIds.includes(String(group.id))}
              onchange={(event) =>
                toggleGroup(group.id, event.currentTarget.checked)}
            />
            <a
              class="item-main"
              href={resolve(
                `/admin/plugins/permission-management/${group.item}`,
              )}
            >
              <span>
                <strong>{group.name}</strong>
                {group.description || t('admin.noDescription')}
                {!group.enabled ? t('admin.disabledSuffix') : ''}
              </span>
            </a>
            <em>{tf('admin.priorityValue', { value: group.priority })}</em>
            <em
              >{tf('admin.groupAssignmentCounts', {
                users: group.userCount,
                cidrs: group.cidrCount,
              })}</em
            >
            <a
              class="row-action"
              href={resolve(
                `/admin/plugins/permission-management/${group.item}`,
              )}>{t('admin.edit')}</a
            >
          </article>
        {/each}
      </div>
    {:else}
      <div class="items">
        <p class="empty">{t('admin.emptyGroups')}</p>
      </div>
    {/if}
  </section>

  <section>
    <div class="section-heading">
      <div>
        <h2>{t('admin.localUsers')}</h2>
        <p>{t('admin.localUsersDescription')}</p>
      </div>
    </div>
    <form class="search-users" method="GET">
      <input
        name="userQ"
        placeholder={t('admin.userSearchPlaceholder')}
        value={data.userSearch?.query ?? ''}
      />
      <button type="submit">{t('admin.search')}</button>
      {#if data.userSearch?.query}
        <a href={resolve('/admin/plugins/permission-management')}>{t('admin.reset')}</a>
      {/if}
    </form>
    <form
      class="create-user"
      method="POST"
      action="?/pluginAction"
      use:enhance={keepFormValues}
    >
      <input type="hidden" name="pluginAction" value="createUser" />
      <input
        name="email"
        type="email"
        placeholder={t('admin.emailPlaceholder')}
        required
      />
      <input name="name" placeholder={t('admin.name')} required />
      <input
        name="password"
        type="password"
        minlength={data.passwordMinLength ?? 10}
        placeholder={data.passwordPolicy ?? t('admin.passwordPolicyFallback')}
        required
      />
      <ToggleField name="isAdmin" label={t('admin.administrator')} />
      <button type="submit">{t('admin.addUser')}</button>
    </form>
    <div class="items">
      {#each data.userSearch?.users ?? [] as user (user.id)}
        <a href={resolve(`/admin/plugins/permission-management/${user.item}`)}>
          <span>
            <strong>{user.name}</strong>
            {user.email}
            {user.isAdmin ? t('admin.adminSuffix') : ''}
            {!user.enabled ? t('admin.disabledSuffix') : ''}
          </span>
          <strong class="edit">{t('admin.edit')}</strong>
        </a>
      {/each}
      {#if !data.userSearch?.users?.length}
        <p class="empty">{t('admin.emptyUsers')}</p>
      {/if}
    </div>
    <Pagination
      page={data.userSearch?.page ?? 1}
      totalPages={data.userSearch?.totalPages ?? 1}
      getHref={userPageHref}
      label={t('admin.userPage')}
      {locale}
    />
  </section>
</div>

<style>
  .stack,
  section {
    display: grid;
    gap: 18px;
  }
  section + section {
    border-top: 1px solid var(--admin-border);
    padding-top: 24px;
  }
  h2,
  p {
    margin: 0;
  }
  .section-heading p,
  .empty {
    margin-top: 6px;
    color: var(--admin-muted);
    font-size: 0.84rem;
    line-height: 1.6;
  }
  form {
    display: grid;
    gap: 14px;
  }
  input:not([type='checkbox']) {
    min-height: var(--form-control-height);
  }
  input {
    width: 100%;
    border: 1px solid var(--admin-border);
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font: inherit;
  }
  button {
    width: fit-content;
    border: 0;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }
  .create-user {
    grid-template-columns: 1.3fr 1fr 1fr auto auto;
    align-items: end;
  }
  .create-group {
    grid-template-columns: 1fr 1.4fr 120px auto;
    align-items: end;
  }
  .search-users {
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
  }
  .search-users a {
    color: var(--admin-primary);
    font-size: 0.84rem;
    font-weight: 850;
    text-decoration: none;
  }
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bulk-actions,
  .item-row {
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
    --toggle-label: var(--admin-text);
    --toggle-font-size: 0.82rem;
    --toggle-min-height: 38px;
  }
  .items {
    margin-top: 2px;
  }
  .items > a,
  .item-row {
    display: grid;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--admin-border);
    padding: 12px 0;
    color: inherit;
    text-decoration: none;
  }
  .items > a {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .group-row {
    grid-template-columns: 18px minmax(0, 1fr) auto auto auto;
  }
  .item-main {
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .item-main:hover strong {
    text-decoration: underline;
  }
  .items > a > span,
  .item-main > span {
    min-width: 0;
  }
  .items strong,
  .items span {
    display: block;
  }
  .items em {
    color: var(--admin-muted);
    font-size: 0.82rem;
    font-style: normal;
    font-weight: 750;
  }
  .row-action {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--admin-border);
    border-radius: 8px;
    padding: 7px 10px;
    background: transparent;
    color: var(--admin-muted);
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
  }
  .row-action:hover {
    border-color: var(--admin-primary);
    color: var(--admin-primary);
  }
  section {
    --toggle-min-height: 42px;
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
  }
  @media (max-width: 900px) {
    .create-user,
    .create-group,
    .search-users,
    .items > a,
    .group-row {
      grid-template-columns: 1fr;
    }
    .bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
