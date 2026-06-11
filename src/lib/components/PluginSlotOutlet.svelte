<script lang="ts">
  import type {
    AuthenticatedUser,
    PluginSlot,
    PluginState,
    RegisteredPlugin,
  } from '$lib/plugin-contracts';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { pluginLocaleStrings } from '$lib/i18n/plugin';

  let {
    registry,
    states,
    slot,
    user = undefined,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
  }: {
    registry: RegisteredPlugin[];
    states: Record<string, PluginState | undefined>;
    slot: PluginSlot;
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
