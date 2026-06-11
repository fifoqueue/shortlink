import type {
  PluginDefinition,
  PluginLocaleKey,
  PluginLocaleStrings,
  PluginMeta,
} from '$lib/plugin-contracts';
import type { SiteLocale } from '$lib/config';

export function localizedPluginMeta(
  definition: PluginDefinition,
  locale: SiteLocale,
  fallbackLocale: SiteLocale = locale,
): PluginMeta {
  const localized =
    definition.translations?.[locale]?.meta ??
    definition.translations?.[fallbackLocale]?.meta;
  return localized ? { ...definition.meta, ...localized } : definition.meta;
}

export function pluginLocaleStrings(
  definition: PluginDefinition,
  locale: SiteLocale,
  fallbackLocale: SiteLocale = locale,
): PluginLocaleStrings {
  return (
    definition.translations?.[locale]?.strings ??
    definition.translations?.[fallbackLocale]?.strings ??
    {}
  );
}

export function pluginText(
  strings: PluginLocaleStrings | undefined,
  key: PluginLocaleKey,
  fallback: string = key,
) {
  return strings?.[key] ?? fallback;
}
