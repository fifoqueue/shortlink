import { Op, type Transaction } from 'sequelize';
import {
  UserIdentityModel,
  UserModel,
  UserPasskeyCredentialModel,
  ensureDatabase,
  getDatabase,
} from './database';
import { serverMessage } from '$lib/i18n/ui-text';

export interface LoginMethodAvailability {
  password: boolean;
  passkey: boolean;
  identityProviders: readonly string[];
}

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

export async function linkIdentity(
  input: {
    userId: number;
    provider: string;
    subject: string;
    email?: string | null;
  },
  transaction?: Transaction,
): Promise<UserIdentityModel> {
  if (!transaction) await ensureDatabase();
  if (!transaction)
    return getDatabase().transaction((transaction) =>
      linkIdentity(input, transaction),
    );
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
    transaction,
  });

  if (identity.userId !== input.userId) {
    throw new Error(serverMessage('identityAlreadyLinked'));
  }

  await identity.update(
    { email: normalizeEmail(input.email) },
    { transaction },
  );
  return identity;
}

export async function unlinkIdentity(
  input: {
    userId: number;
    provider: string;
    identityId: number;
  } & ({ adminOverride: true } | { loginMethods: LoginMethodAvailability }),
) {
  await ensureDatabase();
  return getDatabase().transaction(async (transaction) => {
    const user = await UserModel.findByPk(input.userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new Error(serverMessage('userNotFound'));
    if ('loginMethods' in input) {
      const methods = input.loginMethods;
      const passwordAvailable =
        methods.password && user.passwordHash.startsWith('scrypt:');
      const passkeyAvailable =
        methods.passkey &&
        (await UserPasskeyCredentialModel.count({
          where: { userId: user.id },
          transaction,
        })) > 0;
      const identityAvailable =
        (await UserIdentityModel.count({
          where: {
            userId: user.id,
            id: { [Op.ne]: input.identityId },
            provider: { [Op.in]: [...methods.identityProviders] },
          },
          transaction,
        })) > 0;
      if (!passwordAvailable && !passkeyAvailable && !identityAvailable)
        throw new Error(serverMessage('lastLoginMethodRemovalDenied'));
    }
    return UserIdentityModel.destroy({
      where: {
        id: input.identityId,
        userId: input.userId,
        provider: input.provider,
      },
      transaction,
    });
  });
}
