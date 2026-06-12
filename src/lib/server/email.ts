import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { parseHeaderRecord, parseSingleHeaderLine } from '$lib/delimited';
import type { SiteSettings } from '$lib/config';
import { formatText, serverMessage, uiText } from '$lib/i18n/ui-text';
import { outboundConnect, outboundFetch } from './outbound-http';

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  verificationUrl: string;
};

function emailTimeoutMs(settings: SiteSettings) {
  const timeout = settings.auth.emailVerification.timeoutMs;
  return Number.isFinite(timeout)
    ? Math.min(120_000, Math.max(1_000, Math.trunc(timeout)))
    : 10_000;
}

function basicAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function httpAuthHeaders(settings: SiteSettings) {
  const config = settings.auth.emailVerification.http;
  if (config.authMode === 'none') return {};

  if (config.authMode === 'basic') {
    if (!config.basicUsername || !config.basicPassword) return {};
    return {
      authorization: basicAuthHeader(
        config.basicUsername,
        config.basicPassword,
      ),
    };
  }

  if (config.authMode === 'headers') {
    return parseHeaderRecord(
      parseSingleHeaderLine(config.authHeaders, 'Custom auth header'),
      'Custom auth header',
    );
  }

  const authorization = config.authorizationHeader.trim();
  return authorization ? { authorization } : {};
}

function sender(settings: SiteSettings) {
  const email = settings.auth.emailVerification.fromEmail.trim();
  if (!email) throw new Error(serverMessage('emailSenderRequired'));
  return {
    address: email,
    name:
      settings.auth.emailVerification.fromName.trim() ||
      settings.general.siteName,
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );
}

async function sendSmtp(settings: SiteSettings, message: EmailMessage) {
  const config = settings.auth.emailVerification;
  if (!config.smtp.host.trim())
    throw new Error(serverMessage('smtpHostRequired'));
  const timeout = emailTimeoutMs(settings);
  const host = config.smtp.host.trim();

  const transport = nodemailer.createTransport({
    host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    getSocket(
      _options: SMTPTransport.Options,
      callback: (error: Error | null, socketOptions?: unknown) => void,
    ) {
      outboundConnect({
        host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        servername: host,
        settings,
        purpose: 'smtp-email',
        timeoutMs: timeout,
      })
        .then((connection) => {
          callback(null, {
            connection,
            secured: config.smtp.secure,
          });
        })
        .catch((cause) => {
          callback(cause instanceof Error ? cause : new Error(String(cause)));
        });
    },
    auth: config.smtp.username
      ? {
          user: config.smtp.username,
          pass: config.smtp.password,
        }
      : undefined,
  });

  await transport.sendMail({
    from: sender(settings),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendHttp(settings: SiteSettings, message: EmailMessage) {
  const config = settings.auth.emailVerification;
  if (!config.http.endpoint.trim()) {
    throw new Error(serverMessage('httpEmailEndpointRequired'));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...parseHeaderRecord(config.http.headers, 'HTTP extra headers'),
    ...httpAuthHeaders(settings),
  };

  const response = await outboundFetch(config.http.endpoint, {
    method: config.http.method,
    headers,
    timeoutMs: emailTimeoutMs(settings),
    settings,
    purpose: 'http-email',
    body: JSON.stringify({
      from: sender(settings),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      verificationUrl: message.verificationUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(
      serverMessage('httpEmailStatus', { status: response.status }),
    );
  }
}

export async function sendVerificationEmail(input: {
  settings: SiteSettings;
  email: string;
  name: string;
  verificationUrl: string;
  purpose?: 'signup' | 'email-change';
}) {
  const { settings, email, name, verificationUrl } = input;
  const siteName = settings.general.siteName;
  const emailChange = input.purpose === 'email-change';
  const textContent = uiText(settings.i18n.defaultLocale).email;
  const subject = emailChange
    ? formatText(textContent.emailChangeSubject, { siteName })
    : formatText(textContent.signupSubject, { siteName });
  const intro = emailChange
    ? formatText(textContent.emailChangeIntro, { name, siteName })
    : formatText(textContent.signupIntro, { name, siteName });
  const text = [intro, '', verificationUrl, '', textContent.oneTimeNotice].join(
    '\n',
  );
  const safeName = escapeHtml(name);
  const safeSiteName = escapeHtml(siteName);
  const safeVerificationUrl = escapeHtml(verificationUrl);
  const safeOneTimeNotice = escapeHtml(textContent.oneTimeNotice);
  const htmlIntro = emailChange
    ? formatText(textContent.emailChangeIntro, {
        name: safeName,
        siteName: safeSiteName,
      })
    : formatText(textContent.signupIntro, {
        name: safeName,
        siteName: safeSiteName,
      });
  const html = `<p>${htmlIntro}</p><p><a href="${safeVerificationUrl}">${safeVerificationUrl}</a></p><p>${safeOneTimeNotice}</p>`;

  const message = {
    to: email,
    subject,
    text,
    html,
    verificationUrl,
  };

  if (settings.auth.emailVerification.provider === 'http') {
    await sendHttp(settings, message);
  } else {
    await sendSmtp(settings, message);
  }
}
