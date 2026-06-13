import { createHash } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import type { SiteSettings } from '$lib/config';
import type { EffectivePermissions } from './permissions';
import { ensureDatabase, getDatabase } from './database';
import { serverMessage } from '$lib/i18n/ui-text';
import {
  requestUserPasswordReset,
  resendSignupVerificationEmail,
  resetUserPasswordWithToken,
} from './users';

export type AccountRecoveryRequestKind =
  | 'resend-verification'
  | 'password-reset';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function identifierHash(scope: string, value: string) {
  return createHash('sha256').update(`${scope}:${value}`).digest('hex');
}

async function incrementDailyLimit(
  kind: AccountRecoveryRequestKind,
  identifierHashValue: string,
  limit: number,
) {
  const rows = await getDatabase().query<{ count: number }>(
    `
      INSERT INTO auth_request_limits
        (kind, identifier_hash, date_key, count, updated_at)
      VALUES
        ($kind, $identifierHash, $dateKey, 1, now())
      ON CONFLICT (kind, identifier_hash, date_key)
      DO UPDATE SET
        count = auth_request_limits.count + 1,
        updated_at = now()
      RETURNING count
    `,
    {
      bind: {
        kind,
        identifierHash: identifierHashValue,
        dateKey: localDateKey(),
      },
      type: QueryTypes.SELECT,
    },
  );
  if (Number(rows[0]?.count ?? 0) > limit) {
    throw new Error(serverMessage('authRequestLimitExceeded'));
  }
}

async function enforceDailyLimit(input: {
  kind: AccountRecoveryRequestKind;
  email: string;
  ip: string;
  limit: number;
}) {
  await ensureDatabase();
  const limit = Math.max(0, Math.round(input.limit));
  if (limit <= 0) throw new Error(serverMessage('accountRecoveryDisabled'));
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@')) {
    throw new Error(serverMessage('validEmailRequired'));
  }
  await Promise.all([
    incrementDailyLimit(input.kind, identifierHash('email', email), limit),
    incrementDailyLimit(input.kind, identifierHash('ip', input.ip), limit),
  ]);
}

export function accountRecoveryAvailability(input: {
  settings: SiteSettings;
  permissions: EffectivePermissions;
  passwordLoginEnabled: boolean;
}) {
  return {
    resendVerification:
      input.settings.auth.emailVerification.enabled &&
      input.permissions.auth.resendVerificationDailyLimit > 0,
    passwordReset:
      input.settings.auth.emailVerification.enabled &&
      input.passwordLoginEnabled &&
      input.permissions.auth.passwordResetDailyLimit > 0,
  };
}

export async function requestVerificationResend(input: {
  settings: SiteSettings;
  permissions: EffectivePermissions;
  origin: string;
  ip: string;
  email: string;
}) {
  await enforceDailyLimit({
    kind: 'resend-verification',
    email: input.email,
    ip: input.ip,
    limit: input.permissions.auth.resendVerificationDailyLimit,
  });
  return resendSignupVerificationEmail({
    settings: input.settings,
    origin: input.origin,
    email: input.email,
  });
}

export async function requestPasswordReset(input: {
  settings: SiteSettings;
  permissions: EffectivePermissions;
  origin: string;
  ip: string;
  email: string;
  passwordLoginEnabled: boolean;
}) {
  if (!input.passwordLoginEnabled) {
    throw new Error(serverMessage('passwordResetDisabled'));
  }
  if (!input.settings.auth.emailVerification.enabled) {
    throw new Error(serverMessage('passwordResetDisabled'));
  }
  await enforceDailyLimit({
    kind: 'password-reset',
    email: input.email,
    ip: input.ip,
    limit: input.permissions.auth.passwordResetDailyLimit,
  });
  return requestUserPasswordReset({
    settings: input.settings,
    origin: input.origin,
    email: input.email,
  });
}

export async function resetPasswordFromToken(input: {
  settings: SiteSettings;
  token: string;
  password: string;
}) {
  return resetUserPasswordWithToken({
    token: input.token,
    password: input.password,
    passwordPolicy: input.settings.auth.password,
  });
}
