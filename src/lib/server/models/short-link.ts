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
  declare creatorUserId: number | null;
  declare creatorSessionId: string | null;
  declare creatorIpHash: string | null;
  declare creatorIpAddress: string | null;
  declare createdAt: CreationOptional<Date>;
  declare lastClickedAt: Date | null;
  declare expiresAt: Date | null;
  declare maxClicks: CreationOptional<number>;
  declare passwordHash: string | null;
  declare passwordSalt: string | null;
  declare redirectRules: CreationOptional<Record<string, unknown>[]>;
  declare healthStatus: CreationOptional<string>;
  declare healthStatusCode: number | null;
  declare healthCheckedAt: Date | null;
  declare healthError: string | null;
  declare healthResponseBody: string | null;
  declare healthLatencyMs: number | null;
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
      creatorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      creatorSessionId: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      creatorIpHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      creatorIpAddress: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastClickedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      maxClicks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      passwordHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      passwordSalt: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      redirectRules: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      healthStatus: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'unchecked',
      },
      healthStatusCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      healthCheckedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      healthError: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      healthResponseBody: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      healthLatencyMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'short_links',
      timestamps: false,
      underscored: true,
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
