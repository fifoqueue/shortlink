import type { Sequelize } from 'sequelize';
import { columnExists, indexExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

async function needsAutomaticMembershipColumns(sequelize: Sequelize) {
  const groupTableExists = await tableExists(sequelize, 'permission_groups');
  const userTableExists = await tableExists(
    sequelize,
    'permission_group_users',
  );
  if (!groupTableExists && !userTableExists) return false;

  return (
    (groupTableExists &&
      !(await columnExists(sequelize, 'permission_groups', 'auto_assign'))) ||
    (userTableExists &&
      !(await columnExists(
        sequelize,
        'permission_group_users',
        'assignment_source',
      ))) ||
    (userTableExists &&
      !(await indexExists(
        sequelize,
        'permission_group_users_assignment_source_idx',
      )))
  );
}

const migration: DatabaseMigration = {
  id: '003-permission-group-automatic-memberships',

  shouldRun: needsAutomaticMembershipColumns,

  async up(sequelize) {
    if (await tableExists(sequelize, 'permission_groups')) {
      await sequelize.query(`
        ALTER TABLE permission_groups
        ADD COLUMN IF NOT EXISTS auto_assign jsonb NOT NULL DEFAULT '{}'::jsonb
      `);
    }

    if (await tableExists(sequelize, 'permission_group_users')) {
      await sequelize.query(`
        ALTER TABLE permission_group_users
        ADD COLUMN IF NOT EXISTS assignment_source varchar(20) NOT NULL DEFAULT 'manual'
      `);
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS permission_group_users_assignment_source_idx
        ON permission_group_users (assignment_source)
      `);
    }
  },
};

export default migration;
