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
import { UserPasskeyCredentialModel } from './user-passkey';
import { UserTotpSecretModel } from './user-totp';

function hasAssociation(
  model: { associations: Record<string, unknown> },
  alias: string,
) {
  return Object.prototype.hasOwnProperty.call(model.associations, alias);
}

export function associateModels() {
  if (!hasAssociation(ShortLinkModel, 'clickEvents')) {
    ShortLinkModel.hasMany(ClickEventModel, {
      foreignKey: 'linkId',
      as: 'clickEvents',
    });
  }
  if (!hasAssociation(ClickEventModel, 'link')) {
    ClickEventModel.belongsTo(ShortLinkModel, {
      foreignKey: 'linkId',
      as: 'link',
    });
  }
  if (!hasAssociation(UserModel, 'createdLinks')) {
    UserModel.hasMany(ShortLinkModel, {
      foreignKey: 'creatorUserId',
      as: 'createdLinks',
    });
  }
  if (!hasAssociation(ShortLinkModel, 'creator')) {
    ShortLinkModel.belongsTo(UserModel, {
      foreignKey: 'creatorUserId',
      as: 'creator',
    });
  }
  if (!hasAssociation(ShortLinkModel, 'accessShare')) {
    ShortLinkModel.hasOne(LinkAccessShareModel, {
      foreignKey: 'linkId',
      as: 'accessShare',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessShareModel, 'link')) {
    LinkAccessShareModel.belongsTo(ShortLinkModel, {
      foreignKey: 'linkId',
      as: 'link',
    });
  }
  if (!hasAssociation(LinkAccessShareModel, 'grants')) {
    LinkAccessShareModel.hasMany(LinkAccessGrantModel, {
      foreignKey: 'shareId',
      as: 'grants',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessGrantModel, 'share')) {
    LinkAccessGrantModel.belongsTo(LinkAccessShareModel, {
      foreignKey: 'shareId',
      as: 'share',
    });
  }
  if (!hasAssociation(UserModel, 'linkAccessGrants')) {
    UserModel.hasMany(LinkAccessGrantModel, {
      foreignKey: 'userId',
      as: 'linkAccessGrants',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(LinkAccessGrantModel, 'user')) {
    LinkAccessGrantModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'apiTokens')) {
    UserModel.hasMany(ApiTokenModel, {
      foreignKey: 'userId',
      as: 'apiTokens',
    });
  }
  if (!hasAssociation(ApiTokenModel, 'user')) {
    ApiTokenModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'identities')) {
    UserModel.hasMany(UserIdentityModel, {
      foreignKey: 'userId',
      as: 'identities',
    });
  }
  if (!hasAssociation(UserIdentityModel, 'user')) {
    UserIdentityModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'totpSecret')) {
    UserModel.hasOne(UserTotpSecretModel, {
      foreignKey: 'userId',
      as: 'totpSecret',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(UserTotpSecretModel, 'user')) {
    UserTotpSecretModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(UserModel, 'passkeyCredentials')) {
    UserModel.hasMany(UserPasskeyCredentialModel, {
      foreignKey: 'userId',
      as: 'passkeyCredentials',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(UserPasskeyCredentialModel, 'user')) {
    UserPasskeyCredentialModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(PermissionGroupModel, 'users')) {
    PermissionGroupModel.hasMany(PermissionGroupUserModel, {
      foreignKey: 'groupId',
      as: 'users',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupUserModel, 'group')) {
    PermissionGroupUserModel.belongsTo(PermissionGroupModel, {
      foreignKey: 'groupId',
      as: 'group',
    });
  }
  if (!hasAssociation(UserModel, 'permissionGroupMemberships')) {
    UserModel.hasMany(PermissionGroupUserModel, {
      foreignKey: 'userId',
      as: 'permissionGroupMemberships',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupUserModel, 'user')) {
    PermissionGroupUserModel.belongsTo(UserModel, {
      foreignKey: 'userId',
      as: 'user',
    });
  }
  if (!hasAssociation(PermissionGroupModel, 'cidrs')) {
    PermissionGroupModel.hasMany(PermissionGroupCidrModel, {
      foreignKey: 'groupId',
      as: 'cidrs',
      onDelete: 'CASCADE',
    });
  }
  if (!hasAssociation(PermissionGroupCidrModel, 'group')) {
    PermissionGroupCidrModel.belongsTo(PermissionGroupModel, {
      foreignKey: 'groupId',
      as: 'group',
    });
  }
}
