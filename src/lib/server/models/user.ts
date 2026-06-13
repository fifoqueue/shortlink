import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare pending_email: CreationOptional<string | null>;
  declare name: string;
  declare password_hash: string;
  declare is_admin: CreationOptional<boolean>;
  declare enabled: CreationOptional<boolean>;
  declare email_verified_at: CreationOptional<Date | null>;
  declare email_verification_token_hash: CreationOptional<string | null>;
  declare email_verification_expires_at: CreationOptional<Date | null>;
  declare password_reset_token_hash: CreationOptional<string | null>;
  declare password_reset_expires_at: CreationOptional<Date | null>;
  declare session_version: CreationOptional<number>;
  declare created_at: CreationOptional<Date>;
}

export function initUserModel(sequelize: Sequelize) {
  UserModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING(320),
        allowNull: false,
        unique: true,
      },
      pending_email: {
        type: DataTypes.STRING(320),
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      password_hash: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_admin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      email_verification_token_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      email_verification_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      password_reset_token_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      password_reset_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      session_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: false,
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['email_verification_token_hash'], unique: true },
        { fields: ['password_reset_token_hash'], unique: true },
      ],
    },
  );
}
