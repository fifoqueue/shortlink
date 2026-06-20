import {
  isRedirectRuleConditionKey,
  linkedLinkEditFieldPairs,
  linkedLinkOptionKeyPairs,
  redirectRuleConditionKeys,
  type LinkEditFieldKey,
  type LinkOptionKey,
} from '$lib/config';
import { pluginText } from '$lib/i18n/plugin';
import type {
  PluginLocaleKey,
  PluginLocaleStrings,
} from '$lib/plugin-contracts';
import type { Group, RuleValue } from './types';

export function permissionText(
  strings: PluginLocaleStrings,
  key: PluginLocaleKey,
) {
  return pluginText(strings, key);
}

export function formatPermissionText(
  strings: PluginLocaleStrings,
  key: PluginLocaleKey,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    permissionText(strings, key),
  );
}

export function ruleValue(value: RuleValue) {
  if (value === true) return 'allow';
  if (value === false) return 'deny';
  return 'inherit';
}

function linkedOptionKeys(key: LinkOptionKey) {
  for (const [left, right] of linkedLinkOptionKeyPairs) {
    if (left === key || right === key) return [left, right] as const;
  }
  return [key] as const;
}

function linkedEditFieldKeys(key: LinkEditFieldKey) {
  for (const [left, right] of linkedLinkEditFieldPairs) {
    if (left === key || right === key) return [left, right] as const;
  }
  return [key] as const;
}

function formSelect(form: HTMLFormElement, name: string) {
  return Array.from(form.elements).find(
    (element): element is HTMLSelectElement =>
      element instanceof HTMLSelectElement && element.name === name,
  );
}

function selectValueForRedirectRuleChildren(
  form: HTMLFormElement,
  nameForKey: (key: (typeof redirectRuleConditionKeys)[number]) => string,
) {
  const values = redirectRuleConditionKeys
    .map((key) => formSelect(form, nameForKey(key))?.value)
    .filter((value): value is string => value !== undefined);
  if (values.length === 0) return 'inherit';
  if (values.every((value) => value === 'allow')) return 'allow';
  if (values.every((value) => value === 'deny')) return 'deny';
  if (values.every((value) => value === 'inherit')) return 'inherit';
  return values.includes('allow') ? 'allow' : 'inherit';
}

function syncRedirectRuleOptionSelect(
  form: HTMLFormElement,
  key: LinkOptionKey,
  value: string,
) {
  if (key === 'redirectRules') {
    for (const conditionKey of redirectRuleConditionKeys) {
      const select = formSelect(form, `linkOption.${conditionKey}`);
      if (select) select.value = value;
    }
    return;
  }

  if (!isRedirectRuleConditionKey(key)) return;
  const parent = formSelect(form, 'linkOption.redirectRules');
  if (!parent) return;
  parent.value = selectValueForRedirectRuleChildren(
    form,
    (conditionKey) => `linkOption.${conditionKey}`,
  );
}

function syncRedirectRuleEditFieldSelect(
  form: HTMLFormElement,
  key: LinkEditFieldKey,
  value: string,
) {
  if (key === 'redirectRules') {
    for (const conditionKey of redirectRuleConditionKeys) {
      const select = formSelect(form, `linkEditField.${conditionKey}`);
      if (select) select.value = value;
    }
    return;
  }

  if (!isRedirectRuleConditionKey(key)) return;
  const parent = formSelect(form, 'linkEditField.redirectRules');
  if (!parent) return;
  parent.value = selectValueForRedirectRuleChildren(
    form,
    (conditionKey) => `linkEditField.${conditionKey}`,
  );
}

export function syncLinkedLinkOptionSelect(
  event: Event & { currentTarget: HTMLSelectElement },
  key: LinkOptionKey,
) {
  const form = event.currentTarget.form;
  if (!form) return;
  syncRedirectRuleOptionSelect(form, key, event.currentTarget.value);
  for (const linkedKey of linkedOptionKeys(key)) {
    const select = formSelect(form, `linkOption.${linkedKey}`);
    if (select) select.value = event.currentTarget.value;
  }
}

export function syncLinkedLinkEditFieldSelect(
  event: Event & { currentTarget: HTMLSelectElement },
  key: LinkEditFieldKey,
) {
  const form = event.currentTarget.form;
  if (!form) return;
  syncRedirectRuleEditFieldSelect(form, key, event.currentTarget.value);
  for (const linkedKey of linkedEditFieldKeys(key)) {
    const select = formSelect(form, `linkEditField.${linkedKey}`);
    if (select) select.value = event.currentTarget.value;
  }
}

function autoAssignCondition(group: Group, type: string) {
  return group.autoAssign.conditions.find((item) => item.type === type);
}

function autoAssignListItems(group: Group, type: string, key: string) {
  const value = autoAssignCondition(group, type)?.config[key];
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export function emailPatternCondition(group: Group) {
  return autoAssignListItems(group, 'email-pattern', 'patterns').join('\n');
}

export function autoAssignNumberCondition(
  group: Group,
  type: string,
  key: string,
) {
  const value = autoAssignCondition(group, type)?.config[key];
  return typeof value === 'number' || typeof value === 'string'
    ? String(value)
    : '';
}

export function adminStatusCondition(group: Group) {
  const value = autoAssignCondition(group, 'admin-status')?.config.isAdmin;
  if (value === true) return 'admin';
  if (value === false) return 'user';
  return 'any';
}
