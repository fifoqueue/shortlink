<script lang="ts">
  import { enhance } from '$app/forms';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { keepFormValues } from '$lib/forms';
  import { pluginLocaleStrings } from '$lib/i18n/plugin';
  import type { SiteLocale } from '$lib/config';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { userAdminPluginRegistry } from '../../user-admin-registry';
  import type { User, UserAdminData } from './types';

  let {
    user,
    userSettings,
    integrations = [],
    locale,
    fallbackLocale,
    t,
    dateTimeLabel,
  }: {
    user: User;
    userSettings: UserAdminData | undefined;
    integrations?: PluginComponentProps['integrations'];
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    t: (key: PluginLocaleKey) => string;
    dateTimeLabel: (value: string | null) => string;
  } = $props();
</script>

<div class="stack">
  <section>
    <h2>{t('admin.userInformation')}</h2>
    <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
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
              <input type="hidden" name="pluginAction" value="revokeApiToken" />
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
    <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
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
