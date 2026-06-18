import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
export class AppSettingModel extends Model<
  InferAttributes<AppSettingModel>,
  InferCreationAttributes<AppSettingModel>
> {
  declare key: string;
  declare value: unknown;
  declare updatedAt: CreationOptional<Date>;
}

export function initAppSettingModel(sequelize: Sequelize) {
  AppSettingModel.init(
    {
      key: {
        type: DataTypes.STRING(64),
        primaryKey: true,
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'app_settings',
      timestamps: false,
      underscored: true,
    },
  );
}
