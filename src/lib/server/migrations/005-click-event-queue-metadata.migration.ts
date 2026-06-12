import type { Sequelize } from 'sequelize';
import { columnExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

async function needsClickEventQueueMetadata(sequelize: Sequelize) {
  return (
    (await tableExists(sequelize, 'click_event_queue')) &&
    !(await columnExists(sequelize, 'click_event_queue', 'metadata'))
  );
}

const migration: DatabaseMigration = {
  id: '005-click-event-queue-metadata',

  shouldRun: needsClickEventQueueMetadata,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'click_event_queue'))) return;
    await sequelize.query(`
      ALTER TABLE click_event_queue
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  },
};

export default migration;
