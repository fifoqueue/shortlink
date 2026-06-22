import { redirect } from '@sveltejs/kit';
import { getClientIp } from '$lib/server/client-ip';
import {
  canAccessAdminPlugin,
  effectivePermissions,
  type EffectivePermissions,
} from '$lib/server/permissions';
import type {
  PluginAdminPermissionContext,
  PluginDefinition,
} from '$lib/plugin-contracts';
import { pluginDefinitions } from '../../plugins/server';

export type { EffectivePermissions } from '$lib/server/permissions';

export function definitionForAdminPlugin(id: string) {
  return pluginDefinitions.find((definition) => definition.meta.id === id);
}

export async function adminPluginPermissions(input: {
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

export function requireAdminPluginAccess(
  permissions: EffectivePermissions,
  definition: PluginDefinition,
) {
  if (
    !canAccessAdminPlugin(
      permissions,
      definition.meta.id,
      definition.meta.adminAccessPermissions,
    )
  ) {
    redirect(303, '/admin');
  }
}

export function pluginAdminPermissionContext(
  permissions: EffectivePermissions,
): PluginAdminPermissionContext {
  return {
    isAdmin: permissions.isAdmin,
    admin: permissions.admin,
  };
}
