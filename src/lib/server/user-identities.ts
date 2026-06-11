import { UserIdentityModel, UserModel, ensureDatabase } from './database';
import { serverMessage } from '$lib/i18n/ui-text';

function normalizeEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? '';
  return value && value.includes('@') ? value : null;
}

export async function listUserIdentities(userId: number) {
  await ensureDatabase();
  return UserIdentityModel.findAll({
    where: { user_id: userId },
    order: [['created_at', 'ASC']],
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
      user_id: input.userId,
      provider: input.provider,
      subject: input.subject,
      email: normalizeEmail(input.email),
    },
  });

  if (identity.user_id !== input.userId) {
    throw new Error(serverMessage('oidcAccountAlreadyLinked'));
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
      user_id: input.userId,
      provider: input.provider,
    },
  });
}
