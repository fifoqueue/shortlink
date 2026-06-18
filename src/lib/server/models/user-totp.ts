import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class UserTotpSecretModel extends Model<
  InferAttributes<UserTotpSecretModel>,
  InferCreationAttributes<UserTotpSecretModel>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare secret: string;
  declare enabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUserTotpSecretModel(sequelize: Sequelize) {
  UserTotpSecretModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      secret: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      tableName: 'user_totp_secrets',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['user_id'], unique: true }],
    },
  );
}
