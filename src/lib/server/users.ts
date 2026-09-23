import { literal, Op, type Transaction, type WhereOptions } from 'sequelize';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { SiteSettings } from '$lib/config';
import {
  ClickEventModel,
  ClickEventQueueModel,
  ShortLinkModel,
  UserModel,
  UserIdentityModel,
  UserPasskeyCredentialModel,
  USER_ADMIN_LOCK_KEY,
  ensureDatabase,
  getDatabase,
} from './database';
import { serverMessage } from '$lib/i18n/ui-text';
import { sendPasswordResetEmail, sendVerificationEmail } from './email';
import { paginationMeta, pageOffset } from './pagination';
import { syncAutomaticPermissionGroupMembershipsForUser } from './permissions';
import { validatePassword, type PasswordPolicy } from './password-policy';
import { linkIdentity, type LoginMethodAvailability } from './user-identities';

const KEY_LENGTH = 64;
const deriveKey = promisify<string, string, number, Buffer>(scrypt);
declare const passwordHashBrand: unique symbol;
type PasswordHash = string & { readonly [passwordHashBrand]: true };
export { USER_ADMIN_LOCK_KEY } from './database';

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

function deletedPasswordHash() {
  return `deleted:${randomBytes(32).toString('base64url')}`;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await deriveKey(password, salt, KEY_LENGTH)).toString(
    'base64url',
  );
  return `scrypt:${salt}:${hash}` as PasswordHash;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, stored] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !stored) return false;
  const expected = Buffer.from(stored, 'base64url');
  const actual = await deriveKey(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createEmailVerificationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export const createPasswordResetToken = createEmailVerificationToken;

export function hashPasswordResetToken(token: string) {
  return hashEmailVerificationToken(token);
}

export async function countUsers(transaction?: Transaction) {
  if (!transaction) await ensureDatabase();
  return UserModel.count({ transaction });
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

export async function createUser(
  input: {
    email: string;
    name: string;
    password: string;
    isAdmin: boolean;
    enabled?: boolean;
    emailVerifiedAt?: Date | null;
    emailVerificationTokenHash?: string | null;
    emailVerificationExpiresAt?: Date | null;
    passwordPolicy?: PasswordPolicy;
  },
  transaction?: Transaction,
  preparedPasswordHash?: PasswordHash,
): Promise<UserModel> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@'))
    throw new Error(serverMessage('validEmailRequired'));
  if (!transaction) await ensureDatabase();
  validatePassword(input.password, input.passwordPolicy);
  const passwordHash =
    preparedPasswordHash ?? (await hashPassword(input.password));
  if (!transaction) {
    return getDatabase().transaction((transaction) =>
      createUser(input, transaction, passwordHash),
    );
  }
  await getDatabase().query(
    `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
    { transaction },
  );
  const existing = await UserModel.findOne({ where: { email }, transaction });
  if (existing) throw new Error(serverMessage('emailInUse'));
  const user = await UserModel.create(
    {
      email,
      pendingEmail: null,
      name: input.name.trim().slice(0, 120) || email,
      passwordHash,
      isAdmin: input.isAdmin,
      enabled: input.enabled !== false,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      emailVerificationTokenHash: input.emailVerificationTokenHash ?? null,
      emailVerificationExpiresAt: input.emailVerificationExpiresAt ?? null,
    },
    { transaction },
  );
  await syncAutomaticPermissionGroupMembershipsForUser(user.id, transaction);
  return user;
}

export async function ensureUserEmailAvailable(
  email: string,
  exceptId: number,
  transaction?: Transaction,
) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error(serverMessage('validEmailRequired'));
  }
  const existing = await UserModel.findOne({
    where: { email: normalized, id: { [Op.ne]: exceptId } },
    transaction,
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

  return getDatabase().transaction(async (transaction) => {
    await getDatabase().query(
      `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
      { transaction },
    );
    const name = input.name.trim().slice(0, 120) || email;
    const existing = await UserModel.findOne({
      where: { email },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existing) {
      if (!existing.enabled) throw new Error(serverMessage('userDisabled'));
      const updates: Partial<UserModel> = {
        name,
      };
      if (input.emailVerifiedAt && !existing.emailVerifiedAt) {
        updates.emailVerifiedAt = input.emailVerifiedAt;
      }
      await existing.update(updates, { transaction });
      await linkIdentity(
        {
          userId: existing.id,
          provider: input.provider,
          subject: input.subject,
          email,
        },
        transaction,
      );
      return existing;
    }

    const user = await UserModel.create(
      {
        email,
        pendingEmail: null,
        name,
        passwordHash: ssoPasswordHash(input.provider, input.subject),
        isAdmin: false,
        enabled: true,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
      },
      { transaction },
    );
    await linkIdentity(
      {
        userId: user.id,
        provider: input.provider,
        subject: input.subject,
        email,
      },
      transaction,
    );
    await syncAutomaticPermissionGroupMembershipsForUser(user.id, transaction);
    return user;
  });
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
    emailVerificationTokenHash: hashEmailVerificationToken(token),
    emailVerificationExpiresAt: expiresAt,
  };

  const { user, created } = await getDatabase().transaction(
    async (transaction) => {
      await getDatabase().query(
        `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
        { transaction },
      );
      const existing = await UserModel.findOne({
        where: { email },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing) {
        if (existing.enabled)
          throw new Error(serverMessage('ssoExistingAccountLinkRequired'));
        if (existing.passwordHash !== passwordHash)
          throw new Error(serverMessage('userDisabled'));
        await existing.update(
          { name, pendingEmail: null, ...verification },
          { transaction },
        );
        await linkIdentity(
          {
            userId: existing.id,
            provider: input.provider,
            subject: input.subject,
            email,
          },
          transaction,
        );
        return { user: existing, created: false };
      }
      const user = await UserModel.create(
        {
          email,
          pendingEmail: null,
          name,
          passwordHash,
          isAdmin: false,
          enabled: false,
          emailVerifiedAt: null,
          ...verification,
        },
        { transaction },
      );
      await linkIdentity(
        {
          userId: user.id,
          provider: input.provider,
          subject: input.subject,
          email,
        },
        transaction,
      );
      return { user, created: true };
    },
  );

  try {
    await sendVerificationEmail({
      settings: input.settings,
      email,
      name,
      verificationUrl: verificationUrl(input.origin, token),
    });
  } catch (cause) {
    const where = {
      id: user.id,
      enabled: false,
      emailVerificationTokenHash: verification.emailVerificationTokenHash,
    };
    if (created) {
      await getDatabase().transaction(async (transaction) => {
        await getDatabase().query(
          `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
          { transaction },
        );
        await UserModel.destroy({ where, transaction });
      });
    } else {
      await UserModel.update(
        {
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
        { where },
      );
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
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return null;
  return user;
}

export async function ensureCanDeleteUser(
  id: number,
  transaction?: Transaction,
) {
  if (!transaction) await ensureDatabase();
  const user = await UserModel.findByPk(id, { transaction });
  if (!user) throw new Error(serverMessage('userNotFound'));
  if (!user.isAdmin || !user.enabled) return;

  const adminCount = await UserModel.count({
    where: { isAdmin: true, enabled: true },
    transaction,
  });
  if (adminCount <= 1) {
    throw new Error(serverMessage('onlyAdminDeleteDenied'));
  }
}

export async function ensureCanLoseAdmin(
  id: number,
  transaction?: Transaction,
) {
  if (!transaction) await ensureDatabase();
  const user = await UserModel.findByPk(id, { transaction });
  if (!user) throw new Error(serverMessage('userNotFound'));
  if (!user.isAdmin || !user.enabled) return;

  const adminCount = await UserModel.count({
    where: { isAdmin: true, enabled: true },
    transaction,
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
  let passwordHash: PasswordHash | undefined;
  if (input.password !== undefined && input.password !== '') {
    validatePassword(input.password, input.passwordPolicy);
    passwordHash = await hashPassword(input.password);
  }
  return getDatabase().transaction(async (transaction) => {
    await getDatabase().query(
      `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
      { transaction },
    );
    const user = await UserModel.findByPk(input.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new Error(serverMessage('userNotFound'));
    const email = await ensureUserEmailAvailable(
      input.email,
      user.id,
      transaction,
    );
    if ((user.isAdmin && !input.isAdmin) || (user.isAdmin && !input.enabled)) {
      await ensureCanLoseAdmin(user.id, transaction);
    }
    const next: Partial<UserModel> = {
      email,
      pendingEmail: null,
      name: input.name.trim().slice(0, 120) || email,
      isAdmin: input.isAdmin,
      enabled: input.enabled,
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    };
    if (passwordHash !== undefined) {
      next.passwordHash = passwordHash;
      next.sessionVersion = user.sessionVersion + 1;
      next.passwordResetTokenHash = null;
      next.passwordResetExpiresAt = null;
    }
    await user.update(next, { transaction });
    await syncAutomaticPermissionGroupMembershipsForUser(user.id, transaction);
    return user;
  });
}

export async function updateOwnProfile(input: {
  id: number;
  email: string;
  name: string;
  settings: SiteSettings;
  origin: string;
}) {
  await ensureDatabase();
  const token = createEmailVerificationToken();
  const tokenHash = hashEmailVerificationToken(token);
  const result = await getDatabase().transaction(async (transaction) => {
    const user = await UserModel.findByPk(input.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
    const email = await ensureUserEmailAvailable(
      input.email,
      user.id,
      transaction,
    );
    const name = input.name.trim().slice(0, 120) || email;
    if (email === user.email) {
      await user.update({ name }, { transaction });
      return {
        user,
        emailVerificationRequired: false,
        pendingEmail: user.pendingEmail,
      };
    }
    await user.update(
      {
        name,
        pendingEmail: email,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(
          Date.now() +
            input.settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
        ),
      },
      { transaction },
    );
    return { user, emailVerificationRequired: true, pendingEmail: email };
  });
  if (!result.emailVerificationRequired) return result;
  try {
    await sendVerificationEmail({
      settings: input.settings,
      email: result.pendingEmail!,
      name: result.user.name,
      verificationUrl: verificationUrl(input.origin, token),
      purpose: 'email-change',
    });
  } catch (cause) {
    await UserModel.update(
      {
        pendingEmail: null,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
      { where: { id: result.user.id, emailVerificationTokenHash: tokenHash } },
    );
    throw cause;
  }
  return result;
}

export async function changeOwnPassword(input: {
  id: number;
  currentPassword: string;
  nextPassword: string;
  passwordPolicy?: PasswordPolicy;
}) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    const user = await UserModel.findByPk(input.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
    const hasLocalPassword = user.passwordHash.startsWith('scrypt:');
    if (
      hasLocalPassword &&
      !(await verifyPassword(input.currentPassword, user.passwordHash))
    ) {
      throw new Error(serverMessage('currentPasswordMismatch'));
    }
    validatePassword(input.nextPassword, input.passwordPolicy);
    await user.update(
      {
        passwordHash: await hashPassword(input.nextPassword),
        sessionVersion: user.sessionVersion + 1,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      { transaction },
    );
    return user;
  });
}
export async function deleteOwnPassword(input: {
  id: number;
  currentPassword: string;
  loginMethods: LoginMethodAvailability;
}) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    const user = await UserModel.findByPk(input.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user || !user.enabled) throw new Error(serverMessage('userNotFound'));
    if (!user.passwordHash.startsWith('scrypt:')) {
      throw new Error(serverMessage('localPasswordMissing'));
    }
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new Error(serverMessage('currentPasswordMismatch'));
    }
    const passkeyAvailable =
      input.loginMethods.passkey &&
      (await UserPasskeyCredentialModel.count({
        where: { userId: user.id },
        transaction,
      })) > 0;
    const identityAvailable =
      (await UserIdentityModel.count({
        where: {
          userId: user.id,
          provider: { [Op.in]: [...input.loginMethods.identityProviders] },
        },
        transaction,
      })) > 0;
    if (!passkeyAvailable && !identityAvailable)
      throw new Error(serverMessage('passwordDeleteAlternativeRequired'));
    await user.update(
      {
        passwordHash: deletedPasswordHash(),
        sessionVersion: user.sessionVersion + 1,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      { transaction },
    );
    return user;
  });
}
export async function resendSignupVerificationEmail(input: {
  settings: SiteSettings;
  origin: string;
  email: string;
}) {
  await ensureDatabase();
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@')) {
    throw new Error(serverMessage('validEmailRequired'));
  }

  const user = await UserModel.findOne({ where: { email } });
  if (!user || user.enabled || user.emailVerifiedAt) return false;

  const token = createEmailVerificationToken();
  const [updated] = await UserModel.update(
    {
      emailVerificationTokenHash: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: new Date(
        Date.now() +
          input.settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
      ),
    },
    { where: { id: user.id, enabled: false, emailVerifiedAt: null } },
  );
  if (!updated) return false;

  try {
    await sendVerificationEmail({
      settings: input.settings,
      email: user.email,
      name: user.name,
      verificationUrl: verificationUrl(input.origin, token),
    });
  } catch (cause) {
    await UserModel.update(
      {
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
      {
        where: {
          id: user.id,
          emailVerificationTokenHash: hashEmailVerificationToken(token),
        },
      },
    );
    throw cause;
  }

  return true;
}

function passwordResetUrl(origin: string, token: string) {
  const url = new URL('/login/reset-password', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function requestUserPasswordReset(input: {
  settings: SiteSettings;
  origin: string;
  email: string;
}) {
  await ensureDatabase();
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@')) {
    throw new Error(serverMessage('validEmailRequired'));
  }

  const user = await UserModel.findOne({ where: { email, enabled: true } });
  if (!user || !user.passwordHash.startsWith('scrypt:')) return false;

  const token = createPasswordResetToken();
  const [updated] = await UserModel.update(
    {
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: new Date(
        Date.now() +
          input.settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
      ),
    },
    { where: { id: user.id, enabled: true, passwordHash: user.passwordHash } },
  );
  if (!updated) return false;

  try {
    await sendPasswordResetEmail({
      settings: input.settings,
      email: user.email,
      name: user.name,
      resetUrl: passwordResetUrl(input.origin, token),
    });
  } catch (cause) {
    await UserModel.update(
      {
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      {
        where: {
          id: user.id,
          passwordResetTokenHash: hashPasswordResetToken(token),
        },
      },
    );
    throw cause;
  }

  return true;
}

export async function resetUserPasswordWithToken(input: {
  token: string;
  password: string;
  passwordPolicy?: PasswordPolicy;
}) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    const tokenHash = hashPasswordResetToken(input.token.trim());
    const user = await UserModel.findOne({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { [Op.gt]: new Date() },
        enabled: true,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() <= Date.now()
    )
      return null;
    validatePassword(input.password, input.passwordPolicy);
    await user.update(
      {
        passwordHash: await hashPassword(input.password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        sessionVersion: user.sessionVersion + 1,
      },
      { transaction },
    );
    return user;
  });
}
export async function verifyUserEmailToken(token: string) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    await getDatabase().query(
      `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
      { transaction },
    );
    const tokenHash = hashEmailVerificationToken(token.trim());
    const user = await UserModel.findOne({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { [Op.gt]: new Date() },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() <= Date.now()
    )
      return null;

    const pendingEmail = normalizeEmail(user.pendingEmail ?? '');
    if (pendingEmail) {
      try {
        await ensureUserEmailAvailable(pendingEmail, user.id, transaction);
      } catch {
        await user.update(
          {
            pendingEmail: null,
            emailVerificationTokenHash: null,
            emailVerificationExpiresAt: null,
          },
          { transaction },
        );
        return null;
      }
      await user.update(
        {
          email: pendingEmail,
          pendingEmail: null,
          emailVerifiedAt: new Date(),
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
        { transaction },
      );
      await syncAutomaticPermissionGroupMembershipsForUser(
        user.id,
        transaction,
      );
      return { user, purpose: 'email-change' as const };
    }

    await user.update(
      {
        enabled: true,
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
      { transaction },
    );
    await syncAutomaticPermissionGroupMembershipsForUser(user.id, transaction);
    return { user, purpose: 'signup' as const };
  });
}
export async function rotateUserSessionVersion(id: number) {
  await ensureDatabase();
  const [, users] = await UserModel.update(
    { sessionVersion: literal('session_version + 1') },
    { where: { id, enabled: true }, returning: true },
  );
  const user = users[0];
  if (!user) throw new Error(serverMessage('userNotFound'));
  return user;
}

export async function deleteUser(id: number) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    await getDatabase().query(
      `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
      { transaction },
    );
    const user = await UserModel.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new Error(serverMessage('userNotFound'));
    await ensureCanDeleteUser(id, transaction);
    const links = await ShortLinkModel.findAll({
      attributes: ['id'],
      where: { creatorUserId: id },
      raw: true,
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['id', 'ASC']],
    });
    const linkIds = links.map((link) => link.id);
    if (linkIds.length > 0) {
      await ClickEventQueueModel.destroy({
        where: { linkId: { [Op.in]: linkIds } },
        transaction,
      });
      await ClickEventModel.destroy({
        where: { linkId: { [Op.in]: linkIds } },
        transaction,
      });
    }
    await ShortLinkModel.destroy({
      where: { creatorUserId: id },
      transaction,
    });
    return UserModel.destroy({ where: { id }, transaction });
  });
}
