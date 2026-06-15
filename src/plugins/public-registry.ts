import type { Component } from 'svelte';
import type {
  PluginComponentProps,
  PluginDefinition,
  PluginSlot,
  RegisteredPlugin,
} from '$lib/plugin-contracts';
import { assertUniquePluginId, pluginFolderFromPath } from './utils';

type PluginModule = { default: PluginDefinition };
type ComponentModule = { default: Component<PluginComponentProps> };

const definitionModules = import.meta.glob<PluginModule>(
  ['./*/plugin.ts', '../user-plugins/*/plugin.ts'],
  {
    eager: true,
  },
);
const slotModules = import.meta.glob<ComponentModule>(
  ['./*/slots/*.svelte', '../user-plugins/*/slots/*.svelte'],
  {
    eager: true,
  },
);
const seenPluginIds = new Set<string>();

function slotFromPath(path: string): PluginSlot {
  const filename = path.split('/').at(-1)?.replace('.svelte', '') ?? '';
  return filename as PluginSlot;
}

export const publicPluginRegistry: RegisteredPlugin[] = Object.entries(
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
    assertUniquePluginId(seenPluginIds, definition.meta.id, path);

    const slots: RegisteredPlugin['slots'] = {};
    for (const [slotPath, slotModule] of Object.entries(slotModules)) {
      if (pluginFolderFromPath(slotPath) === folder) {
        slots[slotFromPath(slotPath)] = slotModule.default;
      }
    }

    return { definition, admin: null, adminSubpage: null, slots };
  })
  .sort(
    (left, right) =>
      (left.definition.meta.order ?? 100) -
        (right.definition.meta.order ?? 100) ||
      left.definition.meta.name.localeCompare(right.definition.meta.name),
  );
