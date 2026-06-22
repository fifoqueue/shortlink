<script lang="ts">
  import type { Snippet } from 'svelte';
  import { adminSections } from '$lib/admin-sections';
  import AdminShell from '$lib/components/AdminShell.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import type { PluginMeta } from '$lib/plugin-contracts';

  type PluginShellData = {
    plugin: PluginMeta;
    locale: SiteLocale;
    defaultLocale: SiteLocale;
    permissions: {
      isAdmin: boolean;
      admin: { sections: string[] };
    };
    theme: SiteSettings['theme'];
    customHead: string;
    siteName: string;
    logoUrl: string;
  };

  let {
    data,
    form,
    backHref,
    backLabel,
    children,
  }: {
    data: PluginShellData;
    form?: { ok?: boolean; message?: string };
    backHref: string;
    backLabel: string;
    children: Snippet;
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
  const allowedAdminSections = $derived(
    data.permissions.isAdmin
      ? adminSections
      : adminSections.filter((section) =>
          data.permissions.admin.sections.includes(section.id),
        ),
  );
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
  {backHref}
  {backLabel}
  sections={allowedAdminSections}
  customHead={data.customHead}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} />
    {/key}
  {/if}

  {@render children()}
</AdminShell>
