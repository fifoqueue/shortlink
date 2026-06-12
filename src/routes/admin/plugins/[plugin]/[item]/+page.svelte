<script lang="ts">
  import AdminShell from '$lib/components/AdminShell.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import { adminSections } from '$lib/admin-sections';
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
  backHref={`/admin/plugins/${data.plugin.id}`}
  backLabel={data.plugin.name}
  sections={allowedAdminSections}
  customHead={data.customHead}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} />
    {/key}
  {/if}

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
</AdminShell>

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
