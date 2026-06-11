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
  declare user_id: number;
  declare name: string;
  declare token_hash: string;
  declare token_prefix: string;
  declare created_at: CreationOptional<Date>;
  declare last_used_at: Date | null;
}

export function initApiTokenModel(sequelize: Sequelize) {
  ApiTokenModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: UserModel, key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      token_prefix: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'api_tokens',
      timestamps: false,
      indexes: [
        { fields: ['token_hash'], unique: true },
        { fields: ['user_id'] },
      ],
    },
  );
}
