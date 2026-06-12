import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearPluginSessions } from '../../plugins/auth-registry';
import { pluginDefinitions } from '../../plugins/server';
import { pluginLocaleStrings } from '$lib/i18n/plugin';
import { createUserSessionFromModel } from '$lib/server/auth-session';
import { pluginActionName } from '$lib/server/plugin-actions';
import { passwordPolicyDescription } from '$lib/server/password-policy';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '$lib/server/api-tokens';
import { requirePageUser } from '$lib/server/auth-guards';
import {
  changeOwnPassword,
  deleteUser,
  rotateUserSessionVersion,
  getUserById,
  updateOwnProfile,
} from '$lib/server/users';
import { getSettings, stringValue } from '$lib/server/settings';
import { listUserPermissionGroups } from '$lib/server/permissions';
import { localizeServerMessage, uiText } from '$lib/i18n/ui-text';

async function loadIntegrations(
  user: NonNullable<App.Locals['user']>,
  url: URL,
  locale: App.Locals['locale'],
) {
  const settings = await getSettings();
  const fallbackLocale = settings.i18n.defaultLocale;
  const integrations = await Promise.all(
    pluginDefinitions.map(async (definition) => {
      const state = settings.plugins[definition.meta.id];
      if (!state?.enabled || !definition.loadAccountData) return null;
      return {
        pluginId: definition.meta.id,
        pluginName: definition.meta.name,
        data: await definition.loadAccountData({
          user,
          state,
          url,
          locale,
          fallbackLocale,
          strings: pluginLocaleStrings(definition, locale, fallbackLocale),
        }),
      };
    }),
  );
  return {
    settings,
    integrations: integrations.filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    ),
  };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = requirePageUser(locals, '/account');
  const { settings, integrations } = await loadIntegrations(
    user,
    url,
    locals.locale,
  );
  const displaySettings = locals.localizedSettings;
  const [storedUser, permissionGroups] = await Promise.all([
    getUserById(user.id),
    listUserPermissionGroups(user.id),
  ]);
  return {
    locale: locals.locale,
    defaultLocale: settings.i18n.defaultLocale,
    user,
    integrations,
    tokens: await listApiTokens(user.id),
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    customHead: displaySettings.seo.customHead,
    pendingEmail: storedUser?.pending_email ?? null,
    permissionGroups,
    passwordMinLength: settings.auth.password.minLength,
    passwordPolicy: passwordPolicyDescription(
      settings.auth.password,
      locals.locale,
    ),
  };
};

export const actions: Actions = {
  profile: async ({ request, locals, url }) => {
    const user = requirePageUser(locals, '/account');
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
    try {
      const result = await updateOwnProfile({
        id: user.id,
        email: stringValue(form, 'email'),
        name: stringValue(form, 'name'),
        settings,
        origin: url.origin,
      });
      return {
        ok: true,
        message: result.emailVerificationRequired
          ? text.messages.profileEmailVerification
          : text.messages.profileSaved,
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
            : text.messages.profileSaveFailed,
      });
    }
  },

  password: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account');
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const form = await request.formData();
    try {
      await changeOwnPassword({
        id: user.id,
        currentPassword: stringValue(form, 'currentPassword'),
        nextPassword: stringValue(form, 'nextPassword'),
        passwordPolicy: settings.auth.password,
      });
      return { ok: true, message: text.messages.passwordChanged };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                settings.i18n.defaultLocale,
              )
            : text.messages.passwordChangeFailed,
      });
    }
  },

  logoutOtherSessions: async ({ locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    try {
      const storedUser = await rotateUserSessionVersion(user.id);
      createUserSessionFromModel(
        cookies,
        storedUser,
        user.provider,
        user.subject,
      );
      return {
        ok: true,
        message: text.messages.otherSessionsLoggedOut,
      };
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : text.messages.otherSessionsFailed,
      });
    }
  },

  createToken: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const result = await createApiToken(user.id, stringValue(form, 'name'));
    return {
      ok: true,
      message: text.messages.tokenIssued,
      token: result.token,
    };
  },

  revokeToken: async ({ request, locals }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const form = await request.formData();
    const removed = await revokeApiToken(
      user.id,
      Number(stringValue(form, 'id', '0')),
    );
    if (!removed) {
      return fail(404, { message: text.messages.tokenNotFound });
    }
    return { ok: true, message: text.messages.tokenRevoked };
  },

  delete: async ({ locals, cookies }) => {
    const user = requirePageUser(locals, '/account');
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    try {
      await deleteUser(user.id);
      const settings = await getSettings();
      await clearPluginSessions(cookies, settings.plugins);
    } catch (cause) {
      return fail(400, {
        message:
          cause instanceof Error
            ? localizeServerMessage(
                locals.locale,
                cause.message,
                locals.settings.i18n.defaultLocale,
              )
            : text.messages.deleteAccountFailed,
      });
    }
    redirect(303, '/');
  },

  pluginAction: async ({ request, locals, url }) => {
    const user = requirePageUser(locals, '/account');
    const form = await request.formData();
    const pluginId = String(form.get('pluginId') ?? '');
    const action = pluginActionName(form);
    const definition = pluginDefinitions.find(
      (plugin) => plugin.meta.id === pluginId,
    );
    const settings = await getSettings();
    const text = uiText(locals.locale, settings.i18n.defaultLocale);
    const state = settings.plugins[pluginId];
    if (!definition?.handleAccountAction || !state?.enabled) {
      return fail(404, { message: text.messages.integrationNotFound });
    }
    try {
      const result = await definition.handleAccountAction({
        user,
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
        message: result.message
          ? localizeServerMessage(
              locals.locale,
              result.message,
              settings.i18n.defaultLocale,
            )
          : text.messages.integrationHandled,
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
            : text.messages.integrationFailed,
      });
    }
  },
};
