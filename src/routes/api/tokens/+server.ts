import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createApiToken,
  listApiTokens,
  revokeApiTokens,
} from '$lib/server/api-tokens';
import { requireJsonUser } from '$lib/server/auth-guards';

export const GET: RequestHandler = async ({ locals }) => {
  const error = requireJsonUser(locals);
  if (error) return error;

  return json({ tokens: await listApiTokens(locals.user!.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const error = requireJsonUser(locals);
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
  };
  const result = await createApiToken(
    locals.user!.id,
    String(body.name ?? 'API token'),
  );
  return json(result, { status: 201 });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
  const error = requireJsonUser(locals);
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    ids?: unknown[];
  };
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => Number(id))
    : [Number(body.id ?? 0)];
  const removed = await revokeApiTokens(locals.user!.id, ids);
  return json({ ok: removed > 0, removed });
};
