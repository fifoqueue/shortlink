import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// A local HTTP CONNECT fixture answers requests without contacting the Internet.
const targets = [];
const origins = [];
const proxy = http.createServer();
const destination = http.createServer((request, response) => {
  origins.push(request.headers.host);
  if (request.url === '/redirect-private') {
    response.writeHead(302, { location: 'http://169.254.169.254/metadata' });
    response.end();
  } else if (request.url === '/redirect-public') {
    response.writeHead(302, { location: 'http://1.1.1.1/ok' });
    response.end();
  } else if (request.url === '/large') {
    response.end('x'.repeat(600 * 1024));
  } else if (request.url === '/slow') {
    // The client must abort this request within its timeout.
  } else {
    response.end('public response');
  }
});
proxy.on('connect', (request, socket, head) => {
  targets.push(request.url);
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if (head.length) socket.unshift(head);
  destination.emit('connection', socket);
});
proxy.listen(0, '127.0.0.1');
await once(proxy, 'listening');
await mkdir('.codex', { recursive: true });
const output = await mkdtemp(path.resolve('.codex/public-http-'));
try {
  await build({
    configFile: false,
    envDir: false,
    logLevel: 'error',
    resolve: { alias: { $lib: path.resolve('src/lib') } },
    build: {
      ssr: path.resolve('src/lib/server/public-http.ts'),
      outDir: output,
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: 'http.mjs' } },
    },
  });
  const { publicHttpRequest } = await import(
    pathToFileURL(path.join(output, 'http.mjs')).href
  );
  const settings = {
    network: {
      outboundProxy: {
        enabled: true,
        url: `http://127.0.0.1:${proxy.address().port}`,
      },
    },
  };
  const request = (pathname, timeoutMs = 2000) =>
    publicHttpRequest({
      url: `http://8.8.8.8${pathname}`,
      method: 'GET',
      settings,
      timeoutMs,
    });
  const result = await request('/ok');
  assert.equal(result.body, 'public response');
  assert.equal(
    targets[0],
    '8.8.8.8:80',
    'Proxy connection must use the validated IP',
  );
  assert.equal(
    origins[0],
    '8.8.8.8:80',
    'HTTP Host must retain the destination',
  );
  const before = targets.length;
  await assert.rejects(request('/redirect-private'), /Private and reserved/);
  assert.equal(
    targets.length,
    before + 1,
    'Private redirect must be rejected before connecting',
  );
  assert.equal((await request('/redirect-public')).body, 'public response');
  assert.equal(targets.at(-1), '1.1.1.1:80', 'Validate and pin every redirect');
  await assert.rejects(request('/large'), /too large/);
  await assert.rejects(request('/slow', 100), /abort|timed out/i);
  console.log(
    'Public HTTP transport, proxy, redirects, size limit and timeout checks passed.',
  );
} finally {
  destination.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
  await rm(output, { recursive: true, force: true });
}
