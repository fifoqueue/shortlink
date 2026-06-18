import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class AuthRequestLimitModel extends Model<
  InferAttributes<AuthRequestLimitModel>,
  InferCreationAttributes<AuthRequestLimitModel>
> {
  declare id: CreationOptional<number>;
  declare kind: string;
  declare identifierHash: string;
  declare dateKey: string;
  declare count: CreationOptional<number>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAuthRequestLimitModel(sequelize: Sequelize) {
  AuthRequestLimitModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      kind: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      identifierHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      dateKey: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'auth_request_limits',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          fields: ['kind', 'identifier_hash', 'date_key'],
          name: 'auth_request_limits_kind_identifier_date_idx',
          unique: true,
        },
      ],
    },
  );
}
