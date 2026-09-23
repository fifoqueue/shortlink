import assert from 'node:assert/strict';
import type { Cookies } from '@sveltejs/kit';
import { createHmac, randomUUID, scryptSync } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { defaultSettings } from '../src/lib/config';
import {
  AppSettingModel,
  AuthRequestLimitModel,
  UserModel,
  UserPasskeyCredentialModel,
} from '../src/lib/server/database';
import { registerUser } from '../src/lib/server/registration';
import {
  createUser,
  changeOwnPassword,
  deleteUser,
  deleteOwnPassword,
  requestUserPasswordReset,
  hashEmailVerificationToken,
  hashPasswordResetToken,
  hashPassword,
  verifyPassword,
  resetUserPasswordWithToken,
  rotateUserSessionVersion,
  updateUser,
  upsertSsoUser,
  verifyUserEmailToken,
} from '../src/lib/server/users';
import {
  findIdentity,
  linkIdentity,
  unlinkIdentity,
} from '../src/lib/server/user-identities';
import {
  consumeTimedChallenge,
  saveUserTotpSecret,
  verifyUserTotp,
  updatePasskeyUse,
  removeUserPasskey,
} from '../src/lib/server/local-auth-security';
import {
  encodeSigned,
  getUserFromSession,
} from '../src/lib/server/auth-session';

export async function checkAccounts() {
  const prefix = randomUUID();
  const settings = structuredClone(defaultSettings);
  settings.auth.registration.enabled = true;
  settings.auth.emailVerification.enabled = false;
  const password = 'Invariant-test-password-42!';
  let hashHeartbeats = 0;
  const hashStarted = performance.now();
  const heartbeat = setInterval(() => {
    hashHeartbeats += 1;
  }, 1);
  let encodedPassword: string;
  try {
    encodedPassword = await hashPassword(password);
  } finally {
    clearInterval(heartbeat);
  }
  const hashDurationMs = performance.now() - hashStarted;
  assert.ok(
    hashHeartbeats > 0,
    'Password hashing must allow event-loop timer progress',
  );
  const [algorithm, salt, storedHash] = encodedPassword.split(':');
  assert.equal(algorithm, 'scrypt');
  assert.equal(
    scryptSync(password, salt, 64).toString('base64url'),
    storedHash,
    'Async scrypt must preserve stored hash parameters',
  );
  assert.equal(await verifyPassword(password, encodedPassword), true);
  assert.equal(
    await verifyPassword(`${password}-wrong`, encodedPassword),
    false,
  );
  console.log(
    `Password hashing: ${hashDurationMs.toFixed(1)}ms, ${hashHeartbeats} timer heartbeats (hash format unchanged)`,
  );

  const signup = (name: string) =>
    registerUser({
      settings,
      origin: 'https://invariants.example',
      email: `${prefix}-${name}@example.test`,
      name,
      password,
    });

  assert.equal(
    await UserModel.count(),
    0,
    'Account bootstrap checks require an empty disposable database',
  );
  AppSettingModel.addHook(
    'beforeUpdate',
    'invariants-bootstrap-rollback',
    () => {
      throw new Error('injected bootstrap settings failure');
    },
  );
  try {
    await assert.rejects(
      signup('rollback'),
      /injected bootstrap settings failure/,
    );
    assert.equal(
      await UserModel.count(),
      0,
      'Bootstrap settings failure must roll back account creation',
    );
  } finally {
    AppSettingModel.removeHook('beforeUpdate', 'invariants-bootstrap-rollback');
  }

  const registrations = await Promise.all([signup('first'), signup('second')]);
  assert.equal(registrations.filter((result) => result.firstUser).length, 1);
  assert.equal(
    await UserModel.count({ where: { enabled: true, isAdmin: true } }),
    1,
  );
  const firstAdmin = registrations.find((result) => result.firstUser)!.user;
  const secondAdmin = await createUser({
    email: `${prefix}-admin@example.test`,
    name: 'Admin',
    password,
    isAdmin: true,
  });
  const adminChanges = await Promise.allSettled([
    updateUser({
      id: firstAdmin.id,
      email: firstAdmin.email,
      name: firstAdmin.name,
      isAdmin: false,
      enabled: true,
    }),
    deleteUser(secondAdmin.id),
  ]);
  assert.equal(
    adminChanges.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    await UserModel.count({ where: { enabled: true, isAdmin: true } }),
    1,
    'Concurrent demotion/deletion must preserve the last admin',
  );

  const user = await createUser({
    email: `${prefix}-tokens@example.test`,
    name: 'Tokens',
    password,
    isAdmin: false,
  });
  const resetToken = randomUUID();
  await user.update({
    passwordResetTokenHash: hashPasswordResetToken(resetToken),
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
  });
  const resets = await Promise.all(
    Array.from({ length: 6 }, () =>
      resetUserPasswordWithToken({ token: resetToken, password }),
    ),
  );
  assert.equal(
    resets.filter(Boolean).length,
    1,
    'Password reset token must be consumed once',
  );
  await user.reload();
  const passwordVersion = user.sessionVersion;
  const changedUser = await changeOwnPassword({
    id: user.id,
    currentPassword: password,
    nextPassword: password,
  });
  assert.equal(
    changedUser.sessionVersion,
    passwordVersion + 1,
    'Password update invalidates older sessions in the same transaction',
  );
  await user.reload();
  const initialVersion = user.sessionVersion;
  const rotations = await Promise.all(
    Array.from({ length: 6 }, () => rotateUserSessionVersion(user.id)),
  );
  assert.equal(
    new Set(rotations.map((result) => result.sessionVersion)).size,
    6,
  );
  await user.reload();
  assert.equal(
    user.sessionVersion,
    initialVersion + 6,
    'Session rotation must not lose increments',
  );

  const signedSession = encodeSigned({
    id: user.id,
    provider: 'password',
    subject: String(user.id),
    sessionVersion: user.sessionVersion,
    expiresAt: Date.now() + 60_000,
  });
  const cookies = { get: () => signedSession } as unknown as Cookies;
  assert.equal((await getUserFromSession(cookies))?.id, user.id);
  await rotateUserSessionVersion(user.id);
  assert.equal(
    await getUserFromSession(cookies),
    null,
    'Session revocation must take effect on the next request',
  );

  let replayCleanupQueries = 0;
  AuthRequestLimitModel.addHook(
    'beforeBulkDestroy',
    'invariants-replay-cleanup',
    () => {
      replayCleanupQueries += 1;
    },
  );
  const challengeToken = encodeSigned({
    userId: user.id,
    challenge: randomUUID(),
    expiresAt: Date.now() + 60_000,
  });
  const replayCookies = {
    get: () => challengeToken,
    delete() {},
  } as unknown as Cookies;
  const challenges = await Promise.all(
    Array.from({ length: 6 }, () =>
      consumeTimedChallenge(replayCookies, 'invariant-challenge'),
    ),
  );
  assert.equal(
    challenges.filter(Boolean).length,
    1,
    'A signed challenge must be consumed once across concurrent requests',
  );
  assert.equal(
    await consumeTimedChallenge(
      {
        get: () => `${challengeToken}.suffix`,
        delete() {},
      } as unknown as Cookies,
      'invariant-challenge',
    ),
    null,
    'Appended token data must not bypass replay checks',
  );
  await saveUserTotpSecret(user.id, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', '12345678901234567890')
    .update(counterBytes)
    .digest();
  const totpCode = String(
    (digest.readUInt32BE(digest[digest.length - 1] & 0x0f) & 0x7fffffff) %
      1_000_000,
  ).padStart(6, '0');
  const totpUses = await Promise.all(
    Array.from({ length: 6 }, () => verifyUserTotp(user.id, totpCode)),
  );
  assert.equal(
    totpUses.filter(Boolean).length,
    1,
    'A TOTP time step must be consumed once',
  );
  AuthRequestLimitModel.removeHook(
    'beforeBulkDestroy',
    'invariants-replay-cleanup',
  );
  assert.ok(
    replayCleanupQueries <= 2,
    'Replay cleanup must not run on every authentication (at most two UTC dates in this check)',
  );

  const latestResetHash = hashPasswordResetToken(randomUUID());
  UserModel.addHook(
    'afterBulkUpdate',
    'invariants-reset-mail-race',
    async (options) => {
      const attributes = (options as { attributes?: Partial<UserModel> })
        .attributes;
      if (typeof attributes?.passwordResetTokenHash === 'string') {
        await UserModel.update(
          { passwordResetTokenHash: latestResetHash },
          { where: { id: user.id }, hooks: false },
        );
      }
    },
  );
  const mailSettings = structuredClone(settings);
  mailSettings.auth.emailVerification.provider = 'smtp';
  mailSettings.auth.emailVerification.smtp.host = '';
  try {
    await assert.rejects(
      requestUserPasswordReset({
        settings: mailSettings,
        origin: 'https://invariants.example',
        email: user.email,
      }),
    );
    await user.reload();
    assert.equal(
      user.passwordResetTokenHash,
      latestResetHash,
      'Mail failure cleanup must preserve a newer token',
    );
  } finally {
    UserModel.removeHook('afterBulkUpdate', 'invariants-reset-mail-race');
  }

  const verificationToken = randomUUID();
  const pending = await createUser({
    email: `${prefix}-verify@example.test`,
    name: 'Verify',
    password,
    isAdmin: false,
    enabled: false,
    emailVerificationTokenHash: hashEmailVerificationToken(verificationToken),
    emailVerificationExpiresAt: new Date(Date.now() + 60_000),
  });
  const verifications = await Promise.all(
    Array.from({ length: 6 }, () => verifyUserEmailToken(verificationToken)),
  );
  assert.equal(
    verifications.filter(Boolean).length,
    1,
    'Email verification token must be consumed once',
  );
  await pending.reload();
  assert.equal(pending.enabled, true);

  const credentialId = randomUUID();
  await UserPasskeyCredentialModel.create({
    userId: user.id,
    credentialId,
    publicKey: {},
    algorithm: -7,
    name: 'Counter regression',
  });
  const uses = await Promise.all(
    Array.from({ length: 6 }, () => updatePasskeyUse(credentialId, 1)),
  );
  assert.equal(
    uses.filter(Boolean).length,
    1,
    'A nonzero passkey counter must be accepted once',
  );
  await Promise.all([
    updatePasskeyUse(credentialId, 3),
    updatePasskeyUse(credentialId, 2),
  ]);
  assert.equal(
    (await UserPasskeyCredentialModel.findOne({ where: { credentialId } }))
      ?.counter,
    3,
  );
  await UserPasskeyCredentialModel.destroy({ where: { credentialId } });
  assert.equal(
    await updatePasskeyUse(credentialId, 4),
    null,
    'Deleted credential must not authenticate',
  );

  const lastPasskey = await UserPasskeyCredentialModel.create({
    userId: user.id,
    credentialId: randomUUID(),
    publicKey: {},
    algorithm: -7,
    name: 'Last method race',
  });
  const loginMethods = { password: true, passkey: true, identityProviders: [] };
  const removals = await Promise.allSettled([
    deleteOwnPassword({ id: user.id, currentPassword: password, loginMethods }),
    removeUserPasskey(user.id, lastPasskey.id, loginMethods),
  ]);
  assert.equal(
    removals.filter((result) => result.status === 'fulfilled').length,
    1,
    'Password/passkey race must preserve one login method',
  );
  await user.reload();
  assert.ok(
    user.passwordHash.startsWith('scrypt:') ||
      (await UserPasskeyCredentialModel.count({ where: { userId: user.id } })) >
        0,
  );

  const ssoEmail = `${prefix}-sso@example.test`;
  const sso = await upsertSsoUser({
    email: ssoEmail,
    name: 'SSO',
    provider: 'test',
    subject: prefix,
  });
  assert.equal((await findIdentity('test', prefix))?.userId, sso.id);
  await assert.rejects(
    upsertSsoUser({
      email: `${prefix}-sso-conflict@example.test`,
      name: 'SSO conflict',
      provider: 'test',
      subject: prefix,
    }),
  );
  assert.equal(
    await UserModel.count({
      where: { email: `${prefix}-sso-conflict@example.test` },
    }),
    0,
    'Identity conflict must roll back user creation',
  );
  const firstIdentity = (await findIdentity('test', prefix))!;
  const secondIdentity = await linkIdentity({
    userId: sso.id,
    provider: 'test-two',
    subject: prefix,
  });
  const identityMethods = {
    password: false,
    passkey: false,
    identityProviders: ['test', 'test-two'],
  };
  const unlinks = await Promise.allSettled([
    unlinkIdentity({
      userId: sso.id,
      provider: 'test',
      identityId: firstIdentity.id,
      loginMethods: identityMethods,
    }),
    unlinkIdentity({
      userId: sso.id,
      provider: 'test-two',
      identityId: secondIdentity.id,
      loginMethods: identityMethods,
    }),
  ]);
  assert.equal(
    unlinks.filter((result) => result.status === 'fulfilled').length,
    1,
    'Concurrent identity removal must preserve one login method',
  );
  const remainingIdentity =
    (await findIdentity('test', prefix)) ??
    (await findIdentity('test-two', prefix));
  assert.ok(remainingIdentity);
  assert.equal(
    await unlinkIdentity({
      userId: sso.id,
      provider: remainingIdentity.provider,
      identityId: remainingIdentity.id,
      adminOverride: true,
    }),
    1,
    'Explicit admin unlink may remove the last identity',
  );
  console.log(
    'Account invariants: bootstrap rollback/race, last admin, one-use tokens, session increments, passkey counters, SSO atomicity, last login method, immediate revocation, challenge/TOTP replay, mail cleanup passed',
  );
}
