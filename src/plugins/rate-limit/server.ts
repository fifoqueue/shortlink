import { createHash } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { ensureDatabase, getDatabase } from '$lib/server/database';
import { authenticateApiToken } from '$lib/server/api-tokens';
import type { PluginDefinition } from '$lib/plugin-contracts';
import type { SiteLocale } from '$lib/config';
import {
  normalizeRateLimitConfig,
  type RateLimitRule,
  type RateLimitScopePart,
} from './config';

function localizedResponseMessage(
  config: ReturnType<typeof normalizeRateLimitConfig>,
  locale: SiteLocale,
) {
  return config.responseMessages[locale] || config.responseMessage;
}

type Bucket = {
  count: number;
  resetAt: number;
};

type Match = {
  rule: RateLimitRule;
  key: string;
};

const patternRegexCache = new Map<string, RegExp>();
const rawRegexCache = new Map<string, RegExp>();
let lastCleanupAt = 0;

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() || '';
}

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function globToRegex(pattern: string) {
  const cached = patternRegexCache.get(pattern);
  if (cached) return cached;

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replaceAll('*', '.*')}$`);
  patternRegexCache.set(pattern, regex);
  return regex;
}

function rawRegex(pattern: string) {
  const cached = rawRegexCache.get(pattern);
  if (cached) return cached;

  const regex = new RegExp(pattern);
  rawRegexCache.set(pattern, regex);
  return regex;
}

function matchesPattern(value: string, pattern: string) {
  if (!pattern) return true;
  return globToRegex(pattern).test(value);
}

function matchesPath(rule: RateLimitRule, path: string) {
  if (!rule.path) return true;
  if (rule.pathMode === 'exact') return path === rule.path;
  if (rule.pathMode === 'prefix') {
    const prefix = rule.path.endsWith('/') ? rule.path : `${rule.path}/`;
    return path === rule.path || path.startsWith(prefix);
  }
  if (rule.pathMode === 'glob') return matchesPattern(path, rule.path);
  return rawRegex(rule.path).test(path);
}

function matchesRecord(
  values: Record<string, string>,
  getter: (key: string) => string,
) {
  return Object.entries(values).every(([key, expected]) =>
    matchesPattern(getter(key), expected),
  );
}

function scopeValue(input: {
  part: RateLimitScopePart;
  event: import('@sveltejs/kit').RequestEvent;
  userId: string;
  apiTokenHash: string;
  ip: string;
}) {
  const { event, part } = input;
  if (part === 'global') return 'global';
  if (part === 'ip') return `ip:${input.ip}`;
  if (part === 'user') return `user:${input.userId || 'anonymous'}`;
  if (part === 'apiToken') return `apiToken:${input.apiTokenHash || 'none'}`;
  if (part === 'method') return `method:${event.request.method.toUpperCase()}`;
  if (part === 'path') return `path:${event.url.pathname}`;
  if (part === 'route') return `route:${event.route.id ?? 'unmatched'}`;
  if (part.startsWith('header:')) {
    const name = part.slice(7);
    return `header:${name}:${event.request.headers.get(name) ?? ''}`;
  }
  if (part.startsWith('query:')) {
    const name = part.slice(6);
    return `query:${name}:${event.url.searchParams.get(name) ?? ''}`;
  }
  const name = part.slice(7);
  return `cookie:${name}:${event.cookies.get(name) ?? ''}`;
}

function ruleMatches(input: {
  rule: RateLimitRule;
  event: import('@sveltejs/kit').RequestEvent;
  userId: string;
  isAdmin: boolean;
  apiTokenHash: string;
  isAdminApiToken: boolean;
}) {
  const { event, rule } = input;
  const method = event.request.method.toUpperCase();
  if (rule.methods.length > 0 && !rule.methods.includes(method)) return false;
  if (!matchesPath(rule, event.url.pathname)) return false;

  if (
    rule.requireAuthenticated !== null &&
    rule.requireAuthenticated !== Boolean(input.userId)
  ) {
    return false;
  }
  if (rule.requireAdmin !== null && rule.requireAdmin !== input.isAdmin) {
    return false;
  }
  if (
    rule.requireApiToken !== null &&
    rule.requireApiToken !== Boolean(input.apiTokenHash)
  ) {
    return false;
  }
  if (
    rule.requireAdminApiToken !== null &&
    rule.requireAdminApiToken !== input.isAdminApiToken
  ) {
    return false;
  }

  if (
    !matchesRecord(rule.headers, (key) => event.request.headers.get(key) ?? '')
  ) {
    return false;
  }
  if (
    !matchesRecord(rule.query, (key) => event.url.searchParams.get(key) ?? '')
  ) {
    return false;
  }
  if (!matchesRecord(rule.cookies, (key) => event.cookies.get(key) ?? '')) {
    return false;
  }

  return true;
}

function ruleCouldNeedApiPrincipal(input: {
  rule: RateLimitRule;
  event: import('@sveltejs/kit').RequestEvent;
  userId: string;
  isAdmin: boolean;
  apiTokenHash: string;
}) {
  if (!input.rule.enabled || input.rule.requireAdminApiToken === null) {
    return false;
  }

  return ruleMatches({
    ...input,
    isAdminApiToken: input.rule.requireAdminApiToken,
  });
}

async function cleanupBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  await getDatabase().query(`
    DELETE FROM auth_request_limits
    WHERE kind = 'plugin-rate-limit'
      AND updated_at < clock_timestamp() - interval '7 days'
  `);
  lastCleanupAt = now;
}

function matchedRules(input: {
  event: import('@sveltejs/kit').RequestEvent;
  rules: RateLimitRule[];
  userId: string;
  isAdmin: boolean;
  apiTokenHash: string;
  isAdminApiToken: boolean;
  ip: string;
}) {
  const matches: Match[] = [];

  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    if (!ruleMatches({ ...input, rule })) continue;

    const identity = JSON.stringify(
      rule.scope.map((part) =>
        scopeValue({
          part,
          event: input.event,
          userId: input.userId,
          apiTokenHash: input.apiTokenHash,
          ip: input.ip,
        }),
      ),
    );
    const key = hashValue(JSON.stringify([rule.id, identity]));
    matches.push({ rule, key });
  }

  return matches;
}

function rateLimitResponse(input: {
  message: string;
  match: Match & { bucket: Bucket };
  now: number;
}) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((input.match.bucket.resetAt - input.now) / 1000),
  );

  return new Response(
    JSON.stringify({
      message: input.message,
      rule: input.match.rule.id,
      retryAfter: retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(retryAfterSeconds),
        'x-ratelimit-limit': String(input.match.rule.limit),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(
          Math.ceil(input.match.bucket.resetAt / 1000),
        ),
      },
    },
  );
}

const server: Partial<PluginDefinition> = {
  async handleRequest({ event, state, user, isAdmin, ip }) {
    const config = normalizeRateLimitConfig(state.config);

    const token = bearerToken(event.request);
    const apiTokenHash = token ? hashValue(token) : '';
    const needsApiPrincipal = config.rules.some((rule) =>
      ruleCouldNeedApiPrincipal({
        rule,
        event,
        userId: user ? String(user.id) : '',
        isAdmin,
        apiTokenHash,
      }),
    );
    const apiPrincipal =
      token && needsApiPrincipal
        ? await authenticateApiToken(event.request, { touch: false })
        : null;
    const matches = matchedRules({
      event,
      rules: config.rules,
      userId: user ? String(user.id) : '',
      isAdmin,
      apiTokenHash,
      isAdminApiToken: apiPrincipal?.isAdmin === true,
      ip,
    });
    if (matches.length === 0) return null;
    await ensureDatabase();
    await cleanupBuckets(Date.now());
    try {
      // Lock overlapping rules in a stable order; rejection rolls back all counters.
      await getDatabase().transaction(async (transaction) => {
        for (const match of matches.sort((left, right) =>
          left.key.localeCompare(right.key),
        )) {
          const [bucket] = await getDatabase().query<Bucket>(
            `
            INSERT INTO auth_request_limits
              (kind, identifier_hash, date_key, count, updated_at)
            VALUES ('plugin-rate-limit', $key, '', 1, clock_timestamp())
            ON CONFLICT (kind, identifier_hash, date_key) DO UPDATE SET
              count = CASE
                WHEN auth_request_limits.updated_at + $windowSeconds * interval '1 second' <= clock_timestamp()
                  THEN 1
                ELSE auth_request_limits.count + 1
              END,
              updated_at = CASE
                WHEN auth_request_limits.updated_at + $windowSeconds * interval '1 second' <= clock_timestamp()
                  THEN clock_timestamp()
                ELSE auth_request_limits.updated_at
              END
            RETURNING count,
              EXTRACT(EPOCH FROM (updated_at + $windowSeconds * interval '1 second')) * 1000 AS "resetAt"
          `,
            {
              bind: { key: match.key, windowSeconds: match.rule.windowSeconds },
              type: QueryTypes.SELECT,
              transaction,
            },
          );
          if (bucket.count > match.rule.limit) {
            throw rateLimitResponse({
              message: localizedResponseMessage(config, event.locals.locale),
              match: { ...match, bucket },
              now: Date.now(),
            });
          }
        }
      });
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }

    return null;
  },
};

export default server;
