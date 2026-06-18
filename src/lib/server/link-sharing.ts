import { randomBytes } from 'node:crypto';
import { Op, type WhereOptions } from 'sequelize';
import {
  linkEditFieldKeys,
  linkedLinkEditFieldPairs,
  redirectRuleConditionKeys,
  type LinkEditFieldKey,
} from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';
import type { LinkOwner } from './link-owner';
import {
  ensureDatabase,
  LinkAccessGrantModel,
  LinkAccessShareModel,
  ShortLinkModel,
  UserModel,
} from './database';

export interface LinkShareAccess {
  canEdit: boolean;
  canViewStats: boolean;
  editableFields: LinkEditFieldKey[];
  expiresAt: string | null;
}

export interface LinkShareListSummary {
  recipientCount: number;
  access: LinkShareAccess | null;
}

export interface LinkShareRecipient {
  id: number;
  userId: number;
  name: string;
  email: string | null;
  acceptedAt: string;
  active: boolean;
  access: LinkShareAccess;
}

export interface LinkShareDetails {
  id: number;
  token: string;
  inviteActive: boolean;
  expiresAt: string | null;
  canViewStats: boolean;
  editableFields: LinkEditFieldKey[];
  recipientCount: number;
  recipients: LinkShareRecipient[];
}

export type ShareableLinkAccessResult =
  | { status: 'ok'; link: ShortLinkModel; isOwner: boolean }
  | { status: 'not_found' }
  | { status: 'denied'; link: ShortLinkModel };

export type AcceptLinkShareResult =
  | {
      status: 'accepted' | 'owner';
      link: ShortLinkModel;
      access: LinkShareAccess;
    }
  | { status: 'expired'; link: ShortLinkModel }
  | { status: 'not_found' };

const linkEditFieldSet = new Set<string>(linkEditFieldKeys);

function generateShareToken() {
  return `slk_${randomBytes(32).toString('base64url')}`;
}

function isActiveShare(share: Pick<LinkAccessShareModel, 'expiresAt'>) {
  return !share.expiresAt || share.expiresAt.getTime() > Date.now();
}

function isActiveGrant(grant: Pick<LinkAccessGrantModel, 'expiresAt'>) {
  return !grant.expiresAt || grant.expiresAt.getTime() > Date.now();
}

function activeGrantWhere(): WhereOptions {
  return {
    [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
  };
}

function linkMatchesOwner(link: ShortLinkModel, owner: LinkOwner) {
  if (owner.userId) return link.creatorUserId === owner.userId;
  return Boolean(
    (owner.sessionId && link.creatorSessionId === owner.sessionId) ||
    (owner.ipHash && link.creatorIpHash === owner.ipHash),
  );
}

function normalizeEditableFields(value: unknown): LinkEditFieldKey[] {
  const source = Array.isArray(value) ? value : [];
  const fieldSet = new Set(
    source
      .map((field) => String(field))
      .filter((field): field is LinkEditFieldKey =>
        linkEditFieldSet.has(field),
      ),
  );

  for (const pair of linkedLinkEditFieldPairs) {
    if (pair.some((field) => fieldSet.has(field))) {
      for (const field of pair) fieldSet.add(field);
    }
  }

  if (fieldSet.has('redirectRules')) {
    const hasCondition = redirectRuleConditionKeys.some((key) =>
      fieldSet.has(key),
    );
    if (!hasCondition) {
      for (const key of redirectRuleConditionKeys) fieldSet.add(key);
    }
  } else {
    for (const key of redirectRuleConditionKeys) fieldSet.delete(key);
  }
  if (redirectRuleConditionKeys.some((key) => fieldSet.has(key))) {
    fieldSet.add('redirectRules');
  }

  return linkEditFieldKeys.filter((field) => fieldSet.has(field));
}

function normalizeShareExpiresAt(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(serverMessage('expirationDateInvalid'));
  }
  if (date.getTime() <= Date.now()) {
    throw new Error(serverMessage('expirationDateFuture'));
  }
  return date;
}

function publicAccessFromValues(input: {
  canViewStats: boolean;
  editableFields: unknown;
  expiresAt: Date | null;
}): LinkShareAccess {
  const editableFields = normalizeEditableFields(input.editableFields);
  return {
    canEdit: editableFields.length > 0,
    canViewStats: input.canViewStats === true,
    editableFields,
    expiresAt: input.expiresAt?.toISOString() ?? null,
  };
}

function publicShareAccess(share: LinkAccessShareModel) {
  return publicAccessFromValues(share);
}

function publicGrantAccess(grant: LinkAccessGrantModel) {
  return publicAccessFromValues(grant);
}

async function uniqueShareToken() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = generateShareToken();
    const existing = await LinkAccessShareModel.findOne({ where: { token } });
    if (!existing) return token;
  }
  throw new Error(serverMessage('shortCodeGenerateFailed'));
}

export function linkShareInviteUrl(origin: string, token: string) {
  return new URL(`/invite/${encodeURIComponent(token)}`, origin).toString();
}

export async function getShareableLinkAccess(input: {
  code: string;
  domain?: string;
  owner?: LinkOwner;
  isAdmin?: boolean;
  allowAnyOwner?: boolean;
}): Promise<ShareableLinkAccessResult> {
  await ensureDatabase();
  const link = await ShortLinkModel.findOne({
    where: {
      code: input.code,
      ...(input.domain === undefined ? {} : { domain: input.domain }),
    },
  });
  if (!link) return { status: 'not_found' };

  const isOwner = input.owner ? linkMatchesOwner(link, input.owner) : false;
  if (input.isAdmin || input.allowAnyOwner || isOwner) {
    return { status: 'ok', link, isOwner };
  }

  return { status: 'denied', link };
}

export async function sharedLinkIdsForUser(userId: number) {
  await ensureDatabase();
  const grants = await LinkAccessGrantModel.findAll({
    attributes: ['linkId'],
    where: {
      userId,
      ...activeGrantWhere(),
    },
  });
  return [...new Set(grants.map((grant) => grant.linkId))];
}

export async function linkShareSummariesByLinkId(
  linkIds: number[],
  sharedWithUserId?: number | null,
) {
  await ensureDatabase();
  const uniqueLinkIds = [...new Set(linkIds)];
  const summaries = new Map<number, LinkShareListSummary>();
  for (const linkId of uniqueLinkIds) {
    summaries.set(linkId, { recipientCount: 0, access: null });
  }
  if (uniqueLinkIds.length === 0) return summaries;

  const grants = await LinkAccessGrantModel.findAll({
    attributes: [
      'linkId',
      'userId',
      'expiresAt',
      'canViewStats',
      'editableFields',
    ],
    where: {
      linkId: { [Op.in]: uniqueLinkIds },
      ...activeGrantWhere(),
    },
  });
  for (const grant of grants) {
    const summary = summaries.get(grant.linkId);
    if (summary) summary.recipientCount += 1;
  }

  if (sharedWithUserId) {
    for (const grant of grants.filter(
      (item) => item.userId === sharedWithUserId,
    )) {
      const summary = summaries.get(grant.linkId);
      if (summary) summary.access = publicGrantAccess(grant);
    }
  }

  return summaries;
}

export async function activeShareAccessForLinkId(
  linkId: number,
  userId: number,
) {
  await ensureDatabase();
  const grant = await LinkAccessGrantModel.findOne({
    attributes: ['expiresAt', 'canViewStats', 'editableFields'],
    where: {
      linkId,
      userId,
      ...activeGrantWhere(),
    },
  });
  return grant ? publicGrantAccess(grant) : null;
}

export async function getLinkShareDetails(linkId: number) {
  await ensureDatabase();
  const share = await LinkAccessShareModel.findOne({
    attributes: ['id', 'token', 'expiresAt', 'canViewStats', 'editableFields'],
    where: { linkId },
  });

  const grants = await LinkAccessGrantModel.findAll({
    attributes: [
      'id',
      'userId',
      'acceptedAt',
      'expiresAt',
      'canViewStats',
      'editableFields',
    ],
    where: { linkId },
    order: [['acceptedAt', 'DESC']],
  });
  if (!share && grants.length === 0) return null;

  const grantUserIds = [...new Set(grants.map((grant) => grant.userId))];
  const users =
    grantUserIds.length > 0
      ? await UserModel.findAll({
          attributes: ['id', 'name', 'email'],
          where: { id: { [Op.in]: grantUserIds } },
        })
      : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const recipients: LinkShareRecipient[] = [];
  for (const grant of grants) {
    const user = usersById.get(grant.userId);
    if (!user) continue;
    recipients.push({
      id: grant.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      acceptedAt: grant.acceptedAt.toISOString(),
      active: isActiveGrant(grant),
      access: publicGrantAccess(grant),
    });
  }
  const inviteActive = share ? isActiveShare(share) : false;

  return {
    id: share?.id ?? 0,
    token: share?.token ?? '',
    inviteActive,
    expiresAt:
      share && inviteActive ? (share.expiresAt?.toISOString() ?? null) : null,
    canViewStats: share?.canViewStats !== false,
    editableFields: share
      ? normalizeEditableFields(share.editableFields)
      : ['url'],
    recipientCount: recipients.filter((recipient) => recipient.active).length,
    recipients,
  } satisfies LinkShareDetails;
}

export async function saveLinkShare(input: {
  linkId: number;
  createdByUserId?: number | null;
  expiresAt?: string | Date | null;
  canViewStats: boolean;
  editableFields: unknown;
}) {
  await ensureDatabase();
  const editableFields = normalizeEditableFields(input.editableFields);
  if (!input.canViewStats && editableFields.length === 0) {
    throw new Error(serverMessage('shareNeedsPermission'));
  }

  const existing = await LinkAccessShareModel.findOne({
    where: { linkId: input.linkId },
  });
  const values = {
    expiresAt: normalizeShareExpiresAt(input.expiresAt),
    canViewStats: input.canViewStats,
    editableFields,
    updatedAt: new Date(),
  };

  if (existing) {
    await existing.update({
      ...values,
      ...(!isActiveShare(existing) || !existing.token.startsWith('slk_')
        ? { token: await uniqueShareToken() }
        : {}),
    });
    return existing;
  }

  return LinkAccessShareModel.create({
    linkId: input.linkId,
    token: await uniqueShareToken(),
    createdByUserId: input.createdByUserId ?? null,
    ...values,
  });
}

export async function rotateLinkShareToken(linkId: number) {
  await ensureDatabase();
  const share = await LinkAccessShareModel.findOne({
    where: { linkId },
  });
  if (!share) return null;
  await share.update({
    token: await uniqueShareToken(),
    updatedAt: new Date(),
  });
  return share;
}

export async function cancelLinkShare(linkId: number) {
  await ensureDatabase();
  const share = await LinkAccessShareModel.findOne({
    where: { linkId },
  });
  if (!share) return null;
  await share.update({
    expiresAt: new Date(),
    updatedAt: new Date(),
  });
  return share;
}

export async function acceptLinkShareInvite(input: {
  code?: string;
  domain?: string;
  token: string;
  userId: number;
}): Promise<AcceptLinkShareResult> {
  await ensureDatabase();
  const share = await LinkAccessShareModel.findOne({
    where: { token: input.token },
  });
  if (!share) return { status: 'not_found' };

  const link = await ShortLinkModel.findByPk(share.linkId);
  if (
    !link ||
    (input.code !== undefined && link.code !== input.code) ||
    (input.domain !== undefined && link.domain !== input.domain)
  ) {
    return { status: 'not_found' };
  }

  if (!isActiveShare(share)) return { status: 'expired', link };

  if (link.creatorUserId === input.userId) {
    return { status: 'owner', link, access: publicShareAccess(share) };
  }

  const existingGrant = await LinkAccessGrantModel.findOne({
    where: { linkId: link.id, userId: input.userId },
  });
  const grantValues = {
    shareId: share.id,
    linkId: link.id,
    userId: input.userId,
    expiresAt: share.expiresAt,
    canViewStats: share.canViewStats,
    editableFields: normalizeEditableFields(share.editableFields),
  };

  if (existingGrant) {
    if (!isActiveGrant(existingGrant)) {
      await existingGrant.update({
        ...grantValues,
        acceptedAt: new Date(),
      });
    }
  } else {
    await LinkAccessGrantModel.create(grantValues);
  }

  const grant =
    existingGrant ??
    (await LinkAccessGrantModel.findOne({
      where: { linkId: link.id, userId: input.userId },
    }));
  return {
    status: 'accepted',
    link,
    access: grant ? publicGrantAccess(grant) : publicShareAccess(share),
  };
}

export async function saveLinkShareGrant(input: {
  linkId: number;
  grantId: number;
  expiresAt?: string | Date | null;
  canViewStats: boolean;
  editableFields: unknown;
}) {
  await ensureDatabase();
  const editableFields = normalizeEditableFields(input.editableFields);
  if (!input.canViewStats && editableFields.length === 0) {
    throw new Error(serverMessage('shareNeedsPermission'));
  }

  const grant = await LinkAccessGrantModel.findOne({
    where: { id: input.grantId, linkId: input.linkId },
  });
  if (!grant) return null;

  await grant.update({
    expiresAt: normalizeShareExpiresAt(input.expiresAt),
    canViewStats: input.canViewStats,
    editableFields,
  });
  return grant;
}

export async function revokeLinkShareGrant(input: {
  linkId: number;
  grantId: number;
}) {
  await ensureDatabase();
  return LinkAccessGrantModel.destroy({
    where: { id: input.grantId, linkId: input.linkId },
  });
}

export async function revokeLinkShareGrants(input: {
  linkId: number;
  grantIds: number[];
}) {
  await ensureDatabase();
  const grantIds = [
    ...new Set(
      input.grantIds.filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  if (grantIds.length === 0) return 0;

  return LinkAccessGrantModel.destroy({
    where: {
      id: { [Op.in]: grantIds },
      linkId: input.linkId,
    },
  });
}
