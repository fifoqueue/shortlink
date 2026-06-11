import type { SiteSettings } from '$lib/config';
import {
  apiPrincipalAsUser,
  requireApiPrincipal,
  type ApiCapability,
  type ApiPrincipal,
} from './api-tokens';
import { getClientIp } from './client-ip';
import { effectivePermissions } from './permissions';

export function apiClientIp(
  request: Request,
  settings: SiteSettings,
  getClientAddress: () => string,
) {
  return getClientIp(
    request,
    getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
}

export async function apiPermissionsForRequest(
  request: Request,
  settings: SiteSettings,
  principal: ApiPrincipal,
  getClientAddress: () => string,
) {
  const clientIp = apiClientIp(request, settings, getClientAddress);
  return {
    clientIp,
    permissions: await effectivePermissions({
      settings,
      user: apiPrincipalAsUser(principal),
      isAdmin: principal.isAdmin,
      ip: clientIp,
    }),
  };
}

export function createApiPermissionContext(
  request: Request,
  settings: SiteSettings,
  getClientAddress: () => string,
) {
  let cached:
    | {
        principalId: number;
        context: ReturnType<typeof apiPermissionsForRequest>;
      }
    | undefined;

  return (principal: ApiPrincipal) => {
    if (!cached || cached.principalId !== principal.id) {
      cached = {
        principalId: principal.id,
        context: apiPermissionsForRequest(
          request,
          settings,
          principal,
          getClientAddress,
        ),
      };
    }
    return cached.context;
  };
}

export async function requireApiPermissionContext(
  request: Request,
  settings: SiteSettings,
  capability: ApiCapability,
  getClientAddress: () => string,
) {
  const getApiContext = createApiPermissionContext(
    request,
    settings,
    getClientAddress,
  );
  let context: Awaited<ReturnType<typeof getApiContext>> | undefined;
  const api = await requireApiPrincipal(request, settings, capability, {
    permissions: async (principal) =>
      (context ??= await getApiContext(principal)).permissions,
  });
  if (api.error) return { error: api.error };

  context ??= await getApiContext(api.principal);
  return {
    error: undefined,
    principal: api.principal,
    ...context,
  };
}
