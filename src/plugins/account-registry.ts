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
const accountModules = import.meta.glob<ComponentModule>(
  ['./*/Account.svelte', '../user-plugins/*/Account.svelte'],
  {
    eager: true,
  },
);
const seenPluginIds = new Set<string>();

export const accountPluginRegistry = Object.entries(definitionModules)
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
      account:
        pluginModuleFromFolder(accountModules, folder, 'Account.svelte')
          ?.default ?? null,
    };
  })
  .sort(
    (left, right) =>
      (left.definition.meta.order ?? 100) -
        (right.definition.meta.order ?? 100) ||
      left.definition.meta.name.localeCompare(right.definition.meta.name),
  );
