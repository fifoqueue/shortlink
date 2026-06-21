import type { SiteLocale } from '$lib/config';
import type { PluginLocaleStrings, PluginSlot } from '$lib/plugin-contracts';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import { pluginDefinitions } from '../../../plugins/server';

export function slotSet(slots: readonly PluginSlot[] | undefined) {
  return slots ? new Set(slots) : null;
}

export function slotAllowed(
  slots: ReadonlySet<PluginSlot> | null,
  slot: PluginSlot,
) {
  return !slots || slots.has(slot);
}

export function publicPluginStrings(
  pluginId: string,
  locale: SiteLocale,
  fallbackLocale: SiteLocale,
): PluginLocaleStrings {
  const definition = pluginDefinitions.find(
    (plugin) => plugin.meta.id === pluginId,
  );
  if (!definition) return {};
  return Object.fromEntries(
    Object.entries(pluginLocaleStrings(definition, locale, fallbackLocale))
      .filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith('public.') && typeof entry[1] === 'string',
      )
      .map(([key, value]) => [key, value]),
  ) as PluginLocaleStrings;
}
