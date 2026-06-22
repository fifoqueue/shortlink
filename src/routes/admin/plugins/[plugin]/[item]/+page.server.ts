import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSettings } from '$lib/server/settings';
import { pluginActionName } from '$lib/server/plugin-actions';
import {
  adminPluginPermissions,
  definitionForAdminPlugin,
  type EffectivePermissions,
  pluginAdminPermissionContext,
  requireAdminPluginAccess,
} from '$lib/server/admin-plugin-context';
import {
  pluginDefinitions,
  publicPluginConfig,
} from '../../../../../plugins/server';
import { clearPluginSessions } from '../../../../../plugins/auth-registry';
import { localizedPluginMeta, pluginLocaleStrings } from '$lib/i18n/plugin';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';
import type { SiteLocale } from '$lib/config';
import type {
  PluginAdminAccessStatus,
  PluginDefinition,
} from '$lib/plugin-contracts';

async function pluginSubpageAccessStatus(input: {
  definition: PluginDefinition;
  permissions: EffectivePermissions;
  item: string;
  locale: App.Locals['locale'];
  fallbackLocale: SiteLocale;
}): Promise<PluginAdminAccessStatus> {
  return (
    (await input.definition.canAccessAdminSubpage?.({
      item: input.item,
      permissions: pluginAdminPermissionContext(input.permissions),
      locale: input.locale,
      fallbackLocale: input.fallbackLocale,
      strings: pluginLocaleStrings(
        input.definition,
        input.locale,
        input.fallbackLocale,
      ),
    })) ?? { allowed: true }
  );
}

async function loadIntegrations(
  userId: number,
  url: URL,
  locale: App.Locals['locale'],
  fallbackLocale: SiteLocale,
) {
  const settings = await getSettings();
  const integrations = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const state = settings.plugins[definition.meta.id];
      if (!state?.enabled) return null;
      const runtimeUi = definition.runtime?.userAdmin;
      if (!definition.loadUserAdminData && !runtimeUi) return null;
      const strings = pluginLocaleStrings(definition, locale, fallbackLocale);
      const data = definition.loadUserAdminData
        ? await definition.loadUserAdminData({
            userId,
            state,
            url,
            locale,
            fallbackLocale,
            strings,
          })
        : null;
      const runtimeSchema =
        runtimeUi?.mode === 'schema'
          ? ((await definition.userAdminSchema?.({
              userId,
              state,
              url,
              locale,
              fallbackLocale,
              strings,
              data,
            })) ??
            runtimeUi.schema ??
            null)
          : null;
      return {
        pluginId: definition.meta.id,
        pluginName: localizedPluginMeta(definition, locale, fallbackLocale)
          .name,
        config: definition.prepareAdminConfig
          ? definition.prepareAdminConfig(state.config)
          : publicPluginConfig(definition, state),
        strings,
        runtimeUi: runtimeUi ?? null,
        runtimeSchema,
        data,
      };
    }),
  );
  return integrations.filter((item): item is NonNullable<typeof item> =>
    Boolean(item),
  );
}

export const load: PageServerLoad = async ({
  locals,
  params,
  url,
  request,
  getClientAddress,
}) => {
  const definition = definitionForAdminPlugin(params.plugin);
  if (!definition) redirect(303, '/admin/plugins');
  const permissions = await adminPluginPermissions({
    locals,
    request,
    getClientAddress,
  });
  requireAdminPluginAccess(permissions, definition);
  const access = await pluginSubpageAccessStatus({
    definition,
    permissions,
    item: params.item,
    locale: locals.locale,
    fallbackLocale: locals.settings.i18n.defaultLocale,
  });
  if (!access.allowed) {
    redirect(303, access.redirectTo ?? `/admin/plugins/${params.plugin}`);
  }
  if (!definition.loadAdminSubpage)
    redirect(303, `/admin/plugins/${params.plugin}`);

  const settings = await getSettings();
  const storedState = settings.plugins[definition.meta.id];
  if (!storedState?.enabled) redirect(303, `/admin/plugins/${params.plugin}`);

  const state = {
    ...storedState,
    config: definition.prepareAdminConfig
      ? definition.prepareAdminConfig(storedState.config)
      : storedState.config,
  };
  const adminData = await definition.loadAdminSubpage({
    item: params.item,
    state: storedState,
    url,
    locale: locals.locale,
    fallbackLocale: settings.i18n.defaultLocale,
    strings: pluginLocaleStrings(
      definition,
      locals.locale,
      settings.i18n.defaultLocale,
    ),
  });
  const userId = Number(
    params.item.startsWith('user-') ? params.item.slice(5) : params.item,
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
    item: params.item,
    adminData,
    permissions,
    integrations: Number.isSafeInteger(userId)
      ? await loadIntegrations(
          userId,
          url,
          locals.locale,
          settings.i18n.defaultLocale,
        )
      : [],
    theme: settings.theme,
    customHead: settings.seo.customHead,
    siteName: settings.general.siteName,
    logoUrl: settings.general.logoUrl,
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const settings = await getSettings();
    await clearPluginSessions(cookies, settings.plugins);
    redirect(303, '/admin');
  },

  pluginAction: async ({ request, locals, params, url, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale).admin
      .messages;
    const definition = definitionForAdminPlugin(params.plugin);
    if (!definition?.handleAdminSubpageAction) {
      return fail(404, { message: text.pluginActionNotFound });
    }
    const permissions = await adminPluginPermissions({
      locals,
      request,
      getClientAddress,
    });
    requireAdminPluginAccess(permissions, definition);
    const access = await pluginSubpageAccessStatus({
      definition,
      permissions,
      item: params.item,
      locale: locals.locale,
      fallbackLocale: locals.settings.i18n.defaultLocale,
    });
    if (!access.allowed) {
      return fail(403, {
        message: access.reason ?? text.permissionActionDenied,
      });
    }
    const settings = await getSettings();
    const state = settings.plugins[definition.meta.id];
    if (!state?.enabled) {
      return fail(403, {
        message: text.pluginDisabledAction,
      });
    }
    const form = await request.formData();
    const action = pluginActionName(form);
    let result:
      | {
          ok?: boolean;
          message?: string;
          redirectTo?: string;
        }
      | undefined;
    try {
      result = await definition.handleAdminSubpageAction({
        item: params.item,
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
    if (result?.redirectTo) redirect(303, result.redirectTo);
    return {
      ok: result?.ok ?? true,
      message: result?.message ?? text.pluginActionHandled,
    };
  },

  integrationAction: async ({
    request,
    locals,
    params,
    url,
    getClientAddress,
  }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale).admin
      .messages;
    const permissions = await adminPluginPermissions({
      locals,
      request,
      getClientAddress,
    });
    const parentDefinition = definitionForAdminPlugin(params.plugin);
    if (!parentDefinition) {
      return fail(404, { message: text.pluginNotFound });
    }
    requireAdminPluginAccess(permissions, parentDefinition);
    const access = await pluginSubpageAccessStatus({
      definition: parentDefinition,
      permissions,
      item: params.item,
      locale: locals.locale,
      fallbackLocale: locals.settings.i18n.defaultLocale,
    });
    if (!access.allowed) {
      return fail(403, {
        message: access.reason ?? text.integrationActionDenied,
      });
    }
    const userId = Number(
      params.item.startsWith('user-') ? params.item.slice(5) : params.item,
    );
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return fail(400, { message: text.invalidUserId });
    }
    const form = await request.formData();
    const pluginId = String(form.get('integrationPlugin') ?? '');
    const action = String(form.get('integrationAction') ?? '');
    const definition = definitionForAdminPlugin(pluginId);
    const settings = await getSettings();
    const state = settings.plugins[pluginId];
    if (!definition?.handleUserAdminAction || !state?.enabled) {
      return fail(404, { message: text.integrationActionNotFound });
    }
    try {
      const result = await definition.handleUserAdminAction({
        userId,
        action,
        form,
        state,
        url,
        locale: locals.locale,
        fallbackLocale: settings.i18n.defaultLocale,
        strings: pluginLocaleStrings(
          definition,
          locals.locale,
          settings.i18n.defaultLocale,
        ),
      });
      return {
        ok: result.ok ?? true,
        message: result.message ?? text.integrationActionHandled,
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
            : text.integrationActionFailed,
      });
    }
  },
};
