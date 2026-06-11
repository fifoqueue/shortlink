import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

function tableName(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'tableName' in value) {
    const name = (value as { tableName: unknown }).tableName;
    if (typeof name === 'string') return name;
  }
  return '';
}

export async function tableExists(sequelize: Sequelize, table: string) {
  const queryInterface = sequelize.getQueryInterface();
  const actualTables = new Set(
    (await queryInterface.showAllTables()).map(tableName).filter(Boolean),
  );
  return actualTables.has(table);
}

export async function indexExists(sequelize: Sequelize, index: string) {
  const rows = await sequelize.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = $index
      ) AS "exists"
    `,
    {
      bind: { index },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]?.exists === true;
}

export async function columnExists(
  sequelize: Sequelize,
  table: string,
  column: string,
) {
  const rows = await sequelize.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $table
          AND column_name = $column
      ) AS "exists"
    `,
    {
      bind: { table, column },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]?.exists === true;
}

export async function withTransaction<T>(
  sequelize: Sequelize,
  run: (transaction: Transaction) => Promise<T>,
) {
  const transaction = await sequelize.transaction();
  try {
    const result = await run(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
