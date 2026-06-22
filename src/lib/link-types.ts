import type { LinkEditFieldKey } from '$lib/config';

export type ManagedLinkItem = {
  id: number;
  code: string;
  domain: string;
  url: string;
  preview: {
    title: string;
    description: string;
    imageUrl: string;
    themeColor: string;
  };
  tags: string[];
  shortUrl: string;
  owned?: boolean;
  createdAt: string;
  clicks: number;
  lastClickedAt: string | null;
  smart: {
    expiresAt: string | null;
    maxClicks: number;
    passwordProtected: boolean;
  };
  routing: {
    redirectRules: unknown[];
  };
  health: {
    status: 'unchecked' | 'ok' | 'warning' | 'broken';
    statusCode: number | null;
    checkedAt: string | null;
    error: string;
    responseBody: string;
    latencyMs: number | null;
  };
  share: {
    recipientCount: number;
    access: {
      canEdit: boolean;
      canViewStats: boolean;
      editableFields: LinkEditFieldKey[];
      expiresAt: string | null;
    } | null;
  };
};

export type ManagedLinkPermissions = {
  isAdmin?: boolean;
  links: {
    deleteOwn: boolean;
    deleteAll: boolean;
    deleteMaxClicks: number;
    editOwn: boolean;
    editAll: boolean;
    statsAll: boolean;
    share: boolean;
    healthAll: boolean;
    editableFields: LinkEditFieldKey[];
  };
};

export function linkCanDelete(
  link: Pick<ManagedLinkItem, 'clicks' | 'owned'>,
  permissions: ManagedLinkPermissions,
) {
  if (permissions.links.deleteAll) return true;
  return (
    permissions.links.deleteOwn &&
    link.owned === true &&
    (permissions.links.deleteMaxClicks <= 0 ||
      link.clicks <= permissions.links.deleteMaxClicks)
  );
}

export function linkCanViewStats(
  link: Pick<ManagedLinkItem, 'owned' | 'share'>,
  permissions: ManagedLinkPermissions,
) {
  return (
    permissions.links.statsAll ||
    link.owned === true ||
    link.share.access?.canViewStats === true
  );
}

export function linkCanCheckHealth(
  link: Pick<ManagedLinkItem, 'owned'>,
  permissions: ManagedLinkPermissions,
) {
  return permissions.links.healthAll || link.owned === true;
}

export function linkCanManagePermission(
  link: Pick<ManagedLinkItem, 'owned'>,
  permissions: ManagedLinkPermissions,
) {
  return (
    permissions.links.share &&
    (permissions.isAdmin === true ||
      permissions.links.editAll ||
      link.owned === true)
  );
}

export function linkCanEdit(
  link: Pick<ManagedLinkItem, 'owned' | 'share'>,
  permissions: ManagedLinkPermissions,
) {
  return (
    (permissions.links.editableFields.length > 0 &&
      (permissions.links.editAll ||
        (permissions.links.editOwn && link.owned === true))) ||
    link.share.access?.canEdit === true
  );
}

export function editableFieldsForManagedLink(
  link: Pick<ManagedLinkItem, 'owned' | 'share'>,
  permissions: ManagedLinkPermissions,
) {
  if (
    permissions.links.editableFields.length > 0 &&
    (permissions.links.editAll ||
      (permissions.links.editOwn && link.owned === true))
  ) {
    return permissions.links.editableFields;
  }
  return link.share.access?.editableFields ?? [];
}
