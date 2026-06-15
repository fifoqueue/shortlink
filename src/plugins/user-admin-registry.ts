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

type PluginModule = { default: PluginDefinition };
type ComponentModule = { default: Component<PluginComponentProps> };

const definitionModules = import.meta.glob<PluginModule>(
  ['./*/plugin.ts', '../user-plugins/*/plugin.ts'],
  {
    eager: true,
  },
);
const userAdminModules = import.meta.glob<ComponentModule>(
  ['./*/UserAdmin.svelte', '../user-plugins/*/UserAdmin.svelte'],
  {
    eager: true,
  },
);
const seenPluginIds = new Set<string>();

export const userAdminPluginRegistry = Object.entries(definitionModules)
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
      userAdmin:
        pluginModuleFromFolder(userAdminModules, folder, 'UserAdmin.svelte')
          ?.default ?? null,
    };
  })
  .sort(
    (left, right) =>
      (left.definition.meta.order ?? 100) -
        (right.definition.meta.order ?? 100) ||
      left.definition.meta.name.localeCompare(right.definition.meta.name),
  );
