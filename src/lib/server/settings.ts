import {
  defaultLocalizedContentFor,
  defaultSettings,
  defaultSiteLocale,
  linkEditFieldKeys,
  linkOptionKeys,
  linkedLinkEditFieldPairs,
  linkedLinkOptionKeyPairs,
  redirectRuleConditionKeys,
  siteLocaleKeys,
  themePresets,
  type ColorMode,
  type EmailHttpAuthMode,
  type EmailHttpMethod,
  type EmailProvider,
  type LocalizedSiteContent,
  type RedirectStatus,
  type SiteLocale,
  type SiteSettings,
  type ThemePreset,
} from '$lib/config';
import type { PluginState } from '$lib/plugin-contracts';
import { darkThemeTokens } from '$lib/theme-vars';
import { Op, type Transaction } from 'sequelize';
import { AppSettingModel, ensureDatabase, getDatabase } from './database';
import {
  normalizeShortLinkDomains,
  normalizeShortLinkDomainSettings,
} from './url';

const SITE_SETTINGS_KEY = 'site';
const PLUGIN_SETTINGS_PREFIX = 'plugins:';
const clone = <T>(value: T): T => structuredClone(value);
let normalizePluginStates: (value: unknown) => Record<string, PluginState> =
  loosePluginStates;
const siteLocaleSet = new Set<string>(siteLocaleKeys);

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const property of Object.values(value)) {
    deepFreeze(property);
  }

  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loosePluginState(value: unknown): PluginState | null {
  if (!isRecord(value)) return null;
  return {
    enabled: value.enabled === true,
    config: isRecord(value.config) ? clone(value.config) : {},
  };
}

function loosePluginStates(value: unknown): Record<string, PluginState> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([pluginId, candidate]) => [pluginId, loosePluginState(candidate)])
      .filter(
        (entry): entry is [string, PluginState] =>
          typeof entry[0] === 'string' && entry[1] !== null,
      ),
  );
}

export function setPluginStateNormalizer(
  normalizer: (value: unknown) => Record<string, PluginState>,
) {
  normalizePluginStates = normalizer;
}

function merge<T>(defaults: T, value: unknown): T {
  if (!isRecord(defaults) || !isRecord(value)) return clone(defaults);

  const result = { ...defaults } as Record<string, unknown>;
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const candidate = value[key];
    if (Array.isArray(defaultValue)) {
      result[key] = Array.isArray(candidate) ? candidate : clone(defaultValue);
    } else if (isRecord(defaultValue)) {
      result[key] =
        Object.keys(defaultValue).length === 0 && isRecord(candidate)
          ? clone(candidate)
          : merge(defaultValue, candidate);
    } else if (
      candidate !== undefined &&
      typeof candidate === typeof defaultValue
    ) {
      result[key] = candidate;
    }
  }
  return result as T;
}

function siteSettingsValue(settings: SiteSettings) {
  return clone({
    access: settings.access,
    network: settings.network,
    general: {
      logoUrl: settings.general.logoUrl,
      faviconUrl: settings.general.faviconUrl,
      defaultDomain: settings.general.defaultDomain,
      domains: settings.general.domains,
      domainSchemes: settings.general.domainSchemes,
    },
    seo: {
      ogImageUrl: settings.seo.ogImageUrl,
      indexable: settings.seo.indexable,
      robotsTxt: settings.seo.robotsTxt,
      customHead: settings.seo.customHead,
    },
    i18n: settings.i18n,
    links: settings.links,
    api: settings.api,
    security: settings.security,
    auth: settings.auth,
    theme: settings.theme,
  });
}

function normalizeLinkSettings(settings: SiteSettings) {
  const options = Object.fromEntries(
    linkOptionKeys.map((key) => [
      key,
      typeof settings.links.options[key] === 'boolean'
        ? settings.links.options[key]
        : true,
    ]),
  ) as SiteSettings['links']['options'];

  for (const [left, right] of linkedLinkOptionKeyPairs) {
    if (options[left] !== options[right]) {
      const allowed = options[left] || options[right];
      options[left] = allowed;
      options[right] = allowed;
    }
  }
  if (!options.redirectRules) {
    for (const key of redirectRuleConditionKeys) options[key] = false;
  } else if (redirectRuleConditionKeys.every((key) => !options[key])) {
    for (const key of redirectRuleConditionKeys) options[key] = true;
  }
  settings.links.options = options;
  settings.links.allowCustomCodes = options.customCode;

  const allowedEditFields = new Set<string>(linkEditFieldKeys);
  const editableFieldSet = new Set<(typeof linkEditFieldKeys)[number]>(
    settings.links.editableFields
      .map((field) => String(field))
      .filter((field): field is (typeof linkEditFieldKeys)[number] =>
        allowedEditFields.has(field),
      ),
  );
  for (const pair of linkedLinkEditFieldPairs) {
    if (pair.some((field) => editableFieldSet.has(field))) {
      for (const field of pair) editableFieldSet.add(field);
    }
  }
  if (editableFieldSet.has('redirectRules')) {
    const hasCondition = redirectRuleConditionKeys.some((key) =>
      editableFieldSet.has(key),
    );
    if (!hasCondition) {
      for (const key of redirectRuleConditionKeys) editableFieldSet.add(key);
    }
  } else {
    for (const key of redirectRuleConditionKeys) editableFieldSet.delete(key);
  }
  settings.links.editableFields = linkEditFieldKeys.filter((key) =>
    editableFieldSet.has(key),
  );
  settings.links.allowedDomains = normalizeShortLinkDomains(
    settings.links.allowedDomains,
  );
}

function boundedNumber(
  value: number,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeSecuritySettings(settings: SiteSettings) {
  settings.security.webActionGuard.tokenTtlSeconds = boundedNumber(
    settings.security.webActionGuard.tokenTtlSeconds,
    defaultSettings.security.webActionGuard.tokenTtlSeconds,
    60,
    24 * 60 * 60,
  );
  settings.security.webActionGuard.bypassTokenHash =
    settings.security.webActionGuard.bypassTokenHash.trim();
  settings.security.csrf.tokenTtlSeconds = boundedNumber(
    settings.security.csrf.tokenTtlSeconds,
    defaultSettings.security.csrf.tokenTtlSeconds,
    60,
    24 * 60 * 60,
  );
}

function normalizeGeneralSettings(settings: SiteSettings) {
  const domains = normalizeShortLinkDomainSettings({
    defaultDomain: settings.general.defaultDomain,
    domains: settings.general.domains,
    domainSchemes: settings.general.domainSchemes,
  });
  settings.general.defaultDomain = domains.defaultDomain;
  settings.general.domains = domains.domains;
  settings.general.domainSchemes = domains.domainSchemes;
}

function normalizeLocalizedContent(
  locale: SiteLocale,
  content: LocalizedSiteContent,
): LocalizedSiteContent {
  const fallback = defaultLocalizedContentFor(locale);
  const general = { ...fallback.general, ...content.general };
  // Refresh shipped marketing copy; keep operator-authored content intact.
  const previousDefaults =
    locale === 'ko'
      ? {
          headline: '긴 링크를 짧고 기억하기 쉽게.',
          description:
            '빠르게 공유하고, 클릭 흐름을 확인할 수 있는 나만의 단축 링크 서비스입니다.',
        }
      : {
          headline: 'Short links that are easy to remember.',
          description:
            'Create shareable links and understand click activity in one place.',
        };
  for (const key of ['headline', 'description'] as const) {
    if (general[key] === previousDefaults[key])
      general[key] = fallback.general[key];
  }
  if (general.eyebrow === 'Simple links, clear insights') general.eyebrow = '';
  return {
    general,
    seo: {
      ...fallback.seo,
      ...content.seo,
    },
    legal: {
      ...fallback.legal,
      ...content.legal,
    },
  };
}

function normalizeDefaultLocale(value: unknown): SiteLocale {
  const locale = String(value ?? '')
    .trim()
    .toLowerCase();
  return siteLocaleSet.has(locale) ? (locale as SiteLocale) : defaultSiteLocale;
}

function normalizeI18nSettings(settings: SiteSettings) {
  const defaultLocale = normalizeDefaultLocale(settings.i18n.defaultLocale);
  const locales = Object.fromEntries(
    siteLocaleKeys.map((locale) => [
      locale,
      normalizeLocalizedContent(locale, settings.i18n.locales[locale]),
    ]),
  ) as Record<SiteLocale, LocalizedSiteContent>;

  settings.i18n = {
    defaultLocale,
    locales,
  };
  settings.general = {
    ...settings.general,
    ...locales[defaultLocale].general,
    language: defaultLocale,
  };
  settings.seo = {
    ...settings.seo,
    ...locales[defaultLocale].seo,
  };
  settings.legal = {
    ...settings.legal,
    ...locales[defaultLocale].legal,
  };
}

function pluginSettingsKey(pluginId: string) {
  return `${PLUGIN_SETTINGS_PREFIX}${pluginId}`;
}

function pluginIdFromSettingsKey(key: string) {
  return key.startsWith(PLUGIN_SETTINGS_PREFIX)
    ? key.slice(PLUGIN_SETTINGS_PREFIX.length)
    : '';
}

function pluginValuesFromRecords(
  records: Pick<AppSettingModel, 'key' | 'value'>[],
) {
  return Object.fromEntries(
    records
      .map((record) => [pluginIdFromSettingsKey(record.key), record.value])
      .filter(([pluginId]) => pluginId),
  );
}

function pluginSettingsRows(states: SiteSettings['plugins'], now: Date) {
  return Object.entries(states).map(([pluginId, state]) => ({
    key: pluginSettingsKey(pluginId),
    value: clone(state),
    updatedAt: now,
  }));
}

function normalizeSettings(
  siteValue: unknown,
  pluginValues?: unknown,
): SiteSettings {
  const settings = merge(defaultSettings, siteValue);
  normalizeGeneralSettings(settings);
  normalizeI18nSettings(settings);
  normalizeLinkSettings(settings);
  normalizeSecuritySettings(settings);
  settings.theme.darkTokens = darkThemeTokens(settings.theme);
  settings.plugins = normalizePluginStates(pluginValues);
  return settings;
}

// Read site and plugin rows in one statement so callers never observe a partial save.
export async function getSettings(
  options: { mutable?: boolean; transaction?: Transaction } = {},
): Promise<SiteSettings> {
  if (!options.transaction) await ensureDatabase();
  const records = await AppSettingModel.findAll({
    attributes: ['key', 'value'],
    raw: true,
    transaction: options.transaction,
    where: {
      [Op.or]: [
        { key: SITE_SETTINGS_KEY },
        { key: { [Op.like]: `${PLUGIN_SETTINGS_PREFIX}%` } },
      ],
    },
  });
  const settings = normalizeSettings(
    records.find((record) => record.key === SITE_SETTINGS_KEY)?.value,
    pluginValuesFromRecords(records),
  );
  return options.mutable ? settings : deepFreeze(settings);
}

// The mutation runs against locked, current data. Callers must not perform network
// requests here or replace unrelated sections with an earlier settings snapshot.
export async function updateSettings(
  mutate: (settings: SiteSettings) => void | Promise<void>,
  transaction?: Transaction,
): Promise<SiteSettings> {
  if (!transaction) {
    await ensureDatabase();
    return getDatabase().transaction((current) =>
      updateSettings(mutate, current),
    );
  }
  await AppSettingModel.bulkCreate(
    [{ key: SITE_SETTINGS_KEY, value: siteSettingsValue(defaultSettings) }],
    { transaction, ignoreDuplicates: true },
  );
  const site = await AppSettingModel.findByPk(SITE_SETTINGS_KEY, {
    transaction,
    lock: transaction.LOCK.UPDATE,
    rejectOnEmpty: true,
  });
  const pluginRecords = await AppSettingModel.findAll({
    where: { key: { [Op.like]: `${PLUGIN_SETTINGS_PREFIX}%` } },
    transaction,
  });
  const settings = normalizeSettings(
    site.value,
    pluginValuesFromRecords(pluginRecords),
  );
  await mutate(settings);
  const normalized = normalizeSettings(settings, settings.plugins);
  const now = new Date();
  await site.update(
    { value: siteSettingsValue(normalized), updatedAt: now },
    { transaction },
  );
  const pluginRows = pluginSettingsRows(normalized.plugins, now);
  if (pluginRows.length > 0) {
    await AppSettingModel.bulkCreate(pluginRows, {
      transaction,
      updateOnDuplicate: ['value', 'updatedAt'],
    });
  }
  const pluginKeys = new Set(pluginRows.map((row) => row.key));
  const staleKeys = pluginRecords
    .filter((record) => !pluginKeys.has(record.key))
    .map((record) => record.key);
  if (staleKeys.length > 0) {
    await AppSettingModel.destroy({ where: { key: staleKeys }, transaction });
  }
  return clone(normalized);
}

export function parseBoolean(form: FormData, name: string) {
  return form.get(name) === 'on' || form.get(name) === 'true';
}

export function stringValue(form: FormData, name: string, fallback = '') {
  return String(form.get(name) ?? fallback).trim();
}

export function numberValue(
  form: FormData,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(form.get(name));
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function parseThemePreset(value: string): ThemePreset {
  return value in themePresets ? (value as ThemePreset) : 'emerald';
}

export function parseColorMode(value: string): ColorMode {
  return ['light', 'dark', 'system'].includes(value)
    ? (value as ColorMode)
    : 'light';
}

export function parseRedirectStatus(value: string): RedirectStatus {
  const status = Number(value);
  return [301, 302, 307, 308].includes(status)
    ? (status as RedirectStatus)
    : 302;
}

export function parseEmailProvider(value: string): EmailProvider {
  return value === 'http' ? 'http' : 'smtp';
}

export function parseEmailHttpMethod(value: string): EmailHttpMethod {
  return ['POST', 'PUT', 'PATCH'].includes(value)
    ? (value as EmailHttpMethod)
    : 'POST';
}

export function parseEmailHttpAuthMode(value: string): EmailHttpAuthMode {
  return ['none', 'authorization', 'basic', 'headers'].includes(value)
    ? (value as EmailHttpAuthMode)
    : 'authorization';
}

export function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
