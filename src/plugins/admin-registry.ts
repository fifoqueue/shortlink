import type { Component } from 'svelte';
import type {
  PluginComponentProps,
  PluginDefinition,
  RegisteredPlugin,
} from '$lib/plugin-contracts';
import { pluginFolderFromPath } from './utils';

type PluginModule = { default: PluginDefinition };
type ComponentModule = { default: Component<PluginComponentProps> };

const definitionModules = import.meta.glob<PluginModule>('./*/plugin.ts', {
  eager: true,
});
const adminModules = import.meta.glob<ComponentModule>('./*/Admin.svelte', {
  eager: true,
});
const adminSubpageModules = import.meta.glob<ComponentModule>(
  './*/AdminSubpage.svelte',
  {
    eager: true,
  },
);

export const adminPluginRegistry: RegisteredPlugin[] = Object.entries(
  definitionModules,
)
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
      admin: adminModules[`./${folder}/Admin.svelte`]?.default ?? null,
      adminSubpage:
        adminSubpageModules[`./${folder}/AdminSubpage.svelte`]?.default ?? null,
      slots: {},
    };
  })
  .sort(
    (left, right) =>
      (left.definition.meta.order ?? 100) -
        (right.definition.meta.order ?? 100) ||
      left.definition.meta.name.localeCompare(right.definition.meta.name),
  );
