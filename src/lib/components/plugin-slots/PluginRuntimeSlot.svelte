<script lang="ts">
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import type {
    PluginSlot,
    RuntimePluginSlotRender,
  } from '$lib/plugin-contracts';
  import type { SiteLocale } from '$lib/config';

  let {
    runtimeSlots,
    slot,
    locale,
    fallbackLocale,
  }: {
    runtimeSlots: RuntimePluginSlotRender[];
    slot: PluginSlot;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
  } = $props();
</script>

{#each runtimeSlots as runtimeSlot (`${runtimeSlot.pluginId}:${runtimeSlot.slot}`)}
  {#if runtimeSlot.slot === slot}
    {#if runtimeSlot.ui.mode === 'schema' && runtimeSlot.ui.schema}
      <RuntimePluginSchemaForm schema={runtimeSlot.ui.schema} />
    {:else if runtimeSlot.ui.mode === 'iframe' && runtimeSlot.ui.src}
      <RuntimePluginFrame
        src={runtimeSlot.ui.src}
        pluginId={runtimeSlot.pluginId}
        config={runtimeSlot.config}
        adminData={undefined}
        {locale}
        {fallbackLocale}
        strings={runtimeSlot.strings}
      />
    {/if}
  {/if}
{/each}
