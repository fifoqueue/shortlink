import type {
  ClickMetadataDisplayItem,
  ClickMetadataSearchField,
  AuthenticatedUser,
  PluginConfig,
  PluginDefinition,
  PluginGuardResult,
  PluginProtectedAction,
  PluginState,
} from '$lib/plugin-contracts';
import { defaultSiteLocale, type SiteLocale } from '$lib/config';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import { pluginFolderFromPath } from './utils';

type PluginModule = { default: PluginDefinition };
type ServerPluginModule = {
  default: Partial<
    Pick<
      PluginDefinition,
      | 'canAccessAdminAction'
      | 'canAccessAdminSubpage'
      | 'canDisable'
      | 'canEnable'
      | 'handleAdminAction'
      | 'handleAdminSubpageAction'
      | 'handleAccountAction'
      | 'handleUserAdminAction'
      | 'handleRequest'
      | 'collectClickMetadata'
      | 'formatClickMetadata'
      | 'getClickMetadataSearchFields'
      | 'loadAccountData'
      | 'loadAdminData'
      | 'loadAdminSubpage'
      | 'loadUserAdminData'
      | 'validateConfig'
      | 'verifyFormSubmission'
    >
  >;
};

const modules = import.meta.glob<PluginModule>('./*/plugin.ts', {
  eager: true,
});
const serverModules = import.meta.glob<ServerPluginModule>('./*/server.ts', {
  eager: true,
});

export const pluginDefinitions = Object.entries(modules)
  .map(([path, module]) => {
    const folder = pluginFolderFromPath(path);
    const definition = module.default;
    if (definition.meta.id !== folder) {
      throw new Error(
        `Plugin "${folder}" must use the same meta.id (received "${definition.meta.id}").`,
      );
    }
    return {
      ...definition,
      ...serverModules[`./${folder}/server.ts`]?.default,
    };
  })
  .sort(
    (left, right) =>
      (left.meta.order ?? 100) - (right.meta.order ?? 100) ||
      left.meta.name.localeCompare(right.meta.name),
  );

export function isRequiredPlugin(definition: PluginDefinition) {
  return definition.meta.required === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeConfig(defaults: PluginConfig, value: unknown): PluginConfig {
  if (!isRecord(value)) return structuredClone(defaults);
  return { ...structuredClone(defaults), ...structuredClone(value) };
}

export function normalizePluginStates(
  value: unknown,
): Record<string, PluginState> {
  const raw = isRecord(value) ? value : {};
  const normalized: Record<string, PluginState> = {};

  for (const definition of pluginDefinitions) {
    const directCandidate = raw[definition.meta.id];
    const candidate: Record<string, unknown> = isRecord(directCandidate)
      ? directCandidate
      : {};
    normalized[definition.meta.id] = {
      enabled: isRequiredPlugin(definition) || candidate.enabled === true,
      config: mergeConfig(
        definition.defaultConfig,
        isRecord(candidate.config) ? candidate.config : undefined,
      ),
    };
  }

  return normalized;
}

export function getPublicPluginStates(
  states: Record<string, PluginState>,
): Record<string, PluginState> {
  return Object.fromEntries(
    pluginDefinitions.map((definition) => {
      const state = states[definition.meta.id] ?? {
        enabled: isRequiredPlugin(definition),
        config: definition.defaultConfig,
      };
      return [
        definition.meta.id,
        {
          enabled: isRequiredPlugin(definition) || state.enabled,
          config: definition.publicConfig
            ? definition.publicConfig(state.config)
            : structuredClone(state.config),
        },
      ];
    }),
  );
}

export function parsePluginStates(
  form: FormData,
  current: Record<string, PluginState>,
  defaultLocale: SiteLocale = defaultSiteLocale,
  settings?: import('$lib/config').SiteSettings,
) {
  const next = { ...current };
  for (const definition of pluginDefinitions) {
    const existing = current[definition.meta.id] ?? {
      enabled: isRequiredPlugin(definition),
      config: definition.defaultConfig,
    };
    next[definition.meta.id] = {
      enabled:
        isRequiredPlugin(definition) ||
        form.get(`plugin.${definition.meta.id}.enabled`) === 'on',
      config: definition.parseConfig(form, existing.config, {
        defaultLocale,
        locale: defaultLocale,
        fallbackLocale: defaultLocale,
        strings: pluginLocaleStrings(definition, defaultLocale, defaultLocale),
        settings,
      }),
    };
  }
  return next;
}

export function applyCreateUrlPlugins(
  url: URL,
  form: FormData,
  states: Record<string, PluginState>,
) {
  let result = url;
  for (const definition of pluginDefinitions) {
    const state = states[definition.meta.id];
    if (state?.enabled && definition.transformCreateUrl) {
      result = definition.transformCreateUrl(result, form, state.config);
    }
  }
  return result;
}

export async function verifyFormSubmissionPlugins(input: {
  action: PluginProtectedAction;
  form: FormData;
  request: Request;
  url: URL;
  states: Record<string, PluginState>;
  user: AuthenticatedUser | null;
  isAdmin: boolean;
  ip: string;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
}): Promise<PluginGuardResult> {
  if (input.isAdmin) return { allowed: true };

  for (const definition of pluginDefinitions) {
    const state = input.states[definition.meta.id];
    if (!state?.enabled || !definition.verifyFormSubmission) continue;

    const result = await definition.verifyFormSubmission({
      action: input.action,
      form: input.form,
      request: input.request,
      url: input.url,
      state,
      user: input.user,
      isAdmin: input.isAdmin,
      ip: input.ip,
      locale: input.locale,
      fallbackLocale: input.fallbackLocale,
      strings: pluginLocaleStrings(
        definition,
        input.locale,
        input.fallbackLocale,
      ),
    });
    if (!result.allowed) return result;
  }

  return { allowed: true };
}

export async function handleRequestPlugins(input: {
  event: import('@sveltejs/kit').RequestEvent;
  states: Record<string, PluginState>;
  user: AuthenticatedUser | null;
  isAdmin: boolean;
  ip: string;
}) {
  for (const definition of pluginDefinitions) {
    const state = input.states[definition.meta.id];
    if (!state?.enabled || !definition.handleRequest) continue;

    const response = await definition.handleRequest({
      event: input.event,
      state,
      user: input.user,
      isAdmin: input.isAdmin,
      ip: input.ip,
    });
    if (response) return response;
  }

  return null;
}

export async function collectClickMetadataPlugins(input: {
  request: Request;
  ip: string;
  states: Record<string, PluginState>;
  settings: import('$lib/config').SiteSettings;
}) {
  const metadata: Record<string, unknown> = {};

  for (const definition of pluginDefinitions) {
    const state = input.states[definition.meta.id];
    if (!state?.enabled || !definition.collectClickMetadata) continue;

    const value = await definition.collectClickMetadata({
      request: input.request,
      ip: input.ip,
      state,
      settings: input.settings,
    });
    if (value && Object.keys(value).length > 0) {
      metadata[definition.meta.id] = value;
    }
  }

  return metadata;
}

export async function formatClickMetadataPlugins(input: {
  metadata: Record<string, unknown>;
  states: Record<string, PluginState>;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const entries: ClickMetadataDisplayItem[] = [];

  for (const definition of clickMetadataFormatters(input.states)) {
    entries.push(
      ...(await definition.formatClickMetadata({
        metadata: input.metadata[definition.meta.id],
        state: definition.state,
        isAdmin: input.isAdmin,
        isOwner: input.isOwner,
      })),
    );
  }

  return entries;
}

export async function formatClickMetadataListPlugins(input: {
  metadataItems: Array<Record<string, unknown>>;
  states: Record<string, PluginState>;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const formatters = clickMetadataFormatters(input.states);
  const rows: ClickMetadataDisplayItem[][] = input.metadataItems.map(() => []);
  if (formatters.length === 0 || rows.length === 0) return rows;

  for (const definition of formatters) {
    await Promise.all(
      input.metadataItems.map(async (metadata, index) => {
        rows[index].push(
          ...(await definition.formatClickMetadata({
            metadata: metadata[definition.meta.id],
            state: definition.state,
            isAdmin: input.isAdmin,
            isOwner: input.isOwner,
          })),
        );
      }),
    );
  }

  return rows;
}

function clickMetadataFormatters(states: Record<string, PluginState>) {
  return pluginDefinitions.flatMap((definition) => {
    const state = states[definition.meta.id];
    if (!state?.enabled || !definition.formatClickMetadata) return [];
    return [
      {
        meta: definition.meta,
        formatClickMetadata: definition.formatClickMetadata,
        state,
      },
    ];
  });
}

export async function getClickMetadataSearchFieldsPlugins(input: {
  states: Record<string, PluginState>;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const fields: Array<
    ClickMetadataSearchField & { pluginId: string; pluginName: string }
  > = [];

  for (const definition of pluginDefinitions) {
    const state = input.states[definition.meta.id];
    if (!state?.enabled || !definition.getClickMetadataSearchFields) continue;

    const pluginFields = await definition.getClickMetadataSearchFields({
      state,
      isAdmin: input.isAdmin,
      isOwner: input.isOwner,
    });

    fields.push(
      ...pluginFields.map((field) => ({
        ...field,
        pluginId: definition.meta.id,
        pluginName: definition.meta.name,
      })),
    );
  }

  return fields;
}
