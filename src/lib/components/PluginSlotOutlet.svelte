<script lang="ts">
  import type {
    AuthenticatedUser,
    PluginSlot,
    PluginState,
    RegisteredPlugin,
    RuntimePluginSlotRender,
  } from '$lib/plugin-contracts';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { pluginLocaleStrings } from '$lib/i18n/plugin';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';

  let {
    registry,
    states,
    slot,
    runtimeSlots = [],
    user = undefined,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
  }: {
    registry: RegisteredPlugin[];
    states: Record<string, PluginState | undefined>;
    slot: PluginSlot;
    runtimeSlots?: RuntimePluginSlotRender[];
    user?: AuthenticatedUser | null;
    locale?: SiteLocale;
    fallbackLocale?: SiteLocale;
  } = $props();
</script>

{#each registry as plugin (plugin.definition.meta.id)}
  {@const state = states[plugin.definition.meta.id]}
  {@const SlotComponent = plugin.slots[slot]}
  {@const strings = pluginLocaleStrings(
    plugin.definition,
    locale,
    fallbackLocale,
  )}
  {#if state?.enabled && SlotComponent}
    <SlotComponent
      config={state.config}
      {user}
      {locale}
      {fallbackLocale}
      {strings}
    />
  {/if}
{/each}

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
