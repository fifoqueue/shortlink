import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { ShortLinkModel } from './short-link';

export class ClickEventQueueModel extends Model<
  InferAttributes<ClickEventQueueModel>,
  InferCreationAttributes<ClickEventQueueModel>
> {
  declare id: CreationOptional<number>;
  declare link_id: number;
  declare request_url: string;
  declare request_headers: CreationOptional<Record<string, string>>;
  declare plugin_states: CreationOptional<Record<string, unknown>>;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare ip_address: string | null;
  declare user_agent: string | null;
  declare referer: string | null;
  declare attempts: CreationOptional<number>;
  declare last_error: string | null;
  declare created_at: CreationOptional<Date>;
  declare next_attempt_at: CreationOptional<Date>;
}

export function initClickEventQueueModel(sequelize: Sequelize) {
  ClickEventQueueModel.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      link_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      request_url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      request_headers: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      plugin_states: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      ip_address: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      referer: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      next_attempt_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'click_event_queue',
      timestamps: false,
      indexes: [{ fields: ['next_attempt_at', 'id'] }, { fields: ['link_id'] }],
    },
  );
}
