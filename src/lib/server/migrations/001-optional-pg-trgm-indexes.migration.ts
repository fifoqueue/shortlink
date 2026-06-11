import type { Sequelize } from 'sequelize';
import { columnExists, indexExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

const TRGM_INDEXES = [
  {
    table: 'short_links',
    column: 'code',
    index: 'short_links_code_trgm_idx',
  },
  {
    table: 'short_links',
    column: 'url',
    index: 'short_links_url_trgm_idx',
  },
  {
    table: 'click_events',
    column: 'ip_address',
    index: 'click_events_ip_address_trgm_idx',
  },
  {
    table: 'click_events',
    column: 'referer',
    index: 'click_events_referer_trgm_idx',
  },
  {
    table: 'click_events',
    column: 'user_agent',
    index: 'click_events_user_agent_trgm_idx',
  },
] as const;

type TrgmIndex = (typeof TRGM_INDEXES)[number];

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function missingIndexes(sequelize: Sequelize) {
  const missing: TrgmIndex[] = [];

  for (const target of TRGM_INDEXES) {
    if (!(await tableExists(sequelize, target.table))) continue;
    if (!(await columnExists(sequelize, target.table, target.column))) continue;
    if (await indexExists(sequelize, target.index)) continue;
    missing.push(target);
  }

  return missing;
}

async function createIndex(sequelize: Sequelize, target: TrgmIndex) {
  try {
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS ${quoteIdentifier(target.index)}
      ON ${quoteIdentifier(target.table)}
      USING gin (${quoteIdentifier(target.column)} gin_trgm_ops)
    `);
  } catch {
    // pg_trgm is optional. Missing extension or insufficient privileges should
    // not block application startup.
  }
}

const migration: DatabaseMigration = {
  id: '001-optional-pg-trgm-indexes',

  async shouldRun(sequelize) {
    return (await missingIndexes(sequelize)).length > 0;
  },

  async up(sequelize) {
    const indexes = await missingIndexes(sequelize);
    for (const index of indexes) {
      await createIndex(sequelize, index);
    }
  },
};

export default migration;
