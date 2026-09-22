import { columnExists, indexExists, tableExists } from './helpers';
import type { DatabaseMigration } from './types';

const migration: DatabaseMigration = {
  id: '011-durable-click-reservations',

  async shouldRun(sequelize) {
    return (
      (await tableExists(sequelize, 'short_links')) &&
      (!(await columnExists(sequelize, 'short_links', 'redirect_count')) ||
        !(await columnExists(sequelize, 'click_events', 'source_id')) ||
        !(await indexExists(sequelize, 'click_events_source_id')))
    );
  },

  async up(sequelize) {
    await sequelize.transaction(async (transaction) => {
      // Prevent concurrent startup migrations from reseeding a live counter.
      await sequelize.query('LOCK TABLE short_links IN ACCESS EXCLUSIVE MODE', {
        transaction,
      });
      const hasEvents = await tableExists(
        sequelize,
        'click_events',
        transaction,
      );
      const hasQueue = await tableExists(
        sequelize,
        'click_event_queue',
        transaction,
      );
      if (
        !(await columnExists(
          sequelize,
          'short_links',
          'redirect_count',
          transaction,
        ))
      ) {
        await sequelize.query(
          `
          ALTER TABLE short_links ADD COLUMN redirect_count bigint NOT NULL DEFAULT 0;
          UPDATE short_links AS link SET redirect_count =
            ${hasEvents ? '(SELECT count(*) FROM click_events WHERE link_id = link.id)' : '0'} +
            ${
              hasQueue
                ? `(SELECT count(*) FROM click_event_queue AS pending WHERE pending.link_id = link.id
              ${hasEvents ? 'AND NOT EXISTS (SELECT 1 FROM click_events WHERE queue_id = pending.id)' : ''})`
                : '0'
            };
        `,
          { transaction },
        );
      }
      if (hasEvents)
        await sequelize.query(
          `
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS source_id text;
        CREATE UNIQUE INDEX IF NOT EXISTS click_events_source_id ON click_events (source_id);
      `,
          { transaction },
        );
    });
  },
};

export default migration;
