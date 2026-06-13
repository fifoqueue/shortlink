import { literal, Op, type WhereOptions } from 'sequelize';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { SiteSettings } from '$lib/config';
import {
  ClickEventModel,
  ClickEventQueueModel,
  ShortLinkModel,
  UserModel,
  ensureDatabase,
  getDatabase,
} from './database';
import { serverMessage } from '$lib/i18n/ui-text';
import { sendVerificationEmail } from './email';
import { paginationMeta, pageOffset } from './pagination';
import { syncAutomaticPermissionGroupMembershipsForUser } from './permissions';
import { validatePassword, type PasswordPolicy } from './password-policy';

const KEY_LENGTH = 64;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function verificationUrl(origin: string, token: string) {
  const url = new URL('/signup/verify', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function ssoPasswordHash(provider: string, subject: string) {
  return `sso:${provider}:${subject}`;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, stored] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !stored) return false;
  const expected = Buffer.from(stored, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createEmailVerificationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function countUsers() {
  await ensureDatabase();
  return UserModel.count();
}

export async function listUsers() {
  await ensureDatabase();
  return UserModel.findAll({ order: [['created_at', 'ASC']] });
}

export async function searchUsers(
  input: {
    query?: string | null;
    page?: number;
    pageSize?: number;
    includeIds?: number[];
    excludeIds?: number[];
    excludePermissionGroupId?: number;
  } = {},
) {
  await ensureDatabase();
  const query = (input.query ?? '').trim().slice(0, 120);
  const includeIds = input.includeIds
    ? [...new Set(input.includeIds.filter((id) => Number.isSafeInteger(id)))]
    : undefined;
  const excludeIds = [
    ...new Set(
      (input.excludeIds ?? []).filter((id) => Number.isSafeInteger(id)),
    ),
  ];

  const emptyPagination = paginationMeta({
    totalItems: 0,
    page: input.page,
    pageSize: input.pageSize,
  });
  if (includeIds && includeIds.length === 0) {
    return {
      items: [],
      total: 0,
      page: emptyPagination.page,
      totalPages: emptyPagination.totalPages,
      pageSize: emptyPagination.pageSize,
      query,
    };
  }

  const conditions: WhereOptions<UserModel>[] = [];
  if (query) {
    const like = `%${query}%`;
    const numericId = Number(query);
    conditions.push({
      [Op.or]: [
        { email: { [Op.iLike]: like } },
        { name: { [Op.iLike]: like } },
        ...(Number.isSafeInteger(numericId) && numericId > 0
          ? [{ id: numericId }]
          : []),
      ],
    });
  }
  if (includeIds) conditions.push({ id: { [Op.in]: includeIds } });
  if (excludeIds.length > 0)
    conditions.push({ id: { [Op.notIn]: excludeIds } });
  if (
    input.excludePermissionGroupId &&
    Number.isSafeInteger(input.excludePermissionGroupId) &&
    input.excludePermissionGroupId > 0
  ) {
    conditions.push({
      id: {
        [Op.notIn]: literal(
          `(SELECT user_id FROM permission_group_users WHERE group_id = ${input.excludePermissionGroupId})`,
        ),
      },
    } as WhereOptions<UserModel>);
  }

  const where: WhereOptions<UserModel> =
    conditions.length > 0 ? { [Op.and]: conditions } : {};
  const total = await UserModel.count({ where });
  const pagination = paginationMeta({
    totalItems: total,
    page: input.page,
    pageSize: input.pageSize,
  });
  const items = await UserModel.findAll({
    where,
    order: [
      ['name', 'ASC'],
      ['email', 'ASC'],
      ['id', 'ASC'],
    ],
    limit: pagination.pageSize,
    offset: pageOffset(pagination),
  });

  return {
    items,
    total,
    page: pagination.page,
    totalPages: pagination.totalPages,
    pageSize: pagination.pageSize,
    query,
  };
}

export async function getUserById(id: number) {
  await ensureDatabase();
  return UserModel.findByPk(id);
}

export async function findEnabledUserByEmail(email: string | null) {
  await ensureDatabase();
  const normalized = normalizeEmail(email ?? '');
  if (!normalized || !normalized.includes('@')) return null;
  return UserModel.findOne({
    where: { email: normalized, enabled: true },
  });
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  isAdmin: boolean;
  enabled?: boolean;
  emailVerifiedAt?: Date | null;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
  passwordPolicy?: PasswordPolicy;
}) {
  await ensureDatabase();
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@'))
    throw new Error(serverMessage('validEmailRequired'));
  const existing = await UserModel.findOne({ where: { email } });
  if (existing) throw new Error(serverMessage('emailInUse'));
  validatePassword(input.password, input.passwordPolicy);
  const user = await UserModel.create({
    email,
    pending_email: null,
    name: input.name.trim().slice(0, 120) || email,
    password_hash: hashPassword(input.password),
    is_admin: input.isAdmin,
    enabled: input.enabled !== false,
    email_verified_at: input.emailVerifiedAt ?? null,
    email_verification_token_hash: input.emailVerificationTokenHash ?? null,
    email_verification_expires_at: input.emailVerificationExpiresAt ?? null,
  });
  await syncAutomaticPermissionGroupMembershipsForUser(user.id);
  return user;
}

export async function ensureUserEmailAvailable(
  email: string,
  exceptId: number,
) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error(serverMessage('validEmailRequired'));
  }
  const existing = await UserModel.findOne({
    where: { email: normalized, id: { [Op.ne]: exceptId } },
  });
  if (existing) throw new Error(serverMessage('emailInUse'));
  return normalized;
}

export async function upsertSsoUser(input: {
  email: string | null;
  name: string;
  provider: string;
  subject: string;
  emailVerifiedAt?: Date | null;
}) {
  await ensureDatabase();
  const email = normalizeEmail(input.email ?? '');
  if (!email || !email.includes('@')) {
    throw new Error(serverMessage('ssoEmailMissing'));
  }

  const name = input.name.trim().slice(0, 120) || email;
  const existing = await UserModel.findOne({ where: { email } });
  if (existing) {
    if (!existing.enabled) throw new Error(serverMessage('userDisabled'));
    const updates: Partial<UserModel> = {
      name,
    };
    if (input.emailVerifiedAt && !existing.email_verified_at) {
      updates.email_verified_at = input.emailVerifiedAt;
    }
    await existing.update(updates);
    return existing;
  }

  const user = await UserModel.create({
    email,
    pending_email: null,
    name,
    password_hash: ssoPasswordHash(input.provider, input.subject),
    is_admin: false,
    enabled: true,
    email_verified_at: input.emailVerifiedAt ?? null,
  });
  await syncAutomaticPermissionGroupMembershipsForUser(user.id);
  return user;
}

export async function createPendingSsoUser(input: {
  settings: SiteSettings;
  origin: string;
  email: string | null;
  name: string;
  provider: string;
  subject: string;
}) {
  await ensureDatabase();
  const email = normalizeEmail(input.email ?? '');
  if (!email || !email.includes('@')) {
    throw new Error(serverMessage('ssoEmailMissing'));
  }

  const name = input.name.trim().slice(0, 120) || email;
  const passwordHash = ssoPasswordHash(input.provider, input.subject);
  const token = createEmailVerificationToken();
  const expiresAt = new Date(
    Date.now() +
      input.settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
  );
  const verification = {
    email_verification_token_hash: hashEmailVerificationToken(token),
    email_verification_expires_at: expiresAt,
  };

  const existing = await UserModel.findOne({ where: { email } });
  let user = existing;
  let created = false;

  if (user) {
    if (user.enabled) {
      throw new Error(serverMessage('ssoExistingAccountLinkRequired'));
    }
    if (user.password_hash !== passwordHash) {
      throw new Error(serverMessage('userDisabled'));
    }
    await user.update({
      name,
      pending_email: null,
      ...verification,
    });
  } else {
    user = await UserModel.create({
      email,
      pending_email: null,
      name,
      password_hash: passwordHash,
      is_admin: false,
      enabled: false,
      email_verified_at: null,
      ...verification,
    });
    created = true;
  }

  try {
    await sendVerificationEmail({
      settings: input.settings,
      email,
      name,
      verificationUrl: verificationUrl(input.origin, token),
    });
  } catch (cause) {
    if (created) {
      await user.destroy();
    } else {
      await user.update({
        email_verification_token_hash: null,
        email_verification_expires_at: null,
      });
    }
    throw cause;
  }

  return user;
}

export async function authenticateUser(email: string, password: string) {
  await ensureDatabase();
  const user = await UserModel.findOne({
    where: { email: normalizeEmail(email), enabled: true },
  });
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}

export async function ensureCanDeleteUser(id: number) {
  await ensureDatabase();
  const user = await UserModel.findByPk(id);
  if (!user) throw new Error(serverMessage('userNotFound'));
  if (!user.is_admin) return;

  const adminCount = await UserModel.count({
    where: { is_admin: true, enabled: true },
  });
  if (adminCount <= 1) {
    throw new Error(serverMessage('onlyAdminDeleteDenied'));
  }
}

export async function ensureCanLoseAdmin(id: number) {
  await ensureDatabase();
  const user = await UserModel.findByPk(id);
  if (!user) throw new Error(serverMessage('userNotFound'));
  if (!user.is_admin) return;

  const adminCount = await UserModel.count({
    where: { is_admin: true, enabled: true },
  });
  if (adminCount <= 1) {
    throw new Error(serverMessage('onlyAdminDemoteDenied'));
  }
}

export async function updateUser(input: {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  enabled: boolean;
  password?: string;
  passwordPolicy?: PasswordPolicy;
}) {
  await ensureDatabase();
  const user = await UserModel.findByPk(input.id);
  if (!user) throw new Error(serverMessage('userNotFound'));
  const email = await ensureUserEmailAvailable(input.email, user.id);
  const emailChanged = email !== user.email;
  if ((user.is_admin && !input.isAdmin) || (user.is_admin && !input.enabled)) {
    await ensureCanLoseAdmin(user.id);
  }
  const next: Partial<UserModel> = {
    email,
    pending_email: null,
    name: input.name.trim().slice(0, 120) || email,
    is_admin: input.isAdmin,
    enabled: input.enabled,
    email_verification_token_hash: null,
    email_verification_expires_at: null,
  };
  if (input.password !== undefined && input.password !== '') {
    validatePassword(input.password, input.passwordPolicy);
    next.password_hash = hashPassword(input.password);
  }
  await user.update(next);
  if (emailChanged)
    await syncAutomaticPermissionGroupMembershipsForUser(user.id);
  return user;
}

export async function updateOwnProfile(input: {
  id: number;
  email: string;
  name: string;
  settings: SiteSettings;
  origin: string;
}) {
  await ensureDatabase();
  const user = await UserModel.findByPk(input.id);
  if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
  const email = await ensureUserEmailAvailable(input.email, user.id);
  const name = input.name.trim().slice(0, 120) || email;

  if (email === user.email) {
    await user.update({ name });
    return {
      user,
      emailVerificationRequired: false,
      pendingEmail: user.pending_email,
    };
  }

  const token = createEmailVerificationToken();
  const expiresAt = new Date(
    Date.now() +
      input.settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
  );

  await user.update({
    name,
    pending_email: email,
    email_verification_token_hash: hashEmailVerificationToken(token),
    email_verification_expires_at: expiresAt,
  });

  try {
    await sendVerificationEmail({
      settings: input.settings,
      email,
      name,
      verificationUrl: verificationUrl(input.origin, token),
      purpose: 'email-change',
    });
  } catch (cause) {
    await user.update({
      pending_email: null,
      email_verification_token_hash: null,
      email_verification_expires_at: null,
    });
    throw cause;
  }

  return {
    user,
    emailVerificationRequired: true,
    pendingEmail: email,
  };
}

export async function changeOwnPassword(input: {
  id: number;
  currentPassword: string;
  nextPassword: string;
  passwordPolicy?: PasswordPolicy;
}) {
  await ensureDatabase();
  const user = await UserModel.findByPk(input.id);
  if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
  const hasLocalPassword = user.password_hash.startsWith('scrypt:');
  if (
    hasLocalPassword &&
    !verifyPassword(input.currentPassword, user.password_hash)
  ) {
    throw new Error(serverMessage('currentPasswordMismatch'));
  }
  validatePassword(input.nextPassword, input.passwordPolicy);
  await user.update({ password_hash: hashPassword(input.nextPassword) });
  return user;
}

export async function verifyUserEmailToken(token: string) {
  await ensureDatabase();
  const tokenHash = hashEmailVerificationToken(token.trim());
  const user = await UserModel.findOne({
    where: {
      email_verification_token_hash: tokenHash,
      email_verification_expires_at: { [Op.gt]: new Date() },
    },
  });
  if (!user) return null;

  const pendingEmail = normalizeEmail(user.pending_email ?? '');
  if (pendingEmail) {
    try {
      await ensureUserEmailAvailable(pendingEmail, user.id);
    } catch {
      await user.update({
        pending_email: null,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
      });
      return null;
    }
    await user.update({
      email: pendingEmail,
      pending_email: null,
      email_verified_at: new Date(),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
    });
    await syncAutomaticPermissionGroupMembershipsForUser(user.id);
    return { user, purpose: 'email-change' as const };
  }

  await user.update({
    enabled: true,
    email_verified_at: new Date(),
    email_verification_token_hash: null,
    email_verification_expires_at: null,
  });
  await syncAutomaticPermissionGroupMembershipsForUser(user.id);
  return { user, purpose: 'signup' as const };
}

export async function rotateUserSessionVersion(id: number) {
  await ensureDatabase();
  const user = await UserModel.findByPk(id);
  if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
  await user.update({ session_version: user.session_version + 1 });
  return user;
}

export async function deleteUser(id: number) {
  await ensureDatabase();
  await ensureCanDeleteUser(id);
  return getDatabase().transaction(async (transaction) => {
    const links = await ShortLinkModel.findAll({
      attributes: ['id'],
      where: { creator_user_id: id },
      raw: true,
      transaction,
    });
    const linkIds = links.map((link) => link.id);
    if (linkIds.length > 0) {
      await ClickEventQueueModel.destroy({
        where: { link_id: { [Op.in]: linkIds } },
        transaction,
      });
      await ClickEventModel.destroy({
        where: { link_id: { [Op.in]: linkIds } },
        transaction,
      });
    }
    await ShortLinkModel.destroy({
      where: { creator_user_id: id },
      transaction,
    });
    return UserModel.destroy({ where: { id }, transaction });
  });
}
