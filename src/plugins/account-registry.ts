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
const accountModules = import.meta.glob<ComponentModule>(
  ['./*/Account.svelte', '../user-plugins/*/Account.svelte'],
  {
    eager: true,
  },
);
export const accountPluginRegistry = createComponentPluginRegistry(
  definitionModules,
  accountModules,
  'Account.svelte',
  'account',
);
