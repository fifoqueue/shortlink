import { env } from '$env/dynamic/private';
import { createClient, type RedisClientType } from 'redis';
import { registerServerShutdownTask } from './shutdown';

type RedisClientRole = 'command' | 'publisher' | 'subscriber';
type RedisClient = RedisClientType;

const globalRedis = globalThis as typeof globalThis & {
  __shortlinkRedisClients?: Partial<Record<RedisClientRole, RedisClient>>;
  __shortlinkRedisConnections?: Partial<Record<RedisClientRole, Promise<void>>>;
  __shortlinkRedisSubscriptions?: Map<string, Set<(message: string) => void>>;
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

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const client = await connectedRedis();
  if (!client) return null;
  try {
    const value = await client.get(redisKey(key));
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.warn(`Could not read Redis cache key "${key}".`, error);
    return null;
  }
}

export async function redisSetJson(
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  if (ttlMs <= 0) return;
  const client = await connectedRedis();
  if (!client) return;
  try {
    await client.set(redisKey(key), JSON.stringify(value), { PX: ttlMs });
  } catch (error) {
    console.warn(`Could not write Redis cache key "${key}".`, error);
  }
}

export async function redisDelete(key: string): Promise<void> {
  const client = await connectedRedis();
  if (!client) return;
  try {
    await client.del(redisKey(key));
  } catch (error) {
    console.warn(`Could not delete Redis cache key "${key}".`, error);
  }
}

export async function redisPublish(
  channel: string,
  message: unknown,
): Promise<void> {
  const client = await connectedRedis('publisher');
  if (!client) return;
  try {
    await client.publish(redisKey(channel), JSON.stringify(message));
  } catch (error) {
    console.warn(`Could not publish Redis message "${channel}".`, error);
  }
}

export function redisSubscribe(
  channel: string,
  handler: (message: string) => void,
) {
  if (!redisEnabled()) return;

  const subscriptions = (globalRedis.__shortlinkRedisSubscriptions ??= new Map<
    string,
    Set<(message: string) => void>
  >());
  const key = redisKey(channel);
  const handlers = subscriptions.get(key) ?? new Set();
  const firstSubscriber = handlers.size === 0;
  handlers.add(handler);
  subscriptions.set(key, handlers);

  if (!firstSubscriber) return;

  void connectedRedis('subscriber')
    .then((client) =>
      client?.subscribe(key, (message) => {
        const registeredHandlers = subscriptions.get(key);
        if (!registeredHandlers) return;
        for (const registeredHandler of registeredHandlers) {
          try {
            registeredHandler(message);
          } catch (error) {
            console.error('Redis subscription handler failed.', error);
          }
        }
      }),
    )
    .catch((error: unknown) => {
      console.warn(`Could not subscribe to Redis channel "${channel}".`, error);
    });
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
