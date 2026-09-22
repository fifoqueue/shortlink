import { columnExists, indexExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

const migration: DatabaseMigration = {
  id: '012-clickhouse-delivery',
  async shouldRun(sequelize) {
    return (
      (await tableExists(sequelize, 'click_events')) &&
      (!(await columnExists(
        sequelize,
        'click_events',
        'clickhouse_synced_at',
      )) ||
        !(await columnExists(
          sequelize,
          'click_events',
          'clickhouse_next_attempt_at',
        )) ||
        !(await indexExists(sequelize, 'click_events_clickhouse_pending_idx')))
    );
  },
  async up(sequelize) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `
        ALTER TABLE click_events
          ADD COLUMN IF NOT EXISTS clickhouse_synced_at timestamptz,
          ADD COLUMN IF NOT EXISTS clickhouse_next_attempt_at timestamptz NOT NULL DEFAULT now();
        CREATE INDEX IF NOT EXISTS click_events_clickhouse_pending_idx
        ON click_events (clickhouse_next_attempt_at, id) WHERE clickhouse_synced_at IS NULL;
      `,
        { transaction },
      );
    });
  },
};

export default migration;
