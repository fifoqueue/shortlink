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
  declare autoAssign: CreationOptional<Record<string, unknown>>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class PermissionGroupUserModel extends Model<
  InferAttributes<PermissionGroupUserModel>,
  InferCreationAttributes<PermissionGroupUserModel>
> {
  declare id: CreationOptional<number>;
  declare groupId: number;
  declare userId: number;
  declare expiresAt: Date | null;
  declare reason: CreationOptional<string>;
  declare reasonPublic: CreationOptional<boolean>;
  declare assignmentSource: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
}

export class PermissionGroupCidrModel extends Model<
  InferAttributes<PermissionGroupCidrModel>,
  InferCreationAttributes<PermissionGroupCidrModel>
> {
  declare id: CreationOptional<number>;
  declare groupId: number;
  declare cidr: string;
  declare family: number;
  declare startHex: string;
  declare endHex: string;
  declare expiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
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
      autoAssign: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
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
      tableName: 'permission_groups',
      timestamps: false,
      underscored: true,
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
      groupId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'permission_groups', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      reasonPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      assignmentSource: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'permission_group_users',
      timestamps: false,
      underscored: true,
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
      groupId: {
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
      startHex: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      endHex: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
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
      tableName: 'permission_group_cidrs',
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ['group_id', 'cidr'], unique: true },
        { fields: ['family', 'start_hex', 'end_hex'] },
      ],
    },
  );
}
