import type { SiteSettings } from '$lib/config';
import { outboundRequest } from './outbound-http';

export interface LinkHealthCheckResult {
  status: 'ok' | 'warning' | 'broken';
  statusCode: number | null;
  error: string;
  responseBody: string;
  latencyMs: number;
}

function normalizeResponseText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8_000);
}

function htmlToPlainText(value: string) {
  return normalizeResponseText(
    value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '\n')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(address|article|aside|blockquote|div|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi,
        '\n',
      )
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'"),
  );
}

function plainResponseBody(body: string, contentType: string) {
  if (!body.trim()) return '';
  if (/html|xml/i.test(contentType)) return htmlToPlainText(body);
  return normalizeResponseText(body)
    .replace(/<[^>]+>/g, ' ')
    .trim();
}

export async function fetchLinkHealth(
  url: string,
  settings: SiteSettings,
): Promise<LinkHealthCheckResult> {
  const startedAt = Date.now();

  try {
    let response = await outboundRequest({
      url,
      method: 'HEAD',
      settings,
      purpose: 'link-health',
      timeoutMs: 8_000,
    });

    if (response.status === 405 || response.status >= 400) {
      response = await outboundRequest({
        url,
        method: 'GET',
        settings,
        purpose: 'link-health',
        timeoutMs: 8_000,
      });
    }

    const latencyMs = Date.now() - startedAt;
    const isErrorResponse = response.status >= 400;
    const responseBody = isErrorResponse
      ? plainResponseBody(response.body, response.headers['content-type'] ?? '')
      : '';
    return {
      status:
        response.status >= 500
          ? 'broken'
          : response.status >= 400
            ? 'warning'
            : 'ok',
      statusCode: response.status,
      error: isErrorResponse
        ? `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
        : '',
      responseBody,
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'broken',
      statusCode: null,
      error:
        error instanceof Error ? error.message.slice(0, 500) : 'Request failed',
      responseBody: '',
      latencyMs: Date.now() - startedAt,
    };
  }
}
