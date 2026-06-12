import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class ShortLinkModel extends Model<
  InferAttributes<ShortLinkModel>,
  InferCreationAttributes<ShortLinkModel>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare domain: string;
  declare url: string;
  declare preview: CreationOptional<Record<string, unknown>>;
  declare tags: CreationOptional<string[]>;
  declare clicks: CreationOptional<number>;
  declare creator_user_id: number | null;
  declare creator_session_id: string | null;
  declare creator_ip_hash: string | null;
  declare creator_ip_address: string | null;
  declare created_at: CreationOptional<Date>;
  declare last_clicked_at: Date | null;
  declare expires_at: Date | null;
  declare max_clicks: CreationOptional<number>;
  declare password_hash: string | null;
  declare password_salt: string | null;
  declare redirect_rules: CreationOptional<Record<string, unknown>[]>;
  declare health_status: CreationOptional<string>;
  declare health_status_code: number | null;
  declare health_checked_at: Date | null;
  declare health_error: string | null;
  declare health_response_body: string | null;
  declare health_latency_ms: number | null;
}

export function initShortLinkModel(sequelize: Sequelize) {
  ShortLinkModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      domain: {
        type: DataTypes.STRING(320),
        allowNull: false,
      },
      url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      preview: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      tags: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      clicks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      creator_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      creator_session_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      creator_ip_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      creator_ip_address: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      last_clicked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      max_clicks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      password_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      password_salt: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      redirect_rules: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      health_status: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'unchecked',
      },
      health_status_code: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      health_checked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      health_error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      health_response_body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      health_latency_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'short_links',
      timestamps: false,
      indexes: [
        { fields: ['created_at'] },
        { fields: ['creator_user_id'] },
        { fields: ['creator_session_id'] },
        { fields: ['creator_ip_hash'] },
        { fields: ['creator_user_id', 'id'] },
        { fields: ['creator_session_id', 'id'] },
        { fields: ['creator_ip_hash', 'id'] },
        { name: 'short_links_domain_idx', fields: ['domain'] },
        { name: 'short_links_code_idx', fields: ['code'] },
        { fields: ['health_status'] },
      ],
    },
  );
}
