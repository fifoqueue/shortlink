import {
  createComponentPluginRegistry,
  type ComponentModule,
  type PluginModule,
} from './component-registry';

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
export const userAdminPluginRegistry = createComponentPluginRegistry(
  definitionModules,
  userAdminModules,
  'UserAdmin.svelte',
  'userAdmin',
);
