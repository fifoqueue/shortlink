import type { Cookies } from '@sveltejs/kit';
import type {
  AuthenticatedUser,
  AuthPluginModule,
  PluginDefinition,
  PluginLocaleContext,
  PluginState,
} from '$lib/plugin-contracts';
import { defaultSiteLocale, type SiteLocale } from '$lib/config';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import { authProviderKey } from '$lib/server/permissions';
import { assertUniquePluginId, pluginFolderFromPath } from './utils';
import { pluginDefinitions } from './server';

type AuthModule = { default: AuthPluginModule };
type AuthProviderAllowList = readonly string[] | null | undefined;

const modules = import.meta.glob<AuthModule>(
  ['./*/auth.ts', '../user-plugins/*/auth.ts'],
  {
    eager: true,
  },
);
const seenAuthPluginIds = new Set<string>();

const staticAuthPlugins = Object.entries(modules).map(([path, module]) => {
  const authPlugin = module.default;
  const folder = pluginFolderFromPath(path);
  if (authPlugin.id !== folder) {
    throw new Error(
      `Auth plugin "${folder}" must use the same id (received "${authPlugin.id}").`,
    );
  }
  assertUniquePluginId(seenAuthPluginIds, authPlugin.id, path);
  return authPlugin;
});

function definitionFor(pluginId: string): PluginDefinition | undefined {
  return pluginDefinitions.find(
    (definition) => definition.meta.id === pluginId,
  );
}

function runtimeAuthPlugins(): AuthPluginModule[] {
  return pluginDefinitions.flatMap((definition) => {
    if (!definition.auth || typeof definition.auth.getUser !== 'function') {
      return [];
    }
    return [
      {
        id: definition.meta.id,
        getUser: definition.auth.getUser,
        clearSession: definition.auth.clearSession,
        getLoginMethods: definition.auth.getLoginMethods,
        getAccountLinkMethods: definition.auth.getAccountLinkMethods,
        authenticatePassword: definition.auth.authenticatePassword,
        startLogin: definition.auth.startLogin,
        finishLogin: definition.auth.finishLogin,
        startAccountLink: definition.auth.startAccountLink,
        finishAccountLink: definition.auth.finishAccountLink,
      } satisfies AuthPluginModule,
    ];
  });
}

function authPlugins() {
  return [...staticAuthPlugins, ...runtimeAuthPlugins()];
}

function stateFor(states: Record<string, PluginState>, pluginId: string) {
  const state = states[pluginId];
  return state?.enabled ? state : null;
}

function localeContext(
  pluginId: string,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
): PluginLocaleContext {
  const definition = definitionFor(pluginId);
  return {
    locale,
    fallbackLocale,
    strings: definition
      ? pluginLocaleStrings(definition, locale, fallbackLocale)
      : {},
  };
}

function loginMethods(
  plugin: AuthPluginModule,
  state: PluginState,
  context: PluginLocaleContext,
) {
  return plugin.getLoginMethods?.(state.config, context) ?? [];
}

function authProviderAllowed(
  pluginId: string,
  methodId: string,
  allowedProviders: AuthProviderAllowList,
) {
  return (
    allowedProviders === undefined ||
    allowedProviders === null ||
    allowedProviders.includes(authProviderKey(pluginId, methodId))
  );
}

function redirectLoginMethod(
  plugin: AuthPluginModule,
  state: PluginState,
  methodId: string,
  context: PluginLocaleContext,
  allowedProviders?: AuthProviderAllowList,
) {
  if (!authProviderAllowed(plugin.id, methodId, allowedProviders)) return null;
  return loginMethods(plugin, state, context).find(
    (method) => method.id === methodId && method.type === 'redirect',
  );
}

function accountLinkMethods(
  plugin: AuthPluginModule,
  state: PluginState,
  context: PluginLocaleContext,
) {
  return (
    plugin.getAccountLinkMethods?.(state.config, context) ??
    loginMethods(plugin, state, context).filter(
      (method) => method.type === 'redirect',
    )
  );
}

function accountLinkMethod(
  plugin: AuthPluginModule,
  state: PluginState,
  methodId: string,
  context: PluginLocaleContext,
  allowedProviders?: AuthProviderAllowList,
) {
  if (!authProviderAllowed(plugin.id, methodId, allowedProviders)) return null;
  return accountLinkMethods(plugin, state, context).find(
    (method) => method.id === methodId && method.type === 'redirect',
  );
}

export async function getPluginUser(
  cookies: Cookies,
  states: Record<string, PluginState>,
): Promise<AuthenticatedUser | null> {
  for (const authPlugin of authPlugins()) {
    const state = states[authPlugin.id];
    if (!state?.enabled) continue;
    const user = await authPlugin.getUser(cookies, state.config);
    if (user) return user;
  }
  return null;
}

export function hasEnabledAuthPlugin(states: Record<string, PluginState>) {
  return authPlugins().some((plugin) => states[plugin.id]?.enabled);
}

export function getAuthLoginMethods(
  states: Record<string, PluginState>,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  allowedProviders?: AuthProviderAllowList,
) {
  return authPlugins().flatMap((plugin) => {
    const state = stateFor(states, plugin.id);
    if (!state) return [];
    return loginMethods(
      plugin,
      state,
      localeContext(plugin.id, locale, fallbackLocale),
    )
      .filter((method) =>
        authProviderAllowed(plugin.id, method.id, allowedProviders),
      )
      .map((method) => ({
        ...method,
        pluginId: plugin.id,
      }));
  });
}

export async function authenticatePluginPassword(
  cookies: Cookies,
  states: Record<string, PluginState>,
  email: string,
  password: string,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  allowedProviders?: AuthProviderAllowList,
) {
  for (const plugin of authPlugins()) {
    const state = stateFor(states, plugin.id);
    if (
      !state ||
      !plugin.authenticatePassword ||
      !authProviderAllowed(plugin.id, 'password', allowedProviders)
    ) {
      continue;
    }
    const user = await plugin.authenticatePassword(
      cookies,
      state.config,
      email,
      password,
      localeContext(plugin.id, locale, fallbackLocale),
    );
    if (user) return user;
  }
  return null;
}

export async function clearPluginSessions(
  cookies: Cookies,
  states: Record<string, PluginState>,
) {
  await Promise.all(
    authPlugins().map(async (plugin) => {
      const state = states[plugin.id];
      if (state && plugin.clearSession) {
        await plugin.clearSession(cookies);
      }
    }),
  );
}

export async function startPluginLogin(
  cookies: Cookies,
  states: Record<string, PluginState>,
  pluginId: string,
  methodId: string,
  origin: string,
  returnTo: string | null,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  requestParams?: URLSearchParams,
  allowedProviders?: AuthProviderAllowList,
) {
  const plugin = authPlugins().find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  const context = localeContext(pluginId, locale, fallbackLocale);
  if (
    !plugin?.startLogin ||
    !state ||
    !redirectLoginMethod(plugin, state, methodId, context, allowedProviders)
  ) {
    return null;
  }
  return plugin.startLogin(
    cookies,
    origin,
    state.config,
    methodId,
    returnTo,
    context,
    requestParams,
  );
}

export async function finishPluginLogin(
  cookies: Cookies,
  states: Record<string, PluginState>,
  pluginId: string,
  currentUrl: URL,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  allowedProviders?: AuthProviderAllowList,
) {
  const plugin = authPlugins().find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  if (!plugin?.finishLogin || !state?.enabled) return null;
  return plugin.finishLogin(
    cookies,
    currentUrl,
    state.config,
    localeContext(pluginId, locale, fallbackLocale),
    allowedProviders,
  );
}

export async function startPluginAccountLink(
  cookies: Cookies,
  states: Record<string, PluginState>,
  pluginId: string,
  methodId: string,
  origin: string,
  user: AuthenticatedUser,
  returnTo: string | null,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  requestParams?: URLSearchParams,
  allowedProviders?: AuthProviderAllowList,
) {
  const plugin = authPlugins().find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  const context = localeContext(pluginId, locale, fallbackLocale);
  if (
    !plugin?.startAccountLink ||
    !state ||
    !accountLinkMethod(plugin, state, methodId, context, allowedProviders)
  ) {
    return null;
  }
  return plugin.startAccountLink(
    cookies,
    origin,
    state.config,
    methodId,
    user,
    returnTo,
    context,
    requestParams,
  );
}

export async function finishPluginAccountLink(
  cookies: Cookies,
  states: Record<string, PluginState>,
  pluginId: string,
  currentUrl: URL,
  user: AuthenticatedUser,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
  allowedProviders?: AuthProviderAllowList,
) {
  const plugin = authPlugins().find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  if (!plugin?.finishAccountLink || !state) return null;
  return plugin.finishAccountLink(
    cookies,
    currentUrl,
    state.config,
    user,
    localeContext(pluginId, locale, fallbackLocale),
    allowedProviders,
  );
}
