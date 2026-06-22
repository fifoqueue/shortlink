<script lang="ts">
  import AdminPluginShell from '$lib/components/admin/AdminPluginShell.svelte';
  import type {
    PluginIntegrationData,
    PluginLocaleStrings,
    PluginMeta,
    PluginState,
  } from '$lib/plugin-contracts';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import { adminPluginRegistry } from '../../../../../plugins/admin-registry';

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
      item: string;
      adminData: unknown;
      permissions: {
        isAdmin: boolean;
        admin: { sections: string[] };
      };
      integrations: PluginIntegrationData[];
      theme: import('$lib/config').SiteSettings['theme'];
      customHead: string;
      siteName: string;
      logoUrl: string;
    };
    form?: { ok?: boolean; message?: string };
  } = $props();

  const registered = $derived(
    adminPluginRegistry.find(
      (plugin) => plugin.definition.meta.id === data.plugin.id,
    ),
  );
  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<AdminPluginShell
  {data}
  {form}
  backHref={`/admin/plugins/${data.plugin.id}`}
  backLabel={data.plugin.name}
>
  <section class="plugin-panel">
    {#if registered?.adminSubpage}
      {@const PluginAdminSubpage = registered.adminSubpage}
      <PluginAdminSubpage
        config={data.state.config}
        adminData={data.adminData}
        item={data.item}
        integrations={data.integrations}
        locale={data.locale}
        fallbackLocale={data.defaultLocale}
        strings={data.pluginStrings}
      />
    {:else}
      <p>{text.admin.plugins.noSubpage}</p>
    {/if}
  </section>
</AdminPluginShell>

<style>
  p,
  .plugin-panel {
    margin: 0;
    color: var(--admin-muted);
    line-height: 1.6;
  }
  .plugin-panel {
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.8);
    padding: 26px;
    background: var(--admin-panel);
  }
</style>
