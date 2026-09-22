import { env } from '$env/dynamic/private';
import { createClient, type RedisClientType } from 'redis';
import { registerServerShutdownTask } from './shutdown';

type RedisClientRole = 'command';
type RedisClient = RedisClientType;

const globalRedis = globalThis as typeof globalThis & {
  __shortlinkRedisClients?: Partial<Record<RedisClientRole, RedisClient>>;
  __shortlinkRedisConnections?: Partial<Record<RedisClientRole, Promise<void>>>;
  __shortlinkRedisShutdownRegistered?: boolean;
};

function redisUrl() {
  return env.REDIS_URL?.trim() || '';
}

export function redisEnabled() {
  return Boolean(redisUrl());
}

export function redisKey(key: string) {
  const prefix = env.REDIS_KEY_PREFIX?.trim() || 'shortlink';
  return `${prefix}:${key}`;
}

function clients() {
  return (globalRedis.__shortlinkRedisClients ??= {});
}

function connections() {
  return (globalRedis.__shortlinkRedisConnections ??= {});
}

function createRedis(role: RedisClientRole) {
  const url = redisUrl();
  if (!url) return null;

  const client = createClient({
    url,
    name: `shortlink-${role}`,
  });
  client.on('error', (error) => {
    console.warn(`Redis ${role} client error.`, error);
  });
  return client;
}

export function getRedis(role: RedisClientRole = 'command') {
  if (!redisEnabled()) return null;
  const registry = clients();
  registry[role] ??= createRedis(role) ?? undefined;
  return registry[role] ?? null;
}

async function connectedRedis(
  role: RedisClientRole = 'command',
  options: { throwOnError?: boolean } = {},
) {
  const client = getRedis(role);
  if (!client) return null;
  if (client.isOpen) return client;

  try {
    const registry = connections();
    registry[role] ??= client
      .connect()
      .then(() => undefined)
      .catch((error: unknown) => {
        delete registry[role];
        throw error;
      });
    await registry[role];
    return client;
  } catch (error) {
    if (options.throwOnError) throw error;
    console.warn(`Could not connect Redis ${role} client.`, error);
    return null;
  }
}

export async function redisSendCommand(
  args: string[],
  options: { throwOnError?: boolean } = {},
) {
  const client = await connectedRedis('command', options);
  if (!client) return null;
  try {
    return await client.sendCommand(args);
  } catch (error) {
    if (options.throwOnError) throw error;
    console.warn(`Could not run Redis command "${args[0] ?? ''}".`, error);
    return null;
  }
}

async function closeRedis(client: RedisClient | undefined) {
  if (!client) return;
  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch {
    try {
      if (client.isOpen) {
        await client.disconnect();
      }
    } catch {
      // Ignore shutdown errors.
    }
  }
}

if (!globalRedis.__shortlinkRedisShutdownRegistered) {
  globalRedis.__shortlinkRedisShutdownRegistered = true;
  registerServerShutdownTask(async () => {
    const registry = clients();
    await Promise.all(
      Object.values(registry).map(async (client) => closeRedis(client)),
    );
    globalRedis.__shortlinkRedisClients = {};
    globalRedis.__shortlinkRedisConnections = {};
  });
}
