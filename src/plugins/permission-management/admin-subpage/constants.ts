import type { LinkEditFieldKey, LinkOptionKey } from '$lib/config';
import type { PluginLocaleKey } from '$lib/plugin-contracts';
import type { AutoAssignTab, LinkPermissionKey } from './types';

export const linkOptions = [
  ['customCode', 'admin.customCode'],
  ['previewTitle', 'admin.previewTitle'],
  ['previewDescription', 'admin.previewDescription'],
  ['previewImageUrl', 'admin.previewImageUrl'],
  ['themeColor', 'admin.themeColor'],
  ['utmSource', 'admin.utmSource'],
  ['utmMedium', 'admin.utmMedium'],
  ['utmCampaign', 'admin.utmCampaign'],
  ['utmTerm', 'admin.utmTerm'],
  ['utmContent', 'admin.utmContent'],
  ['expiresAt', 'admin.expirationDate'],
  ['maxClicks', 'admin.maxClicks'],
  ['password', 'admin.password'],
  ['tags', 'admin.tags'],
  ['redirectRules', 'admin.redirectRules'],
  ['redirectRuleDevice', 'admin.redirectRuleDevice'],
  ['redirectRuleLanguage', 'admin.redirectRuleLanguage'],
  ['redirectRuleQuery', 'admin.redirectRuleQuery'],
  ['redirectRuleIp', 'admin.redirectRuleIp'],
  ['redirectRuleGeo', 'admin.redirectRuleGeo'],
  ['redirectRulePercentage', 'admin.redirectRulePercentage'],
] as const satisfies readonly (readonly [LinkOptionKey, PluginLocaleKey])[];

export const linkPermissions = [
  ['create', 'admin.createLinks'],
  ['deleteOwn', 'admin.deleteOwnLinks'],
  ['editOwn', 'admin.editOwnLinks'],
  ['viewAll', 'admin.viewOtherLinks'],
  ['editAll', 'admin.editOtherLinks'],
  ['deleteAll', 'admin.deleteOtherLinks'],
  ['statsAll', 'admin.viewOtherStats'],
  ['statsCsv', 'admin.downloadStatsCsv'],
  ['share', 'admin.shareLinks'],
  ['healthAll', 'admin.checkOtherLinkHealth'],
  ['expiresAtBypass', 'admin.bypassExpiration'],
  ['passwordBypass', 'admin.bypassPasswords'],
] as const satisfies readonly (readonly [LinkPermissionKey, PluginLocaleKey])[];

export const editableFields = [
  ['url', 'admin.destinationUrl'],
  ['previewTitle', 'admin.previewTitle'],
  ['previewDescription', 'admin.previewDescription'],
  ['previewImageUrl', 'admin.previewImageUrl'],
  ['themeColor', 'admin.themeColor'],
  ['utmSource', 'admin.utmSource'],
  ['utmMedium', 'admin.utmMedium'],
  ['utmCampaign', 'admin.utmCampaign'],
  ['utmTerm', 'admin.utmTerm'],
  ['utmContent', 'admin.utmContent'],
  ['expiresAt', 'admin.expirationDate'],
  ['maxClicks', 'admin.maxClicks'],
  ['password', 'admin.password'],
  ['tags', 'admin.tags'],
  ['redirectRules', 'admin.redirectRules'],
  ['redirectRuleDevice', 'admin.redirectRuleDevice'],
  ['redirectRuleLanguage', 'admin.redirectRuleLanguage'],
  ['redirectRuleQuery', 'admin.redirectRuleQuery'],
  ['redirectRuleIp', 'admin.redirectRuleIp'],
  ['redirectRuleGeo', 'admin.redirectRuleGeo'],
  ['redirectRulePercentage', 'admin.redirectRulePercentage'],
] as const satisfies readonly (readonly [LinkEditFieldKey, PluginLocaleKey])[];

export const apiPermissions = [
  ['enabled', 'admin.apiAccess'],
  ['create', 'admin.createLinksApi'],
  ['list', 'admin.listApi'],
  ['stats', 'admin.statsApi'],
  ['delete', 'admin.deleteApi'],
  ['update', 'admin.updateApi'],
] as const satisfies readonly (readonly [string, PluginLocaleKey])[];

export const autoAssignTabs = [
  ['email', 'admin.autoAssignEmailTab'],
  ['account', 'admin.autoAssignAccountTab'],
] as const satisfies readonly (readonly [AutoAssignTab, PluginLocaleKey])[];
