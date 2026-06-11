import type { PluginConfig } from '$lib/plugin-contracts';
export { isHttpHeaderName, parseDelimitedLines } from '$lib/delimited';

export function fieldName(pluginId: string, field: string) {
  return `plugin.${pluginId}.${field}`;
}

export function pluginFolderFromPath(path: string) {
  return path.split('/')[1];
}

export function pluginString(
  form: FormData,
  pluginId: string,
  field: string,
  fallback = '',
) {
  const value = form.get(fieldName(pluginId, field));
  return value === null ? fallback : String(value).trim();
}

export function pluginChecked(form: FormData, pluginId: string, field: string) {
  return form.get(fieldName(pluginId, field)) === 'on';
}

export function configString(
  config: PluginConfig,
  field: string,
  fallback = '',
) {
  const value = config[field];
  return typeof value === 'string' ? value : fallback;
}

export function configStringArray(config: PluginConfig, field: string) {
  const value = config[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
