import { ApiTokenModel } from './api-token';
import { ClickEventModel } from './click-event';
import {
  LinkAccessGrantModel,
  LinkAccessShareModel,
} from './link-access-share';
import {
  PermissionGroupCidrModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
} from './permission-group';
import { ShortLinkModel } from './short-link';
import { UserModel } from './user';
import { UserIdentityModel } from './user-identity';

function hasAssociation(
  model: { associations: Record<string, unknown> },
  alias: string,
) {
  return Object.prototype.hasOwnProperty.call(model.associations, alias);
}

export function associateModels() {
  if (!hasAssociation(ShortLinkModel, 'click_events')) {
    ShortLinkModel.hasMany(ClickEventModel, {
      foreignKey: 'link_id',
      as: 'click_events',
    });
  }
  if (!hasAssociation(ClickEventModel, 'link')) {
    ClickEventModel.belongsTo(ShortLinkModel, {
      foreignKey: 'link_id',
      as: 'link',
    });
  }
  if (!hasAssociation(UserModel, 'created_links')) {
    UserModel.hasMany(ShortLinkModel, {
      foreignKey: 'creator_user_id',
      as: 'created_links',
    });
  }
  if (!hasAssociation(ShortLinkModel, 'creator')) {
    ShortLinkModel.belongsTo(UserModel, {
      foreignKey: 'creator_user_id',
      as: 'creator',
    });
  }
  if (!hasAssociation(ShortLinkModel, 'access_share')) {
    ShortLinkModel.hasOne(LinkAccessShareModel, {
      foreignKey: 'link_id',
      as: 'access_share',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessShareModel, 'link')) {
    LinkAccessShareModel.belongsTo(ShortLinkModel, {
      foreignKey: 'link_id',
      as: 'link',
    });
  }
  if (!hasAssociation(LinkAccessShareModel, 'grants')) {
    LinkAccessShareModel.hasMany(LinkAccessGrantModel, {
      foreignKey: 'share_id',
      as: 'grants',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessGrantModel, 'share')) {
    LinkAccessGrantModel.belongsTo(LinkAccessShareModel, {
      foreignKey: 'share_id',
      as: 'share',
    });
  }
  if (!hasAssociation(UserModel, 'link_access_grants')) {
    UserModel.hasMany(LinkAccessGrantModel, {
      foreignKey: 'user_id',
      as: 'link_access_grants',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessGrantModel, 'user')) {
    LinkAccessGrantModel.belongsTo(UserModel, {
      foreignKey: 'user_id',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'api_tokens')) {
    UserModel.hasMany(ApiTokenModel, {
      foreignKey: 'user_id',
      as: 'api_tokens',
    });
  }
  if (!hasAssociation(ApiTokenModel, 'user')) {
    ApiTokenModel.belongsTo(UserModel, {
      foreignKey: 'user_id',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'identities')) {
    UserModel.hasMany(UserIdentityModel, {
      foreignKey: 'user_id',
      as: 'identities',
    });
  }
  if (!hasAssociation(UserIdentityModel, 'user')) {
    UserIdentityModel.belongsTo(UserModel, {
      foreignKey: 'user_id',
      as: 'user',
    });
  }
  if (!hasAssociation(PermissionGroupModel, 'users')) {
    PermissionGroupModel.hasMany(PermissionGroupUserModel, {
      foreignKey: 'group_id',
      as: 'users',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupUserModel, 'group')) {
    PermissionGroupUserModel.belongsTo(PermissionGroupModel, {
      foreignKey: 'group_id',
      as: 'group',
    });
  }
  if (!hasAssociation(UserModel, 'permission_group_memberships')) {
    UserModel.hasMany(PermissionGroupUserModel, {
      foreignKey: 'user_id',
      as: 'permission_group_memberships',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupUserModel, 'user')) {
    PermissionGroupUserModel.belongsTo(UserModel, {
      foreignKey: 'user_id',
      as: 'user',
    });
  }
  if (!hasAssociation(PermissionGroupModel, 'cidrs')) {
    PermissionGroupModel.hasMany(PermissionGroupCidrModel, {
      foreignKey: 'group_id',
      as: 'cidrs',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupCidrModel, 'group')) {
    PermissionGroupCidrModel.belongsTo(PermissionGroupModel, {
      foreignKey: 'group_id',
      as: 'group',
    });
  }
}
