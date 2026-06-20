<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import { keepFormValues } from '$lib/forms';
  import type { SiteLocale } from '$lib/config';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import GroupCidrManagement from './GroupCidrManagement.svelte';
  import GroupMemberManagement from './GroupMemberManagement.svelte';
  import GroupSettingsForm from './GroupSettingsForm.svelte';
  import type {
    AuthProviderOption,
    CidrSearch,
    Group,
    UserSearch,
  } from './types';

  let {
    group,
    authProviders,
    cidrs,
    members,
    addableUsers,
    item,
    locale,
    t,
    formatText,
    expiresAtLabel,
    adminSections,
  }: {
    group: Group;
    authProviders: AuthProviderOption[];
    cidrs: CidrSearch | undefined;
    members: UserSearch | undefined;
    addableUsers: UserSearch | undefined;
    item: string | undefined;
    locale: SiteLocale;
    t: (key: PluginLocaleKey) => string;
    formatText: (
      key: PluginLocaleKey,
      values: Record<string, string | number>,
    ) => string;
    expiresAtLabel: (expiresAt?: string | null) => string;
    adminSections: Array<{ id: string; label: string }>;
  } = $props();

  function groupRoute() {
    return item
      ? resolve('/admin/plugins/[plugin]/[item]', {
          plugin: 'permission-management',
          item,
        })
      : resolve('/admin/plugins/[plugin]', {
          plugin: 'permission-management',
        });
  }

  function searchParamsFromForm(form: HTMLFormElement) {
    const params = new SvelteURLSearchParams();
    for (const [key, value] of new FormData(form)) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }
    return params;
  }

  function submitGroupSearch(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const params = searchParamsFromForm(form);
    const search = params.toString();
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(`${groupRoute()}${search ? `?${search}` : ''}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  function groupPageHref(page: number, pageName: string) {
    const params = new SvelteURLSearchParams();
    if (cidrs?.query) params.set('cidrQ', cidrs.query);
    if (cidrs?.page && cidrs.page > 1) {
      params.set('cidrPage', String(cidrs.page));
    }
    if (members?.query) params.set('memberQ', members.query);
    if (members?.page && members.page > 1) {
      params.set('memberPage', String(members.page));
    }
    if (addableUsers?.query) {
      params.set('addUserQ', addableUsers.query);
    }
    if (addableUsers?.page && addableUsers.page > 1) {
      params.set('addUserPage', String(addableUsers.page));
    }
    if (page > 1) params.set(pageName, String(page));
    else params.delete(pageName);
    const search = params.toString();
    return `${groupRoute()}${search ? `?${search}` : ''}`;
  }
</script>

<GroupSettingsForm {group} {authProviders} {adminSections} {t} />

<GroupCidrManagement
  {cidrs}
  {members}
  {addableUsers}
  {locale}
  {t}
  {formatText}
  {expiresAtLabel}
  {submitGroupSearch}
  {groupPageHref}
/>

<GroupMemberManagement
  {cidrs}
  {members}
  {addableUsers}
  {locale}
  {t}
  {formatText}
  {expiresAtLabel}
  {submitGroupSearch}
  {groupPageHref}
/>

<section class="danger">
  <h2>{t('admin.dangerZone')}</h2>
  <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
    <input type="hidden" name="pluginAction" value="deleteGroup" />
    <DangerConfirmButton
      label={t('admin.deleteGroup')}
      {locale}
      title={t('admin.deleteGroupTitle')}
      message={t('admin.deleteGroupMessage')}
      details={[group.name]}
      confirmLabel={t('admin.deleteGroup')}
    />
  </form>
</section>
