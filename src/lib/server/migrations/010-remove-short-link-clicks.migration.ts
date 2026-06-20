import { columnExists } from './helpers';
import type { DatabaseMigration } from './types';

const migration: DatabaseMigration = {
  id: '010-remove-short-link-clicks',

  shouldRun(sequelize) {
    return columnExists(sequelize, 'short_links', 'clicks');
  },

  async up(sequelize) {
    await sequelize.query(`
      ALTER TABLE short_links
      DROP COLUMN IF EXISTS clicks
    `);
  },
};

export default migration;
