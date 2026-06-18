import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { UserModel } from './user';

export class UserIdentityModel extends Model<
  InferAttributes<UserIdentityModel>,
  InferCreationAttributes<UserIdentityModel>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare provider: string;
  declare subject: string;
  declare email: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function initUserIdentityModel(sequelize: Sequelize) {
  UserIdentityModel.init(
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
      provider: {
        type: DataTypes.STRING(96),
        allowNull: false,
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(320),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'user_identities',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['provider', 'subject'], unique: true },
        { fields: ['user_id', 'provider'] },
      ],
    },
  );
}
