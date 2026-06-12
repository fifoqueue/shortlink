import { env } from '$env/dynamic/private';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import {
  columnExists,
  indexExists,
  tableExists,
  withTransaction,
} from './helpers';
import type { DatabaseMigration } from './types';

type ShortLinkDomainScheme = 'http' | 'https';

type InitialShortLinkDomain = {
  hostname: string;
  scheme: ShortLinkDomainScheme;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configuredInitialShortLinkDomain(): InitialShortLinkDomain | null {
  const rawOrigin = String(env.PRIVATE_BASE_URL || env.ORIGIN || '').trim();
  if (!rawOrigin) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error(
      'PRIVATE_BASE_URL or ORIGIN must be a valid http(s) origin before migrating existing short links to multi-domain storage.',
    );
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.host ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'PRIVATE_BASE_URL or ORIGIN must be a plain http(s) origin without credentials, path, query, or hash before migrating existing short links to multi-domain storage.',
    );
  }

  return {
    hostname: parsed.host.toLowerCase(),
    scheme: parsed.protocol === 'http:' ? 'http' : 'https',
  };
}

async function domainColumnNullable(sequelize: Sequelize) {
  const rows = await sequelize.query<{ nullable: boolean }>(
    `
      SELECT is_nullable = 'YES' AS nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'short_links'
        AND column_name = 'domain'
      LIMIT 1
    `,
    { type: QueryTypes.SELECT },
  );
  return rows[0]?.nullable === true;
}

async function constraintExists(
  sequelize: Sequelize,
  table: string,
  constraint: string,
) {
  const rows = await sequelize.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = $table
          AND constraint_name = $constraint
      ) AS "exists"
    `,
    {
      bind: { table, constraint },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]?.exists === true;
}

async function uniqueIndexUsesPlainDomainCode(sequelize: Sequelize) {
  if (!(await indexExists(sequelize, 'short_links_domain_code_unique_idx'))) {
    return false;
  }
  const rows = await sequelize.query<{ indexdef: string }>(
    `
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'short_links_domain_code_unique_idx'
      LIMIT 1
    `,
    { type: QueryTypes.SELECT },
  );
  const indexDef = rows[0]?.indexdef ?? '';
  return !/COALESCE/i.test(indexDef);
}

async function needsShortLinkDomain(sequelize: Sequelize) {
  if (!(await tableExists(sequelize, 'short_links'))) return false;
  if (!(await columnExists(sequelize, 'short_links', 'domain'))) return true;
  if (!(await indexExists(sequelize, 'short_links_domain_idx'))) return true;
  if (!(await indexExists(sequelize, 'short_links_code_idx'))) return true;
  if (!(await uniqueIndexUsesPlainDomainCode(sequelize))) return true;
  if (
    await constraintExists(sequelize, 'short_links', 'short_links_code_key')
  ) {
    return true;
  }
  return domainColumnNullable(sequelize);
}

async function shortLinkRowCount(
  sequelize: Sequelize,
  transaction: Transaction,
) {
  const rows = await sequelize.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM short_links
    `,
    { transaction, type: QueryTypes.SELECT },
  );
  return Number(rows[0]?.count ?? 0);
}

async function nullDomainRowCount(
  sequelize: Sequelize,
  transaction: Transaction,
) {
  const rows = await sequelize.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM short_links
      WHERE domain IS NULL
    `,
    { transaction, type: QueryTypes.SELECT },
  );
  return Number(rows[0]?.count ?? 0);
}

async function initializeSiteDomainSettings(
  sequelize: Sequelize,
  initialDomain: InitialShortLinkDomain | null,
  transaction: Transaction,
) {
  if (!initialDomain || !(await tableExists(sequelize, 'app_settings'))) {
    return;
  }

  const rows = await sequelize.query<{ value: unknown }>(
    `
      SELECT value
      FROM app_settings
      WHERE key = 'site'
      LIMIT 1
    `,
    { transaction, type: QueryTypes.SELECT },
  );
  const settings = rows[0]?.value;
  if (!isRecord(settings)) return;

  const general = isRecord(settings.general) ? settings.general : {};
  const hasExistingDomains =
    Boolean(String(general.defaultDomain ?? '').trim()) ||
    (Array.isArray(general.domains) && general.domains.length > 0);
  if (hasExistingDomains) return;

  const normalized = {
    ...settings,
    general: {
      ...general,
      defaultDomain: initialDomain.hostname,
      domains: [initialDomain.hostname],
      domainSchemes: {
        [initialDomain.hostname]: initialDomain.scheme,
      },
    },
  };

  await sequelize.query(
    `
      UPDATE app_settings
      SET value = CAST($value AS jsonb),
          updated_at = NOW()
      WHERE key = 'site'
    `,
    {
      bind: { value: JSON.stringify(normalized) },
      transaction,
    },
  );
}

const migration: DatabaseMigration = {
  id: '007-short-link-domain',

  shouldRun: needsShortLinkDomain,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'short_links'))) return;

    const initialDomain = configuredInitialShortLinkDomain();

    await withTransaction(sequelize, async (transaction) => {
      await sequelize.query(
        `
          ALTER TABLE short_links
          ADD COLUMN IF NOT EXISTS domain varchar(320)
        `,
        { transaction },
      );

      const rowCount = await shortLinkRowCount(sequelize, transaction);
      if (rowCount > 0 && !initialDomain) {
        throw new Error(
          'Cannot initialize short link domains for existing links. Set PRIVATE_BASE_URL or ORIGIN to the public http(s) origin before running migration 007.',
        );
      }

      await initializeSiteDomainSettings(sequelize, initialDomain, transaction);

      if (initialDomain) {
        await sequelize.query(
          `
            UPDATE short_links
            SET domain = $hostname
            WHERE domain IS NULL
          `,
          {
            bind: { hostname: initialDomain.hostname },
            transaction,
          },
        );
      }

      if ((await nullDomainRowCount(sequelize, transaction)) > 0) {
        throw new Error(
          'Cannot make short_links.domain required while existing links still have no domain.',
        );
      }

      await sequelize.query(
        `
          ALTER TABLE short_links
          ALTER COLUMN domain SET NOT NULL
        `,
        { transaction },
      );

      await sequelize.query(
        `
          ALTER TABLE short_links
          DROP CONSTRAINT IF EXISTS short_links_code_key
        `,
        { transaction },
      );

      await sequelize.query(
        `
          DROP INDEX IF EXISTS short_links_code_key
        `,
        { transaction },
      );

      await sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS short_links_domain_idx
          ON short_links (domain)
        `,
        { transaction },
      );

      await sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS short_links_code_idx
          ON short_links (code)
        `,
        { transaction },
      );

      await sequelize.query(
        `
          DROP INDEX IF EXISTS short_links_domain_code_unique_idx
        `,
        { transaction },
      );

      await sequelize.query(
        `
          CREATE UNIQUE INDEX short_links_domain_code_unique_idx
          ON short_links (domain, code)
        `,
        { transaction },
      );
    });
  },
};

export default migration;
