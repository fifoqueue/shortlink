<script lang="ts">
  import { enhance } from '$app/forms';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { keepFormValues } from '$lib/forms';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import {
    apiPermissions,
    autoAssignTabs,
    editableFields,
    linkOptions,
    linkPermissions,
  } from './constants';
  import {
    adminStatusCondition,
    autoAssignNumberCondition,
    emailPatternCondition,
    ruleValue,
    syncLinkedLinkEditFieldSelect,
    syncLinkedLinkOptionSelect,
  } from './helpers';
  import type {
    AuthProviderOption,
    AutoAssignTab,
    Group,
    PermissionTab,
  } from './types';

  let {
    group,
    authProviders,
    adminSections,
    t,
  }: {
    group: Group;
    authProviders: AuthProviderOption[];
    adminSections: Array<{ id: string; label: string }>;
    t: (key: PluginLocaleKey) => string;
  } = $props();

  let activeTab = $state<PermissionTab>('links');
  let autoAssignTab = $state<AutoAssignTab>('email');
</script>

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
          <option value="user">{t('admin.autoAssignNonAdminsOnly')}</option>
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
      onclick={() => (activeTab = 'admin')}>{t('admin.administrator')}</button
    >
    <button
      type="button"
      class:active={activeTab === 'auth'}
      onclick={() => (activeTab = 'auth')}>{t('admin.authentication')}</button
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
              onchange={(event) => syncLinkedLinkOptionSelect(event, option[0])}
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
              checked={group.rules.auth.resendVerificationDailyLimit !== null}
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
        {#each adminSections as section (section.id)}
          <ToggleField
            name="adminSections"
            value={section.id}
            checked={group.rules.admin.sections.includes(section.id)}
            label={section.label}
          />
        {/each}
      </div>
    </section>

    <section>
      <h2>{t('admin.manageableAdminTabs')}</h2>
      <div class="checks">
        {#each adminSections as section (section.id)}
          <ToggleField
            name="adminManageSections"
            value={section.id}
            checked={group.rules.admin.manageSections.includes(section.id)}
            label={section.label}
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
