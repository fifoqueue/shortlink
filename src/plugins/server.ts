import type {
  ClickMetadataDisplayItem,
  ClickMetadataSearchField,
  AuthenticatedUser,
  PluginConfig,
  PluginDefinition,
  PluginGuardResult,
  PluginLocaleStrings,
  PluginProtectedAction,
  PluginSlot,
  RuntimePluginSlotRender,
  PluginState,
} from '$lib/plugin-contracts';
import { defaultSiteLocale, type SiteLocale } from '$lib/config';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import {
  registerOutboundProxyProtocol,
  registerOutboundProxyResolver,
  unregisterOutboundProxyProtocol,
} from '$lib/server/outbound-http';
import {
  getRuntimePluginDefinitions,
  refreshRuntimePlugins as refreshRuntimePluginDefinitions,
} from '$lib/server/runtime-plugins';
import {
  assertUniquePluginId,
  pluginFolderFromPath,
  pluginModuleFromFolder,
} from './utils';

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
      | 'outboundProxyProtocols'
      | 'handleOutboundProxyRequest'
      | 'handleOutboundProxyConnect'
      | 'loadAccountData'
      | 'loadAdminData'
      | 'loadAdminSubpage'
      | 'loadUserAdminData'
      | 'resolveOutboundProxy'
      | 'validateConfig'
      | 'verifyFormSubmission'
    >
  >;
};

const modules = import.meta.glob<PluginModule>(
  ['./*/plugin.ts', '../user-plugins/*/plugin.ts'],
  {
    eager: true,
  },
);
const serverModules = import.meta.glob<ServerPluginModule>(
  ['./*/server.ts', '../user-plugins/*/server.ts'],
  {
    eager: true,
  },
);
const builtInProxyProtocols = new Set(['http', 'https', 'socks5', 'socks5h']);
const registeredPluginProxyProtocols = new Set<string>();
const seenPluginIds = new Set<string>();

const staticPluginDefinitions = Object.entries(modules)
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
      ...definition,
      ...pluginModuleFromFolder(serverModules, folder, 'server.ts')?.default,
    };
  })
  .sort(
    (left, right) =>
      (left.meta.order ?? 100) - (right.meta.order ?? 100) ||
      left.meta.name.localeCompare(right.meta.name),
  );

export let pluginDefinitions = [...staticPluginDefinitions];

function sortPluginDefinitions(definitions: PluginDefinition[]) {
  return [...definitions].sort(
    (left, right) =>
      (left.meta.order ?? 100) - (right.meta.order ?? 100) ||
      left.meta.name.localeCompare(right.meta.name),
  );
}

function assertUniqueRuntimePluginIds(definitions: PluginDefinition[]) {
  const seen = new Set<string>();
  for (const definition of definitions) {
    assertUniquePluginId(seen, definition.meta.id, definition.meta.id);
  }
}

function syncOutboundProxyProtocols() {
  for (const protocol of registeredPluginProxyProtocols) {
    unregisterOutboundProxyProtocol(protocol);
  }
  registeredPluginProxyProtocols.clear();

  const pluginProtocols = new Set<string>();
  for (const definition of pluginDefinitions) {
    for (const protocol of definition.outboundProxyProtocols ?? []) {
      const normalized = protocol.protocol
        .trim()
        .replace(/:$/, '')
        .toLowerCase();
      if (builtInProxyProtocols.has(normalized)) {
        throw new Error(
          `Plugin "${definition.meta.id}" cannot replace built-in outbound proxy protocol "${normalized}".`,
        );
      }
      if (pluginProtocols.has(normalized)) {
        throw new Error(
          `Duplicate outbound proxy protocol "${normalized}" was registered by plugins.`,
        );
      }
      pluginProtocols.add(normalized);
      registeredPluginProxyProtocols.add(normalized);
      registerOutboundProxyProtocol({
        protocol: protocol.protocol,
        defaultPort: protocol.defaultPort,
        request: async (input) => {
          const state = input.settings.plugins[definition.meta.id];
          if (!state?.enabled || !definition.handleOutboundProxyRequest) {
            throw new Error(
              `Outbound proxy protocol "${protocol.protocol}" is not available.`,
            );
          }

          const result = await definition.handleOutboundProxyRequest({
            url: input.url,
            method: input.method,
            headers: input.headers,
            body: new Uint8Array(
              input.body.buffer,
              input.body.byteOffset,
              input.body.byteLength,
            ),
            proxy: {
              protocol: input.proxy.protocol,
              host: input.proxy.host,
              port: input.proxy.port,
              username: input.proxy.username,
              password: input.proxy.password,
              rawUrl: input.proxy.rawUrl,
              searchParams: input.proxy.searchParams,
            },
            purpose: input.purpose,
            signal: input.signal,
            timeoutMs: input.timeoutMs,
            state,
            settings: input.settings,
          });

          return {
            url: result.url,
            status: result.status,
            statusText: result.statusText ?? '',
            headers: result.headers ?? {},
            body: result.body ?? '',
          };
        },
        connect: async (input) => {
          const state = input.settings.plugins[definition.meta.id];
          if (!state?.enabled || !definition.handleOutboundProxyConnect) {
            throw new Error(
              `Outbound proxy protocol "${protocol.protocol}" cannot open raw sockets.`,
            );
          }

          return definition.handleOutboundProxyConnect({
            host: input.host,
            port: input.port,
            secure: input.secure,
            servername: input.servername,
            proxy: {
              protocol: input.proxy.protocol,
              host: input.proxy.host,
              port: input.proxy.port,
              username: input.proxy.username,
              password: input.proxy.password,
              rawUrl: input.proxy.rawUrl,
              searchParams: input.proxy.searchParams,
            },
            purpose: input.purpose,
            signal: input.signal,
            timeoutMs: input.timeoutMs,
            state,
            settings: input.settings,
          });
        },
      });
    }
  }
}

export async function refreshRuntimePlugins(input: { force?: boolean } = {}) {
  const changed = await refreshRuntimePluginDefinitions({
    force: input.force,
    reservedPluginIds: staticPluginDefinitions.map(
      (definition) => definition.meta.id,
    ),
  });
  if (!changed && pluginDefinitions.length !== staticPluginDefinitions.length) {
    return false;
  }
  const next = sortPluginDefinitions([
    ...staticPluginDefinitions,
    ...getRuntimePluginDefinitions(),
  ]);
  assertUniqueRuntimePluginIds(next);
  pluginDefinitions = next;
  syncOutboundProxyProtocols();
  return changed;
}

syncOutboundProxyProtocols();

registerOutboundProxyResolver(async (input) => {
  for (const definition of pluginDefinitions) {
    const state = input.settings.plugins[definition.meta.id];
    if (!state?.enabled || !definition.resolveOutboundProxy) continue;
    const proxy = await definition.resolveOutboundProxy({
      url: input.url,
      purpose: input.purpose,
      state,
      settings: input.settings,
    });
    if (proxy) {
      return {
        protocol: proxy.protocol,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username ?? '',
        password: proxy.password ?? '',
        rawUrl: proxy.rawUrl,
        searchParams: proxy.searchParams,
      };
    }
  }

  return null;
});

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

export function publicPluginConfig(
  definition: PluginDefinition,
  state: PluginState,
): PluginConfig {
  return definition.publicConfig ? definition.publicConfig(state.config) : {};
}

export function hasEnabledRequestPlugin(states: Record<string, PluginState>) {
  return pluginDefinitions.some((definition) => {
    const state = states[definition.meta.id];
    return state?.enabled === true && Boolean(definition.handleRequest);
  });
}

function publicLocaleStrings(
  strings: PluginLocaleStrings,
): PluginLocaleStrings {
  return Object.fromEntries(
    Object.entries(strings).filter(([key]) => key.startsWith('public.')),
  ) as PluginLocaleStrings;
}

export async function loadRuntimePluginSlots(input: {
  states: Record<string, PluginState>;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
  user: AuthenticatedUser | null;
  slots?: readonly PluginSlot[];
}) {
  const allowedSlots = input.slots ? new Set(input.slots) : null;
  const slotGroups = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const slots: RuntimePluginSlotRender[] = [];
      const state = input.states[definition.meta.id];
      if (!state?.enabled || !definition.runtime?.slots) return slots;
      const strings = pluginLocaleStrings(
        definition,
        input.locale,
        input.fallbackLocale,
      );
      for (const [slot, descriptor] of Object.entries(
        definition.runtime.slots,
      ) as Array<
        [PluginSlot, NonNullable<typeof definition.runtime.slots>[PluginSlot]]
      >) {
        if (!descriptor) continue;
        if (allowedSlots && !allowedSlots.has(slot)) continue;
        const schema =
          descriptor.mode === 'schema'
            ? ((await definition.slotSchema?.({
                slot,
                state,
                locale: input.locale,
                fallbackLocale: input.fallbackLocale,
                strings,
                user: input.user,
              })) ?? descriptor.schema)
            : undefined;
        const ui = {
          ...descriptor,
          schema: descriptor.mode === 'schema' ? schema : descriptor.schema,
        };
        if (ui.mode === 'schema' && !ui.schema) continue;
        if (ui.mode === 'iframe' && !ui.src) continue;
        slots.push({
          pluginId: definition.meta.id,
          pluginName: definition.meta.name,
          slot,
          ui,
          config: publicPluginConfig(definition, state),
          strings: publicLocaleStrings(strings),
        });
      }
      return slots;
    }),
  );
  return slotGroups.flat();
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
  settings: import('$lib/config').SiteSettings;
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
      settings: input.settings,
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
  const entries = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const state = input.states[definition.meta.id];
      if (!state?.enabled || !definition.collectClickMetadata) return null;

      const value = await definition.collectClickMetadata({
        request: input.request,
        ip: input.ip,
        state,
        settings: input.settings,
      });
      if (value && Object.keys(value).length > 0) {
        return [definition.meta.id, value] as const;
      }
      return null;
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export async function formatClickMetadataPlugins(input: {
  metadata: Record<string, unknown>;
  states: Record<string, PluginState>;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const entries = await Promise.all(
    clickMetadataFormatters(input.states).map((definition) =>
      definition.formatClickMetadata({
        metadata: input.metadata[definition.meta.id],
        state: definition.state,
        isAdmin: input.isAdmin,
        isOwner: input.isOwner,
      }),
    ),
  );

  return entries.flat();
}

export async function formatClickMetadataListPlugins(input: {
  metadataItems: Array<Record<string, unknown>>;
  states: Record<string, PluginState>;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const formatters = clickMetadataFormatters(input.states);
  if (formatters.length === 0 || input.metadataItems.length === 0) {
    return input.metadataItems.map(() => []);
  }

  const pluginRows = await Promise.all(
    formatters.map((definition) =>
      Promise.all(
        input.metadataItems.map(async (metadata, index) => {
          const items = await definition.formatClickMetadata({
            metadata: metadata[definition.meta.id],
            state: definition.state,
            isAdmin: input.isAdmin,
            isOwner: input.isOwner,
          });
          return { index, items };
        }),
      ),
    ),
  );

  const rows: ClickMetadataDisplayItem[][] = input.metadataItems.map(() => []);
  for (const pluginResult of pluginRows) {
    for (const { index, items } of pluginResult) rows[index].push(...items);
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
}): Promise<
  Array<ClickMetadataSearchField & { pluginId: string; pluginName: string }>
> {
  const fields = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const state = input.states[definition.meta.id];
      if (!state?.enabled || !definition.getClickMetadataSearchFields) {
        return [];
      }

      const pluginFields = await definition.getClickMetadataSearchFields({
        state,
        isAdmin: input.isAdmin,
        isOwner: input.isOwner,
      });

      return pluginFields.map((field) => ({
        ...field,
        pluginId: definition.meta.id,
        pluginName: definition.meta.name,
      }));
    }),
  );

  return fields.flat();
}
