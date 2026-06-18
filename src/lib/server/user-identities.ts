import { UserIdentityModel, UserModel, ensureDatabase } from './database';
import { serverMessage } from '$lib/i18n/ui-text';

function normalizeEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? '';
  return value && value.includes('@') ? value : null;
}

export async function listUserIdentities(userId: number) {
  await ensureDatabase();
  return UserIdentityModel.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
  });
}

export async function findIdentity(provider: string, subject: string) {
  await ensureDatabase();
  return UserIdentityModel.findOne({
    where: { provider, subject },
    include: [{ model: UserModel, as: 'user' }],
  });
}

export async function linkIdentity(input: {
  userId: number;
  provider: string;
  subject: string;
  email?: string | null;
}) {
  await ensureDatabase();
  const [identity] = await UserIdentityModel.findOrCreate({
    where: {
      provider: input.provider,
      subject: input.subject,
    },
    defaults: {
      userId: input.userId,
      provider: input.provider,
      subject: input.subject,
      email: normalizeEmail(input.email),
    },
  });

  if (identity.userId !== input.userId) {
    throw new Error(serverMessage('identityAlreadyLinked'));
  }

  await identity.update({ email: normalizeEmail(input.email) });
  return identity;
}

export async function unlinkIdentity(input: {
  userId: number;
  provider: string;
  identityId: number;
}) {
  await ensureDatabase();
  return UserIdentityModel.destroy({
    where: {
      id: input.identityId,
      userId: input.userId,
      provider: input.provider,
    },
  });
}
