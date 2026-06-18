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
  declare pendingEmail: CreationOptional<string | null>;
  declare name: string;
  declare passwordHash: string;
  declare isAdmin: CreationOptional<boolean>;
  declare enabled: CreationOptional<boolean>;
  declare emailVerifiedAt: CreationOptional<Date | null>;
  declare emailVerificationTokenHash: CreationOptional<string | null>;
  declare emailVerificationExpiresAt: CreationOptional<Date | null>;
  declare passwordResetTokenHash: CreationOptional<string | null>;
  declare passwordResetExpiresAt: CreationOptional<Date | null>;
  declare sessionVersion: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
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
      pendingEmail: {
        type: DataTypes.STRING(320),
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      isAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      emailVerificationTokenHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      emailVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      passwordResetTokenHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      passwordResetExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      sessionVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['email_verification_token_hash'], unique: true },
        { fields: ['password_reset_token_hash'], unique: true },
      ],
    },
  );
}
