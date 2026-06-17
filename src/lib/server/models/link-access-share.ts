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
  declare link_id: number;
  declare token: string;
  declare expires_at: Date | null;
  declare can_view_stats: CreationOptional<boolean>;
  declare editable_fields: CreationOptional<string[]>;
  declare created_by_user_id: number | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

export class LinkAccessGrantModel extends Model<
  InferAttributes<LinkAccessGrantModel>,
  InferCreationAttributes<LinkAccessGrantModel>
> {
  declare id: CreationOptional<number>;
  declare share_id: number;
  declare link_id: number;
  declare user_id: number;
  declare expires_at: Date | null;
  declare can_view_stats: CreationOptional<boolean>;
  declare editable_fields: CreationOptional<string[]>;
  declare accepted_at: CreationOptional<Date>;
}

export function initLinkAccessShareModels(sequelize: Sequelize) {
  LinkAccessShareModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      link_id: {
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
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      can_view_stats: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      editable_fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      created_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: UserModel, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'link_access_shares',
      timestamps: false,
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
      share_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: LinkAccessShareModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      link_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: ShortLinkModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: UserModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      can_view_stats: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      editable_fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      accepted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'link_access_grants',
      timestamps: false,
      indexes: [
        { fields: ['share_id', 'user_id'], unique: true },
        { fields: ['link_id', 'user_id'], unique: true },
        { fields: ['user_id'] },
      ],
    },
  );
}
