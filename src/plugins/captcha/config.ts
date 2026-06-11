import type { PluginConfig } from '$lib/plugin-contracts';
import { serverMessage } from '$lib/i18n/ui-text';
import { isHttpHeaderName, parseDelimitedLines } from '../utils';

export type CaptchaProvider =
  | 'none'
  | 'recaptcha-v2'
  | 'recaptcha-v3'
  | 'recaptcha-invisible'
  | 'turnstile'
  | 'hcaptcha'
  | 'custom';

export type CaptchaAction = 'login' | 'signup' | 'link-create';
export type CaptchaVerifyMethod = 'POST' | 'GET';
export type CaptchaRequestFormat = 'form' | 'json';

export interface CaptchaConfig extends Record<string, unknown> {
  provider: CaptchaProvider;
  siteKey: string;
  secretKey: string;
  scoreThreshold: number;
  tokenFieldName: string;
  loginEnabled: boolean;
  signupEnabled: boolean;
  linkCreateEnabled: boolean;
  customScriptUrl: string;
  customWidgetHtml: string;
  customVerifyEndpoint: string;
  customVerifyMethod: CaptchaVerifyMethod;
  customRequestFormat: CaptchaRequestFormat;
  customHeaders: string;
  customExtraBody: string;
  customSecretField: string;
  customResponseField: string;
  customRemoteIpField: string;
  customSuccessPath: string;
  customScorePath: string;
  verifyTimeoutMs: number;
}

export const captchaTokenField = 'captchaToken';

export const captchaProviderOptions: Array<{
  id: CaptchaProvider;
  label: string;
}> = [
  { id: 'none', label: 'Disabled' },
  { id: 'turnstile', label: 'Cloudflare Turnstile' },
  { id: 'hcaptcha', label: 'hCaptcha' },
  { id: 'recaptcha-v2', label: 'Google reCAPTCHA v2' },
  { id: 'recaptcha-v3', label: 'Google reCAPTCHA v3' },
  { id: 'recaptcha-invisible', label: 'Google reCAPTCHA Invisible' },
  { id: 'custom', label: 'Custom CAPTCHA' },
];

export const defaultCaptchaConfig: CaptchaConfig = {
  provider: 'none',
  siteKey: '',
  secretKey: '',
  scoreThreshold: 0.5,
  tokenFieldName: captchaTokenField,
  loginEnabled: false,
  signupEnabled: false,
  linkCreateEnabled: false,
  customScriptUrl: '',
  customWidgetHtml: '',
  customVerifyEndpoint: '',
  customVerifyMethod: 'POST',
  customRequestFormat: 'form',
  customHeaders: '',
  customExtraBody: '',
  customSecretField: 'secret',
  customResponseField: 'response',
  customRemoteIpField: 'remoteip',
  customSuccessPath: 'success',
  customScorePath: 'score',
  verifyTimeoutMs: 10_000,
};

function configString(
  config: PluginConfig,
  field: keyof CaptchaConfig,
  fallback = '',
) {
  const value = config[field];
  return typeof value === 'string' ? value : fallback;
}

function configBoolean(
  config: PluginConfig,
  field: keyof CaptchaConfig,
  fallback = false,
) {
  const value = config[field];
  return typeof value === 'boolean' ? value : fallback;
}

function configNumber(
  config: PluginConfig,
  field: keyof CaptchaConfig,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(config[field]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function isCaptchaProvider(value: string): value is CaptchaProvider {
  return captchaProviderOptions.some((provider) => provider.id === value);
}

function normalizeTokenFieldName(value: string) {
  return /^[A-Za-z0-9_.:-]+$/.test(value) ? value : captchaTokenField;
}

export function normalizeCaptchaConfig(config: PluginConfig): CaptchaConfig {
  const provider = configString(config, 'provider');
  const method = configString(config, 'customVerifyMethod');
  const requestFormat = configString(config, 'customRequestFormat');

  return {
    provider: isCaptchaProvider(provider) ? provider : 'none',
    siteKey: configString(config, 'siteKey'),
    secretKey: configString(config, 'secretKey'),
    scoreThreshold: configNumber(config, 'scoreThreshold', 0.5, 0, 1),
    tokenFieldName: normalizeTokenFieldName(
      configString(config, 'tokenFieldName', captchaTokenField),
    ),
    loginEnabled: configBoolean(config, 'loginEnabled'),
    signupEnabled: configBoolean(config, 'signupEnabled'),
    linkCreateEnabled: configBoolean(config, 'linkCreateEnabled'),
    customScriptUrl: configString(config, 'customScriptUrl'),
    customWidgetHtml: configString(config, 'customWidgetHtml'),
    customVerifyEndpoint: configString(config, 'customVerifyEndpoint'),
    customVerifyMethod: method === 'GET' ? 'GET' : 'POST',
    customRequestFormat: requestFormat === 'json' ? 'json' : 'form',
    customHeaders: configString(config, 'customHeaders'),
    customExtraBody: configString(config, 'customExtraBody'),
    customSecretField:
      configString(config, 'customSecretField') ||
      defaultCaptchaConfig.customSecretField,
    customResponseField:
      configString(config, 'customResponseField') ||
      defaultCaptchaConfig.customResponseField,
    customRemoteIpField:
      configString(config, 'customRemoteIpField') ||
      defaultCaptchaConfig.customRemoteIpField,
    customSuccessPath:
      configString(config, 'customSuccessPath') ||
      defaultCaptchaConfig.customSuccessPath,
    customScorePath:
      configString(config, 'customScorePath') ||
      defaultCaptchaConfig.customScorePath,
    verifyTimeoutMs: Math.trunc(
      configNumber(config, 'verifyTimeoutMs', 10_000, 1_000, 120_000),
    ),
  };
}

export function isActionProtected(
  config: CaptchaConfig,
  action: CaptchaAction | (string & {}),
) {
  if (config.provider === 'none') return false;
  if (action === 'login') return config.loginEnabled;
  if (action === 'signup') return config.signupEnabled;
  if (action === 'link-create') return config.linkCreateEnabled;
  return false;
}

export function isCaptchaConfigured(config: CaptchaConfig) {
  if (config.provider === 'none') return false;
  if (config.provider === 'custom') {
    return Boolean(
      config.customVerifyEndpoint &&
      config.tokenFieldName &&
      config.customSuccessPath,
    );
  }

  return Boolean(config.siteKey && config.secretKey);
}

export function scriptUrlForProvider(config: CaptchaConfig) {
  if (config.provider === 'none') return '';
  if (config.provider === 'custom') return config.customScriptUrl;
  if (config.provider === 'turnstile') {
    return 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  }
  if (config.provider === 'hcaptcha') {
    return 'https://js.hcaptcha.com/1/api.js?render=explicit';
  }
  if (config.provider === 'recaptcha-v3') {
    return `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
      config.siteKey,
    )}`;
  }
  if (config.provider === 'recaptcha-invisible') {
    return 'https://www.google.com/recaptcha/api.js?render=explicit';
  }
  return 'https://www.google.com/recaptcha/api.js?render=explicit';
}

export function verificationEndpointForProvider(config: CaptchaConfig) {
  if (config.provider === 'none') return '';
  if (config.provider === 'turnstile') {
    return 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  }
  if (config.provider === 'hcaptcha')
    return 'https://api.hcaptcha.com/siteverify';
  if (config.provider === 'custom') return config.customVerifyEndpoint;
  return 'https://www.google.com/recaptcha/api/siteverify';
}

export function actionName(action: CaptchaAction) {
  return `shortlink_${action.replace(/-/g, '_')}`;
}

export interface CaptchaPair extends Record<string, unknown> {
  key: string;
  value: string;
}

export function parseCaptchaPairs(value: string, description: string) {
  return parseDelimitedLines<CaptchaPair>(
    value,
    [
      {
        key: 'key',
        label: 'K',
        validate: (key) => /^[A-Za-z0-9_.:-]+$/.test(key),
      },
      {
        key: 'value',
        label: 'V',
      },
    ],
    { description, maxRows: 50 },
  );
}

export function parseCaptchaHeaderRecord(value: string) {
  const headers: Record<string, string> = {};
  for (const pair of parseCaptchaPairs(value, 'CAPTCHA HTTP headers')) {
    if (!isHttpHeaderName(pair.key)) {
      throw new Error(
        serverMessage('captchaHeaderInvalid', { header: pair.key }),
      );
    }
    headers[pair.key] = pair.value;
  }
  return headers;
}

export function parseCaptchaBodyRecord(value: string) {
  const body: Record<string, string> = {};
  for (const pair of parseCaptchaPairs(value, 'CAPTCHA extra body')) {
    body[pair.key] = pair.value;
  }
  return body;
}

export function validateCaptchaConfig(config: CaptchaConfig) {
  const enabled =
    config.loginEnabled || config.signupEnabled || config.linkCreateEnabled;

  if (config.provider === 'custom') {
    parseCaptchaHeaderRecord(config.customHeaders);
    parseCaptchaBodyRecord(config.customExtraBody);
  }
  if (!enabled) return;

  if (config.provider === 'none') {
    throw new Error(serverMessage('captchaProtectedRequiresProvider'));
  }

  if (!isCaptchaConfigured(config)) {
    throw new Error(serverMessage('captchaSettingsIncomplete'));
  }

  if (config.provider === 'custom') {
    if (!config.customVerifyEndpoint) {
      throw new Error(serverMessage('captchaCustomEndpointRequired'));
    }
    new URL(config.customVerifyEndpoint);
    if (!config.customSuccessPath) {
      throw new Error(serverMessage('captchaCustomSuccessPathRequired'));
    }
    if (!config.tokenFieldName) {
      throw new Error(serverMessage('captchaTokenFieldRequired'));
    }
    return;
  }

  if (!config.siteKey) throw new Error(serverMessage('captchaSiteKeyRequired'));
  if (!config.secretKey) {
    throw new Error(serverMessage('captchaSecretKeyRequired'));
  }
}
