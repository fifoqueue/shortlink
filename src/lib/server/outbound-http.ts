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

export type OutboundRequestMethod = 'HEAD' | 'GET';

export interface OutboundProxyProtocolDefinition {
  protocol: string;
  defaultPort: number;
  request: (input: {
    url: URL;
    method: OutboundRequestMethod;
    proxy: OutboundProxyConfig;
    purpose: string;
    settings: SiteSettings;
    timeoutMs: number;
  }) => Promise<OutboundRequestResult>;
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
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Outbound request timed out.'));
    }, timeoutMs);
    timer.unref?.();
    run()
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
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
  if (!proxy.username && !proxy.password) return '';
  const token = Buffer.from(`${proxy.username}:${proxy.password}`).toString(
    'base64',
  );
  return `Proxy-Authorization: Basic ${token}\r\n`;
}

async function connectTcp(host: string, port: number, timeoutMs: number) {
  const socket = net.connect({ host, port });
  await withSocketTimeout(socket, timeoutMs, () =>
    waitForEvent(socket, 'connect'),
  );
  return socket;
}

async function connectTls(host: string, port: number, timeoutMs: number) {
  const socket = tls.connect({ host, port, servername: host });
  await withSocketTimeout(socket, timeoutMs, () =>
    waitForEvent(socket, 'secureConnect'),
  );
  return socket;
}

async function connectHttpProxy(
  proxy: OutboundProxyConfig,
  url: URL,
  timeoutMs: number,
) {
  const proxySocket =
    proxy.protocol === 'https'
      ? await connectTls(proxy.host, proxy.port, timeoutMs)
      : await connectTcp(proxy.host, proxy.port, timeoutMs);

  return withSocketTimeout(proxySocket, timeoutMs, async () => {
    const reader = new SocketReader(proxySocket);
    const host = `${url.hostname}:${targetPort(url)}`;
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

    if (url.protocol !== 'https:') return proxySocket;
    const secureSocket = tls.connect({
      socket: proxySocket,
      servername: url.hostname,
    });
    await waitForEvent(secureSocket, 'secureConnect');
    return secureSocket;
  });
}

async function connectForwardProxy(
  proxy: OutboundProxyConfig,
  timeoutMs: number,
) {
  return proxy.protocol === 'https'
    ? connectTls(proxy.host, proxy.port, timeoutMs)
    : connectTcp(proxy.host, proxy.port, timeoutMs);
}

async function connectSocks5Proxy(
  proxy: OutboundProxyConfig,
  url: URL,
  timeoutMs: number,
) {
  const socket = await connectTcp(proxy.host, proxy.port, timeoutMs);
  return withSocketTimeout(socket, timeoutMs, async () => {
    const reader = new SocketReader(socket);
    const hasAuth = Boolean(proxy.username || proxy.password);
    socket.write(Buffer.from(hasAuth ? [5, 2, 0, 2] : [5, 1, 0]));
    const methodResponse = await reader.readBytes(2);
    if (methodResponse[0] !== 5 || methodResponse[1] === 0xff) {
      throw new Error('SOCKS5 proxy rejected authentication methods.');
    }
    if (methodResponse[1] === 2) {
      const username = Buffer.from(proxy.username);
      const password = Buffer.from(proxy.password);
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

    const host = Buffer.from(url.hostname);
    if (host.length > 255) throw new Error('Target host is too long.');
    const port = targetPort(url);
    socket.write(
      Buffer.concat([
        Buffer.from([5, 1, 0, 3, host.length]),
        host,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      ]),
    );
    const head = await reader.readBytes(4);
    if (head[1] !== 0)
      throw new Error(`SOCKS5 proxy failed with code ${head[1]}.`);
    const addressLength =
      head[3] === 1 ? 4 : head[3] === 4 ? 16 : (await reader.readBytes(1))[0];
    await reader.readBytes(addressLength + 2);

    if (url.protocol !== 'https:') return socket;
    const secureSocket = tls.connect({ socket, servername: url.hostname });
    await waitForEvent(secureSocket, 'secureConnect');
    return secureSocket;
  });
}

async function connectViaProxy(
  proxy: OutboundProxyConfig,
  url: URL,
  timeoutMs: number,
) {
  return proxy.protocol === 'socks5' || proxy.protocol === 'socks5h'
    ? connectSocks5Proxy(proxy, url, timeoutMs)
    : connectHttpProxy(proxy, url, timeoutMs);
}

function requestPath(url: URL) {
  return `${url.pathname || '/'}${url.search}`;
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

async function proxiedRequest(input: {
  url: URL;
  method: OutboundRequestMethod;
  proxy: OutboundProxyConfig;
  timeoutMs: number;
}) {
  const usesTunnel =
    input.proxy.protocol === 'socks5' ||
    input.proxy.protocol === 'socks5h' ||
    input.url.protocol === 'https:';
  const socket = usesTunnel
    ? await connectViaProxy(input.proxy, input.url, input.timeoutMs)
    : await connectForwardProxy(input.proxy, input.timeoutMs);
  return withSocketTimeout(socket, input.timeoutMs, async () => {
    const reader = new SocketReader(socket);
    const requestTarget = usesTunnel ? requestPath(input.url) : input.url.href;
    const proxyAuth = usesTunnel ? '' : proxyAuthorization(input.proxy);
    socket.write(
      `${input.method} ${requestTarget} HTTP/1.1\r\n` +
        `Host: ${input.url.host}\r\n` +
        proxyAuth +
        'User-Agent: ShortlinkHealthCheck/1.0\r\n' +
        'Accept: text/plain,text/html,*/*\r\n' +
        'Accept-Encoding: identity\r\n' +
        'Connection: close\r\n\r\n',
    );

    const headerBuffer = await reader.readUntil(
      Buffer.from('\r\n\r\n'),
      64_000,
    );
    const headerText = headerBuffer.toString('latin1');
    const statusLine = headerText.split('\r\n')[0] ?? '';
    const statusMatch = statusLine.match(
      /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/i,
    );
    const headers = parseHeaders(headerText);
    const body = await reader.readRemaining(MAX_RESPONSE_BYTES);
    socket.destroy();

    return {
      url: input.url.toString(),
      status: Number(statusMatch?.[1] ?? 0),
      statusText: statusMatch?.[2]?.trim() ?? '',
      headers,
      body: decodeBody(body, headers),
    };
  });
}

async function directRequest(input: {
  url: URL;
  method: OutboundRequestMethod;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(input.url, {
      method: input.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'text/plain,text/html,*/*',
        'accept-encoding': 'identity',
        'user-agent': 'ShortlinkHealthCheck/1.0',
      },
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
});

registerOutboundProxyProtocol({
  protocol: 'https',
  defaultPort: 443,
  request: proxiedRequest,
});

registerOutboundProxyProtocol({
  protocol: 'socks5',
  defaultPort: 1080,
  request: proxiedRequest,
});

registerOutboundProxyProtocol({
  protocol: 'socks5h',
  defaultPort: 1080,
  request: proxiedRequest,
});

export async function outboundRequest(input: {
  url: string;
  method: OutboundRequestMethod;
  settings: SiteSettings;
  purpose?: string;
  timeoutMs?: number;
  maxRedirects?: number;
}) {
  let url = new URL(input.url);
  const timeoutMs = input.timeoutMs ?? 8_000;
  const maxRedirects = input.maxRedirects ?? MAX_REDIRECTS;
  const purpose = input.purpose ?? 'generic';

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
        proxy,
        purpose,
        settings: input.settings,
        timeoutMs,
      });
    } else {
      result = await directRequest({ url, method: input.method, timeoutMs });
    }
    const nextUrl = redirectUrl(url, result);
    if (!nextUrl) return result;
    url = nextUrl;
  }

  throw new Error('Too many redirects.');
}
