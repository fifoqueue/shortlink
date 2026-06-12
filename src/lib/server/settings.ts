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
import { Op } from 'sequelize';
import { AppSettingModel, ensureDatabase } from './database';
import {
  normalizeShortLinkDomains,
  normalizeShortLinkDomainSettings,
} from './url';

const SITE_SETTINGS_KEY = 'site';
const PLUGIN_SETTINGS_PREFIX = 'plugins:';
const SETTINGS_CACHE_TTL_MS = 5_000;
const clone = <T>(value: T): T => structuredClone(value);
let cachedSettings:
  | {
      expiresAt: number;
      value: SiteSettings;
    }
  | undefined;
let pendingSettings: Promise<SiteSettings> | undefined;
let normalizePluginStates: (value: unknown) => Record<string, PluginState> =
  loosePluginStates;
const siteLocaleSet = new Set<string>(siteLocaleKeys);

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
  cachedSettings = undefined;
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
  return {
    general: {
      ...fallback.general,
      ...content.general,
    },
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

function pluginValuesFromRecords(records: AppSettingModel[]) {
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
    updated_at: now,
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
  settings.plugins = normalizePluginStates(pluginValues);
  return settings;
}

async function loadSettings(): Promise<SiteSettings> {
  await ensureDatabase();
  const settings = normalizeSettings(defaultSettings);
  const [siteRecord] = await AppSettingModel.findOrCreate({
    where: { key: SITE_SETTINGS_KEY },
    defaults: {
      key: SITE_SETTINGS_KEY,
      value: siteSettingsValue(settings),
    },
  });

  const pluginRecords = await AppSettingModel.findAll({
    where: { key: { [Op.like]: `${PLUGIN_SETTINGS_PREFIX}%` } },
  });
  const normalized = normalizeSettings(
    siteRecord.value,
    pluginValuesFromRecords(pluginRecords),
  );
  const existingKeys = new Set(pluginRecords.map((record) => record.key));
  const missingRows = pluginSettingsRows(normalized.plugins, new Date()).filter(
    (row) => !existingKeys.has(row.key),
  );
  if (missingRows.length > 0) {
    await AppSettingModel.bulkCreate(missingRows);
  }

  return clone(normalized);
}

export async function getSettings(): Promise<SiteSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return clone(cachedSettings.value);
  }

  if (!pendingSettings) {
    pendingSettings = loadSettings()
      .then((settings) => {
        cachedSettings = {
          expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
          value: clone(settings),
        };
        return settings;
      })
      .finally(() => {
        pendingSettings = undefined;
      });
  }

  return clone(await pendingSettings);
}

export async function updateSettings(settings: SiteSettings) {
  await ensureDatabase();
  const normalized = normalizeSettings(settings, settings.plugins);
  const now = new Date();
  const pluginRows = pluginSettingsRows(normalized.plugins, now);
  const pluginKeys = new Set(pluginRows.map((row) => row.key));
  const stalePluginRecords = await AppSettingModel.findAll({
    where: { key: { [Op.like]: `${PLUGIN_SETTINGS_PREFIX}%` } },
  });

  await Promise.all([
    AppSettingModel.upsert({
      key: SITE_SETTINGS_KEY,
      value: siteSettingsValue(normalized),
      updated_at: now,
    }),
    ...pluginRows.map((row) => AppSettingModel.upsert(row)),
    ...stalePluginRecords
      .filter((record) => !pluginKeys.has(record.key))
      .map((record) => record.destroy()),
  ]);
  cachedSettings = {
    expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    value: clone(normalized),
  };
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
