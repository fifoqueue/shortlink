import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { ShortLinkModel } from './short-link';
import { UserModel } from './user';

export class LinkAccessShareModel extends Model<
  InferAttributes<LinkAccessShareModel>,
  InferCreationAttributes<LinkAccessShareModel>
> {
  declare id: CreationOptional<number>;
  declare linkId: number;
  declare token: string;
  declare expiresAt: Date | null;
  declare canViewStats: CreationOptional<boolean>;
  declare editableFields: CreationOptional<string[]>;
  declare createdByUserId: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class LinkAccessGrantModel extends Model<
  InferAttributes<LinkAccessGrantModel>,
  InferCreationAttributes<LinkAccessGrantModel>
> {
  declare id: CreationOptional<number>;
  declare shareId: number;
  declare linkId: number;
  declare userId: number;
  declare expiresAt: Date | null;
  declare canViewStats: CreationOptional<boolean>;
  declare editableFields: CreationOptional<string[]>;
  declare acceptedAt: CreationOptional<Date>;
}

export function initLinkAccessShareModels(sequelize: Sequelize) {
  LinkAccessShareModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      linkId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      token: {
        type: DataTypes.STRING(96),
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      canViewStats: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      editableFields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: UserModel, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'link_access_shares',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['link_id'], unique: true },
        { fields: ['token'], unique: true },
        { fields: ['expires_at'] },
      ],
    },
  );

  LinkAccessGrantModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      shareId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: LinkAccessShareModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      linkId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: UserModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      canViewStats: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      editableFields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'link_access_grants',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['share_id', 'user_id'], unique: true },
        { fields: ['link_id', 'user_id'], unique: true },
        { fields: ['user_id'] },
      ],
    },
  );
}
