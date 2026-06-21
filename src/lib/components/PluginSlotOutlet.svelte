<script lang="ts">
  import PluginRuntimeSlot from '$lib/components/plugin-slots/PluginRuntimeSlot.svelte';
  import type { SiteLocale } from '$lib/config';
  import type { PluginSlot } from '$lib/plugin-contracts';
  import type { PublicPluginSlots } from '$lib/public-plugin-slots';
  import { publicSlotRegistry } from '../../plugins/public-registry';

  let {
    slots,
    slot,
    locale,
    fallbackLocale,
  }: {
    slots: PublicPluginSlots;
    slot: PluginSlot;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
  } = $props();
</script>

{#each slots.componentSlots as componentSlot, index (`${componentSlot.pluginId}:${componentSlot.slot}:${index}`)}
  {#if componentSlot.slot === slot}
    {@const SlotComponent = publicSlotRegistry[componentSlot.pluginId]?.[slot]}
    {#if SlotComponent}
      <SlotComponent
        config={componentSlot.config}
        strings={componentSlot.strings}
        {locale}
        {fallbackLocale}
      />
    {/if}
  {/if}
{/each}

<PluginRuntimeSlot
  runtimeSlots={slots.runtimeSlots}
  {slot}
  {locale}
  {fallbackLocale}
/>
