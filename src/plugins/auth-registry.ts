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

type AuthModule = { default: AuthPluginModule };
type PluginModule = { default: PluginDefinition };

const modules = import.meta.glob<AuthModule>('./*/auth.ts', {
  eager: true,
});
const pluginModules = import.meta.glob<PluginModule>('./*/plugin.ts', {
  eager: true,
});

const pluginDefinitionsById = new Map(
  Object.entries(pluginModules).map(([, module]) => [
    module.default.meta.id,
    module.default,
  ]),
);

const authPlugins = Object.entries(modules).map(([path, module]) => {
  const authPlugin = module.default;
  const folder = path.split('/')[1];
  if (authPlugin.id !== folder) {
    throw new Error(
      `Auth plugin "${folder}" must use the same id (received "${authPlugin.id}").`,
    );
  }
  return authPlugin;
});

function stateFor(states: Record<string, PluginState>, pluginId: string) {
  const state = states[pluginId];
  return state?.enabled ? state : null;
}

function localeContext(
  pluginId: string,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
): PluginLocaleContext {
  const definition = pluginDefinitionsById.get(pluginId);
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

function redirectLoginMethod(
  plugin: AuthPluginModule,
  state: PluginState,
  methodId: string,
  context: PluginLocaleContext,
) {
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
) {
  return accountLinkMethods(plugin, state, context).find(
    (method) => method.id === methodId && method.type === 'redirect',
  );
}

export async function getPluginUser(
  cookies: Cookies,
  states: Record<string, PluginState>,
): Promise<AuthenticatedUser | null> {
  for (const authPlugin of authPlugins) {
    const state = states[authPlugin.id];
    if (!state?.enabled) continue;
    const user = await authPlugin.getUser(cookies, state.config);
    if (user) return user;
  }
  return null;
}

export function hasEnabledAuthPlugin(states: Record<string, PluginState>) {
  return authPlugins.some((plugin) => states[plugin.id]?.enabled);
}

export function getAuthLoginMethods(
  states: Record<string, PluginState>,
  locale: SiteLocale = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
) {
  return authPlugins.flatMap((plugin) => {
    const state = stateFor(states, plugin.id);
    if (!state) return [];
    return loginMethods(
      plugin,
      state,
      localeContext(plugin.id, locale, fallbackLocale),
    ).map((method) => ({
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
) {
  for (const plugin of authPlugins) {
    const state = stateFor(states, plugin.id);
    if (!state || !plugin.authenticatePassword) continue;
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
    authPlugins.map(async (plugin) => {
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
) {
  const plugin = authPlugins.find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  const context = localeContext(pluginId, locale, fallbackLocale);
  if (
    !plugin?.startLogin ||
    !state ||
    !redirectLoginMethod(plugin, state, methodId, context)
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
) {
  const plugin = authPlugins.find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  if (!plugin?.finishLogin || !state?.enabled) return null;
  return plugin.finishLogin(
    cookies,
    currentUrl,
    state.config,
    localeContext(pluginId, locale, fallbackLocale),
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
) {
  const plugin = authPlugins.find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  const context = localeContext(pluginId, locale, fallbackLocale);
  if (
    !plugin?.startAccountLink ||
    !state ||
    !accountLinkMethod(plugin, state, methodId, context)
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
) {
  const plugin = authPlugins.find((item) => item.id === pluginId);
  const state = stateFor(states, pluginId);
  if (!plugin?.finishAccountLink || !state) return null;
  return plugin.finishAccountLink(
    cookies,
    currentUrl,
    state.config,
    user,
    localeContext(pluginId, locale, fallbackLocale),
  );
}
