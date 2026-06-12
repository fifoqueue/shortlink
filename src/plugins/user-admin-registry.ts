import type { Component } from 'svelte';
import type {
  PluginComponentProps,
  PluginDefinition,
} from '$lib/plugin-contracts';
import { pluginFolderFromPath } from './utils';

type PluginModule = { default: PluginDefinition };
type ComponentModule = { default: Component<PluginComponentProps> };

const definitionModules = import.meta.glob<PluginModule>('./*/plugin.ts', {
  eager: true,
});
const userAdminModules = import.meta.glob<ComponentModule>(
  './*/UserAdmin.svelte',
  {
    eager: true,
  },
);

export const userAdminPluginRegistry = Object.entries(definitionModules)
  .map(([path, module]) => {
    const folder = pluginFolderFromPath(path);
    const definition = module.default;
    if (definition.meta.id !== folder) {
      throw new Error(
        `Plugin "${folder}" must use the same meta.id (received "${definition.meta.id}").`,
      );
    }

    return {
      definition,
      userAdmin:
        userAdminModules[`./${folder}/UserAdmin.svelte`]?.default ?? null,
    };
  })
  .sort(
    (left, right) =>
      (left.definition.meta.order ?? 100) -
        (right.definition.meta.order ?? 100) ||
      left.definition.meta.name.localeCompare(right.definition.meta.name),
  );
