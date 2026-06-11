import type { Sequelize } from 'sequelize';

export interface DatabaseMigration {
  id: string;
  shouldRun: (sequelize: Sequelize) => Promise<boolean>;
  up: (sequelize: Sequelize) => Promise<void>;
}
