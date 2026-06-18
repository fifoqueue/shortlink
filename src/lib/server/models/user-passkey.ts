import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class UserPasskeyCredentialModel extends Model<
  InferAttributes<UserPasskeyCredentialModel>,
  InferCreationAttributes<UserPasskeyCredentialModel>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare credentialId: string;
  declare publicKey: Record<string, unknown>;
  declare algorithm: number;
  declare counter: CreationOptional<number>;
  declare transports: CreationOptional<string[]>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUserPasskeyCredentialModel(sequelize: Sequelize) {
  UserPasskeyCredentialModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      credentialId: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      publicKey: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      algorithm: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      counter: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      transports: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'user_passkey_credentials',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['credential_id'], unique: true },
        { fields: ['user_id'] },
      ],
    },
  );
}
