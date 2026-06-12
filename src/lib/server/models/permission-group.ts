import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export class PermissionGroupModel extends Model<
  InferAttributes<PermissionGroupModel>,
  InferCreationAttributes<PermissionGroupModel>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: CreationOptional<string>;
  declare priority: CreationOptional<number>;
  declare enabled: CreationOptional<boolean>;
  declare rules: CreationOptional<Record<string, unknown>>;
  declare auto_assign: CreationOptional<Record<string, unknown>>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

export class PermissionGroupUserModel extends Model<
  InferAttributes<PermissionGroupUserModel>,
  InferCreationAttributes<PermissionGroupUserModel>
> {
  declare id: CreationOptional<number>;
  declare group_id: number;
  declare user_id: number;
  declare expires_at: Date | null;
  declare reason: CreationOptional<string>;
  declare reason_public: CreationOptional<boolean>;
  declare assignment_source: CreationOptional<string>;
  declare created_at: CreationOptional<Date>;
}

export class PermissionGroupCidrModel extends Model<
  InferAttributes<PermissionGroupCidrModel>,
  InferCreationAttributes<PermissionGroupCidrModel>
> {
  declare id: CreationOptional<number>;
  declare group_id: number;
  declare cidr: string;
  declare family: number;
  declare start_hex: string;
  declare end_hex: string;
  declare expires_at: Date | null;
  declare created_at: CreationOptional<Date>;
}

export function initPermissionGroupModels(sequelize: Sequelize) {
  PermissionGroupModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      rules: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      auto_assign: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
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
      tableName: 'permission_groups',
      timestamps: false,
      indexes: [{ fields: ['enabled'] }, { fields: ['priority'] }],
    },
  );

  PermissionGroupUserModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'permission_groups', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      reason_public: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      assignment_source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'permission_group_users',
      timestamps: false,
      indexes: [
        { fields: ['group_id', 'user_id'], unique: true },
        { fields: ['user_id'] },
        { fields: ['assignment_source'] },
      ],
    },
  );

  PermissionGroupCidrModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'permission_groups', key: 'id' },
        onDelete: 'CASCADE',
      },
      cidr: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      family: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      start_hex: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      end_hex: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'permission_group_cidrs',
      timestamps: false,
      indexes: [
        { fields: ['group_id', 'cidr'], unique: true },
        { fields: ['family', 'start_hex', 'end_hex'] },
      ],
    },
  );
}
