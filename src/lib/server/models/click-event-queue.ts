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
  declare linkId: number;
  declare requestUrl: string;
  declare requestHeaders: CreationOptional<Record<string, string>>;
  declare pluginStates: CreationOptional<Record<string, unknown>>;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare referer: string | null;
  declare attempts: CreationOptional<number>;
  declare lastError: string | null;
  declare createdAt: CreationOptional<Date>;
  declare nextAttemptAt: CreationOptional<Date>;
}

export function initClickEventQueueModel(sequelize: Sequelize) {
  ClickEventQueueModel.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      linkId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      requestUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      requestHeaders: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      pluginStates: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      userAgent: {
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
      lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      nextAttemptAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'click_event_queue',
      timestamps: false,
      underscored: true,
      indexes: [{ fields: ['next_attempt_at', 'id'] }, { fields: ['link_id'] }],
    },
  );
}
