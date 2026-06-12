import {
  defaultLocalizedContentFor,
  defaultSiteLocale,
  siteLocaleKeys,
  type SiteLocale,
} from '$lib/config';
import { QueryTypes, type Sequelize } from 'sequelize';
import { tableExists } from './helpers';
import type { DatabaseMigration } from './types';

const localizedGeneralKeys = [
  'siteName',
  'eyebrow',
  'headline',
  'description',
  'footerText',
  'language',
] as const;

const localizedSeoKeys = ['title', 'description'] as const;
const localizedLegalKeys = [
  'termsTitle',
  'termsContent',
  'privacyTitle',
  'privacyContent',
] as const;
const siteLocaleSet = new Set<string>(siteLocaleKeys);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const next = { ...value };
  for (const key of keys) delete next[key];
  return next;
}

function localeFromValue(value: unknown) {
  const locale = String(value ?? '')
    .trim()
    .toLowerCase();
  return siteLocaleSet.has(locale) ? (locale as SiteLocale) : defaultSiteLocale;
}

function stringFields(
  value: unknown,
  keys: readonly string[],
): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    keys
      .map((key) => [key, value[key]])
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
  );
}

function rootLocalizedContent(locale: SiteLocale, value: unknown) {
  const fallback = defaultLocalizedContentFor(locale);
  const record = isRecord(value) ? value : {};
  return {
    general: {
      ...fallback.general,
      ...stringFields(record.general, localizedGeneralKeys),
    },
    seo: {
      ...fallback.seo,
      ...stringFields(record.seo, localizedSeoKeys),
    },
    legal: {
      ...fallback.legal,
      ...stringFields(record.legal, localizedLegalKeys),
    },
  };
}

function mergeLocalizedContent(
  base: ReturnType<typeof rootLocalizedContent>,
  value: unknown,
) {
  const content = isRecord(value) ? value : {};
  return {
    general: {
      ...base.general,
      ...(isRecord(content.general) ? content.general : {}),
    },
    seo: {
      ...base.seo,
      ...(isRecord(content.seo) ? content.seo : {}),
    },
    legal: {
      ...base.legal,
      ...(isRecord(content.legal) ? content.legal : {}),
    },
  };
}

function withI18nSource(value: Record<string, unknown>) {
  const i18n = isRecord(value.i18n) ? { ...value.i18n } : {};
  const defaultLocale = localeFromValue(i18n.defaultLocale);
  const locales = isRecord(i18n.locales) ? { ...i18n.locales } : {};
  locales[defaultLocale] = mergeLocalizedContent(
    rootLocalizedContent(defaultLocale, value),
    locales[defaultLocale],
  );

  return {
    ...value,
    i18n: {
      ...i18n,
      defaultLocale,
      locales,
    },
  };
}

function stripPersistedLocalizedFields(value: Record<string, unknown>) {
  const next = { ...value };

  if (isRecord(next.general)) {
    next.general = withoutKeys(next.general, localizedGeneralKeys);
  }
  if (isRecord(next.seo)) {
    next.seo = withoutKeys(next.seo, localizedSeoKeys);
  }
  delete next.legal;

  return next;
}

async function needsSiteSettingsI18nStorageMigration(sequelize: Sequelize) {
  if (!(await tableExists(sequelize, 'app_settings'))) return false;

  const rows = await sequelize.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM app_settings
        WHERE key = 'site'
          AND (
            value #> '{general,siteName}' IS NOT NULL
            OR value #> '{general,eyebrow}' IS NOT NULL
            OR value #> '{general,headline}' IS NOT NULL
            OR value #> '{general,description}' IS NOT NULL
            OR value #> '{general,footerText}' IS NOT NULL
            OR value #> '{general,language}' IS NOT NULL
            OR value #> '{seo,title}' IS NOT NULL
            OR value #> '{seo,description}' IS NOT NULL
            OR value ? 'legal'
          )
      ) AS "exists"
    `,
    { type: QueryTypes.SELECT },
  );
  return rows[0]?.exists === true;
}

const migration: DatabaseMigration = {
  id: '008-site-settings-i18n-storage',

  shouldRun: needsSiteSettingsI18nStorageMigration,

  async up(sequelize) {
    if (!(await tableExists(sequelize, 'app_settings'))) return;

    const rows = await sequelize.query<{ value: unknown }>(
      `
        SELECT value
        FROM app_settings
        WHERE key = 'site'
        LIMIT 1
      `,
      { type: QueryTypes.SELECT },
    );
    const value = rows[0]?.value;
    if (!isRecord(value)) return;

    const normalized = withI18nSource(value);
    await sequelize.query(
      `
        UPDATE app_settings
        SET value = CAST($value AS jsonb),
            updated_at = NOW()
        WHERE key = 'site'
      `,
      {
        bind: {
          value: JSON.stringify(stripPersistedLocalizedFields(normalized)),
        },
      },
    );
  },
};

export default migration;
