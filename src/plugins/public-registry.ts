import type { Component } from 'svelte';
import type { PluginComponentProps, PluginSlot } from '$lib/plugin-contracts';
import { pluginFolderFromPath } from './utils';

type ComponentModule = { default: Component<PluginComponentProps> };

const slotModules = import.meta.glob<ComponentModule>(
  ['./*/slots/*.svelte', '../user-plugins/*/slots/*.svelte'],
  {
    eager: true,
  },
);

function slotNameFromPath(path: string): PluginSlot {
  return (path.split('/').at(-1) ?? '').replace(/\.svelte$/, '') as PluginSlot;
}

export const publicSlotRegistry = Object.entries(slotModules).reduce<
  Record<string, Partial<Record<PluginSlot, Component<PluginComponentProps>>>>
>((registry, [path, module]) => {
  const pluginId = pluginFolderFromPath(path);
  registry[pluginId] ??= {};
  registry[pluginId][slotNameFromPath(path)] = module.default;
  return registry;
}, {});
