import type { PluginConfig } from '$lib/plugin-contracts';
export { isHttpHeaderName, parseDelimitedLines } from '$lib/delimited';

export function fieldName(pluginId: string, field: string) {
  return `plugin.${pluginId}.${field}`;
}

export function pluginFolderFromPath(path: string) {
  const parts = path.split('/');
  const markerIndex = parts.findIndex(
    (part) => part === 'plugins' || part === 'user-plugins',
  );
  if (markerIndex >= 0) return parts[markerIndex + 1] ?? '';
  return parts[0] === '.' ? (parts[1] ?? '') : (parts.at(-2) ?? '');
}

export function pluginModuleFromFolder<T>(
  modules: Record<string, T>,
  folder: string,
  filename: string,
) {
  return Object.entries(modules).find(
    ([path]) =>
      pluginFolderFromPath(path) === folder && path.endsWith(`/${filename}`),
  )?.[1];
}

export function assertUniquePluginId(
  seen: Set<string>,
  pluginId: string,
  path: string,
) {
  if (seen.has(pluginId)) {
    throw new Error(`Duplicate plugin id "${pluginId}" detected at ${path}.`);
  }
  seen.add(pluginId);
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
