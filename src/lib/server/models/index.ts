import type { Sequelize } from 'sequelize';
import { associateModels } from './associations';
import { AppSettingModel, initAppSettingModel } from './app-setting';
import { ApiTokenModel, initApiTokenModel } from './api-token';
import {
  AuthRequestLimitModel,
  initAuthRequestLimitModel,
} from './auth-request-limit';
import { ClickEventModel, initClickEventModel } from './click-event';
import {
  ClickEventQueueModel,
  initClickEventQueueModel,
} from './click-event-queue';
import {
  LinkAccessGrantModel,
  LinkAccessShareModel,
  initLinkAccessShareModels,
} from './link-access-share';
import {
  PermissionGroupCidrModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
  initPermissionGroupModels,
} from './permission-group';
import { ShortLinkModel, initShortLinkModel } from './short-link';
import { UserModel, initUserModel } from './user';
import { UserIdentityModel, initUserIdentityModel } from './user-identity';

export { AppSettingModel } from './app-setting';
export { ApiTokenModel } from './api-token';
export { AuthRequestLimitModel } from './auth-request-limit';
export { ClickEventModel } from './click-event';
export { ClickEventQueueModel } from './click-event-queue';
export {
  LinkAccessGrantModel,
  LinkAccessShareModel,
} from './link-access-share';
export {
  PermissionGroupCidrModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
} from './permission-group';
export { ShortLinkModel } from './short-link';
export { UserModel } from './user';
export { UserIdentityModel } from './user-identity';

export function initModels(sequelize: Sequelize) {
  if (AppSettingModel.sequelize !== sequelize) initAppSettingModel(sequelize);
  if (AuthRequestLimitModel.sequelize !== sequelize)
    initAuthRequestLimitModel(sequelize);
  if (UserModel.sequelize !== sequelize) initUserModel(sequelize);
  if (ShortLinkModel.sequelize !== sequelize) initShortLinkModel(sequelize);
  if (ClickEventModel.sequelize !== sequelize) initClickEventModel(sequelize);
  if (ClickEventQueueModel.sequelize !== sequelize)
    initClickEventQueueModel(sequelize);
  if (
    LinkAccessShareModel.sequelize !== sequelize ||
    LinkAccessGrantModel.sequelize !== sequelize
  ) {
    initLinkAccessShareModels(sequelize);
  }
  if (UserIdentityModel.sequelize !== sequelize)
    initUserIdentityModel(sequelize);
  if (ApiTokenModel.sequelize !== sequelize) initApiTokenModel(sequelize);
  if (
    PermissionGroupModel.sequelize !== sequelize ||
    PermissionGroupUserModel.sequelize !== sequelize ||
    PermissionGroupCidrModel.sequelize !== sequelize
  ) {
    initPermissionGroupModels(sequelize);
  }
  associateModels();
}
