import {
  DataTypes,
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
  declare queue_id: CreationOptional<number | null>;
  declare link_id: number;
  declare created_at: CreationOptional<Date>;
  declare ip_address: string | null;
  declare user_agent: string | null;
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
      queue_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      link_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
      indexes: [
        { fields: ['link_id', 'created_at'] },
        { fields: ['queue_id'], unique: true },
      ],
    },
  );
}
