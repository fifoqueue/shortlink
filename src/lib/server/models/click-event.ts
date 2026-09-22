import {
  DataTypes,
  literal,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { ShortLinkModel } from './short-link';

export class ClickEventModel extends Model<
  InferAttributes<ClickEventModel>,
  InferCreationAttributes<ClickEventModel>
> {
  declare id: CreationOptional<number>;
  declare queueId: CreationOptional<number | null>;
  declare sourceId: CreationOptional<string | null>;
  declare clickhouseSyncedAt: CreationOptional<Date | null>;
  declare clickhouseNextAttemptAt: CreationOptional<Date>;
  declare linkId: number;
  declare createdAt: CreationOptional<Date>;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare referer: string | null;
  declare metadata: CreationOptional<Record<string, unknown>>;
}

export function initClickEventModel(sequelize: Sequelize) {
  ClickEventModel.init(
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      sourceId: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      clickhouseSyncedAt: { type: DataTypes.DATE, allowNull: true },
      clickhouseNextAttemptAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
      },
      queueId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      linkId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      sequelize,
      tableName: 'click_events',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['link_id', 'created_at'] },
        { fields: ['queue_id'], unique: true },
        { fields: ['source_id'], unique: true },
        {
          name: 'click_events_clickhouse_pending_idx',
          fields: ['clickhouse_next_attempt_at', 'id'],
          where: { clickhouse_synced_at: null },
        },
      ],
    },
  );
}
