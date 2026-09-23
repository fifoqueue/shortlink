import http from 'node:http';
import https from 'node:https';
import type { SiteSettings } from '$lib/config';
import { outboundConnect, type OutboundRequestResult } from './outbound-http';
import { resolvePublicAddress } from './public-address';

const MAX_BYTES = 512 * 1024;

// Health checks accept untrusted link destinations. Pin each validated DNS answer
// through the configured transport so DNS rebinding cannot reach a private host.
export async function publicHttpRequest(input: {
  url: string;
  method: 'GET' | 'HEAD';
  settings: SiteSettings;
  timeoutMs: number;
}): Promise<OutboundRequestResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Health check timed out.')),
    input.timeoutMs,
  );
  timer.unref();
  try {
    let url = new URL(input.url);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const address = await Promise.race([
        resolvePublicAddress(url),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted) reject(controller.signal.reason);
          else
            controller.signal.addEventListener(
              'abort',
              () => reject(controller.signal.reason),
              { once: true },
            );
        }),
      ]);
      controller.signal.throwIfAborted();
      const secure = url.protocol === 'https:';
      const socket = await outboundConnect({
        host: address,
        port: Number(url.port) || (secure ? 443 : 80),
        secure,
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        settings: input.settings,
        purpose: 'link-health',
        timeoutMs: input.timeoutMs,
        signal: controller.signal,
      });
      const result = await new Promise<OutboundRequestResult>(
        (resolve, reject) => {
          const request = (secure ? https : http).request(
            url,
            {
              method: input.method,
              // Supplying createConnection without an agent uses this exact socket.
              createConnection: () => socket,
              signal: controller.signal,
              headers: {
                'user-agent': 'ShortlinkHealth/1.0',
                'accept-encoding': 'identity',
                connection: 'close',
              },
            },
            (response) => {
              const chunks: Buffer[] = [];
              let size = 0;
              response.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BYTES) {
                  request.destroy(
                    new Error('Health check response is too large.'),
                  );
                  return;
                }
                chunks.push(chunk);
              });
              response.on('error', reject);
              response.on('end', () =>
                resolve({
                  url: url.toString(),
                  status: response.statusCode ?? 502,
                  statusText: response.statusMessage ?? '',
                  headers: Object.fromEntries(
                    Object.entries(response.headers).map(([key, value]) => [
                      key,
                      Array.isArray(value) ? value.join(', ') : (value ?? ''),
                    ]),
                  ),
                  body: Buffer.concat(chunks).toString('utf8'),
                }),
              );
            },
          );
          request.on('error', reject);
          request.on('close', () => socket.destroy());
          request.end();
        },
      );
      if (
        ![301, 302, 303, 307, 308].includes(result.status) ||
        !result.headers.location
      )
        return result;
      url = new URL(result.headers.location, url);
    }
    throw new Error('Too many redirects.');
  } finally {
    clearTimeout(timer);
  }
}
