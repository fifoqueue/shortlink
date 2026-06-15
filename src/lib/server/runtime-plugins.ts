import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseMigration } from '$lib/server/migrations/types';
import { outboundFetch } from '$lib/server/outbound-http';
import {
  runtimePluginAbi,
  type RuntimePluginFactoryResult,
  type RuntimePluginManifest,
  type RuntimePluginMigration,
  type RuntimePluginModule,
  type RuntimePluginSdkV1,
} from '$lib/runtime-plugin-abi';
import type {
  PluginConfig,
  PluginDefinition,
  PluginLocalizedText,
  PluginSlot,
  RuntimePluginAdminField,
  RuntimePluginAdminSchema,
  RuntimePluginTrust,
  RuntimePluginUiDescriptor,
} from '$lib/plugin-contracts';

type RuntimePluginLoadError = {
  pluginId: string;
  message: string;
  path: string;
};

type RuntimePluginRecord = {
  definition: PluginDefinition;
  dispose?: () => void | Promise<void>;
};

const DEFAULT_RUNTIME_PLUGIN_DIR = 'user-plugins';
const WATCH_SCAN_INTERVAL_MS = 2_000;
const pluginIdPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;
const clone = <T>(value: T): T => structuredClone(value);

let runtimePluginRecords: RuntimePluginRecord[] = [];
let runtimeMigrations: DatabaseMigration[] = [];
let runtimeErrors: RuntimePluginLoadError[] = [];
let loadedSignature = '';
let lastScanAt = 0;
let pendingRefresh: Promise<boolean> | null = null;

function runtimePluginDir() {
  return path.resolve(env.USER_PLUGIN_DIR || DEFAULT_RUNTIME_PLUGIN_DIR);
}

function watchEnabled() {
  return env.USER_PLUGIN_WATCH === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalString(value: unknown) {
  const text = stringValue(value).trim();
  return text ? text : undefined;
}

function parseTrust(value: unknown): RuntimePluginTrust {
  return value === 'untrusted' ? 'untrusted' : 'trusted';
}

function parseTranslations(
  value: unknown,
): RuntimePluginManifest['translations'] {
  return isRecord(value)
    ? (clone(value) as Partial<Record<string, PluginLocalizedText>>)
    : undefined;
}

function parseSelectOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    const optionValue = stringValue(option.value);
    const label = stringValue(option.label);
    return optionValue && label ? [{ value: optionValue, label }] : [];
  });
}

function parseSchemaField(value: unknown): RuntimePluginAdminField | null {
  if (!isRecord(value)) return null;
  const type = stringValue(value.type);
  const name = stringValue(value.name).trim();
  const label = stringValue(value.label).trim();
  if (!name || !label) return null;

  const base = {
    name,
    label,
    help: optionalString(value.help),
    required: optionalBoolean(value.required),
  };
  if (type === 'text' || type === 'password' || type === 'url') {
    return {
      ...base,
      type,
      value: stringValue(value.value),
      placeholder: optionalString(value.placeholder),
      maxlength: optionalNumber(value.maxlength),
    };
  }
  if (type === 'textarea') {
    return {
      ...base,
      type,
      value: stringValue(value.value),
      placeholder: optionalString(value.placeholder),
      rows: optionalNumber(value.rows),
      maxlength: optionalNumber(value.maxlength),
    };
  }
  if (type === 'number') {
    return {
      ...base,
      type,
      value: optionalNumber(value.value),
      min: optionalNumber(value.min),
      max: optionalNumber(value.max),
      step: optionalNumber(value.step),
    };
  }
  if (type === 'checkbox') {
    return {
      ...base,
      type,
      checked: value.checked === true,
    };
  }
  if (type === 'select') {
    const options = parseSelectOptions(value.options);
    if (options.length === 0) return null;
    return {
      ...base,
      type,
      value: stringValue(value.value),
      options,
    };
  }
  return null;
}

function parseSchema(value: unknown): RuntimePluginAdminSchema | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) return undefined;
  const fields = value.fields
    .map(parseSchemaField)
    .filter((field): field is RuntimePluginAdminField => Boolean(field));
  return fields.length > 0 ? { fields } : undefined;
}

function insideDirectory(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function resolveInside(root: string, relativePath: string) {
  const target = path.resolve(root, relativePath);
  if (!insideDirectory(root, target)) {
    throw new Error(`Path "${relativePath}" escapes the plugin directory.`);
  }
  return target;
}

async function pathExists(target: string) {
  try {
    await fs.access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function directChildDirectories(root: string) {
  if (!(await pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function parseManifest(
  value: unknown,
  directory: string,
): RuntimePluginManifest {
  if (!isRecord(value))
    throw new Error('manifest.json must contain an object.');
  const id = stringValue(value.id).trim();
  const folder = path.basename(directory);
  if (!pluginIdPattern.test(id)) {
    throw new Error(
      'Runtime plugin id must use lowercase letters, numbers, and hyphens.',
    );
  }
  if (id !== folder) {
    throw new Error(`Runtime plugin id "${id}" must match folder "${folder}".`);
  }
  if (value.abi !== runtimePluginAbi) {
    throw new Error(`Unsupported runtime plugin ABI "${String(value.abi)}".`);
  }
  const trust = parseTrust(value.trust);
  if (trust === 'untrusted' && optionalString(value.entry)) {
    throw new Error('Untrusted runtime plugins cannot declare server entry.');
  }

  return {
    abi: runtimePluginAbi,
    id,
    name: stringValue(value.name) || id,
    description: stringValue(value.description),
    version: stringValue(value.version) || '0.0.0',
    category: stringValue(value.category) || 'runtime',
    order: optionalNumber(value.order),
    required: value.required === true,
    trust,
    entry:
      trust === 'trusted'
        ? stringValue(value.entry) || './server.mjs'
        : undefined,
    assets: stringValue(value.assets) || './public',
    defaultConfig: defaultConfig(value.defaultConfig),
    translations: parseTranslations(value.translations),
    admin: parseUiDescriptor(value.admin),
    account: parseUiDescriptor(value.account),
    userAdmin: parseUiDescriptor(value.userAdmin),
    slots: parseSlotDescriptors(value.slots),
  };
}

function parseUiDescriptor(
  value: unknown,
): RuntimePluginUiDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const mode =
    value.mode === 'iframe'
      ? 'iframe'
      : value.mode === 'schema'
        ? 'schema'
        : null;
  if (!mode) return undefined;
  return {
    mode,
    src: mode === 'iframe' ? stringValue(value.src || value.entry) : undefined,
    schema: mode === 'schema' ? parseSchema(value.schema) : undefined,
  };
}

function parseSlotDescriptors(
  value: unknown,
): Record<string, RuntimePluginUiDescriptor> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .map(([slot, descriptor]) => [slot, parseUiDescriptor(descriptor)])
      .filter(
        (entry): entry is [string, RuntimePluginUiDescriptor] =>
          typeof entry[0] === 'string' && entry[1] !== undefined,
      ),
  );
}

async function readJsonFile(target: string) {
  return JSON.parse(await fs.readFile(target, 'utf8')) as unknown;
}

function hashText(hash: ReturnType<typeof createHash>, text: string) {
  hash.update(text);
  hash.update('\0');
}

async function appendFileHash(
  hash: ReturnType<typeof createHash>,
  target: string,
) {
  if (!(await pathExists(target))) return;
  hashText(hash, target);
  hash.update(await fs.readFile(target));
  hash.update('\0');
}

async function runtimeSignature(root: string) {
  const hash = createHash('sha256');
  hashText(hash, root);
  for (const directory of await directChildDirectories(root)) {
    const manifestPath = path.join(directory, 'manifest.json');
    await appendFileHash(hash, manifestPath);
    try {
      const manifest = parseManifest(
        await readJsonFile(manifestPath),
        directory,
      );
      if (manifest.trust !== 'untrusted') {
        await appendFileHash(
          hash,
          resolveInside(directory, manifest.entry ?? './server.mjs'),
        );
        const migrationDirectory = path.join(directory, 'migrations');
        if (await pathExists(migrationDirectory)) {
          const migrations = (await fs.readdir(migrationDirectory))
            .filter((file) => file.endsWith('.mjs'))
            .sort((left, right) => left.localeCompare(right));
          for (const migration of migrations) {
            await appendFileHash(
              hash,
              path.join(migrationDirectory, migration),
            );
          }
        }
      }
    } catch (cause) {
      hashText(hash, cause instanceof Error ? cause.message : String(cause));
    }
  }
  return hash.digest('hex');
}

function formSdk(): RuntimePluginSdkV1['form'] {
  return {
    string(form, name, fallback = '') {
      return String(form.get(name) ?? fallback).trim();
    },
    boolean(form, name) {
      const value = form.get(name);
      return value === 'on' || value === 'true' || value === '1';
    },
    stringArray(form, name) {
      return form
        .getAll(name)
        .map((value) => String(value).trim())
        .filter(Boolean);
    },
  };
}

function sdk(pluginId: string): RuntimePluginSdkV1 {
  return {
    abi: runtimePluginAbi,
    form: formSdk(),
    text: {
      interpolate(template, values) {
        return Object.entries(values).reduce(
          (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
          template,
        );
      },
    },
    http: {
      outboundFetch(resource, init) {
        return outboundFetch(
          resource,
          init as Parameters<typeof outboundFetch>[1],
        );
      },
    },
    log: {
      debug(message, meta) {
        console.debug(`[runtime-plugin:${pluginId}] ${message}`, meta ?? '');
      },
      info(message, meta) {
        console.info(`[runtime-plugin:${pluginId}] ${message}`, meta ?? '');
      },
      warn(message, meta) {
        console.warn(`[runtime-plugin:${pluginId}] ${message}`, meta ?? '');
      },
      error(message, meta) {
        console.error(`[runtime-plugin:${pluginId}] ${message}`, meta ?? '');
      },
    },
  };
}

function defaultConfig(value: unknown): PluginConfig {
  return isRecord(value) ? clone(value) : {};
}

function defaultParseConfig(defaults: PluginConfig) {
  return (form: FormData, current: PluginConfig): PluginConfig => {
    const next: PluginConfig = {
      ...clone(defaults),
      ...clone(current),
    };
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'boolean') {
        next[key] = formSdk().boolean(form, key);
      } else if (typeof value === 'number') {
        const parsed = Number(form.get(key));
        next[key] = Number.isFinite(parsed) ? parsed : value;
      } else if (Array.isArray(value)) {
        next[key] = formSdk().stringArray(form, key);
      } else if (form.has(key)) {
        next[key] = formSdk().string(form, key);
      }
    }
    return next;
  };
}

function assetSrc(input: {
  pluginId: string;
  pluginDirectory: string;
  assetDirectory: string;
  source: string | undefined;
}) {
  if (!input.source) return undefined;
  const absolute = resolveInside(input.pluginDirectory, input.source);
  if (!insideDirectory(input.assetDirectory, absolute)) {
    throw new Error(
      `Asset "${input.source}" is outside the plugin asset directory.`,
    );
  }
  const relative = path
    .relative(input.assetDirectory, absolute)
    .replaceAll(path.sep, '/');
  return `/runtime-plugins/${input.pluginId}/assets/${relative}`;
}

function runtimeUi(input: {
  manifest: RuntimePluginManifest;
  pluginDirectory: string;
  assetDirectory: string;
}) {
  const resolveDescriptor = (
    descriptor: RuntimePluginUiDescriptor | undefined,
  ) =>
    descriptor
      ? {
          ...descriptor,
          schema: descriptor.schema ? clone(descriptor.schema) : undefined,
          src:
            descriptor.mode === 'iframe'
              ? assetSrc({
                  pluginId: input.manifest.id,
                  pluginDirectory: input.pluginDirectory,
                  assetDirectory: input.assetDirectory,
                  source: descriptor.src,
                })
              : undefined,
        }
      : undefined;
  const admin = resolveDescriptor(input.manifest.admin);
  const account = resolveDescriptor(input.manifest.account);
  const userAdmin = resolveDescriptor(input.manifest.userAdmin);
  const slots = Object.fromEntries(
    Object.entries(input.manifest.slots ?? {}).map(([slot, descriptor]) => [
      slot,
      resolveDescriptor(descriptor),
    ]),
  ) as Partial<Record<PluginSlot, RuntimePluginUiDescriptor>>;

  return { admin, account, userAdmin, slots };
}

function staticSchema(schema: RuntimePluginAdminSchema | undefined) {
  return schema ? () => clone(schema) : undefined;
}

function staticSlotSchema(
  slots: Partial<Record<PluginSlot, RuntimePluginUiDescriptor>>,
) {
  return ({ slot }: { slot: PluginSlot }) => {
    const schema = slots[slot]?.schema;
    return schema ? clone(schema) : { fields: [] };
  };
}

function pluginDefinition(input: {
  manifest: RuntimePluginManifest;
  directory: string;
  factoryResult: RuntimePluginFactoryResult;
}): PluginDefinition {
  const defaults = defaultConfig(input.factoryResult.defaultConfig);
  const assetsDirectory = resolveInside(
    input.directory,
    input.manifest.assets ?? './public',
  );
  const ui = runtimeUi({
    manifest: input.manifest,
    pluginDirectory: input.directory,
    assetDirectory: assetsDirectory,
  });
  return {
    ...input.factoryResult,
    meta: {
      id: input.manifest.id,
      name: input.factoryResult.meta?.name ?? input.manifest.name,
      description:
        input.factoryResult.meta?.description ?? input.manifest.description,
      version: input.factoryResult.meta?.version ?? input.manifest.version,
      category: input.factoryResult.meta?.category ?? input.manifest.category,
      order: input.factoryResult.meta?.order ?? input.manifest.order,
      required: input.factoryResult.meta?.required ?? input.manifest.required,
      adminAccessPermissions:
        input.factoryResult.meta?.adminAccessPermissions ?? [],
    },
    translations:
      input.factoryResult.translations ?? input.manifest.translations,
    runtime: {
      abi: runtimePluginAbi,
      directory: input.directory,
      trust: input.manifest.trust ?? 'trusted',
      admin: ui.admin,
      account: ui.account,
      userAdmin: ui.userAdmin,
      slots: ui.slots,
    },
    defaultConfig: defaults,
    parseConfig:
      input.factoryResult.parseConfig ?? defaultParseConfig(defaults),
    adminSchema:
      input.factoryResult.adminSchema ?? staticSchema(ui.admin?.schema),
    accountSchema:
      input.factoryResult.accountSchema ?? staticSchema(ui.account?.schema),
    userAdminSchema:
      input.factoryResult.userAdminSchema ?? staticSchema(ui.userAdmin?.schema),
    slotSchema:
      input.factoryResult.slotSchema ??
      (Object.values(ui.slots).some((descriptor) => descriptor?.schema)
        ? staticSlotSchema(ui.slots)
        : undefined),
  };
}

function databaseMigration(
  migration: RuntimePluginMigration,
): DatabaseMigration {
  return {
    id: migration.id,
    async shouldRun(sequelize) {
      return migration.shouldRun({ sequelize });
    },
    async up(sequelize) {
      await migration.up({ sequelize });
    },
  };
}

async function runtimeMigrationFiles(directory: string) {
  const migrationDirectory = path.join(directory, 'migrations');
  if (!(await pathExists(migrationDirectory))) return [];
  return (await fs.readdir(migrationDirectory))
    .filter((file) => file.endsWith('.mjs'))
    .sort((left, right) => left.localeCompare(right));
}

function manifestFactoryResult(
  manifest: RuntimePluginManifest,
): RuntimePluginFactoryResult {
  return {
    meta: {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      category: manifest.category,
      order: manifest.order,
      required: manifest.required,
    },
    translations: manifest.translations,
    defaultConfig: manifest.defaultConfig ?? {},
  };
}

async function loadRuntimeMigrations(directory: string) {
  const migrationDirectory = path.join(directory, 'migrations');
  const files = await runtimeMigrationFiles(directory);
  const migrations: DatabaseMigration[] = [];
  for (const file of files) {
    const target = path.join(migrationDirectory, file);
    const signature = createHash('sha256')
      .update(await fs.readFile(target))
      .digest('hex');
    const module = (await import(
      `${pathToFileURL(target).href}?v=${signature}`
    )) as {
      default?: RuntimePluginMigration;
    };
    if (!module.default?.id) {
      throw new Error(`Runtime migration "${file}" must export an id.`);
    }
    migrations.push(databaseMigration(module.default));
  }
  return migrations;
}

async function loadRuntimePlugin(
  directory: string,
  reservedIds: Set<string>,
): Promise<{
  record: RuntimePluginRecord;
  migrations: DatabaseMigration[];
}> {
  const manifest = parseManifest(
    await readJsonFile(path.join(directory, 'manifest.json')),
    directory,
  );
  if (reservedIds.has(manifest.id)) {
    throw new Error(`Duplicate plugin id "${manifest.id}".`);
  }
  reservedIds.add(manifest.id);
  if (manifest.trust === 'untrusted') {
    const migrations = await runtimeMigrationFiles(directory);
    if (migrations.length > 0) {
      throw new Error('Untrusted runtime plugins cannot define migrations.');
    }
    return {
      record: {
        definition: pluginDefinition({
          manifest,
          directory,
          factoryResult: manifestFactoryResult(manifest),
        }),
      },
      migrations: [],
    };
  }
  const entry = resolveInside(directory, manifest.entry ?? './server.mjs');
  const signature = createHash('sha256')
    .update(await fs.readFile(entry))
    .digest('hex');
  const module = (await import(
    `${pathToFileURL(entry).href}?v=${signature}`
  )) as RuntimePluginModule;
  if (typeof module.default !== 'function') {
    throw new Error(
      'Runtime plugin entry must default export a factory function.',
    );
  }
  const factoryResult = module.default(sdk(manifest.id));
  const record = {
    definition: pluginDefinition({
      manifest,
      directory,
      factoryResult,
    }),
    dispose: factoryResult.dispose,
  };
  return {
    record,
    migrations: await loadRuntimeMigrations(directory),
  };
}

async function disposeRuntimePlugins() {
  await Promise.all(
    runtimePluginRecords.map(async (record) => {
      await record.dispose?.();
    }),
  );
}

async function loadRuntimePlugins(reservedPluginIds: Iterable<string>) {
  const root = runtimePluginDir();
  const reservedIds = new Set(reservedPluginIds);
  const records: RuntimePluginRecord[] = [];
  const migrations: DatabaseMigration[] = [];
  const errors: RuntimePluginLoadError[] = [];

  for (const directory of await directChildDirectories(root)) {
    try {
      const result = await loadRuntimePlugin(directory, reservedIds);
      records.push(result.record);
      migrations.push(...result.migrations);
    } catch (cause) {
      errors.push({
        pluginId: path.basename(directory),
        path: directory,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return {
    records,
    migrations,
    errors,
  };
}

export async function refreshRuntimePlugins(
  input: {
    force?: boolean;
    reservedPluginIds?: Iterable<string>;
  } = {},
) {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    const now = Date.now();
    if (!input.force && !watchEnabled() && loadedSignature) {
      return false;
    }
    if (
      !input.force &&
      watchEnabled() &&
      now - lastScanAt < WATCH_SCAN_INTERVAL_MS
    ) {
      return false;
    }
    lastScanAt = now;

    const signature = await runtimeSignature(runtimePluginDir());
    if (!input.force && signature === loadedSignature) return false;
    const loaded = await loadRuntimePlugins(input.reservedPluginIds ?? []);
    for (const loadError of loaded.errors) {
      console.warn(
        `[runtime-plugin:${loadError.pluginId}] ${loadError.message}`,
      );
    }
    await disposeRuntimePlugins();
    runtimePluginRecords = loaded.records;
    runtimeMigrations = loaded.migrations;
    runtimeErrors = loaded.errors;
    loadedSignature = signature;
    return true;
  })().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

export function getRuntimePluginDefinitions() {
  return runtimePluginRecords.map((record) => record.definition);
}

export function getRuntimePluginMigrations() {
  return runtimeMigrations;
}

export function getRuntimePluginLoadErrors() {
  return [...runtimeErrors];
}

export async function resolveRuntimePluginAsset(
  pluginId: string,
  assetPath: string,
) {
  const definition = runtimePluginRecords.find(
    (record) => record.definition.meta.id === pluginId,
  )?.definition;
  const directory = definition?.runtime?.directory;
  if (!directory) return null;
  const manifest = parseManifest(
    await readJsonFile(path.join(directory, 'manifest.json')),
    directory,
  );
  const assetDirectory = resolveInside(
    directory,
    manifest.assets ?? './public',
  );
  const target = resolveInside(assetDirectory, assetPath);
  if (!insideDirectory(assetDirectory, target)) return null;
  return target;
}
