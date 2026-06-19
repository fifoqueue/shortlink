import { env } from '$env/dynamic/private';
import process from 'node:process';
import { Sequelize } from 'sequelize';
import { initModels } from './models';
import type { DatabaseMigration } from './migrations/types';
import { runServerShutdownTasks } from './shutdown';
import { refreshRuntimePlugins } from '../../plugins/server';
import { getRuntimePluginMigrations } from './runtime-plugins';

export {
  AppSettingModel,
  ApiTokenModel,
  AuthRequestLimitModel,
  ClickEventModel,
  ClickEventQueueModel,
  LinkAccessGrantModel,
  LinkAccessShareModel,
  PermissionGroupCidrModel,
  PermissionGroupModel,
  PermissionGroupUserModel,
  ShortLinkModel,
  UserPasskeyCredentialModel,
  UserIdentityModel,
  UserModel,
  UserTotpSecretModel,
} from './models';

const globalDatabase = globalThis as typeof globalThis & {
  __shortlinkSequelize?: Sequelize;
  __shortlinkDatabaseReady?: Promise<void>;
  __shortlinkDatabaseShutdownHookRegistered?: boolean;
};

const coreMigrationModules = import.meta.glob<{ default: DatabaseMigration }>(
  './migrations/*.migration.ts',
  { eager: true },
);
const pluginMigrationModules = import.meta.glob<{
  default: DatabaseMigration;
}>(
  [
    '../../plugins/*/migrations/*.migration.ts',
    '../../user-plugins/*/migrations/*.migration.ts',
  ],
  { eager: true },
);

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function createSequelize() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not configured.');
  }
  const poolMax = numberEnv(
    'DATABASE_POOL_MAX',
    env.DATABASE_PGBOUNCER === 'true' ? 2 : 10,
    1,
    1_000,
  );
  const poolMin = numberEnv('DATABASE_POOL_MIN', 0, 0, poolMax);
  const dialectOptions: Record<string, unknown> = {};
  if (env.DATABASE_SSL === 'true') {
    dialectOptions.ssl = { require: true, rejectUnauthorized: false };
  }
  if (env.DATABASE_APPLICATION_NAME) {
    dialectOptions.application_name = env.DATABASE_APPLICATION_NAME;
  }
  const statementTimeout = numberEnv(
    'DATABASE_STATEMENT_TIMEOUT_MS',
    0,
    0,
    3_600_000,
  );
  if (statementTimeout > 0) dialectOptions.statement_timeout = statementTimeout;
  const idleTransactionTimeout = numberEnv(
    'DATABASE_IDLE_TRANSACTION_TIMEOUT_MS',
    0,
    0,
    3_600_000,
  );
  if (idleTransactionTimeout > 0) {
    dialectOptions.idle_in_transaction_session_timeout = idleTransactionTimeout;
  }

  return new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres',
    logging: env.DATABASE_LOGGING === 'true' ? console.log : false,
    dialectOptions,
    pool: {
      max: poolMax,
      min: poolMin,
      acquire: numberEnv('DATABASE_POOL_ACQUIRE_MS', 30_000, 1_000, 300_000),
      idle: numberEnv('DATABASE_POOL_IDLE_MS', 10_000, 1_000, 300_000),
    },
  });
}

export function getDatabase() {
  if (!globalDatabase.__shortlinkSequelize) {
    globalDatabase.__shortlinkSequelize = createSequelize();
  }
  return globalDatabase.__shortlinkSequelize;
}

export async function closeDatabase() {
  const sequelize = globalDatabase.__shortlinkSequelize;
  const ready = globalDatabase.__shortlinkDatabaseReady;

  globalDatabase.__shortlinkSequelize = undefined;
  globalDatabase.__shortlinkDatabaseReady = undefined;

  if (!sequelize) return;

  if (ready) {
    try {
      await ready;
    } catch {
      // The pool still needs to be closed after a failed startup/sync attempt.
    }
  }

  await sequelize.close();
}

function registerShutdownHook() {
  if (globalDatabase.__shortlinkDatabaseShutdownHookRegistered) return;
  globalDatabase.__shortlinkDatabaseShutdownHookRegistered = true;

  process.once('sveltekit:shutdown', (reason) => {
    void (async () => {
      await runServerShutdownTasks(String(reason ?? 'shutdown'));
      await closeDatabase();
    })().catch((error: unknown) => {
      console.error('An error occurred during server shutdown.', error);
    });
  });
}

registerShutdownHook();

function databaseMigrations() {
  return [
    ...Object.values(coreMigrationModules).map((module) => module.default),
    ...Object.values(pluginMigrationModules).map((module) => module.default),
    ...getRuntimePluginMigrations(),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

async function runDatabaseMigrations(sequelize: Sequelize) {
  for (const migration of databaseMigrations()) {
    if (await migration.shouldRun(sequelize)) {
      await migration.up(sequelize);
    }
  }
}

function syncAlterEnabled() {
  return env.DATABASE_SYNC_ALTER === 'true';
}

async function syncDatabase(sequelize: Sequelize) {
  await sequelize.authenticate();
  await runDatabaseMigrations(sequelize);
  await sequelize.sync({ alter: syncAlterEnabled() });
  await runDatabaseMigrations(sequelize);
}

export async function ensureDatabase() {
  await refreshRuntimePlugins();
  const sequelize = getDatabase();
  initModels(sequelize);

  if (!globalDatabase.__shortlinkDatabaseReady) {
    globalDatabase.__shortlinkDatabaseReady = syncDatabase(sequelize).catch(
      (error: unknown) => {
        globalDatabase.__shortlinkDatabaseReady = undefined;
        throw error;
      },
    );
  }

  return globalDatabase.__shortlinkDatabaseReady;
}
