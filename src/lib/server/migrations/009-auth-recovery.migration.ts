import type { Sequelize } from 'sequelize';
import { columnExists, indexExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

async function needsAuthRecovery(sequelize: Sequelize) {
  return (
    !(await tableExists(sequelize, 'auth_request_limits')) ||
    ((await tableExists(sequelize, 'users')) &&
      (!(await columnExists(sequelize, 'users', 'password_reset_token_hash')) ||
        !(await columnExists(
          sequelize,
          'users',
          'password_reset_expires_at',
        )) ||
        !(await indexExists(sequelize, 'users_password_reset_token_hash'))))
  );
}

const migration: DatabaseMigration = {
  id: '009-auth-recovery',

  shouldRun: needsAuthRecovery,

  async up(sequelize) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS auth_request_limits (
        id serial PRIMARY KEY,
        kind varchar(40) NOT NULL,
        identifier_hash varchar(128) NOT NULL,
        date_key varchar(10) NOT NULL,
        count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS auth_request_limits_kind_identifier_date_idx
      ON auth_request_limits (kind, identifier_hash, date_key)
    `);

    if (await tableExists(sequelize, 'users')) {
      await sequelize.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_reset_token_hash varchar(128),
        ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz
      `);
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_password_reset_token_hash
        ON users (password_reset_token_hash)
        WHERE password_reset_token_hash IS NOT NULL
      `);
    }
  },
};

export default migration;
