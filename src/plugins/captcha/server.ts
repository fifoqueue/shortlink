import type { PluginDefinition } from '$lib/plugin-contracts';
import { pluginText } from '$lib/i18n/plugin';
import {
  captchaTokenField,
  isActionProtected,
  isCaptchaConfigured,
  normalizeCaptchaConfig,
  parseCaptchaBodyRecord,
  parseCaptchaHeaderRecord,
  verificationEndpointForProvider,
  type CaptchaConfig,
} from './config';

type CaptchaResponse = Record<string, unknown>;

function verifyTimeoutMs(config: CaptchaConfig) {
  const timeout = config.verifyTimeoutMs;
  return Number.isFinite(timeout)
    ? Math.min(120_000, Math.max(1_000, Math.trunc(timeout)))
    : 10_000;
}

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function tokenFromForm(form: FormData, config: CaptchaConfig) {
  const candidates = [
    config.tokenFieldName,
    captchaTokenField,
    'cf-turnstile-response',
    'h-captcha-response',
    'g-recaptcha-response',
  ];
  for (const candidate of candidates) {
    const value = formValue(form, candidate);
    if (value) return value;
  }
  return '';
}

function readPath(value: unknown, path: string) {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function isSuccess(response: CaptchaResponse, config: CaptchaConfig) {
  const path =
    config.provider === 'custom' ? config.customSuccessPath : 'success';
  return readPath(response, path) === true;
}

function scoreValue(response: CaptchaResponse, config: CaptchaConfig) {
  const path = config.provider === 'custom' ? config.customScorePath : 'score';
  const value = readPath(response, path);
  return typeof value === 'number' ? value : null;
}

function buildVerificationPayload(
  config: CaptchaConfig,
  token: string,
  ip: string,
) {
  if (config.provider !== 'custom') {
    return {
      secret: config.secretKey,
      response: token,
      remoteip: ip,
    };
  }

  const payload = {
    ...parseCaptchaBodyRecord(config.customExtraBody),
    [config.customSecretField]: config.secretKey,
    [config.customResponseField]: token,
  };
  if (config.customRemoteIpField) payload[config.customRemoteIpField] = ip;
  return payload;
}

async function verifyCaptcha(input: {
  config: CaptchaConfig;
  token: string;
  ip: string;
}) {
  const { config, token, ip } = input;
  const endpoint = verificationEndpointForProvider(config);
  const payload = buildVerificationPayload(config, token, ip);
  const headers: Record<string, string> =
    config.provider === 'custom'
      ? parseCaptchaHeaderRecord(config.customHeaders)
      : {};
  let fetchUrl = endpoint;
  let body: BodyInit | undefined;

  if (config.provider === 'custom' && config.customVerifyMethod === 'GET') {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(payload)) {
      url.searchParams.set(key, value);
    }
    fetchUrl = url.toString();
  } else if (
    config.provider === 'custom' &&
    config.customRequestFormat === 'json'
  ) {
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    body = JSON.stringify(payload);
  } else {
    headers['content-type'] =
      headers['content-type'] ?? 'application/x-www-form-urlencoded';
    body = new URLSearchParams(payload);
  }

  const response = await fetch(fetchUrl, {
    method: config.provider === 'custom' ? config.customVerifyMethod : 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(verifyTimeoutMs(config)),
  });

  if (!response.ok) return false;
  const data = (await response.json()) as CaptchaResponse;
  if (!isSuccess(data, config)) return false;

  const score = scoreValue(data, config);
  if (
    (config.provider === 'recaptcha-v3' || config.provider === 'custom') &&
    score !== null &&
    score < config.scoreThreshold
  ) {
    return false;
  }

  return true;
}

const server: Partial<PluginDefinition> = {
  loadAdminData({ state }) {
    const config = normalizeCaptchaConfig(state.config);
    return {
      configured: isCaptchaConfigured(config),
      hasSecretKey: Boolean(config.secretKey),
    };
  },
  async verifyFormSubmission({ action, form, state, ip, isAdmin, strings }) {
    if (isAdmin) return { allowed: true };

    const config = normalizeCaptchaConfig(state.config);
    if (!isActionProtected(config, action)) return { allowed: true };

    const token = tokenFromForm(form, config);
    if (!token) {
      return {
        allowed: false,
        message: pluginText(strings, 'public.required'),
      };
    }

    try {
      const ok = await verifyCaptcha({ config, token, ip });
      return ok
        ? { allowed: true }
        : {
            allowed: false,
            message: pluginText(strings, 'public.failed'),
          };
    } catch {
      return {
        allowed: false,
        message: pluginText(strings, 'public.serverUnavailable'),
      };
    }
  },
};

export default server;
