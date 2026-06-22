import type { Component } from 'svelte';
import type {
  PluginComponentProps,
  PluginDefinition,
} from '$lib/plugin-contracts';
import {
  assertUniquePluginId,
  pluginFolderFromPath,
  pluginModuleFromFolder,
} from './utils';

export type PluginModule = { default: PluginDefinition };
export type ComponentModule = { default: Component<PluginComponentProps> };

export function createComponentPluginRegistry<Key extends string>(
  definitionModules: Record<string, PluginModule>,
  componentModules: Record<string, ComponentModule>,
  componentFile: string,
  componentKey: Key,
) {
  const seenPluginIds = new Set<string>();
  return Object.entries(definitionModules)
    .map(([path, module]) => {
      const folder = pluginFolderFromPath(path);
      const definition = module.default;
      if (definition.meta.id !== folder) {
        throw new Error(
          `Plugin "${folder}" must use the same meta.id (received "${definition.meta.id}").`,
        );
      }
      assertUniquePluginId(seenPluginIds, definition.meta.id, path);

      return {
        definition,
        [componentKey]:
          pluginModuleFromFolder(componentModules, folder, componentFile)
            ?.default ?? null,
      } as { definition: PluginDefinition } & Record<
        Key,
        Component<PluginComponentProps> | null
      >;
    })
    .sort(
      (left, right) =>
        (left.definition.meta.order ?? 100) -
          (right.definition.meta.order ?? 100) ||
        left.definition.meta.name.localeCompare(right.definition.meta.name),
    );
}
