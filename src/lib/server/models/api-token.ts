import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { UserModel } from './user';

export class ApiTokenModel extends Model<
  InferAttributes<ApiTokenModel>,
  InferCreationAttributes<ApiTokenModel>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare name: string;
  declare tokenHash: string;
  declare tokenPrefix: string;
  declare createdAt: CreationOptional<Date>;
  declare lastUsedAt: Date | null;
}

export function initApiTokenModel(sequelize: Sequelize) {
  ApiTokenModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: UserModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      tokenPrefix: {
        type: DataTypes.STRING(16),
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
    },
    {
      sequelize,
      tableName: 'api_tokens',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['token_hash'], unique: true },
        { fields: ['user_id'] },
      ],
    },
  );
}
