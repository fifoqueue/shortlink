import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { PluginDefinition } from '$lib/plugin-contracts';
import { AuthRequestLimitModel, getDatabase } from '$lib/server/database';
import { requestVerificationResend } from '$lib/server/account-recovery';
import { defaultSettings } from '$lib/config';
import type { EffectivePermissions } from '$lib/server/permissions';
import server from '$plugins/rate-limit/server';

type Context = Parameters<NonNullable<PluginDefinition['handleRequest']>>[0];

export async function checkRateLimit() {
  const prefix = randomUUID();
  const keys: string[] = [];
  function rule(id: string, limit: number) {
    id = `${prefix}-${id}`;
    keys.push(
      createHash('sha256')
        .update(JSON.stringify([id, JSON.stringify(['global'])]))
        .digest('hex')
        .slice(0, 32),
    );
    return {
      id,
      limit,
      enabled: true,
      windowSeconds: 60,
      scope: ['global'],
      path: '/',
    };
  }
  async function request(rules: ReturnType<typeof rule>[]) {
    return server.handleRequest!({
      event: {
        request: new Request('https://example.test/'),
        url: new URL('https://example.test/'),
        route: { id: '/' },
        cookies: { get: () => undefined },
        locals: { locale: 'en' },
      },
      state: { enabled: true, config: { rules } },
      user: null,
      isAdmin: false,
      ip: '127.0.0.1',
    } as Context);
  }
  try {
    const rules = [rule('parallel', 4)];
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => request(rules)),
    );
    assert.equal(responses.filter((response) => response === null).length, 4);
    assert.equal(
      responses.filter((response) => response?.status === 429).length,
      8,
    );
    const counter = await AuthRequestLimitModel.findOne({
      where: { kind: 'plugin-rate-limit', identifierHash: keys[0] },
    });
    assert.equal(counter?.count, 4);
    assert.ok(counter);
    await counter.update({ updatedAt: new Date(Date.now() - 61_000) });
    assert.equal(await request(rules), null);
    await counter.reload();
    assert.equal(counter.count, 1);

    const overlapping = [rule('large', 5), rule('small', 1)];
    assert.equal(await request(overlapping), null);
    assert.equal((await request([...overlapping].reverse()))?.status, 429);
    for (const key of keys.slice(1)) {
      assert.equal(
        (
          await AuthRequestLimitModel.findOne({
            where: { kind: 'plugin-rate-limit', identifierHash: key },
          })
        )?.count,
        1,
      );
    }
    console.log(
      'rate limits: shared concurrent quota, fixed-window reset, overlapping-rule rollback passed',
    );
  } finally {
    for (const key of keys)
      await AuthRequestLimitModel.destroy({
        where: { kind: 'plugin-rate-limit', identifierHash: key },
      });
  }
}

export async function checkRecoveryLimits() {
  const suffix = randomUUID().replaceAll('-', '');
  const name = `invariant_recovery_${suffix}`;
  const email = `${suffix}@example.test`;
  const ip = `recovery-${suffix}`;
  const emailHash = createHash('sha256').update(`email:${email}`).digest('hex');
  const ipHash = createHash('sha256').update(`ip:${ip}`).digest('hex');
  const kind = 'resend-verification';
  const request = () =>
    requestVerificationResend({
      settings: defaultSettings,
      permissions: {
        auth: { resendVerificationDailyLimit: 1 },
      } as EffectivePermissions,
      origin: 'https://example.test',
      ip,
      email,
    });
  try {
    // Fail the second raw SQL write; the first scope must disappear on rollback.
    await getDatabase().query(`
      CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.identifier_hash = '${ipHash}' THEN
          RAISE EXCEPTION 'recovery counter failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON auth_request_limits
        FOR EACH ROW EXECUTE FUNCTION ${name}();
    `);
    await assert.rejects(request(), /recovery counter failure/);
    assert.equal(
      await AuthRequestLimitModel.count({
        where: { kind, identifierHash: emailHash },
      }),
      0,
    );
    await getDatabase().query(`DROP TRIGGER ${name} ON auth_request_limits`);

    const date = new Date();
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const identifierHash of [emailHash, ipHash]) {
      await AuthRequestLimitModel.create({
        kind,
        identifierHash,
        dateKey,
        count: 1,
      });
    }
    await assert.rejects(request());
    for (const identifierHash of [emailHash, ipHash]) {
      assert.equal(
        (
          await AuthRequestLimitModel.findOne({
            where: { kind, identifierHash, dateKey },
          })
        )?.count,
        2,
      );
    }
    console.log(
      'recovery limits: both scopes roll back on failure and count rejected attempts together',
    );
  } finally {
    await getDatabase().query(
      `DROP TRIGGER IF EXISTS ${name} ON auth_request_limits; DROP FUNCTION IF EXISTS ${name}()`,
    );
    for (const identifierHash of [emailHash, ipHash]) {
      await AuthRequestLimitModel.destroy({ where: { kind, identifierHash } });
    }
  }
}
