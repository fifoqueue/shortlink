import { createHash, randomBytes } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { SiteSettings } from '$lib/config';
import type { AuthenticatedUser } from '$lib/plugin-contracts';
import { uiText } from '$lib/i18n/ui-text';
import { ApiTokenModel, ensureDatabase, UserModel } from './database';
import type { EffectivePermissions } from './permissions';

export type ApiCapability = 'create' | 'list' | 'stats' | 'delete' | 'update';

export interface ApiPrincipal {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
}

const TOKEN_TOUCH_INTERVAL_MS = 60_000;
const tokenTouchCache = new Map<string, number>();
const tokenAuthCache = new WeakMap<
  Request,
  Promise<CachedApiTokenAuth | null>
>();

type CachedApiTokenAuth = {
  principal: ApiPrincipal;
  tokenHash: string;
  record: ApiTokenModel;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function publicToken(token: ApiTokenModel) {
  return {
    id: token.id,
    name: token.name,
    prefix: token.token_prefix,
    created_at: token.created_at.toISOString(),
    last_used_at: token.last_used_at?.toISOString() ?? null,
  };
}

export async function listApiTokens(userId: number) {
  await ensureDatabase();
  const tokens = await ApiTokenModel.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });
  return tokens.map(publicToken);
}

export async function createApiToken(userId: number, name: string) {
  await ensureDatabase();
  const token = `slk_${randomBytes(32).toString('base64url')}`;
  const record = await ApiTokenModel.create({
    user_id: userId,
    name: name.trim().slice(0, 120) || 'API token',
    token_hash: hashToken(token),
    token_prefix: token.slice(0, 12),
  });
  return {
    token,
    record: publicToken(record),
  };
}

export async function revokeApiToken(userId: number, tokenId: number) {
  await ensureDatabase();
  return (
    (await ApiTokenModel.destroy({
      where: { id: tokenId, user_id: userId },
    })) > 0
  );
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export async function authenticateApiToken(
  request: Request,
  { touch = true }: { touch?: boolean } = {},
) {
  let auth = tokenAuthCache.get(request);
  if (!auth) {
    auth = (async () => {
      const token = bearerToken(request);
      if (!token) return null;
      const tokenHash = hashToken(token);

      await ensureDatabase();
      const record = await ApiTokenModel.findOne({
        where: { token_hash: tokenHash },
      });
      if (!record) return null;

      const user = await UserModel.findByPk(record.user_id);
      if (!user?.enabled) return null;

      return {
        record,
        tokenHash,
        principal: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.is_admin === true,
        },
      } satisfies CachedApiTokenAuth;
    })();
    tokenAuthCache.set(request, auth);
  }

  const cached = await auth;
  if (!cached) return null;

  const now = Date.now();
  if (
    touch &&
    (tokenTouchCache.get(cached.tokenHash) ?? 0) + TOKEN_TOUCH_INTERVAL_MS < now
  ) {
    tokenTouchCache.set(cached.tokenHash, now);
    await cached.record.update({ last_used_at: new Date(now) });
  }
  return cached.principal;
}

function apiCapabilityEnabled(
  settings: SiteSettings,
  capability: ApiCapability,
) {
  if (capability === 'create') return settings.api.allowCreate;
  if (capability === 'list') return settings.api.allowList;
  if (capability === 'stats') return settings.api.allowStats;
  if (capability === 'delete') return settings.api.allowDelete;
  if (capability === 'update') return settings.api.allowUpdate;
  return true;
}

export async function requireApiPrincipal(
  request: Request,
  settings: SiteSettings,
  capability: ApiCapability,
  options: {
    permissions?:
      | EffectivePermissions
      | ((principal: ApiPrincipal) => Promise<EffectivePermissions>);
  } = {},
) {
  const text = uiText(settings.i18n.defaultLocale).messages;
  const principal = await authenticateApiToken(request);
  if (!principal) {
    return {
      error: json({ message: text.apiTokenRequired }, { status: 401 }),
    };
  }

  if (principal.isAdmin) return { principal };

  const permissions =
    typeof options.permissions === 'function'
      ? await options.permissions(principal)
      : options.permissions;

  if (permissions ? !permissions.api.enabled : !settings.api.enabled) {
    return {
      error: json({ message: text.apiAccessDisabled }, { status: 403 }),
    };
  }

  const capabilityAllowed = permissions
    ? permissions.api[capability]
    : apiCapabilityEnabled(settings, capability);
  if (!capabilityAllowed) {
    return {
      error: json({ message: text.apiCapabilityDisabled }, { status: 403 }),
    };
  }

  return { principal };
}

export function apiPrincipalAsUser(principal: ApiPrincipal): AuthenticatedUser {
  return {
    id: principal.id,
    provider: 'api',
    subject: `api-token:${principal.id}`,
    name: principal.name,
    email: principal.email,
    isAdmin: principal.isAdmin,
  };
}
