import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getSettings,
  parseBoolean,
  updateSettings,
} from '$lib/server/settings';
import { getClientIp } from '$lib/server/client-ip';
import {
  canAccessAdminPlugin,
  effectivePermissions,
  type EffectivePermissions,
} from '$lib/server/permissions';
import { pluginActionName } from '$lib/server/plugin-actions';
import { clearPluginSessions } from '../../../../plugins/auth-registry';
import {
  isRequiredPlugin,
  pluginDefinitions,
} from '../../../../plugins/server';
import { localizedPluginMeta, pluginLocaleStrings } from '$lib/i18n/plugin';
import type {
  PluginActivationStatus,
  PluginDefinition,
  PluginState,
} from '$lib/plugin-contracts';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import { defaultSiteLocale, type SiteLocale } from '$lib/config';

function definitionFor(id: string) {
  return pluginDefinitions.find((definition) => definition.meta.id === id);
}

async function permissionsFor(input: {
  locals: App.Locals;
  request: Request;
  getClientAddress: () => string;
}) {
  const settings = input.locals.settings;
  return effectivePermissions({
    settings,
    user: input.locals.user,
    isAdmin: input.locals.isAdmin,
    ip: getClientIp(
      input.request,
      input.getClientAddress,
      settings.network.trustProxyHeaders,
      settings.network.proxyIpHeaders,
    ),
  });
}

function requirePluginAccess(
  permissions: EffectivePermissions,
  pluginId: string,
) {
  if (!canAccessAdminPlugin(permissions, pluginId)) redirect(303, '/admin');
}

function requirePermissionManagementAction(
  permissions: EffectivePermissions,
  pluginId: string,
  action: string,
  locale: App.Locals['locale'] = defaultSiteLocale,
  fallbackLocale: SiteLocale = locale,
) {
  const text = uiText(locale, fallbackLocale).admin.messages;
  if (pluginId !== 'permission-management' || permissions.isAdmin) return;
  if (action === 'createUser' && !permissions.admin.manageUsers) {
    throw new Error(text.permissionActionDenied);
  }
  if (
    (action === 'createGroup' || action === 'deleteGroups') &&
    !permissions.admin.managePermissions
  ) {
    throw new Error(text.permissionActionDenied);
  }
}

async function activationStatus(
  definition: PluginDefinition,
  state: PluginState,
  url: URL,
  locale: App.Locals['locale'],
  fallbackLocale: SiteLocale,
) {
  const text = uiText(locale, fallbackLocale).admin;
  if (isRequiredPlugin(definition)) {
    return {
      enable: { allowed: true } satisfies PluginActivationStatus,
      disable: {
        allowed: false,
        reason: text.plugins.cannotDisableCore,
      } satisfies PluginActivationStatus,
    };
  }

  const [enable, disable] = await Promise.all([
    definition.canEnable?.({ state, url }) ?? { allowed: true },
    definition.canDisable?.({ state, url }) ?? { allowed: true },
  ]);
  return {
    enable: enable satisfies PluginActivationStatus,
    disable: disable satisfies PluginActivationStatus,
  };
}

async function applyPluginStateChange(input: {
  definition: PluginDefinition;
  current: PluginState;
  next: PluginState;
  url: URL;
  locale: App.Locals['locale'];
  fallbackLocale: SiteLocale;
}) {
  const { definition, current, url } = input;
  const text = uiText(input.locale, input.fallbackLocale).admin.messages;
  const next = {
    ...input.next,
    enabled: isRequiredPlugin(definition) || input.next.enabled,
  };

  if (!current.enabled && next.enabled) {
    const status = await (definition.canEnable?.({
      state: current,
      url,
    }) ?? { allowed: true });
    if (!status.allowed) {
      throw new Error(status.reason ?? text.pluginSettingsFailed);
    }
  }
  if (current.enabled && !next.enabled) {
    const status = await (definition.canDisable?.({
      state: current,
      url,
    }) ?? { allowed: true });
    if (!status.allowed) {
      throw new Error(status.reason ?? text.pluginSettingsFailed);
    }
  }

  await definition.validateConfig?.(next.config);
  return next;
}

export const load: PageServerLoad = async ({
  locals,
  params,
  url,
  request,
  getClientAddress,
}) => {
  const definition = definitionFor(params.plugin);
  if (!definition) redirect(303, '/admin/plugins');
  const permissions = await permissionsFor({
    locals,
    request,
    getClientAddress,
  });
  requirePluginAccess(permissions, definition.meta.id);
  const settings = await getSettings();
  const storedState = settings.plugins[definition.meta.id];
  const state = {
    ...storedState,
    config: definition.prepareAdminConfig
      ? definition.prepareAdminConfig(storedState.config)
      : storedState.config,
  };
  const adminData =
    storedState.enabled && definition.loadAdminData
      ? await definition.loadAdminData({ state: storedState, url })
      : null;
  const activation = await activationStatus(
    definition,
    storedState,
    url,
    locals.locale,
    settings.i18n.defaultLocale,
  );

  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    plugin: localizedPluginMeta(
      definition,
      locals.locale,
      settings.i18n.defaultLocale,
    ),
    pluginStrings: pluginLocaleStrings(
      definition,
      locals.locale,
      settings.i18n.defaultLocale,
    ),
    state,
    activation,
    adminData,
    permissions,
    theme: settings.theme,
    siteName: settings.general.siteName,
    logoUrl: settings.general.logoUrl,
    handlesAdminActions: Boolean(definition.handleAdminAction),
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const settings = await getSettings();
    await clearPluginSessions(cookies, settings.plugins);
    redirect(303, '/admin');
  },

  save: async ({ request, locals, params, url, getClientAddress }) => {
    const text = uiText(
      locals.locale,
      locals.settings.i18n.defaultLocale,
    ).admin.messages;
    const definition = definitionFor(params.plugin);
    if (!definition) return fail(404, { message: text.pluginNotFound });
    const permissions = await permissionsFor({
      locals,
      request,
      getClientAddress,
    });
    requirePluginAccess(permissions, definition.meta.id);
    const settings = await getSettings();
    const current = settings.plugins[definition.meta.id];
    const form = await request.formData();
    try {
      const next = await applyPluginStateChange({
        definition,
        current,
        url,
        locale: locals.locale,
        fallbackLocale: settings.i18n.defaultLocale,
        next: {
          enabled: parseBoolean(form, 'enabled'),
          config: definition.parseConfig(form, current.config, {
            defaultLocale: settings.i18n.defaultLocale,
          }),
        },
      });
      settings.plugins[definition.meta.id] = next;
      await updateSettings(settings);
      return { ok: true, message: text.pluginSettingsSaved };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.pluginSettingsFailed,
      });
    }
  },

  pluginAction: async ({ request, locals, params, url, getClientAddress }) => {
    const text = uiText(
      locals.locale,
      locals.settings.i18n.defaultLocale,
    ).admin.messages;
    const definition = definitionFor(params.plugin);
    if (!definition?.handleAdminAction) {
      return fail(404, { message: text.pluginActionNotFound });
    }
    const permissions = await permissionsFor({
      locals,
      request,
      getClientAddress,
    });
    requirePluginAccess(permissions, definition.meta.id);
    const settings = await getSettings();
    const state = settings.plugins[definition.meta.id];
    if (!state.enabled) {
      return fail(403, {
        message: text.pluginDisabledAction,
      });
    }
    const form = await request.formData();
    const action = pluginActionName(form);
    if (!action) {
      return fail(400, {
        message: text.pluginActionMissing,
      });
    }
    try {
      requirePermissionManagementAction(
        permissions,
        definition.meta.id,
        action,
        locals.locale,
        locals.settings.i18n.defaultLocale,
      );
    } catch (cause) {
      return fail(403, {
        message:
          cause instanceof Error ? cause.message : text.permissionActionDenied,
      });
    }
    try {
      const result = await definition.handleAdminAction({
        action,
        form,
        state,
        url,
        user: locals.user,
        isAdmin: locals.isAdmin,
        locale: locals.locale,
        fallbackLocale: settings.i18n.defaultLocale,
        strings: pluginLocaleStrings(
          definition,
          locals.locale,
          settings.i18n.defaultLocale,
        ),
      });
      settings.plugins[definition.meta.id] = await applyPluginStateChange({
        definition,
        current: state,
        url,
        locale: locals.locale,
        fallbackLocale: settings.i18n.defaultLocale,
        next: {
          enabled: result.enabled ?? state.enabled,
          config: result.config ?? state.config,
        },
      });
      await updateSettings(settings);
      return {
        ok: result.ok ?? true,
        message: result.message ?? text.pluginActionHandled,
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.pluginActionFailed,
      });
    }
  },
};
