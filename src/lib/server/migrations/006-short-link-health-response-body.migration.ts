import type { Sequelize } from 'sequelize';
import { columnExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

async function needsHealthResponseBody(sequelize: Sequelize) {
  return (
    (await tableExists(sequelize, 'short_links')) &&
    !(await columnExists(sequelize, 'short_links', 'health_response_body'))
  );
}

const migration: DatabaseMigration = {
  id: '006-short-link-health-response-body',

  shouldRun: needsHealthResponseBody,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'short_links'))) return;
    await sequelize.query(`
      ALTER TABLE short_links
      ADD COLUMN IF NOT EXISTS health_response_body text
    `);
  },
};

export default migration;
