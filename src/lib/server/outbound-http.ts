import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';
import type { SiteSettings } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';

export interface OutboundProxyConfig {
  protocol: string;
  host: string;
  port: number;
  username: string;
  password: string;
  rawUrl?: string;
  searchParams?: Record<string, string>;
}

export interface OutboundRequestResult {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export type OutboundRequestMethod =
  | 'DELETE'
  | 'GET'
  | 'HEAD'
  | 'PATCH'
  | 'POST'
  | 'PUT'
  | (string & {});

type OutboundRequestBody =
  | ArrayBuffer
  | Blob
  | Buffer
  | FormData
  | ReadableStream
  | URLSearchParams
  | Uint8Array
  | string
  | null
  | undefined;

export interface OutboundProxyProtocolDefinition {
  protocol: string;
  defaultPort: number;
  request: (input: {
    url: URL;
    method: OutboundRequestMethod;
    headers: Record<string, string>;
    body: Buffer;
    proxy: OutboundProxyConfig;
    purpose: string;
    signal?: AbortSignal;
    settings: SiteSettings;
    timeoutMs: number;
  }) => Promise<OutboundRequestResult>;
  connect?: (input: {
    host: string;
    port: number;
    secure: boolean;
    servername?: string;
    proxy: OutboundProxyConfig;
    purpose: string;
    signal?: AbortSignal;
    settings: SiteSettings;
    timeoutMs: number;
  }) => Promise<net.Socket | tls.TLSSocket>;
}

type OutboundProxyResolver = (input: {
  url: URL;
  purpose: string;
  settings: SiteSettings;
}) =>
  | OutboundProxyConfig
  | null
  | undefined
  | Promise<OutboundProxyConfig | null | undefined>;

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const registeredProxyResolvers: OutboundProxyResolver[] = [];
const registeredProxyProtocols = new Map<
  string,
  OutboundProxyProtocolDefinition
>();

class SocketReader {
  private buffer = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private closed = false;

  constructor(private socket: net.Socket | tls.TLSSocket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.on('end', () => this.close());
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
  }

  private flush() {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter();
  }

  private close() {
    this.closed = true;
    this.flush();
  }

  private wait() {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async readBytes(length: number) {
    while (
      this.buffer.length < length &&
      !this.closed &&
      !this.socket.destroyed
    ) {
      await this.wait();
    }
    if (this.buffer.length < length)
      throw new Error('Proxy connection closed.');
    const result = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return result;
  }

  async readUntil(pattern: Buffer, maxBytes: number) {
    while (this.buffer.indexOf(pattern) === -1) {
      if (this.buffer.length > maxBytes) {
        throw new Error('Proxy response header is too large.');
      }
      if (this.closed || this.socket.destroyed) break;
      await this.wait();
    }
    const index = this.buffer.indexOf(pattern);
    if (index === -1) throw new Error('Proxy response ended unexpectedly.');
    const result = this.buffer.subarray(0, index + pattern.length);
    this.buffer = this.buffer.subarray(index + pattern.length);
    return result;
  }

  takeBuffered() {
    const result = this.buffer;
    this.buffer = Buffer.alloc(0);
    return result;
  }

  async readRemaining(maxBytes: number) {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < maxBytes) {
      const buffered = this.takeBuffered();
      if (buffered.length > 0) {
        const remaining = maxBytes - total;
        const chunk = buffered.subarray(0, remaining);
        chunks.push(chunk);
        total += chunk.length;
        if (total >= maxBytes) break;
        continue;
      }
      if (this.closed || this.socket.destroyed || this.socket.readableEnded) {
        break;
      }
      await this.wait();
    }
    return Buffer.concat(chunks);
  }
}

function waitForEvent(socket: net.Socket | tls.TLSSocket, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off(event, onEvent);
      socket.off('error', onError);
    };
    socket.once(event, onEvent);
    socket.once('error', onError);
  });
}

function withSocketTimeout<T>(
  socket: net.Socket | tls.TLSSocket,
  timeoutMs: number,
  run: () => Promise<T>,
  signal?: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      socket.destroy();
      reject(signal.reason ?? new Error('Outbound request aborted.'));
      return;
    }
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Outbound request timed out.'));
    }, timeoutMs);
    timer.unref?.();
    const abort = () => {
      socket.destroy();
      reject(signal?.reason ?? new Error('Outbound request aborted.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    run().then(resolve, reject).finally(cleanup);
  });
}

function normalizeProtocol(protocol: string) {
  return protocol.trim().replace(/:$/, '').toLowerCase();
}

export function registerOutboundProxyResolver(resolver: OutboundProxyResolver) {
  registeredProxyResolvers.push(resolver);
}

export function registerOutboundProxyProtocol(
  definition: OutboundProxyProtocolDefinition,
) {
  const protocol = normalizeProtocol(definition.protocol);
  if (!protocol) throw new Error('Outbound proxy protocol is required.');
  if (
    !Number.isInteger(definition.defaultPort) ||
    definition.defaultPort < 1 ||
    definition.defaultPort > 65535
  ) {
    throw new Error(
      `Outbound proxy protocol "${protocol}" has an invalid port.`,
    );
  }
  registeredProxyProtocols.set(protocol, {
    ...definition,
    protocol,
  });
}

function proxyProtocolDefinition(protocol: string) {
  return registeredProxyProtocols.get(normalizeProtocol(protocol));
}

export function parseOutboundProxyUrl(raw: string): OutboundProxyConfig | null {
  const value = raw.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(serverMessage('outboundProxyUrlInvalid'));
  }

  const protocol = normalizeProtocol(parsed.protocol);
  const definition = proxyProtocolDefinition(protocol);
  if (!definition) {
    throw new Error(serverMessage('outboundProxySchemeInvalid'));
  }
  if (!parsed.hostname) {
    throw new Error(serverMessage('outboundProxyHostRequired'));
  }

  const port = parsed.port ? Number(parsed.port) : definition.defaultPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(serverMessage('outboundProxyPortInvalid'));
  }

  return {
    protocol,
    host: parsed.hostname,
    port,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    rawUrl: value,
    searchParams: Object.fromEntries(parsed.searchParams.entries()),
  };
}

function proxyFromSettings(settings: SiteSettings) {
  const proxy = settings.network.outboundProxy;
  return proxy.enabled ? parseOutboundProxyUrl(proxy.url) : null;
}

async function proxyForRequest(input: {
  url: URL;
  purpose: string;
  settings: SiteSettings;
}) {
  for (const resolver of registeredProxyResolvers) {
    const proxy = await resolver(input);
    if (proxy) return proxy;
  }
  return proxyFromSettings(input.settings);
}

function targetPort(url: URL) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

function proxyAuthorization(proxy: OutboundProxyConfig) {
  const value = proxyAuthorizationValue(proxy);
  return value ? `Proxy-Authorization: ${value}\r\n` : '';
}

function proxyAuthorizationValue(proxy: OutboundProxyConfig) {
  if (!proxy.username && !proxy.password) return '';
  const token = Buffer.from(`${proxy.username}:${proxy.password}`).toString(
    'base64',
  );
  return `Basic ${token}`;
}

async function connectTcp(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const socket = net.connect({ host, port });
  await withSocketTimeout(
    socket,
    timeoutMs,
    () => waitForEvent(socket, 'connect'),
    signal,
  );
  return socket;
}

async function connectTls(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
  servername: string = host,
) {
  const socket = tls.connect({ host, port, servername });
  await withSocketTimeout(
    socket,
    timeoutMs,
    () => waitForEvent(socket, 'secureConnect'),
    signal,
  );
  return socket;
}

async function connectHttpProxyTarget(input: {
  proxy: OutboundProxyConfig;
  host: string;
  port: number;
  secure: boolean;
  servername?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const { proxy } = input;
  const proxySocket =
    proxy.protocol === 'https'
      ? await connectTls(proxy.host, proxy.port, input.timeoutMs, input.signal)
      : await connectTcp(proxy.host, proxy.port, input.timeoutMs, input.signal);

  return withSocketTimeout(
    proxySocket,
    input.timeoutMs,
    async () => {
      const reader = new SocketReader(proxySocket);
      const host = `${input.host}:${input.port}`;
      proxySocket.write(
        `CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n${proxyAuthorization(
          proxy,
        )}Connection: close\r\n\r\n`,
      );
      const header = (await reader.readUntil(Buffer.from('\r\n\r\n'), 32_000))
        .toString('latin1')
        .split('\r\n')[0];
      const status = Number(header.split(/\s+/)[1] ?? 0);
      if (status < 200 || status >= 300) {
        proxySocket.destroy();
        throw new Error(
          `Proxy CONNECT failed with status ${status || 'unknown'}.`,
        );
      }

      if (!input.secure) return proxySocket;
      const secureSocket = tls.connect({
        socket: proxySocket,
        servername: input.servername ?? input.host,
      });
      await waitForEvent(secureSocket, 'secureConnect');
      return secureSocket;
    },
    input.signal,
  );
}

async function connectForwardProxy(
  proxy: OutboundProxyConfig,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  return proxy.protocol === 'https'
    ? connectTls(proxy.host, proxy.port, timeoutMs, signal)
    : connectTcp(proxy.host, proxy.port, timeoutMs, signal);
}

async function connectSocks5ProxyTarget(input: {
  proxy: OutboundProxyConfig;
  host: string;
  port: number;
  secure: boolean;
  servername?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const socket = await connectTcp(
    input.proxy.host,
    input.proxy.port,
    input.timeoutMs,
    input.signal,
  );
  return withSocketTimeout(
    socket,
    input.timeoutMs,
    async () => {
      const reader = new SocketReader(socket);
      const hasAuth = Boolean(input.proxy.username || input.proxy.password);
      socket.write(Buffer.from(hasAuth ? [5, 2, 0, 2] : [5, 1, 0]));
      const methodResponse = await reader.readBytes(2);
      if (methodResponse[0] !== 5 || methodResponse[1] === 0xff) {
        throw new Error('SOCKS5 proxy rejected authentication methods.');
      }
      if (methodResponse[1] === 2) {
        const username = Buffer.from(input.proxy.username);
        const password = Buffer.from(input.proxy.password);
        if (username.length > 255 || password.length > 255) {
          throw new Error('SOCKS5 credentials are too long.');
        }
        socket.write(
          Buffer.concat([
            Buffer.from([1, username.length]),
            username,
            Buffer.from([password.length]),
            password,
          ]),
        );
        const authResponse = await reader.readBytes(2);
        if (authResponse[1] !== 0) {
          throw new Error('SOCKS5 proxy authentication failed.');
        }
      }

      const host = Buffer.from(input.host);
      if (host.length > 255) throw new Error('Target host is too long.');
      socket.write(
        Buffer.concat([
          Buffer.from([5, 1, 0, 3, host.length]),
          host,
          Buffer.from([(input.port >> 8) & 0xff, input.port & 0xff]),
        ]),
      );
      const head = await reader.readBytes(4);
      if (head[1] !== 0)
        throw new Error(`SOCKS5 proxy failed with code ${head[1]}.`);
      const addressLength =
        head[3] === 1 ? 4 : head[3] === 4 ? 16 : (await reader.readBytes(1))[0];
      await reader.readBytes(addressLength + 2);

      if (!input.secure) return socket;
      const secureSocket = tls.connect({
        socket,
        servername: input.servername ?? input.host,
      });
      await waitForEvent(secureSocket, 'secureConnect');
      return secureSocket;
    },
    input.signal,
  );
}

async function connectViaProxy(
  proxy: OutboundProxyConfig,
  url: URL,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  return proxy.protocol === 'socks5' || proxy.protocol === 'socks5h'
    ? connectSocks5ProxyTarget({
        proxy,
        host: url.hostname,
        port: targetPort(url),
        secure: url.protocol === 'https:',
        servername: url.hostname,
        timeoutMs,
        signal,
      })
    : connectHttpProxyTarget({
        proxy,
        host: url.hostname,
        port: targetPort(url),
        secure: url.protocol === 'https:',
        servername: url.hostname,
        timeoutMs,
        signal,
      });
}

function requestPath(url: URL) {
  return `${url.pathname || '/'}${url.search}`;
}

function urlHost(host: string) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function parseHeaders(raw: string) {
  const headers: Record<string, string> = {};
  for (const line of raw.split('\r\n').slice(1)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

function decodeChunkedBody(body: Buffer) {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < body.length) {
    const marker = body.indexOf('\r\n', offset, 'latin1');
    if (marker === -1) return body;
    const sizeText = body
      .subarray(offset, marker)
      .toString('latin1')
      .split(';')[0];
    const size = Number.parseInt(sizeText.trim(), 16);
    if (!Number.isFinite(size)) return body;
    offset = marker + 2;
    if (size === 0) break;
    const end = offset + size;
    if (end > body.length) return body;
    chunks.push(body.subarray(offset, end));
    offset = end + 2;
  }
  return Buffer.concat(chunks);
}

function decodeBody(body: Buffer, headers: Record<string, string>) {
  const decoded = /\bchunked\b/i.test(headers['transfer-encoding'] ?? '')
    ? decodeChunkedBody(body)
    : body;
  return decoded.toString('utf8');
}

type OutboundFetchInit = Omit<RequestInit, 'body'> & {
  body?: OutboundRequestBody;
  settings: SiteSettings;
  purpose?: string;
  timeoutMs?: number;
  maxRedirects?: number;
};

function headersFromInit(headers: HeadersInit | undefined) {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function hasHeader(headers: Record<string, string>, key: string) {
  return Object.hasOwn(headers, key.toLowerCase());
}

async function bodyBuffer(body: OutboundRequestBody) {
  if (body === null || body === undefined) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

function defaultBodyContentType(body: OutboundRequestBody) {
  if (body instanceof URLSearchParams) {
    return 'application/x-www-form-urlencoded;charset=UTF-8';
  }
  if (body instanceof Blob && body.type) return body.type;
  if (typeof body === 'string') return 'text/plain;charset=UTF-8';
  return '';
}

function requestHeaders(input: {
  headers: Record<string, string>;
  body: Buffer;
  sourceBody: OutboundRequestBody;
}) {
  const headers = { ...input.headers };
  if (!hasHeader(headers, 'user-agent')) {
    headers['user-agent'] = 'ShortlinkOutbound/1.0';
  }
  if (!hasHeader(headers, 'accept')) headers.accept = '*/*';
  if (!hasHeader(headers, 'accept-encoding')) {
    headers['accept-encoding'] = 'identity';
  }
  if (input.body.length > 0 && !hasHeader(headers, 'content-length')) {
    headers['content-length'] = String(input.body.length);
  }
  const contentType = defaultBodyContentType(input.sourceBody);
  if (contentType && !hasHeader(headers, 'content-type')) {
    headers['content-type'] = contentType;
  }
  delete headers.host;
  delete headers.connection;
  delete headers['proxy-authorization'];
  return headers;
}

function serializeHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');
}

function bufferArrayBuffer(buffer: Buffer) {
  return Uint8Array.from(buffer).buffer;
}

async function proxiedRequest(input: {
  url: URL;
  method: OutboundRequestMethod;
  headers: Record<string, string>;
  body: Buffer;
  proxy: OutboundProxyConfig;
  signal?: AbortSignal;
  timeoutMs: number;
}) {
  const usesTunnel =
    input.proxy.protocol === 'socks5' ||
    input.proxy.protocol === 'socks5h' ||
    input.url.protocol === 'https:';
  const socket = usesTunnel
    ? await connectViaProxy(
        input.proxy,
        input.url,
        input.timeoutMs,
        input.signal,
      )
    : await connectForwardProxy(input.proxy, input.timeoutMs, input.signal);
  return withSocketTimeout(
    socket,
    input.timeoutMs,
    async () => {
      const reader = new SocketReader(socket);
      const requestTarget = usesTunnel
        ? requestPath(input.url)
        : input.url.href;
      const headers = {
        ...input.headers,
        host: input.url.host,
        ...(usesTunnel
          ? {}
          : { 'proxy-authorization': proxyAuthorizationValue(input.proxy) }),
        connection: 'close',
      };
      if (!headers['proxy-authorization'])
        delete headers['proxy-authorization'];
      socket.write(
        `${input.method} ${requestTarget} HTTP/1.1\r\n${serializeHeaders(
          headers,
        )}\r\n\r\n`,
      );
      if (input.body.length > 0) socket.write(input.body);

      const headerBuffer = await reader.readUntil(
        Buffer.from('\r\n\r\n'),
        64_000,
      );
      const headerText = headerBuffer.toString('latin1');
      const statusLine = headerText.split('\r\n')[0] ?? '';
      const statusMatch = statusLine.match(
        /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/i,
      );
      const responseHeaders = parseHeaders(headerText);
      const body = await reader.readRemaining(MAX_RESPONSE_BYTES);
      socket.destroy();

      return {
        url: input.url.toString(),
        status: Number(statusMatch?.[1] ?? 0),
        statusText: statusMatch?.[2]?.trim() ?? '',
        headers: responseHeaders,
        body: decodeBody(body, responseHeaders),
      };
    },
    input.signal,
  );
}

async function directRequest(input: {
  url: URL;
  method: OutboundRequestMethod;
  headers: Record<string, string>;
  body: Buffer;
  signal?: AbortSignal;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  if (input.signal?.aborted) {
    throw input.signal.reason ?? new Error('Outbound request aborted.');
  }
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  timer.unref?.();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(input.url, {
      method: input.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: input.headers,
      body:
        input.method.toUpperCase() === 'GET' ||
        input.method.toUpperCase() === 'HEAD'
          ? undefined
          : bufferArrayBuffer(input.body),
    });
    const headers = Object.fromEntries(response.headers.entries());
    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      headers,
      body:
        input.method === 'HEAD'
          ? ''
          : (await response.text()).slice(0, MAX_RESPONSE_BYTES),
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abort);
  }
}

function redirectUrl(current: URL, result: OutboundRequestResult) {
  if (result.status < 300 || result.status >= 400) return null;
  const location = result.headers.location;
  if (!location) return null;
  return new URL(location, current);
}

registerOutboundProxyProtocol({
  protocol: 'http',
  defaultPort: 80,
  request: proxiedRequest,
  connect: (input) =>
    connectHttpProxyTarget({
      proxy: input.proxy,
      host: input.host,
      port: input.port,
      secure: input.secure,
      servername: input.servername,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }),
});

registerOutboundProxyProtocol({
  protocol: 'https',
  defaultPort: 443,
  request: proxiedRequest,
  connect: (input) =>
    connectHttpProxyTarget({
      proxy: input.proxy,
      host: input.host,
      port: input.port,
      secure: input.secure,
      servername: input.servername,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }),
});

registerOutboundProxyProtocol({
  protocol: 'socks5',
  defaultPort: 1080,
  request: proxiedRequest,
  connect: (input) =>
    connectSocks5ProxyTarget({
      proxy: input.proxy,
      host: input.host,
      port: input.port,
      secure: input.secure,
      servername: input.servername,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }),
});

registerOutboundProxyProtocol({
  protocol: 'socks5h',
  defaultPort: 1080,
  request: proxiedRequest,
  connect: (input) =>
    connectSocks5ProxyTarget({
      proxy: input.proxy,
      host: input.host,
      port: input.port,
      secure: input.secure,
      servername: input.servername,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }),
});

export async function outboundRequest(input: {
  url: string;
  method: OutboundRequestMethod;
  headers?: HeadersInit;
  body?: OutboundRequestBody;
  signal?: AbortSignal;
  settings: SiteSettings;
  purpose?: string;
  timeoutMs?: number;
  maxRedirects?: number;
}) {
  let url = new URL(input.url);
  const timeoutMs = input.timeoutMs ?? 8_000;
  const maxRedirects = input.maxRedirects ?? MAX_REDIRECTS;
  const purpose = input.purpose ?? 'generic';
  const method = input.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD'
      ? Buffer.alloc(0)
      : await bodyBuffer(input.body);
  const headers = requestHeaders({
    headers: headersFromInit(input.headers),
    body,
    sourceBody: input.body,
  });

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const proxy = await proxyForRequest({
      url,
      purpose,
      settings: input.settings,
    });
    let result: OutboundRequestResult;
    if (proxy) {
      const protocol = proxyProtocolDefinition(proxy.protocol);
      if (!protocol) {
        throw new Error(serverMessage('outboundProxySchemeInvalid'));
      }
      result = await protocol.request({
        url,
        method: input.method,
        headers,
        body,
        proxy,
        purpose,
        signal: input.signal,
        settings: input.settings,
        timeoutMs,
      });
    } else {
      result = await directRequest({
        url,
        method: input.method,
        headers,
        body,
        signal: input.signal,
        timeoutMs,
      });
    }
    const nextUrl = redirectUrl(url, result);
    if (!nextUrl) return result;
    url = nextUrl;
  }

  throw new Error('Too many redirects.');
}

export async function outboundFetch(
  resource: RequestInfo | URL,
  init: OutboundFetchInit,
) {
  const request = new Request(resource, init as RequestInit);
  const method = request.method.toUpperCase();
  const requestBody =
    method === 'GET' || method === 'HEAD' || request.body === null
      ? undefined
      : Buffer.from(await request.arrayBuffer());
  const result = await outboundRequest({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: requestBody,
    signal: init.signal ?? request.signal,
    settings: init.settings,
    purpose: init.purpose,
    timeoutMs: init.timeoutMs,
    maxRedirects:
      init.maxRedirects ?? (init.redirect === 'manual' ? 0 : undefined),
  });
  const status = result.status || 502;
  const responseBody =
    request.method.toUpperCase() === 'HEAD' || status === 204 || status === 304
      ? null
      : result.body;
  return new Response(responseBody, {
    status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

export async function outboundConnect(input: {
  host: string;
  port: number;
  secure?: boolean;
  servername?: string;
  settings: SiteSettings;
  purpose?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const secure = input.secure === true;
  const purpose = input.purpose ?? 'generic';
  const timeoutMs = input.timeoutMs ?? 8_000;
  const url = new URL(
    `${secure ? 'tls' : 'tcp'}://${urlHost(input.host)}:${input.port}`,
  );
  const proxy = await proxyForRequest({
    url,
    purpose,
    settings: input.settings,
  });
  if (!proxy) {
    return secure
      ? connectTls(
          input.host,
          input.port,
          timeoutMs,
          input.signal,
          input.servername ?? input.host,
        )
      : connectTcp(input.host, input.port, timeoutMs, input.signal);
  }

  const protocol = proxyProtocolDefinition(proxy.protocol);
  if (!protocol?.connect) {
    throw new Error(serverMessage('outboundProxySchemeInvalid'));
  }
  return protocol.connect({
    host: input.host,
    port: input.port,
    secure,
    servername: input.servername,
    proxy,
    purpose,
    signal: input.signal,
    settings: input.settings,
    timeoutMs,
  });
}
