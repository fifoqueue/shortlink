import { QueryTypes, type Sequelize } from 'sequelize';
import { tableExists } from '$lib/server/migrations/helpers';
import type { DatabaseMigration } from '$lib/server/migrations/types';

async function hasLegacyEnhancedTrackingFlags(sequelize: Sequelize) {
  if (!(await tableExists(sequelize, 'app_settings'))) return false;

  const rows = await sequelize.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM app_settings
        WHERE key = 'plugins:enhanced-tracking'
          AND (
            value #> '{config,showCountry}' IS NOT NULL OR
            value #> '{config,showCity}' IS NOT NULL OR
            value #> '{config,showAsn}' IS NOT NULL
          )
      ) AS "exists"
    `,
    { type: QueryTypes.SELECT },
  );
  return rows[0]?.exists === true;
}

const migration: DatabaseMigration = {
  id: 'enhanced-tracking:001-collect-flags',

  shouldRun: hasLegacyEnhancedTrackingFlags,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'app_settings'))) return;

    await sequelize.query(`
      UPDATE app_settings
      SET value = jsonb_set(
        jsonb_set(
          jsonb_set(
            value
              #- '{config,showCountry}'
              #- '{config,showCity}'
              #- '{config,showAsn}',
            '{config,collectCountry}',
            CASE
              WHEN jsonb_typeof(value #> '{config,collectCountry}') = 'boolean'
                THEN value #> '{config,collectCountry}'
              WHEN jsonb_typeof(value #> '{config,showCountry}') = 'boolean'
                THEN value #> '{config,showCountry}'
              ELSE 'true'::jsonb
            END,
            true
          ),
          '{config,collectCity}',
          CASE
            WHEN jsonb_typeof(value #> '{config,collectCity}') = 'boolean'
              THEN value #> '{config,collectCity}'
            WHEN jsonb_typeof(value #> '{config,showCity}') = 'boolean'
              THEN value #> '{config,showCity}'
            ELSE 'true'::jsonb
          END,
          true
        ),
        '{config,collectAsn}',
        CASE
          WHEN jsonb_typeof(value #> '{config,collectAsn}') = 'boolean'
            THEN value #> '{config,collectAsn}'
          WHEN jsonb_typeof(value #> '{config,showAsn}') = 'boolean'
            THEN value #> '{config,showAsn}'
          ELSE 'true'::jsonb
        END,
        true
      ),
      updated_at = now()
      WHERE key = 'plugins:enhanced-tracking'
        AND (
          value #> '{config,showCountry}' IS NOT NULL OR
          value #> '{config,showCity}' IS NOT NULL OR
          value #> '{config,showAsn}' IS NOT NULL
        )
    `);
  },
};

export default migration;
