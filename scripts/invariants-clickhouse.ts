import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ClickEventModel,
  ClickEventQueueModel,
  getDatabase,
  ShortLinkModel,
} from '$lib/server/database';
import {
  countClickAnalyticsEvents,
  listClickAnalyticsEvents,
  syncClickAnalytics,
  writeClickAnalytics,
  type ClickAnalyticsRow,
} from '$lib/server/click-analytics';
import { enqueueClick, processClickQueue } from '$lib/server/click-queue';
import {
  createLink,
  getStatsForLink,
  listClickEventsForLink,
} from '$lib/server/shortener';
import { getSettings } from '$lib/server/settings';

export async function checkClickHouse() {
  const base = process.env.ANALYTICS_CLICKHOUSE_URL;
  const database = process.env.ANALYTICS_CLICKHOUSE_DATABASE;
  const username = process.env.ANALYTICS_CLICKHOUSE_USERNAME;
  const password = process.env.ANALYTICS_CLICKHOUSE_PASSWORD ?? '';
  const table =
    process.env.ANALYTICS_CLICKHOUSE_TABLE || 'shortlink_click_events';
  assert.ok(base, 'Configure the disposable ClickHouse URL.');
  assert.ok(
    database && /test/i.test(database),
    'ClickHouse database name must contain test.',
  );
  assert.ok(username, 'Exercise authenticated ClickHouse access.');
  assert.match(table, /^[A-Za-z_][A-Za-z0-9_]*$/);
  const originalFetch = globalThis.fetch;
  const endpoint = new URL(base);
  const links: number[] = [];
  let ownsTable = false;
  const trigger = `invariant_mirror_${randomUUID().replaceAll('-', '')}`;
  let ownsTrigger = false;
  const requestUrl = (input: Parameters<typeof fetch>[0]) =>
    new URL(input instanceof Request ? input.url : String(input));
  const isInsert = (input: Parameters<typeof fetch>[0]) => {
    const url = requestUrl(input);
    return (
      url.origin === endpoint.origin &&
      /^\s*INSERT\s/i.test(url.searchParams.get('query') ?? '')
    );
  };
  async function query(sql: string) {
    const url = new URL(endpoint);
    url.searchParams.set('database', database!);
    url.searchParams.set('query', sql);
    url.searchParams.set('wait_end_of_query', '1');
    const response = await originalFetch(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
    assert.ok(!body.includes('DB::Exception'), body);
    return body;
  }
  async function createFixture() {
    const settings = structuredClone(await getSettings());
    settings.links.trackClicks = true;
    const link = await createLink(
      'https://example.test/destination',
      randomUUID().replaceAll('-', '').slice(0, 12),
      {
        domain: 'clickhouse.example.test',
        isAdmin: true,
        linkSettings: settings.links,
      },
    );
    links.push(link.id);
    return { link, settings };
  }
  async function pending(linkId: number) {
    return ClickEventModel.count({
      where: { linkId, clickhouseSyncedAt: null },
    });
  }
  async function seed(linkId: number, eventId?: string) {
    const values = {
      linkId,
      createdAt: new Date(),
      ipAddress: '192.0.2.44',
      userAgent: 'clickhouse-invariant',
      referer: 'https://example.test/source',
      metadata: { country: 'JP', nested: { region: 'Tokyo' } },
    };
    if (eventId) {
      await getDatabase().query(
        `
        INSERT INTO click_events (id, link_id, created_at, ip_address, user_agent, referer, metadata)
        VALUES ($id, $linkId, $createdAt, $ip, $agent, $referer, $metadata::jsonb)
      `,
        {
          bind: {
            id: eventId,
            linkId,
            createdAt: values.createdAt,
            ip: values.ipAddress,
            agent: values.userAgent,
            referer: values.referer,
            metadata: JSON.stringify(values.metadata),
          },
        },
      );
      return values;
    }
    const row = await ClickEventModel.create(values);
    return { ...values, eventId: String(row.id) };
  }
  try {
    const identity = JSON.parse(
      (
        await query(
          'SELECT currentDatabase() AS database, currentUser() AS username FORMAT JSONEachRow',
        )
      ).trim(),
    ) as { database: string; username: string };
    assert.equal(identity.database, database);
    assert.equal(identity.username, username);
    const { link, settings } = await createFixture();
    const example: ClickAnalyticsRow = {
      eventId: '1',
      linkId: link.id,
      createdAt: new Date(),
      ipAddress: null,
      userAgent: null,
      referer: null,
      metadata: {},
    };

    // A same-shaped MergeTree table cannot safely absorb at-least-once retries.
    await query(`CREATE TABLE \`${table}\` (
      event_id UInt64, created_at DateTime64(3, 'UTC'), link_id UInt32,
      ip_address Nullable(String), user_agent Nullable(String), referer Nullable(String), metadata_json String
    ) ENGINE = MergeTree ORDER BY (link_id, event_id, created_at)`);
    ownsTable = true;
    await assert.rejects(
      writeClickAnalytics([example]),
      /ReplacingMergeTree|engine|ClickHouse/i,
    );
    await query(`DROP TABLE \`${table}\``);

    assert.equal(
      await enqueueClick({
        linkId: link.id,
        request: new Request('https://clickhouse.example.test/event', {
          headers: { 'user-agent': 'queue-mirror-test' },
        }),
        getClientAddress: () => '192.0.2.12',
        settings,
      }),
      'accepted',
    );
    await processClickQueue();
    assert.equal(
      await ClickEventQueueModel.count({ where: { linkId: link.id } }),
      0,
    );
    assert.equal(
      await pending(link.id),
      1,
      'queue consumption must leave a durable unsynced event',
    );

    globalThis.fetch = async (input, init) => {
      if (isInsert(input))
        return new Response('injected unavailable', { status: 503 });
      return originalFetch(input, init);
    };
    await assert.rejects(syncClickAnalytics(), /503|unavailable/i);
    assert.equal(
      await pending(link.id),
      1,
      'failed HTTP must not acknowledge the PostgreSQL event',
    );
    let analyticsRequests = 0;
    globalThis.fetch = async (input, init) => {
      if (requestUrl(input).origin === endpoint.origin) {
        analyticsRequests += 1;
        throw new Error('ClickHouse is offline');
      }
      return originalFetch(input, init);
    };
    const stats = await getStatsForLink(link, { isAdmin: true });
    assert.equal(stats.clicks, 1);
    assert.equal(stats.clickEvents.length, 1);
    assert.equal(stats.clickEvents[0].userAgent, 'queue-mirror-test');
    const exported = await listClickEventsForLink(link, { isAdmin: true });
    assert.equal(exported.length, 1);
    assert.equal(exported[0].userAgent, 'queue-mirror-test');
    assert.equal(
      analyticsRequests,
      0,
      'statistics and CSV must read PostgreSQL',
    );
    globalThis.fetch = async (input, init) => {
      if (isInsert(input))
        return new Response('Code: 241. DB::Exception: injected late failure', {
          status: 200,
        });
      return originalFetch(input, init);
    };
    await assert.rejects(syncClickAnalytics(), /exception|failure|ClickHouse/i);
    assert.equal(
      await pending(link.id),
      1,
      'HTTP 200 with an exception body is a failed insert',
    );

    const previousTimeout = process.env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS;
    let aborted = false;
    process.env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS = '100';
    globalThis.fetch = async (input, init) => {
      if (!isInsert(input)) return originalFetch(input, init);
      const signal = init?.signal;
      assert.ok(signal, 'ClickHouse requests need a bounded deadline');
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          aborted = true;
          reject(signal.reason);
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    };
    try {
      await assert.rejects(syncClickAnalytics());
      assert.equal(aborted, true);
      assert.equal(
        await pending(link.id),
        1,
        'timed out insert must stay retryable',
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousTimeout === undefined)
        delete process.env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS;
      else process.env.ANALYTICS_CLICKHOUSE_TIMEOUT_MS = previousTimeout;
    }
    assert.equal(await syncClickAnalytics(), 1);
    assert.equal(await pending(link.id), 0);
    assert.equal(await countClickAnalyticsEvents({ linkId: link.id }), 1);
    assert.equal(
      (await listClickAnalyticsEvents({ linkId: link.id }))[0].userAgent,
      'queue-mirror-test',
    );

    const crash = await createFixture();
    await seed(crash.link.id);
    // Fail after the real ClickHouse commit, at the PostgreSQL acknowledgement.
    await getDatabase().query(`
      CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.link_id = ${crash.link.id} AND NEW.clickhouse_synced_at IS NOT NULL THEN
          RAISE EXCEPTION 'injected mirror acknowledgement crash';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER ${trigger} BEFORE UPDATE ON click_events
        FOR EACH ROW EXECUTE FUNCTION ${trigger}();
    `);
    ownsTrigger = true;
    let inserts = 0;
    globalThis.fetch = async (input, init) => {
      if (isInsert(input)) inserts += 1;
      return originalFetch(input, init);
    };
    await assert.rejects(syncClickAnalytics(), /acknowledgement crash/);
    assert.equal(await pending(crash.link.id), 1);
    assert.equal(await countClickAnalyticsEvents({ linkId: crash.link.id }), 1);
    await getDatabase().query(
      `DROP TRIGGER ${trigger} ON click_events; DROP FUNCTION ${trigger}()`,
    );
    ownsTrigger = false;
    assert.equal(await syncClickAnalytics(), 1);
    assert.equal(
      inserts,
      2,
      'a lost acknowledgement must retry the original event',
    );
    globalThis.fetch = originalFetch;
    assert.equal(await pending(crash.link.id), 0);
    assert.equal(
      await countClickAnalyticsEvents({ linkId: crash.link.id }),
      1,
      'FINAL must collapse the duplicate retry',
    );

    const concurrent = await createFixture();
    await Promise.all(
      Array.from({ length: 4 }, () => seed(concurrent.link.id)),
    );
    await Promise.all([
      syncClickAnalytics(),
      syncClickAnalytics(),
      syncClickAnalytics(),
    ]);
    assert.equal(await pending(concurrent.link.id), 0);
    assert.equal(
      await countClickAnalyticsEvents({ linkId: concurrent.link.id }),
      4,
    );
    assert.equal(
      (await listClickAnalyticsEvents({ linkId: concurrent.link.id })).length,
      4,
    );

    const leased = await createFixture();
    await seed(leased.link.id);
    await ClickEventModel.update(
      { clickhouseNextAttemptAt: new Date(Date.now() + 60_000) },
      {
        where: { linkId: leased.link.id },
      },
    );
    assert.equal(
      await syncClickAnalytics(),
      0,
      'another worker must respect an unexpired lease',
    );
    assert.equal(await pending(leased.link.id), 1);
    assert.equal(
      await countClickAnalyticsEvents({ linkId: leased.link.id }),
      0,
    );
    await ClickEventModel.update(
      { clickhouseNextAttemptAt: new Date(Date.now() - 1_000) },
      {
        where: { linkId: leased.link.id },
      },
    );

    const insertStarted = Promise.withResolvers<void>();
    const allowInsert = Promise.withResolvers<void>();
    let insertHeld = false;
    globalThis.fetch = async (input, init) => {
      if (isInsert(input)) {
        assert.equal(
          insertHeld,
          false,
          'a concurrent worker bypassed the active lease',
        );
        insertHeld = true;
        insertStarted.resolve();
        await allowInsert.promise;
      }
      return originalFetch(input, init);
    };
    const delivery = syncClickAnalytics();
    try {
      await Promise.race([
        insertStarted.promise,
        delivery.then(() => {
          throw new Error('Mirror returned before reaching its HTTP insert');
        }),
      ]);
      assert.equal(
        await syncClickAnalytics(),
        0,
        'a slow HTTP request must not release its lease',
      );
      await getDatabase().transaction(async (transaction) => {
        await getDatabase().query("SET LOCAL statement_timeout = '500ms'", {
          transaction,
        });
        await getDatabase().query(
          'UPDATE click_events SET metadata = metadata WHERE link_id = $linkId',
          {
            bind: { linkId: leased.link.id },
            transaction,
          },
        );
      });
    } finally {
      allowInsert.resolve();
      globalThis.fetch = originalFetch;
      await delivery;
    }
    assert.equal(await pending(leased.link.id), 0);
    assert.equal(
      await countClickAnalyticsEvents({ linkId: leased.link.id }),
      1,
      'expired crash lease permits delivery',
    );

    const large = await createFixture();
    const largeIds = ['9007199254740993', '9007199254740995'];
    for (const id of largeIds) await seed(large.link.id, id);
    await syncClickAnalytics();
    const receivedIds = (
      await listClickAnalyticsEvents({ linkId: large.link.id })
    )
      .map((event) => String(event.eventId))
      .sort();
    assert.deepEqual(receivedIds, largeIds);
    assert.equal(await countClickAnalyticsEvents({ linkId: large.link.id }), 2);
    assert.equal(
      await countClickAnalyticsEvents({
        linkId: large.link.id,
        search: {
          field: 'metadata',
          query: 'Tokyo',
          paths: [['nested', 'region']],
        },
      }),
      2,
    );
    await assert.rejects(
      writeClickAnalytics([{ ...example, eventId: '18446744073709551616' }]),
      /event|UInt64|identifier|range/i,
    );
    await assert.rejects(
      writeClickAnalytics([
        { ...example, eventId: Number.MAX_SAFE_INTEGER + 2 },
      ]),
      /event|safe|integer|identifier/i,
    );
    console.log(
      'ClickHouse: authenticated mirror, retry/no-ack, PostgreSQL statistics/CSV during outage, late HTTP error, deadline, duplicate FINAL, concurrent sends, expiring leases, no HTTP-held DB lock, exact UInt64 IDs, incompatible engine rejection passed',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (ownsTrigger)
      await getDatabase().query(
        `DROP TRIGGER IF EXISTS ${trigger} ON click_events; DROP FUNCTION IF EXISTS ${trigger}()`,
      );
    for (const id of links) await ShortLinkModel.destroy({ where: { id } });
    if (ownsTable) await query(`DROP TABLE IF EXISTS \`${table}\``);
  }
}
