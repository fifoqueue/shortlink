import type { SiteSettings } from '$lib/config';
import type { EffectivePermissions } from './permissions';

export function canCreateLinks(
  settings: SiteSettings,
  locals: App.Locals,
  permissions?: EffectivePermissions,
) {
  if (permissions) return permissions.links.canCreate;
  return (
    settings.access.visibility === 'public' ||
    locals.isAdmin ||
    Boolean(locals.user)
  );
}
