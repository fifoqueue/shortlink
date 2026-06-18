<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { pluginLocaleStrings, pluginText } from '$lib/i18n/plugin';
  import { translateContent } from '$lib/i18n/translate-content';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import {
    defaultSiteLocale,
    isRedirectRuleConditionKey,
    linkedLinkEditFieldPairs,
    linkedLinkOptionKeyPairs,
    redirectRuleConditionKeys,
    type LinkEditFieldKey,
    type LinkOptionKey,
  } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { userAdminPluginRegistry } from '../user-admin-registry';

  type User = {
    id: number;
    email: string;
    name: string;
    isAdmin: boolean;
    enabled: boolean;
    createdAt: string;
  };

  type GroupUser = {
    id: number;
    item: string;
    email: string;
    name: string;
    isAdmin: boolean;
    enabled: boolean;
    expiresAt?: string | null;
    reason?: string;
    reasonPublic?: boolean;
    assignmentSource?: 'manual' | 'automatic';
  };

  type CidrRule = {
    cidr: string;
    expiresAt: string | null;
  };

  type AuthProviderOption = {
    id: string;
    pluginId: string;
    methodId: string;
    label: string;
    type: 'password' | 'redirect';
  };

  type RuleValue = boolean | null;
  type Group = {
    id: number;
    name: string;
    description: string;
    priority: number;
    enabled: boolean;
    autoAssign: {
      enabled: boolean;
      conditions: Array<{
        type: string;
        config: Record<string, unknown>;
      }>;
      revokeWhenUnmatched: boolean;
    };
    userIds: number[];
    ipRules: string[];
    userMemberships: Array<{
      userId: number;
      expiresAt: string | null;
      reason: string;
      reasonPublic: boolean;
    }>;
    cidrRules: CidrRule[];
    rules: {
      links: {
        create: RuleValue;
        options: Record<string, RuleValue>;
        codeMinLength: number | null;
        codeMaxLength: number | null;
        generatedCodeLength: number | null;
        domains: string[] | null;
        deleteOwn: RuleValue;
        deleteMaxClicks: number | null;
        editOwn: RuleValue;
        viewAll: RuleValue;
        editAll: RuleValue;
        deleteAll: RuleValue;
        statsAll: RuleValue;
        statsCsv: RuleValue;
        share: RuleValue;
        healthAll: RuleValue;
        expiresAtBypass: RuleValue;
        passwordBypass: RuleValue;
        editableFields: Record<string, RuleValue>;
      };
      admin: {
        access: RuleValue;
        sections: string[];
        manageSections: string[];
        plugins: string[];
        manageUsers: RuleValue;
        managePermissions: RuleValue;
      };
      auth: {
        providers: string[] | null;
        resendVerificationDailyLimit: number | null;
        passwordResetDailyLimit: number | null;
      };
      api: Record<string, RuleValue>;
    };
  };

  type UserSearch = {
    query: string;
    page: number;
    total: number;
    totalPages: number;
    users: GroupUser[];
  };

  type CidrSearch = {
    query: string;
    page: number;
    total: number;
    totalPages: number;
    cidrs: CidrRule[];
  };

  type ApiToken = {
    id: number;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  };

  type AdminData =
    | {
        kind: 'user';
        passwordMinLength: number;
        passwordPolicy: string;
        user: User;
        apiTokens: ApiToken[];
      }
    | {
        kind: 'group';
        group: Group;
        authProviders: AuthProviderOption[];
        cidrs: CidrSearch;
        members: UserSearch;
        addableUsers: UserSearch;
      };

  type Tab = 'links' | 'admin' | 'auth' | 'api';
  type AutoAssignTab = 'email' | 'account';
  type LinkPermissionKey =
    | 'create'
    | 'deleteOwn'
    | 'editOwn'
    | 'viewAll'
    | 'editAll'
    | 'deleteAll'
    | 'statsAll'
    | 'statsCsv'
    | 'share'
    | 'healthAll'
    | 'expiresAtBypass'
    | 'passwordBypass';

  let {
    adminData,
    integrations,
    item,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
    strings = {},
  }: PluginComponentProps = $props();
  const data = $derived((adminData ?? {}) as Partial<AdminData>);
  const user = $derived(data.kind === 'user' ? data.user : undefined);
  const userSettings = $derived(data.kind === 'user' ? data : undefined);
  const group = $derived(data.kind === 'group' ? data.group : undefined);
  const authProviders = $derived(
    data.kind === 'group' ? (data.authProviders ?? []) : [],
  );
  const cidrs = $derived(data.kind === 'group' ? data.cidrs : undefined);
  const members = $derived(data.kind === 'group' ? data.members : undefined);
  const addableUsers = $derived(
    data.kind === 'group' ? data.addableUsers : undefined,
  );
  const selectableCidrKeys = $derived(
    (cidrs?.cidrs ?? []).map((rule) => rule.cidr),
  );
  const selectableMemberIds = $derived(
    (members?.users ?? []).map((member) => String(member.id)),
  );

  let selectedCidrKeys = $state<string[]>([]);
  let selectedMemberIds = $state<string[]>([]);
  let addUserTarget = $state<GroupUser | null>(null);

  let activeTab = $state<Tab>('links');
  let autoAssignTab = $state<AutoAssignTab>('email');

  const selectedCidrCount = $derived(
    selectedAllowedCount(selectedCidrKeys, selectableCidrKeys),
  );
  const selectedMemberCount = $derived(
    selectedAllowedCount(selectedMemberIds, selectableMemberIds),
  );
  const allCidrsSelected = $derived(
    allAllowedSelected(selectedCidrKeys, selectableCidrKeys),
  );
  const allMembersSelected = $derived(
    allAllowedSelected(selectedMemberIds, selectableMemberIds),
  );

  $effect(() => {
    const next = reconcileSelection(selectedCidrKeys, selectableCidrKeys);
    if (next.length !== selectedCidrKeys.length) selectedCidrKeys = next;
  });

  $effect(() => {
    const next = reconcileSelection(selectedMemberIds, selectableMemberIds);
    if (next.length !== selectedMemberIds.length) selectedMemberIds = next;
  });

  const linkOptions = [
    ['customCode', 'admin.customCode'],
    ['previewTitle', 'admin.previewTitle'],
    ['previewDescription', 'admin.previewDescription'],
    ['previewImageUrl', 'admin.previewImageUrl'],
    ['themeColor', 'admin.themeColor'],
    ['utmSource', 'admin.utmSource'],
    ['utmMedium', 'admin.utmMedium'],
    ['utmCampaign', 'admin.utmCampaign'],
    ['utmTerm', 'admin.utmTerm'],
    ['utmContent', 'admin.utmContent'],
    ['expiresAt', 'admin.expirationDate'],
    ['maxClicks', 'admin.maxClicks'],
    ['password', 'admin.password'],
    ['tags', 'admin.tags'],
    ['redirectRules', 'admin.redirectRules'],
    ['redirectRuleDevice', 'admin.redirectRuleDevice'],
    ['redirectRuleLanguage', 'admin.redirectRuleLanguage'],
    ['redirectRuleQuery', 'admin.redirectRuleQuery'],
    ['redirectRuleIp', 'admin.redirectRuleIp'],
    ['redirectRuleGeo', 'admin.redirectRuleGeo'],
    ['redirectRulePercentage', 'admin.redirectRulePercentage'],
  ] as const satisfies readonly (readonly [LinkOptionKey, PluginLocaleKey])[];
  const linkPermissions = [
    ['create', 'admin.createLinks'],
    ['deleteOwn', 'admin.deleteOwnLinks'],
    ['editOwn', 'admin.editOwnLinks'],
    ['viewAll', 'admin.viewOtherLinks'],
    ['editAll', 'admin.editOtherLinks'],
    ['deleteAll', 'admin.deleteOtherLinks'],
    ['statsAll', 'admin.viewOtherStats'],
    ['statsCsv', 'admin.downloadStatsCsv'],
    ['share', 'admin.shareLinks'],
    ['healthAll', 'admin.checkOtherLinkHealth'],
    ['expiresAtBypass', 'admin.bypassExpiration'],
    ['passwordBypass', 'admin.bypassPasswords'],
  ] as const satisfies readonly (readonly [
    LinkPermissionKey,
    PluginLocaleKey,
  ])[];
  const editableFields = [
    ['url', 'admin.destinationUrl'],
    ['previewTitle', 'admin.previewTitle'],
    ['previewDescription', 'admin.previewDescription'],
    ['previewImageUrl', 'admin.previewImageUrl'],
    ['themeColor', 'admin.themeColor'],
    ['utmSource', 'admin.utmSource'],
    ['utmMedium', 'admin.utmMedium'],
    ['utmCampaign', 'admin.utmCampaign'],
    ['utmTerm', 'admin.utmTerm'],
    ['utmContent', 'admin.utmContent'],
    ['expiresAt', 'admin.expirationDate'],
    ['maxClicks', 'admin.maxClicks'],
    ['password', 'admin.password'],
    ['tags', 'admin.tags'],
    ['redirectRules', 'admin.redirectRules'],
    ['redirectRuleDevice', 'admin.redirectRuleDevice'],
    ['redirectRuleLanguage', 'admin.redirectRuleLanguage'],
    ['redirectRuleQuery', 'admin.redirectRuleQuery'],
    ['redirectRuleIp', 'admin.redirectRuleIp'],
    ['redirectRuleGeo', 'admin.redirectRuleGeo'],
    ['redirectRulePercentage', 'admin.redirectRulePercentage'],
  ] as const satisfies readonly (readonly [
    LinkEditFieldKey,
    PluginLocaleKey,
  ])[];
  const adminSections = [
    ['general', 'admin.siteSection'],
    ['links', 'admin.linksAndApiSection'],
    ['theme', 'admin.themeSection'],
    ['plugins', 'admin.pluginsSection'],
    ['data', 'admin.linkManagementSection'],
  ] as const satisfies readonly (readonly [string, PluginLocaleKey])[];
  const apiPermissions = [
    ['enabled', 'admin.apiAccess'],
    ['create', 'admin.createLinksApi'],
    ['list', 'admin.listApi'],
    ['stats', 'admin.statsApi'],
    ['delete', 'admin.deleteApi'],
    ['update', 'admin.updateApi'],
  ] as const satisfies readonly (readonly [string, PluginLocaleKey])[];
  const autoAssignTabs = [
    ['email', 'admin.autoAssignEmailTab'],
    ['account', 'admin.autoAssignAccountTab'],
  ] as const satisfies readonly (readonly [AutoAssignTab, PluginLocaleKey])[];

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }

  function formatText(
    key: PluginLocaleKey,
    values: Record<string, string | number>,
  ) {
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      t(key),
    );
  }

  function ruleValue(value: RuleValue) {
    if (value === true) return 'allow';
    if (value === false) return 'deny';
    return 'inherit';
  }

  function linkedOptionKeys(key: LinkOptionKey) {
    for (const [left, right] of linkedLinkOptionKeyPairs) {
      if (left === key || right === key) return [left, right] as const;
    }
    return [key] as const;
  }

  function linkedEditFieldKeys(key: LinkEditFieldKey) {
    for (const [left, right] of linkedLinkEditFieldPairs) {
      if (left === key || right === key) return [left, right] as const;
    }
    return [key] as const;
  }

  function formSelect(form: HTMLFormElement, name: string) {
    return Array.from(form.elements).find(
      (element): element is HTMLSelectElement =>
        element instanceof HTMLSelectElement && element.name === name,
    );
  }

  function selectValueForRedirectRuleChildren(
    form: HTMLFormElement,
    nameForKey: (key: (typeof redirectRuleConditionKeys)[number]) => string,
  ) {
    const values = redirectRuleConditionKeys
      .map((key) => formSelect(form, nameForKey(key))?.value)
      .filter((value): value is string => value !== undefined);
    if (values.length === 0) return 'inherit';
    if (values.every((value) => value === 'allow')) return 'allow';
    if (values.every((value) => value === 'deny')) return 'deny';
    if (values.every((value) => value === 'inherit')) return 'inherit';
    return values.includes('allow') ? 'allow' : 'inherit';
  }

  function syncRedirectRuleOptionSelect(
    form: HTMLFormElement,
    key: LinkOptionKey,
    value: string,
  ) {
    if (key === 'redirectRules') {
      for (const conditionKey of redirectRuleConditionKeys) {
        const select = formSelect(form, `linkOption.${conditionKey}`);
        if (select) select.value = value;
      }
      return;
    }

    if (!isRedirectRuleConditionKey(key)) return;
    const parent = formSelect(form, 'linkOption.redirectRules');
    if (!parent) return;
    parent.value = selectValueForRedirectRuleChildren(
      form,
      (conditionKey) => `linkOption.${conditionKey}`,
    );
  }

  function syncRedirectRuleEditFieldSelect(
    form: HTMLFormElement,
    key: LinkEditFieldKey,
    value: string,
  ) {
    if (key === 'redirectRules') {
      for (const conditionKey of redirectRuleConditionKeys) {
        const select = formSelect(form, `linkEditField.${conditionKey}`);
        if (select) select.value = value;
      }
      return;
    }

    if (!isRedirectRuleConditionKey(key)) return;
    const parent = formSelect(form, 'linkEditField.redirectRules');
    if (!parent) return;
    parent.value = selectValueForRedirectRuleChildren(
      form,
      (conditionKey) => `linkEditField.${conditionKey}`,
    );
  }

  function syncLinkedLinkOptionSelect(
    event: Event & { currentTarget: HTMLSelectElement },
    key: LinkOptionKey,
  ) {
    const form = event.currentTarget.form;
    if (!form) return;
    syncRedirectRuleOptionSelect(form, key, event.currentTarget.value);
    for (const linkedKey of linkedOptionKeys(key)) {
      const select = formSelect(form, `linkOption.${linkedKey}`);
      if (select) select.value = event.currentTarget.value;
    }
  }

  function syncLinkedLinkEditFieldSelect(
    event: Event & { currentTarget: HTMLSelectElement },
    key: LinkEditFieldKey,
  ) {
    const form = event.currentTarget.form;
    if (!form) return;
    syncRedirectRuleEditFieldSelect(form, key, event.currentTarget.value);
    for (const linkedKey of linkedEditFieldKeys(key)) {
      const select = formSelect(form, `linkEditField.${linkedKey}`);
      if (select) select.value = event.currentTarget.value;
    }
  }

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

  function toggleCidr(cidr: string, checked: boolean) {
    selectedCidrKeys = toggleSelection(selectedCidrKeys, cidr, checked);
  }

  function toggleAllCidrs(checked: boolean) {
    selectedCidrKeys = selectAll(selectableCidrKeys, checked);
  }

  function toggleMember(id: number, checked: boolean) {
    selectedMemberIds = toggleSelection(selectedMemberIds, String(id), checked);
  }

  function toggleAllMembers(checked: boolean) {
    selectedMemberIds = selectAll(selectableMemberIds, checked);
  }

  function openAddUserModal(user: GroupUser) {
    addUserTarget = user;
  }

  function closeAddUserModal() {
    addUserTarget = null;
  }

  function closeAddUserModalOnEscape(event: KeyboardEvent) {
    if (addUserTarget && event.key === 'Escape') closeAddUserModal();
  }

  function closeAddUserModalOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeAddUserModal();
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

  function autoAssignCondition(group: Group, type: string) {
    return group.autoAssign.conditions.find((item) => item.type === type);
  }

  function autoAssignListItems(group: Group, type: string, key: string) {
    const value = autoAssignCondition(group, type)?.config[key];
    return Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : [];
  }

  function emailPatternCondition(group: Group) {
    return autoAssignListItems(group, 'email-pattern', 'patterns').join('\n');
  }

  function autoAssignNumberCondition(group: Group, type: string, key: string) {
    const value = autoAssignCondition(group, type)?.config[key];
    return typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '';
  }

  function adminStatusCondition(group: Group) {
    const value = autoAssignCondition(group, 'admin-status')?.config.isAdmin;
    if (value === true) return 'admin';
    if (value === false) return 'user';
    return 'any';
  }
</script>

<svelte:window onkeydown={closeAddUserModalOnEscape} />

<div class="plugin-i18n-root" use:translateContent={strings}>
  {#if user}
    <div class="stack">
      <section>
        <h2>{t('admin.userInformation')}</h2>
        <form
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginAction" value="saveUser" />
          <div class="grid form-grid balanced">
            <label>
              {t('admin.email')}
              <input name="email" type="email" value={user.email} required />
            </label>
            <label>
              {t('admin.name')}
              <input name="name" value={user.name} required />
            </label>
          </div>
          <label>
            {t('admin.newPassword')}
            <input
              name="password"
              type="password"
              minlength={userSettings?.passwordMinLength ?? 10}
              placeholder={userSettings?.passwordPolicy ??
                t('admin.changeOnlyPlaceholder')}
            />
          </label>
          <div class="toggles">
            <ToggleField
              name="isAdmin"
              label={t('admin.administrator')}
              checked={user.isAdmin}
            />
            <ToggleField
              name="enabled"
              label={t('admin.enabled')}
              checked={user.enabled}
            />
          </div>
          <button type="submit">{t('admin.save')}</button>
        </form>
      </section>

      {#each integrations ?? [] as integration (integration.pluginId)}
        {@const registered = userAdminPluginRegistry.find(
          (plugin) => plugin.definition.meta.id === integration.pluginId,
        )}
        {#if registered?.userAdmin}
          {@const UserAdmin = registered.userAdmin}
          <UserAdmin
            config={integration.config ?? {}}
            integrationData={integration.data}
            {locale}
            {fallbackLocale}
            strings={pluginLocaleStrings(
              registered.definition,
              locale,
              fallbackLocale,
            )}
          />
        {:else if integration.runtimeSchema}
          <section>
            <h2>{integration.pluginName}</h2>
            <form
              method="POST"
              action="?/integrationAction"
              use:enhance={keepFormValues}
            >
              <input
                type="hidden"
                name="integrationPlugin"
                value={integration.pluginId}
              />
              <input type="hidden" name="integrationAction" value="save" />
              <RuntimePluginSchemaForm schema={integration.runtimeSchema} />
              <button type="submit">{t('admin.save')}</button>
            </form>
          </section>
        {:else if integration.runtimeUi?.mode === 'iframe' && integration.runtimeUi.src}
          <section>
            <h2>{integration.pluginName}</h2>
            <form method="POST" action="?/integrationAction" use:enhance>
              <RuntimePluginFrame
                src={integration.runtimeUi.src}
                pluginId={integration.pluginId}
                config={integration.config ?? {}}
                adminData={integration.data}
                {locale}
                {fallbackLocale}
                strings={integration.strings ?? {}}
                pluginFieldName="integrationPlugin"
                pluginFieldValue={integration.pluginId}
                actionFieldName="integrationAction"
              />
            </form>
          </section>
        {/if}
      {/each}

      <section>
        <h2>{t('admin.apiTokens')}</h2>
        <p class="muted">{t('admin.apiTokensDescription')}</p>
        {#if userSettings?.apiTokens?.length}
          <div class="connections">
            {#each userSettings.apiTokens as token (token.id)}
              <article>
                <div>
                  <strong>{token.name}</strong>
                  <span>
                    {token.prefix}... · {t('admin.createdAt')}
                    {dateTimeLabel(token.createdAt)} · {t('admin.lastUsedAt')}
                    {dateTimeLabel(token.lastUsedAt)}
                  </span>
                </div>
                <form
                  method="POST"
                  action="?/pluginAction"
                  use:enhance={keepFormValues}
                >
                  <input
                    type="hidden"
                    name="pluginAction"
                    value="revokeApiToken"
                  />
                  <input type="hidden" name="tokenId" value={token.id} />
                  <DangerConfirmButton
                    label={t('admin.revokeApiToken')}
                    {locale}
                    title={t('admin.revokeApiTokenTitle')}
                    message={t('admin.revokeApiTokenMessage')}
                    details={[`${token.name} (${token.prefix}...)`]}
                    confirmLabel={t('admin.revokeApiTokenConfirm')}
                  />
                </form>
              </article>
            {/each}
          </div>
        {:else}
          <p class="muted">{t('admin.emptyApiTokens')}</p>
        {/if}
      </section>

      <section>
        <h2>{t('admin.dangerZone')}</h2>
        <form
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginAction" value="deleteUser" />
          <DangerConfirmButton
            label={t('admin.deleteUser')}
            {locale}
            title={t('admin.deleteUserTitle')}
            message={t('admin.deleteUserMessage')}
            details={[`${user.name} (${user.email})`]}
            confirmLabel={t('admin.deleteUser')}
            requireConsent
            consentLabel={t('admin.deleteUserConsent')}
          />
        </form>
      </section>
    </div>
  {:else if group}
    <form
      class="stack"
      method="POST"
      action="?/pluginAction"
      use:enhance={keepFormValues}
    >
      <input type="hidden" name="pluginAction" value="saveGroup" />

      <section>
        <h2>{t('admin.permissionGroups')}</h2>
        <div class="grid form-grid balanced">
          <label>
            {t('admin.groupName')}
            <input name="name" value={group.name} required />
          </label>
          <label>
            {t('admin.priority')}
            <input
              name="priority"
              type="number"
              min="0"
              max="10000"
              value={group.priority}
            />
          </label>
          <label class="wide">
            {t('admin.description')}
            <textarea name="description" rows="3">{group.description}</textarea>
          </label>
          <div class="wide">
            <ToggleField
              name="enabled"
              label={t('admin.enableGroup')}
              checked={group.enabled}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>{t('admin.automaticAssignment')}</h2>
        <p class="muted">{t('admin.automaticAssignmentDescription')}</p>
        <div class="grid form-grid balanced auto-assignment-grid">
          <div class="wide">
            <ToggleField
              name="autoAssign.enabled"
              label={t('admin.enableAutomaticAssignment')}
              checked={group.autoAssign.enabled}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="autoAssign.revokeWhenUnmatched"
              label={t('admin.revokeWhenUnmatched')}
              checked={group.autoAssign.revokeWhenUnmatched}
            />
            <p class="muted">{t('admin.revokeWhenUnmatchedHelp')}</p>
          </div>
        </div>
        <div
          class="tabs auto-assign-tabs"
          role="tablist"
          aria-label={t('admin.automaticAssignment')}
        >
          {#each autoAssignTabs as tab (tab[0])}
            <button
              type="button"
              class:active={autoAssignTab === tab[0]}
              onclick={() => (autoAssignTab = tab[0])}>{t(tab[1])}</button
            >
          {/each}
        </div>
        <div
          class="auto-assign-tab-panel"
          role="tabpanel"
          hidden={autoAssignTab !== 'email'}
        >
          <label>
            {t('admin.autoAssignEmailPatterns')}
            <small>{t('admin.autoAssignEmailPatternsHelp')}</small>
            <textarea name="autoAssign.emailPatterns" rows="4"
              >{emailPatternCondition(group)}</textarea
            >
          </label>
        </div>
        <div
          class="auto-assign-tab-panel"
          role="tabpanel"
          hidden={autoAssignTab !== 'account'}
        >
          <label>
            {t('admin.autoAssignAdminStatus')}
            <select
              name="autoAssign.adminStatus"
              value={adminStatusCondition(group)}
            >
              <option value="any">{t('admin.autoAssignAny')}</option>
              <option value="admin">{t('admin.autoAssignAdminsOnly')}</option>
              <option value="user">
                {t('admin.autoAssignNonAdminsOnly')}
              </option>
            </select>
          </label>
          <div class="grid form-grid balanced">
            <label>
              {t('admin.autoAssignMinAgeDays')}
              <input
                name="autoAssign.accountAgeMinDays"
                type="number"
                min="0"
                max="36500"
                value={autoAssignNumberCondition(
                  group,
                  'account-age-days',
                  'minDays',
                )}
              />
            </label>
            <label>
              {t('admin.autoAssignMaxAgeDays')}
              <input
                name="autoAssign.accountAgeMaxDays"
                type="number"
                min="0"
                max="36500"
                value={autoAssignNumberCondition(
                  group,
                  'account-age-days',
                  'maxDays',
                )}
              />
            </label>
          </div>
          <p class="muted">{t('admin.autoAssignAgeHelp')}</p>
        </div>
      </section>

      <div
        class="tabs"
        role="tablist"
        aria-label={t('admin.permissionGroupSettings')}
      >
        <button
          type="button"
          class:active={activeTab === 'links'}
          onclick={() => (activeTab = 'links')}>{t('admin.links')}</button
        >
        <button
          type="button"
          class:active={activeTab === 'admin'}
          onclick={() => (activeTab = 'admin')}
          >{t('admin.administrator')}</button
        >
        <button
          type="button"
          class:active={activeTab === 'auth'}
          onclick={() => (activeTab = 'auth')}
          >{t('admin.authentication')}</button
        >
        <button
          type="button"
          class:active={activeTab === 'api'}
          onclick={() => (activeTab = 'api')}>{t('admin.api')}</button
        >
      </div>

      <div class="tab-panel" hidden={activeTab !== 'links'}>
        <section>
          <h2>{t('admin.linkPermissions')}</h2>
          <div class="grid form-grid balanced dense-grid">
            {#each linkPermissions as permission (permission[0])}
              <label>
                {t(permission[1])}
                <select
                  name={`links.${permission[0]}`}
                  value={ruleValue(group.rules.links[permission[0]])}
                >
                  <option value="inherit">{t('admin.inheritDefault')}</option>
                  <option value="allow">{t('admin.allow')}</option>
                  <option value="deny">{t('admin.deny')}</option>
                </select>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h2>{t('admin.linkCreationOptions')}</h2>
          <div class="grid form-grid balanced dense-grid">
            {#each linkOptions as option (option[0])}
              <label>
                {t(option[1])}
                <select
                  name={`linkOption.${option[0]}`}
                  value={ruleValue(group.rules.links.options[option[0]])}
                  onchange={(event) =>
                    syncLinkedLinkOptionSelect(event, option[0])}
                >
                  <option value="inherit">{t('admin.inheritDefault')}</option>
                  <option value="allow">{t('admin.allow')}</option>
                  <option value="deny">{t('admin.deny')}</option>
                </select>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h2>{t('admin.linkEditingOptions')}</h2>
          <div class="grid form-grid balanced dense-grid">
            {#each editableFields as field (field[0])}
              <label>
                {t(field[1])}
                <select
                  name={`linkEditField.${field[0]}`}
                  value={ruleValue(group.rules.links.editableFields[field[0]])}
                  onchange={(event) =>
                    syncLinkedLinkEditFieldSelect(event, field[0])}
                >
                  <option value="inherit">{t('admin.inheritDefault')}</option>
                  <option value="allow">{t('admin.allow')}</option>
                  <option value="deny">{t('admin.deny')}</option>
                </select>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h2>{t('admin.codeAndDeletionConditions')}</h2>
          <div class="grid form-grid balanced dense-grid override-grid">
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.minimumLength')}</span>
                <ToggleField
                  name="overrideCodeMinLength"
                  checked={group.rules.links.codeMinLength !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideCodeMinLength')}
                />
              </div>
              <input
                name="codeMinLength"
                type="number"
                min="1"
                max="64"
                value={group.rules.links.codeMinLength ?? 3}
              />
            </div>
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.maximumLength')}</span>
                <ToggleField
                  name="overrideCodeMaxLength"
                  checked={group.rules.links.codeMaxLength !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideCodeMaxLength')}
                />
              </div>
              <input
                name="codeMaxLength"
                type="number"
                min="1"
                max="64"
                value={group.rules.links.codeMaxLength ?? 32}
              />
            </div>
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.generatedCodeLength')}</span>
                <ToggleField
                  name="overrideGeneratedCodeLength"
                  checked={group.rules.links.generatedCodeLength !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideGeneratedCodeLength')}
                />
              </div>
              <input
                name="generatedCodeLength"
                type="number"
                min="1"
                max="64"
                value={group.rules.links.generatedCodeLength ?? 7}
              />
            </div>
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.allowedShortLinkDomains')}</span>
                <ToggleField
                  name="overrideDomains"
                  checked={group.rules.links.domains !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideAllowedShortLinkDomains')}
                />
              </div>
              <textarea name="allowedDomains" rows="4"
                >{group.rules.links.domains?.join('\n') ?? ''}</textarea
              >
              <small>{t('admin.allowedShortLinkDomainsHelp')}</small>
            </div>
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.maxClicksForDeletion')}</span>
                <ToggleField
                  name="overrideDeleteMaxClicks"
                  checked={group.rules.links.deleteMaxClicks !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideDeleteMaxClicks')}
                />
              </div>
              <input
                name="deleteMaxClicks"
                type="number"
                min="0"
                max="1000000"
                value={group.rules.links.deleteMaxClicks ?? 0}
              />
              <small>{t('admin.zeroMeansUnlimited')}</small>
            </div>
          </div>
        </section>
      </div>

      <div class="tab-panel" hidden={activeTab !== 'auth'}>
        <section>
          <h2>{t('admin.authProviders')}</h2>
          <p class="muted">{t('admin.authProvidersDescription')}</p>
          <div class="override-control wide">
            <div class="override-heading">
              <span>{t('admin.authProviderAccess')}</span>
              <ToggleField
                name="overrideAuthProviders"
                checked={group.rules.auth.providers !== null}
                label={t('admin.override')}
                ariaLabel={t('admin.overrideAuthProviders')}
              />
            </div>
            {#if authProviders.length}
              <div class="auth-provider-list">
                {#each authProviders as provider (provider.id)}
                  <ToggleField
                    name="authProviders"
                    value={provider.id}
                    checked={group.rules.auth.providers === null ||
                      group.rules.auth.providers.includes(provider.id)}
                    label={provider.label}
                  />
                {/each}
              </div>
            {:else}
              <p class="empty">{t('admin.noAuthProviders')}</p>
            {/if}
            <small>{t('admin.authProvidersHelp')}</small>
          </div>
        </section>

        <section>
          <h2>{t('admin.accountRecovery')}</h2>
          <p class="muted">{t('admin.accountRecoveryDescription')}</p>
          <div class="grid form-grid balanced dense-grid override-grid">
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.resendVerificationDailyLimit')}</span>
                <ToggleField
                  name="overrideResendVerificationDailyLimit"
                  checked={group.rules.auth.resendVerificationDailyLimit !==
                    null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overrideResendVerificationDailyLimit')}
                />
              </div>
              <input
                name="resendVerificationDailyLimit"
                type="number"
                min="0"
                max="1000"
                value={group.rules.auth.resendVerificationDailyLimit ?? 5}
              />
              <small>{t('admin.zeroMeansDisabled')}</small>
            </div>
            <div class="override-control">
              <div class="override-heading">
                <span>{t('admin.passwordResetDailyLimit')}</span>
                <ToggleField
                  name="overridePasswordResetDailyLimit"
                  checked={group.rules.auth.passwordResetDailyLimit !== null}
                  label={t('admin.override')}
                  ariaLabel={t('admin.overridePasswordResetDailyLimit')}
                />
              </div>
              <input
                name="passwordResetDailyLimit"
                type="number"
                min="0"
                max="1000"
                value={group.rules.auth.passwordResetDailyLimit ?? 10}
              />
              <small>{t('admin.zeroMeansDisabled')}</small>
            </div>
          </div>
        </section>
      </div>

      <div class="tab-panel" hidden={activeTab !== 'admin'}>
        <section>
          <h2>{t('admin.adminAccess')}</h2>
          <div class="grid form-grid balanced dense-grid">
            <label>
              {t('admin.adminPageAccess')}
              <select
                name="admin.access"
                value={ruleValue(group.rules.admin.access)}
              >
                <option value="inherit">{t('admin.inheritDefault')}</option>
                <option value="allow">{t('admin.allow')}</option>
                <option value="deny">{t('admin.deny')}</option>
              </select>
            </label>
            <label>
              {t('admin.userManagement')}
              <select
                name="admin.manageUsers"
                value={ruleValue(group.rules.admin.manageUsers)}
              >
                <option value="inherit">{t('admin.inheritDefault')}</option>
                <option value="allow">{t('admin.allow')}</option>
                <option value="deny">{t('admin.deny')}</option>
              </select>
            </label>
            <label>
              {t('admin.permissionGroupManagement')}
              <select
                name="admin.managePermissions"
                value={ruleValue(group.rules.admin.managePermissions)}
              >
                <option value="inherit">{t('admin.inheritDefault')}</option>
                <option value="allow">{t('admin.allow')}</option>
                <option value="deny">{t('admin.deny')}</option>
              </select>
            </label>
            <label class="wide">
              {t('admin.accessiblePluginIds')}
              <small>{t('admin.accessiblePluginIdsHelp')}</small>
              <textarea name="adminPlugins" rows="4"
                >{group.rules.admin.plugins.join('\n')}</textarea
              >
            </label>
          </div>
        </section>

        <section>
          <h2>{t('admin.accessibleAdminTabs')}</h2>
          <div class="checks">
            {#each adminSections as section (section[0])}
              <ToggleField
                name="adminSections"
                value={section[0]}
                checked={group.rules.admin.sections.includes(section[0])}
                label={t(section[1])}
              />
            {/each}
          </div>
        </section>

        <section>
          <h2>{t('admin.manageableAdminTabs')}</h2>
          <div class="checks">
            {#each adminSections as section (section[0])}
              <ToggleField
                name="adminManageSections"
                value={section[0]}
                checked={group.rules.admin.manageSections.includes(section[0])}
                label={t(section[1])}
              />
            {/each}
          </div>
        </section>
      </div>

      <section hidden={activeTab !== 'api'}>
        <h2>{t('admin.apiPermissions')}</h2>
        <div class="grid form-grid balanced dense-grid">
          {#each apiPermissions as permission (permission[0])}
            <label>
              {t(permission[1])}
              <select
                name={`api.${permission[0]}`}
                value={ruleValue(group.rules.api[permission[0]])}
              >
                <option value="inherit">{t('admin.inheritDefault')}</option>
                <option value="allow">{t('admin.allow')}</option>
                <option value="deny">{t('admin.deny')}</option>
              </select>
            </label>
          {/each}
        </div>
      </section>

      <div class="savebar">
        <button type="submit">{t('admin.savePermissionGroup')}</button>
      </div>
    </form>

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
              <input
                type="hidden"
                name="pluginAction"
                value="removeGroupCidr"
              />
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
          <input
            name="memberQ"
            placeholder={t('admin.searchCurrentMembers')}
            value={members?.query ?? ''}
          />
          <button type="submit">{t('admin.searchMembers')}</button>
        </form>
        <form class="search-users" method="GET" onsubmit={submitGroupSearch}>
          {#if cidrs?.query}
            <input type="hidden" name="cidrQ" value={cidrs.query} />
          {/if}
          {#if members?.query}
            <input type="hidden" name="memberQ" value={members.query} />
          {/if}
          <input
            name="addUserQ"
            placeholder={t('admin.searchUsersToAdd')}
            value={addableUsers?.query ?? ''}
          />
          <button type="submit">{t('admin.searchUsers')}</button>
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
              <input
                type="hidden"
                name="pluginAction"
                value="removeGroupUsers"
              />
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
                  ariaLabel={formatText('admin.selectUser', {
                    name: member.name,
                  })}
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
                  <em class="assignment-meta"
                    >{expiresAtLabel(member.expiresAt)}</em
                  >
                  <em class="assignment-meta">
                    {member.assignmentSource === 'automatic'
                      ? t('admin.automaticAssignmentBadge')
                      : t('admin.manualAssignmentBadge')}
                  </em>
                  {#if member.reason}
                    <em class="assignment-meta"
                      >{t('admin.assignmentReason')}: {member.reason}</em
                    >
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
                  <button type="submit">{t('admin.remove')}</button>
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
                  <button
                    type="button"
                    onclick={() => openAddUserModal(candidate)}
                    >{t('admin.add')}</button
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
      <div
        class="modal-backdrop"
        role="presentation"
        onclick={closeAddUserModalOnBackdrop}
      >
        <div
          class="assignment-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-modal-title"
          tabindex="-1"
        >
          <div>
            <h2 id="add-user-modal-title">{t('admin.addUserToGroup')}</h2>
            <p class="muted">
              {formatText('admin.addUserToGroupDescription', {
                name: addUserTarget.name,
              })}
            </p>
          </div>
          <form
            method="POST"
            action="?/pluginAction"
            use:enhance={keepFormValues}
          >
            <input type="hidden" name="pluginAction" value="addGroupUser" />
            <input type="hidden" name="userId" value={addUserTarget.id} />
            <label>
              {t('admin.expirationDateTime')}
              <input name="expiresAt" type="datetime-local" step="60" />
            </label>
            <label>
              {t('admin.assignmentReason')}
              <textarea
                name="reason"
                rows="4"
                maxlength="1000"
                placeholder={t('admin.assignmentReasonPlaceholder')}
              ></textarea>
            </label>
            <label class="checkbox-row">
              <input name="reasonPublic" type="checkbox" />
              <span>{t('admin.assignmentReasonPublicCheckbox')}</span>
            </label>
            <div class="modal-actions">
              <button
                type="button"
                class="secondary"
                onclick={closeAddUserModal}>{t('admin.cancel')}</button
              >
              <button type="submit">{t('admin.add')}</button>
            </div>
          </form>
        </div>
      </div>
    {/if}

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
  {:else}
    <p>{t('admin.itemNotFound')}</p>
  {/if}
</div>

<style>
  .plugin-i18n-root {
    display: contents;
  }
  .stack,
  section,
  form {
    display: grid;
    gap: 16px;
  }
  section {
    border-top: 1px solid var(--admin-border);
    padding-top: 18px;
  }
  section[hidden],
  .tab-panel[hidden],
  .auto-assign-tab-panel[hidden] {
    display: none;
  }
  .stack > section:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.05rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-columns, 2), minmax(0, 1fr));
    gap: 14px;
  }
  .dense-grid {
    --grid-columns: 4;
  }
  label {
    display: grid;
    gap: 7px;
    color: var(--admin-text);
    font-size: 0.82rem;
    font-weight: 750;
  }
  label small,
  .muted,
  .connections article span {
    color: var(--admin-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }
  input:not([type='checkbox']),
  textarea,
  select {
    width: 100%;
    min-height: var(--form-control-height);
    border: 1px solid var(--admin-border);
    border-radius: var(--form-control-radius);
    padding: 10px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font: inherit;
  }
  input[type='datetime-local'] {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    display: block;
    height: var(--form-control-height);
    min-height: var(--form-control-height);
    line-height: 1.2;
    padding-top: 0;
    padding-bottom: 0;
  }
  input[type='datetime-local']::-webkit-date-and-time-value {
    display: flex;
    min-height: calc(var(--form-control-height) - 2px);
    align-items: center;
    padding: 0;
    line-height: 1.2;
    text-align: left;
  }
  input[type='datetime-local']::-webkit-datetime-edit {
    display: flex;
    min-height: calc(var(--form-control-height) - 2px);
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
  select {
    -webkit-appearance: none;
    appearance: none;
    height: var(--form-control-height);
    padding-inline-end: max(34px, 2.25em);
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 18px) 50%,
      calc(100% - 13px) 50%;
    background-repeat: no-repeat;
    background-size:
      5px 5px,
      5px 5px;
    text-align: left;
    text-align-last: left;
  }
  textarea {
    resize: vertical;
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
  .wide {
    grid-column: 1 / -1;
  }
  .toggles,
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    --toggle-min-height: 42px;
  }
  .auth-provider-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
    --toggle-label: var(--admin-text);
    --toggle-font-size: 0.82rem;
    --toggle-min-height: 40px;
  }
  .override-grid {
    align-items: start;
  }
  .override-control {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .override-heading {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--admin-text);
    font-size: 0.82rem;
    font-weight: 750;
  }
  .override-heading > span {
    min-width: 0;
  }
  .override-heading :global(.toggle) {
    flex: none;
    --toggle-font-size: 0.72rem;
    --toggle-label: var(--admin-muted);
    --toggle-min-height: 28px;
  }
  .override-control small {
    color: var(--admin-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .hidden-form {
    display: none;
  }
  .list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .list-heading h3 {
    margin: 0;
  }
  .member-list-heading {
    margin-bottom: 12px;
  }
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
    --toggle-label: var(--admin-text);
    --toggle-font-size: 0.82rem;
    --toggle-min-height: 38px;
  }
  .list-grid {
    display: grid;
    grid-template-columns: repeat(var(--list-grid-columns, 1), minmax(0, 1fr));
    gap: var(--list-grid-gap, 8px);
  }
  .cidr-list {
    --list-grid-columns: 3;
    --list-grid-gap: 8px;
  }
  .cidr-list > .empty {
    grid-column: 1 / -1;
  }
  .add-cidr-form {
    grid-template-columns: minmax(0, 1fr) minmax(280px, auto) auto;
    align-items: end;
  }
  .expires-field {
    min-width: 0;
    font-size: 0.76rem;
  }
  .cidr-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.45);
    padding: 12px;
    background: var(--admin-surface);
  }
  .cidr-row > span {
    min-width: 0;
  }
  .cidr-row strong,
  .cidr-row em,
  .assignment-meta {
    display: block;
  }
  .cidr-row em,
  .assignment-meta {
    color: var(--admin-muted);
    font-size: 0.76rem;
    font-style: normal;
    line-height: 1.5;
  }
  .connections {
    display: grid;
  }
  .connections article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--admin-border);
    padding: 12px 0;
  }
  .connections article:first-child {
    border-top: 0;
  }
  .connections article strong,
  .connections article span {
    display: block;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-top: 1px solid var(--admin-border);
    padding-top: 16px;
  }
  .tabs button {
    border: 1px solid var(--admin-border);
    background: var(--admin-surface);
    color: var(--admin-muted);
  }
  .tabs button.active {
    border-color: var(--admin-primary);
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
  }
  .auto-assign-tabs {
    border-top: 0;
    padding-top: 0;
  }
  .auto-assign-tab-panel {
    display: grid;
    gap: 14px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.55);
    padding: 14px;
    background: color-mix(in srgb, var(--admin-surface) 82%, transparent);
  }
  .savebar {
    position: sticky;
    bottom: 18px;
    display: flex;
    justify-content: flex-end;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.65);
    padding: 12px;
    background: color-mix(in srgb, var(--admin-surface) 90%, transparent);
    box-shadow: 0 15px 40px var(--admin-shadow);
    backdrop-filter: blur(12px);
  }
  .danger {
    margin-top: 18px;
  }
  .member-management {
    margin-top: 18px;
  }
  .member-searches,
  .member-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .search-users {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }
  h3 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 10px;
    font-size: 0.95rem;
  }
  h3 em {
    color: var(--admin-muted);
    font-size: 0.78rem;
    font-style: normal;
  }
  .user-list {
    display: grid;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.55);
    overflow: hidden;
    background: var(--admin-surface);
  }
  .user-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--admin-border);
    padding: 12px;
  }
  .user-row:first-child {
    border-top: 0;
  }
  .member-row {
    grid-template-columns: 18px minmax(0, 1fr) auto;
  }
  .add-user-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .inline-form {
    display: contents;
  }
  .user-row a {
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .user-row a:hover strong {
    text-decoration: underline;
  }
  .user-row strong,
  .user-row span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-row span,
  .empty {
    color: var(--admin-muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .empty {
    margin: 0;
    padding: 16px;
  }
  .modal-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18px;
    background: color-mix(in srgb, var(--admin-text) 34%, transparent);
  }
  .assignment-modal {
    display: grid;
    width: min(560px, 100%);
    max-height: calc(100vh - 36px);
    gap: 16px;
    overflow: auto;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.75);
    padding: 18px;
    background: var(--admin-surface);
    color: var(--admin-text);
    box-shadow: 0 28px 80px var(--admin-shadow);
  }
  .assignment-modal form {
    display: grid;
    gap: 14px;
  }
  .assignment-modal textarea {
    min-height: 110px;
  }
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .checkbox-row input {
    width: 18px;
    height: 18px;
    flex: none;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  button.secondary {
    border: 1px solid var(--admin-border);
    background: var(--admin-surface);
    color: var(--admin-muted);
  }
  section,
  .toggles {
    --toggle-border: var(--admin-border);
    --toggle-surface: var(--admin-surface);
    --toggle-primary: var(--admin-primary);
  }
  @media (max-width: 1100px) {
    .dense-grid {
      --grid-columns: 3;
    }
    .cidr-list {
      --list-grid-columns: 2;
    }
  }
  @media (max-width: 860px) {
    .dense-grid {
      --grid-columns: 2;
    }
  }
  @media (max-width: 720px) {
    .grid {
      --grid-columns: 1;
    }
    .wide {
      grid-column: auto;
    }
    .connections article {
      align-items: start;
      flex-direction: column;
    }
    .member-searches,
    .member-columns,
    .search-users,
    .add-cidr-form,
    .cidr-row,
    .user-row {
      grid-template-columns: 1fr;
    }
    .cidr-list {
      --list-grid-columns: 1;
    }
    .bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .list-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
