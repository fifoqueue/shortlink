import type { Sequelize } from 'sequelize';
import { columnExists, tableExists, withTransaction } from './helpers';
import type { DatabaseMigration } from './types';

const legacyRedirectColumns = [
  'mobile_url',
  'desktop_url',
  'ab_url',
  'ab_percent',
] as const;

type LegacyRedirectColumn = (typeof legacyRedirectColumns)[number];

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function existingLegacyRedirectColumns(sequelize: Sequelize) {
  const columns: LegacyRedirectColumn[] = [];

  for (const column of legacyRedirectColumns) {
    if (await columnExists(sequelize, 'short_links', column)) {
      columns.push(column);
    }
  }

  return columns;
}

async function needsRedirectRulesMigration(sequelize: Sequelize) {
  if (!(await tableExists(sequelize, 'short_links'))) return false;
  if (!(await columnExists(sequelize, 'short_links', 'redirect_rules'))) {
    return true;
  }
  return (await existingLegacyRedirectColumns(sequelize)).length > 0;
}

function nonEmptyColumn(column: LegacyRedirectColumn) {
  return `NULLIF(BTRIM(${quoteIdentifier(column)}::text), '') IS NOT NULL`;
}

function deviceRuleExpression(column: LegacyRedirectColumn, device: string) {
  const quotedColumn = quoteIdentifier(column);
  return `
    CASE
      WHEN ${nonEmptyColumn(column)}
      THEN jsonb_build_array(
        jsonb_build_object(
          'longUrl', BTRIM(${quotedColumn}::text),
          'conditions', jsonb_build_array(
            jsonb_build_object(
              'type', 'device',
              'matchKey', NULL,
              'matchValue', '${device}'
            )
          )
        )
      )
      ELSE '[]'::jsonb
    END
  `;
}

function legacyPercentExpression(hasAbPercent: boolean) {
  if (!hasAbPercent) return `'50'`;

  return `
    CASE
      WHEN "ab_percent" IS NULL THEN '50'
      WHEN BTRIM("ab_percent"::text) ~ '^[+-]?[0-9]+(\\.[0-9]+)?$'
      THEN LEAST(
        100,
        GREATEST(1, ROUND(BTRIM("ab_percent"::text)::numeric))
      )::int::text
      ELSE '50'
    END
  `;
}

function abRuleExpression(hasAbPercent: boolean) {
  const hasPositivePercent = hasAbPercent
    ? `AND (
        "ab_percent" IS NULL
        OR BTRIM("ab_percent"::text) !~ '^[+-]?[0-9]+(\\.[0-9]+)?$'
        OR BTRIM("ab_percent"::text)::numeric > 0
      )`
    : '';

  return `
    CASE
      WHEN ${nonEmptyColumn('ab_url')} ${hasPositivePercent}
      THEN jsonb_build_array(
        jsonb_build_object(
          'longUrl', BTRIM("ab_url"::text),
          'conditions', jsonb_build_array(
            jsonb_build_object(
              'type', 'percentage',
              'matchKey', NULL,
              'matchValue', ${legacyPercentExpression(hasAbPercent)}
            )
          )
        )
      )
      ELSE '[]'::jsonb
    END
  `;
}

const migration: DatabaseMigration = {
  id: '004-short-link-redirect-rules',

  shouldRun: needsRedirectRulesMigration,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'short_links'))) return;

    const legacyColumns = await existingLegacyRedirectColumns(sequelize);
    const hasLegacyColumn = (column: LegacyRedirectColumn) =>
      legacyColumns.includes(column);

    const legacyRuleExpressions = [
      hasLegacyColumn('mobile_url')
        ? deviceRuleExpression('mobile_url', 'mobile')
        : null,
      hasLegacyColumn('desktop_url')
        ? deviceRuleExpression('desktop_url', 'desktop')
        : null,
      hasLegacyColumn('ab_url')
        ? abRuleExpression(hasLegacyColumn('ab_percent'))
        : null,
    ].filter((expression): expression is string => expression !== null);

    await withTransaction(sequelize, async (transaction) => {
      await sequelize.query(
        `
          ALTER TABLE short_links
          ADD COLUMN IF NOT EXISTS redirect_rules jsonb NOT NULL DEFAULT '[]'::jsonb
        `,
        { transaction },
      );

      if (legacyRuleExpressions.length > 0) {
        await sequelize.query(
          `
            UPDATE short_links
            SET redirect_rules =
              CASE
                WHEN jsonb_typeof(redirect_rules) = 'array'
                THEN redirect_rules
                ELSE '[]'::jsonb
              END
              || ${legacyRuleExpressions.join('\n              || ')}
          `,
          { transaction },
        );
      }

      if (legacyColumns.length > 0) {
        await sequelize.query(
          `
            ALTER TABLE short_links
            DROP COLUMN IF EXISTS mobile_url,
            DROP COLUMN IF EXISTS desktop_url,
            DROP COLUMN IF EXISTS ab_url,
            DROP COLUMN IF EXISTS ab_percent
          `,
          { transaction },
        );
      }
    });
  },
};

export default migration;
