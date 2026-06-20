<script lang="ts">
  import { localizedAdminSections } from '$lib/admin-sections';
  import { defaultSiteLocale } from '$lib/config';
  import { translateContent } from '$lib/i18n/translate-content';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import './admin-subpage.css';
  import GroupSubpage from './GroupSubpage.svelte';
  import { formatPermissionText, permissionText } from './helpers';
  import type { AdminData } from './types';
  import UserSubpage from './UserSubpage.svelte';

  let {
    adminData,
    integrations,
    item,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
    strings = {},
  }: PluginComponentProps = $props();

  const data = $derived((adminData ?? null) as AdminData | null);
  const user = $derived(data?.kind === 'user' ? data.user : undefined);
  const userSettings = $derived(data?.kind === 'user' ? data : undefined);
  const group = $derived(data?.kind === 'group' ? data.group : undefined);
  const authProviders = $derived(
    data?.kind === 'group' ? (data.authProviders ?? []) : [],
  );
  const cidrs = $derived(data?.kind === 'group' ? data.cidrs : undefined);
  const members = $derived(data?.kind === 'group' ? data.members : undefined);
  const addableUsers = $derived(
    data?.kind === 'group' ? data.addableUsers : undefined,
  );
  const adminSections = $derived(localizedAdminSections(locale));

  function t(key: PluginLocaleKey) {
    return permissionText(strings, key);
  }

  function formatText(
    key: PluginLocaleKey,
    values: Record<string, string | number>,
  ) {
    return formatPermissionText(strings, key, values);
  }

  function expiresAtLabel(expiresAt?: string | null) {
    if (!expiresAt) return t('admin.noExpiration');
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return t('admin.expirationDateError');
    const label = date.toLocaleString();
    return formatText(
      date.getTime() <= Date.now() ? 'admin.expiredAt' : 'admin.expiresAt',
      { value: label },
    );
  }

  function dateTimeLabel(value: string | null) {
    if (!value) return t('admin.neverUsed');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
  }
</script>

<div class="plugin-i18n-root permission-subpage" use:translateContent={strings}>
  {#if user}
    <UserSubpage
      {user}
      {userSettings}
      {integrations}
      {locale}
      {fallbackLocale}
      {t}
      {dateTimeLabel}
    />
  {:else if group}
    <GroupSubpage
      {group}
      {authProviders}
      {cidrs}
      {members}
      {addableUsers}
      {item}
      {locale}
      {t}
      {formatText}
      {expiresAtLabel}
      {adminSections}
    />
  {:else}
    <p>{t('admin.itemNotFound')}</p>
  {/if}
</div>
