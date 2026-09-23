<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
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
  import AddUserModal from './AddUserModal.svelte';
  import type { CidrSearch, GroupUser, UserSearch } from './types';

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

  const selectableMemberIds = $derived(
    (members?.users ?? []).map((member) => String(member.id)),
  );
  let selectedMemberIds = $state<string[]>([]);
  let addUserTarget = $state<GroupUser | null>(null);
  let addUserTrigger: HTMLElement | null = null;
  const selectedMemberCount = $derived(
    selectedAllowedCount(selectedMemberIds, selectableMemberIds),
  );
  const allMembersSelected = $derived(
    allAllowedSelected(selectedMemberIds, selectableMemberIds),
  );

  $effect(() => {
    const next = reconcileSelection(selectedMemberIds, selectableMemberIds);
    if (next.length !== selectedMemberIds.length) selectedMemberIds = next;
  });

  function toggleMember(id: number, checked: boolean) {
    selectedMemberIds = toggleSelection(selectedMemberIds, String(id), checked);
  }

  function toggleAllMembers(checked: boolean) {
    selectedMemberIds = selectAll(selectableMemberIds, checked);
  }

  function openAddUserModal(user: GroupUser, trigger: HTMLElement) {
    addUserTrigger = trigger;
    addUserTarget = user;
  }

  function closeAddUserModal() {
    addUserTarget = null;
    void tick().then(() => addUserTrigger?.focus());
  }
</script>

<section class="member-management">
  <h2>{t('admin.groupUsers')}</h2>
  <div class="member-searches">
    <form class="search-users" method="GET" onsubmit={submitGroupSearch}>
      {#if cidrs?.query}
        <input type="hidden" name="cidrQ" value={cidrs.query} />
      {/if}
      {#if addableUsers?.query}
        <input type="hidden" name="addUserQ" value={addableUsers.query} />
      {/if}
      <Input
        name="memberQ"
        placeholder={t('admin.searchCurrentMembers')}
        value={members?.query ?? ''}
      />
      <Button type="submit">{t('admin.searchMembers')}</Button>
    </form>
    <form class="search-users" method="GET" onsubmit={submitGroupSearch}>
      {#if cidrs?.query}
        <input type="hidden" name="cidrQ" value={cidrs.query} />
      {/if}
      {#if members?.query}
        <input type="hidden" name="memberQ" value={members.query} />
      {/if}
      <Input
        name="addUserQ"
        placeholder={t('admin.searchUsersToAdd')}
        value={addableUsers?.query ?? ''}
      />
      <Button type="submit">{t('admin.searchUsers')}</Button>
    </form>
  </div>

  <div class="member-columns">
    <div>
      {#if members?.users?.length}
        <form
          id="group-member-bulk-remove-form"
          class="hidden-form"
          method="POST"
          action="?/pluginAction"
          use:enhance
        >
          <input type="hidden" name="pluginAction" value="removeGroupUsers" />
        </form>
      {/if}
      <div class="list-heading member-list-heading">
        <h3>{t('admin.currentMembers')} <em>{members?.total ?? 0}</em></h3>
        {#if members?.users?.length}
          <div class="bulk-actions">
            <ToggleField
              form="group-member-bulk-remove-form"
              checked={allMembersSelected}
              disabled={selectableMemberIds.length === 0}
              label={formatText('admin.selectedUsersCount', {
                count: selectedMemberCount,
              })}
              onchange={(event) =>
                toggleAllMembers(event.currentTarget.checked)}
            />
            <DangerConfirmButton
              formId="group-member-bulk-remove-form"
              label={t('admin.deleteSelected')}
              {locale}
              title={t('admin.deleteSelectedUsersTitle')}
              message={formatText('admin.deleteSelectedUsersMessage', {
                count: selectedMemberCount,
              })}
              confirmLabel={t('admin.deleteSelectedUsersConfirm')}
              disabled={selectedMemberCount === 0}
            />
          </div>
        {/if}
      </div>
      <div class="user-list">
        {#each members?.users ?? [] as member (member.id)}
          <article class="user-row member-row">
            <ToggleField
              form="group-member-bulk-remove-form"
              name="userIds"
              value={member.id}
              ariaLabel={formatText('admin.selectUser', { name: member.name })}
              checked={selectedMemberIds.includes(String(member.id))}
              onchange={(event) =>
                toggleMember(member.id, event.currentTarget.checked)}
            />
            <a
              href={resolve(
                `/admin/plugins/permission-management/${member.item}`,
              )}
            >
              <strong>{member.name}</strong>
              <span
                >{member.email}{member.isAdmin
                  ? t('admin.adminSuffix')
                  : ''}</span
              >
              <em class="assignment-meta">
                {expiresAtLabel(member.expiresAt)}
              </em>
              <em class="assignment-meta">
                {member.assignmentSource === 'automatic'
                  ? t('admin.automaticAssignmentBadge')
                  : t('admin.manualAssignmentBadge')}
              </em>
              {#if member.reason}
                <em class="assignment-meta">
                  {t('admin.assignmentReason')}: {member.reason}
                </em>
                <em class="assignment-meta">
                  {member.reasonPublic
                    ? t('admin.assignmentReasonPublic')
                    : t('admin.assignmentReasonPrivate')}
                </em>
              {/if}
            </a>
            <form
              class="inline-form"
              method="POST"
              action="?/pluginAction"
              use:enhance={keepFormValues}
            >
              <input
                type="hidden"
                name="pluginAction"
                value="removeGroupUser"
              />
              <input type="hidden" name="userId" value={member.id} />
              <Button type="submit">{t('admin.remove')}</Button>
            </form>
          </article>
        {/each}
        {#if !members?.users?.length}
          <p class="empty">{t('admin.emptyGroupMembers')}</p>
        {/if}
      </div>
      <Pagination
        page={members?.page ?? 1}
        totalPages={members?.totalPages ?? 1}
        getHref={(page) => groupPageHref(page, 'memberPage')}
        label={t('admin.groupMemberPage')}
        {locale}
      />
    </div>

    <div>
      <h3>{t('admin.addUser')}</h3>
      <div class="user-list">
        {#if addableUsers?.query}
          {#each addableUsers.users as candidate (candidate.id)}
            <article class="user-row add-user-row">
              <a
                href={resolve(
                  `/admin/plugins/permission-management/${candidate.item}`,
                )}
              >
                <strong>{candidate.name}</strong>
                <span
                  >{candidate.email}{candidate.isAdmin
                    ? t('admin.adminSuffix')
                    : ''}</span
                >
              </a>
              <Button
                variant="outline"
                type="button"
                onclick={(event) =>
                  openAddUserModal(candidate, event.currentTarget)}
                >{t('admin.add')}</Button
              >
            </article>
          {/each}
          {#if !addableUsers.users.length}
            <p class="empty">{t('admin.emptyAddableUsers')}</p>
          {/if}
        {:else}
          <p class="empty">{t('admin.searchUsersByNameEmailId')}</p>
        {/if}
      </div>
      <Pagination
        page={addableUsers?.page ?? 1}
        totalPages={addableUsers?.totalPages ?? 1}
        getHref={(page) => groupPageHref(page, 'addUserPage')}
        label={t('admin.addableUsersPage')}
        {locale}
      />
    </div>
  </div>
</section>

{#if addUserTarget}
  <AddUserModal
    user={addUserTarget}
    {t}
    {formatText}
    onClose={closeAddUserModal}
  />
{/if}
