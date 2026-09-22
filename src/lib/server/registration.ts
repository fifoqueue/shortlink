import type { Transaction } from 'sequelize';
import { ensureDatabase, getDatabase, UserModel } from './database';
import type { SiteSettings } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';
import {
  countUsers,
  USER_ADMIN_LOCK_KEY,
  createEmailVerificationToken,
  createUser,
  hashEmailVerificationToken,
  hashPassword,
  verifyUserEmailToken,
} from './users';
import { sendVerificationEmail } from './email';
import { validatePassword } from './password-policy';
import { updateSettings } from './settings';
import {
  normalizeShortLinkDomainSettings,
  shortLinkDomainSchemeFromOrigin,
  shortLinkHostnameFromOrigin,
} from './url';

function verificationUrl(origin: string, token: string) {
  const url = new URL('/signup/verify', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function registrationAvailability(
  settings: SiteSettings,
  options: { passwordLoginEnabled?: boolean } = {},
  transaction?: Transaction,
) {
  const setupRequired = (await countUsers(transaction)) === 0;
  if (setupRequired) {
    return {
      allowed: true,
      reason: '',
      setupRequired,
    };
  }

  if (!settings.auth.registration.enabled) {
    return {
      allowed: false,
      reason: serverMessage('registrationDisabled'),
      setupRequired,
    };
  }

  const passwordLoginEnabled = options.passwordLoginEnabled ?? true;
  if (!passwordLoginEnabled) {
    return {
      allowed: false,
      reason: serverMessage('passwordLoginDisabled'),
      setupRequired,
    };
  }

  return { allowed: true, reason: '', setupRequired };
}

export async function registerUser(input: {
  settings: SiteSettings;
  origin: string;
  email: string;
  name: string;
  password: string;
  passwordLoginEnabled?: boolean;
}) {
  const { settings, origin, email, name, password, passwordLoginEnabled } =
    input;
  await ensureDatabase();
  if (!email.trim().includes('@'))
    throw new Error(serverMessage('validEmailRequired'));
  validatePassword(password, settings.auth.password);
  const passwordHash = await hashPassword(password);
  const { user, firstUser, verificationEnabled, token } =
    await getDatabase().transaction(async (transaction) => {
      await getDatabase().query(
        `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
        { transaction },
      );
      const availability = await registrationAvailability(
        settings,
        {
          passwordLoginEnabled,
        },
        transaction,
      );
      if (!availability.allowed) throw new Error(availability.reason);

      const firstUser = availability.setupRequired;
      const verificationEnabled =
        settings.auth.emailVerification.enabled && !firstUser;
      const token = verificationEnabled ? createEmailVerificationToken() : '';
      const expiresAt = verificationEnabled
        ? new Date(
            Date.now() +
              settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
          )
        : null;

      const user = await createUser(
        {
          email,
          name,
          password,
          isAdmin: firstUser,
          enabled: !verificationEnabled,
          emailVerifiedAt: verificationEnabled ? null : new Date(),
          emailVerificationTokenHash: token
            ? hashEmailVerificationToken(token)
            : null,
          emailVerificationExpiresAt: expiresAt,
          passwordPolicy: settings.auth.password,
        },
        transaction,
        passwordHash,
      );
      if (firstUser) {
        await updateSettings((current) => {
          const defaultDomain = shortLinkHostnameFromOrigin(origin);
          const domains = normalizeShortLinkDomainSettings({
            defaultDomain,
            domains: current.general.domains,
            domainSchemes: {
              ...current.general.domainSchemes,
              [defaultDomain]: shortLinkDomainSchemeFromOrigin(origin),
            },
          });
          Object.assign(current.general, domains);
        }, transaction);
      }
      return { user, firstUser, verificationEnabled, token };
    });

  if (verificationEnabled) {
    try {
      await sendVerificationEmail({
        settings,
        email: user.email,
        name: user.name,
        verificationUrl: verificationUrl(origin, token),
      });
    } catch (cause) {
      await getDatabase().transaction(async (transaction) => {
        await getDatabase().query(
          `SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`,
          { transaction },
        );
        await UserModel.destroy({
          where: {
            id: user.id,
            enabled: false,
            emailVerificationTokenHash: hashEmailVerificationToken(token),
          },
          transaction,
        });
      });
      throw cause;
    }
  }

  return {
    user,
    firstUser,
    verificationRequired: verificationEnabled,
  };
}

export async function verifySignupEmail(token: string) {
  return verifyUserEmailToken(token);
}
