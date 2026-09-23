<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { enhance } from '$app/forms';
  import AdminPluginShell from '$lib/components/admin/AdminPluginShell.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
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
  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<AdminPluginShell
  {data}
  {form}
  backHref="/admin/plugins"
  backLabel={text.admin.plugins.listBack}
>
  <section class="plugin-panel">
    <Card.Root
      class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
      ><Card.Content class="p-5 sm:p-6">
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
              <Button type="submit">{text.admin.plugins.saveActivation}</Button>
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
            <Button type="submit">{text.admin.plugins.saveSettings}</Button>
          </form>
        {/if}
      </Card.Content></Card.Root
    >
  </section>
</AdminPluginShell>

<style>
  .plugin-panel {
    display: grid;
    gap: 14px;
    min-width: 0;
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
    border-radius: var(--ui-radius, 8px);
    padding: 12px 14px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font-size: 0.84rem;
    font-weight: 600;
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
