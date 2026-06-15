import { error, type RequestHandler } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { refreshRuntimePlugins } from '../../../../../plugins/server';
import { resolveRuntimePluginAsset } from '$lib/server/runtime-plugins';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

export const GET: RequestHandler = async ({ params }) => {
  await refreshRuntimePlugins();
  const pluginId = params.plugin;
  const assetPath = params.path;
  if (!pluginId || !assetPath) error(404);
  const target = await resolveRuntimePluginAsset(pluginId, assetPath);
  if (!target) error(404);

  try {
    const body = await fs.readFile(target);
    return new Response(body, {
      headers: {
        'cache-control': 'no-store',
        'content-type':
          contentTypes[path.extname(target).toLowerCase()] ??
          'application/octet-stream',
      },
    });
  } catch {
    error(404);
  }
};
