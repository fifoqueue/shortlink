<script lang="ts">
  import { enhance } from '$app/forms';
  import AdminShell from '$lib/components/AdminShell.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { adminSections } from '$lib/admin-sections';
  import { keepFormValues } from '$lib/forms';
  import type {
    PluginActivationStatus,
    PluginLocaleStrings,
    PluginMeta,
    RuntimePluginAdminSchema,
    RuntimePluginUiDescriptor,
    PluginState,
  } from '$lib/plugin-contracts';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { adminPluginRegistry } from '../../../../plugins/admin-registry';

  let {
    data,
    form,
  }: {
    data: {
      plugin: PluginMeta;
      pluginStrings: PluginLocaleStrings;
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      state: PluginState;
      activation: {
        enable: PluginActivationStatus;
        disable: PluginActivationStatus;
      };
      adminData: unknown;
      runtimeAdminUi: RuntimePluginUiDescriptor | null;
      runtimeAdminSchema: RuntimePluginAdminSchema | null;
      permissions: {
        isAdmin: boolean;
        admin: { sections: string[] };
      };
      theme: import('$lib/config').SiteSettings['theme'];
      customHead: string;
      siteName: string;
      logoUrl: string;
      handlesAdminActions: boolean;
    };
    form?: { ok?: boolean; message?: string };
  } = $props();

  const registered = $derived(
    adminPluginRegistry.find(
      (plugin) => plugin.definition.meta.id === data.plugin.id,
    ),
  );
  const activationBlocked = $derived(
    data.state.enabled
      ? !data.activation.disable.allowed
      : !data.activation.enable.allowed,
  );
  const activationBlockReason = $derived(
    data.state.enabled
      ? data.activation.disable.reason
      : data.activation.enable.reason,
  );
  const allowedAdminSections = $derived(
    data.permissions.isAdmin
      ? adminSections
      : adminSections.filter((section) =>
          data.permissions.admin.sections.includes(section.id),
        ),
  );
  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<svelte:head><title>{data.plugin.name} · {data.siteName}</title></svelte:head>

<AdminShell
  siteName={data.siteName}
  logoUrl={data.logoUrl}
  theme={data.theme}
  locale={data.locale}
  activeSection="plugins"
  title={data.plugin.name}
  kicker={text.admin.pluginSettings}
  description={data.plugin.description}
  status={`v${data.plugin.version}`}
  backHref="/admin/plugins"
  backLabel={text.admin.plugins.listBack}
  sections={allowedAdminSections}
  customHead={data.customHead}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} />
    {/key}
  {/if}

  <section class="plugin-panel">
    {#if data.handlesAdminActions && (registered?.admin || data.runtimeAdminUi || data.runtimeAdminSchema)}
      {#if data.plugin.required}
        <p class="core-note">{text.admin.plugins.cannotDisableCore}</p>
      {:else}
        <form method="POST" action="?/save" use:enhance={keepFormValues}>
          {#if activationBlocked && data.state.enabled}
            <input type="hidden" name="enabled" value="on" />
          {/if}
          <ToggleField
            name="enabled"
            label={text.admin.plugins.enablePlugin}
            checked={data.state.enabled}
            disabled={activationBlocked}
          />
          {#if activationBlocked && activationBlockReason}
            <p class="activation-note">{activationBlockReason}</p>
          {/if}
          <button type="submit">{text.admin.plugins.saveActivation}</button>
        </form>
      {/if}
      {#if data.state.enabled}
        <div class:separated={!data.plugin.required} class="plugin-fields">
          {#if registered?.admin}
            {@const PluginAdmin = registered.admin}
            <PluginAdmin
              config={data.state.config}
              adminData={data.adminData}
              locale={data.locale}
              fallbackLocale={data.defaultLocale}
              strings={data.pluginStrings}
            />
          {:else if data.runtimeAdminSchema}
            <RuntimePluginSchemaForm schema={data.runtimeAdminSchema} />
          {:else if data.runtimeAdminUi?.mode === 'iframe' && data.runtimeAdminUi.src}
            <RuntimePluginFrame
              src={data.runtimeAdminUi.src}
              pluginId={data.plugin.id}
              config={data.state.config}
              adminData={data.adminData}
              locale={data.locale}
              fallbackLocale={data.defaultLocale}
              strings={data.pluginStrings}
            />
          {/if}
        </div>
      {:else}
        <p class="disabled-note">{text.admin.plugins.disabledNote}</p>
      {/if}
    {:else}
      <form method="POST" action="?/save" use:enhance={keepFormValues}>
        {#if data.plugin.required || (activationBlocked && data.state.enabled)}
          <input type="hidden" name="enabled" value="on" />
        {/if}
        {#if data.plugin.required}
          <p class="core-note">{text.admin.plugins.cannotDisableCore}</p>
        {:else}
          <ToggleField
            name="enabled"
            label={text.admin.plugins.enablePlugin}
            checked={data.state.enabled}
            disabled={activationBlocked}
          />
          {#if activationBlocked && activationBlockReason}
            <p class="activation-note">{activationBlockReason}</p>
          {/if}
        {/if}
        {#if registered?.admin}
          {@const PluginAdmin = registered.admin}
          <div class="plugin-fields">
            <PluginAdmin
              config={data.state.config}
              adminData={data.adminData}
              locale={data.locale}
              fallbackLocale={data.defaultLocale}
              strings={data.pluginStrings}
            />
          </div>
        {:else if data.runtimeAdminSchema}
          <div class="plugin-fields">
            <RuntimePluginSchemaForm schema={data.runtimeAdminSchema} />
          </div>
        {:else if data.runtimeAdminUi?.mode === 'iframe' && data.runtimeAdminUi.src}
          <div class="plugin-fields">
            <RuntimePluginFrame
              src={data.runtimeAdminUi.src}
              pluginId={data.plugin.id}
              config={data.state.config}
              adminData={data.adminData}
              locale={data.locale}
              fallbackLocale={data.defaultLocale}
              strings={data.pluginStrings}
            />
          </div>
        {/if}
        <button type="submit">{text.admin.plugins.saveSettings}</button>
      </form>
    {/if}
  </section>
</AdminShell>

<style>
  .plugin-panel {
    display: grid;
    gap: 14px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.8);
    padding: 26px;
    background: var(--admin-panel);
  }
  form,
  .plugin-fields {
    display: grid;
    gap: 14px;
  }
  .plugin-fields.separated {
    border-top: 1px solid var(--admin-border);
    padding-top: 22px;
  }
  .disabled-note {
    margin: 8px 0 0;
    border-top: 1px solid var(--admin-border);
    padding-top: 18px;
    color: var(--admin-muted);
    font-size: 0.86rem;
    line-height: 1.6;
  }
  .activation-note {
    margin: -4px 0 0;
    color: var(--admin-danger-text);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .core-note {
    margin: 0;
    border: 1px solid var(--admin-border);
    border-radius: 12px;
    padding: 12px 14px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font-size: 0.84rem;
    font-weight: 800;
  }
  button {
    border: 0;
    cursor: pointer;
  }
  .plugin-panel button {
    width: fit-content;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font: inherit;
    font-weight: 850;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  @media (prefers-color-scheme: dark) {
    .plugin-panel {
      --toggle-border: var(--admin-border);
      --toggle-surface: var(--admin-surface);
      --toggle-primary: var(--admin-primary);
      --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    }
    .disabled-note {
      color: var(--admin-muted);
    }
    .core-note {
      color: var(--admin-muted);
    }
  }
</style>
