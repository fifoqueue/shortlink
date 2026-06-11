import type { PluginDefinition } from '$lib/plugin-contracts';
import { fieldName, pluginChecked, pluginString } from '../utils';
import {
  defaultCaptchaConfig,
  isCaptchaProvider,
  normalizeCaptchaConfig,
  validateCaptchaConfig,
  type CaptchaRequestFormat,
  type CaptchaVerifyMethod,
} from './config';

function scoreValue(form: FormData, name: string, fallback: number) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function numberValue(
  form: FormData,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(form.get(name));
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function parseProvider(
  value: string,
  fallback = defaultCaptchaConfig.provider,
) {
  return isCaptchaProvider(value) ? value : fallback;
}

function parseVerifyMethod(value: string): CaptchaVerifyMethod {
  return value === 'GET' ? 'GET' : 'POST';
}

function parseRequestFormat(value: string): CaptchaRequestFormat {
  return value === 'json' ? 'json' : 'form';
}

const plugin: PluginDefinition = {
  meta: {
    id: 'captcha',
    name: 'CAPTCHA',
    description:
      'Applies CAPTCHA verification to logins, signups, and link creation to reduce automated abuse.',
    version: '1.0.0',
    category: 'core',
    required: true,
    order: 15,
  },
  translations: {
    ko: {
      meta: {
        name: 'CAPTCHA',
        description:
          '로그인, 회원 가입, 링크 생성에 CAPTCHA 검증을 적용해 자동화된 남용을 줄입니다.',
        category: 'core',
      },
      strings: {
        'admin.protectedActions': '보호 대상',
        'admin.protectPasswordLogin': '비밀번호 로그인 보호',
        'admin.protectSignup': '회원 가입 보호',
        'admin.protectLinkCreation': '링크 생성 보호',
        'admin.adminBypassHint': '관리자는 모든 CAPTCHA 검증을 우회합니다.',
        'admin.disabledWithoutCaptchaHint':
          'CAPTCHA를 사용하지 않으면 보호 대상도 비활성화됩니다.',
        'admin.completeSettingsHint':
          'CAPTCHA 설정을 먼저 완료해야 보호 대상을 활성화할 수 있습니다.',
        'admin.provider': 'Provider',
        'admin.providerNone': '사용 안 함',
        'admin.providerTurnstile': 'Cloudflare Turnstile',
        'admin.providerHcaptcha': 'hCaptcha',
        'admin.providerRecaptchaV2': 'Google reCAPTCHA v2',
        'admin.providerRecaptchaV3': 'Google reCAPTCHA v3',
        'admin.providerRecaptchaInvisible': 'Google reCAPTCHA Invisible',
        'admin.providerCustom': 'Custom CAPTCHA',
        'admin.captchaType': 'CAPTCHA 종류',
        'admin.tokenFieldName': '토큰 필드명',
        'admin.verifyTimeout': '검증 Timeout',
        'admin.verifyTimeoutHint':
          'CAPTCHA 검증 서버 응답 대기 시간입니다. 단위: ms',
        'admin.siteKey': 'Site Key',
        'admin.publicSiteKeyPlaceholder': 'public site key',
        'admin.secretKey': 'Secret Key',
        'admin.keepExistingHint': '비워두면 기존 값을 유지합니다.',
        'admin.changeOnlyPlaceholder': '변경할 때만 입력',
        'admin.scoreThreshold': 'Score Threshold',
        'admin.scoreThresholdHint':
          '0이면 점수 제한을 사실상 적용하지 않습니다.',
        'admin.customRendering': 'Custom 렌더링',
        'admin.scriptUrl': 'Script URL',
        'admin.customWidgetUrlPlaceholder':
          'https://captcha.example.com/widget.js',
        'admin.widgetHtml': 'Widget HTML',
        'admin.customWidgetHint':
          '폼 안에 그대로 렌더링됩니다. 토큰 input 이름을 토큰 필드명과 맞추세요.',
        'admin.customVerification': 'Custom 검증',
        'admin.verifyEndpoint': 'Verify Endpoint',
        'admin.customVerifyUrlPlaceholder':
          'https://captcha.example.com/siteverify',
        'admin.verifyMethod': 'Verify Method',
        'admin.verifyMethodPost': 'POST',
        'admin.verifyMethodGet': 'GET',
        'admin.requestFormat': 'Request Format',
        'admin.formUrlEncoded': 'Form URL Encoded',
        'admin.requestFormatJson': 'JSON',
        'admin.secretParam': 'Secret Param',
        'admin.responseParam': 'Response Param',
        'admin.remoteIpParam': 'Remote IP Param',
        'admin.successJsonPath': 'Success JSON Path',
        'admin.successJsonPathPlaceholder': 'success',
        'admin.scoreJsonPath': 'Score JSON Path',
        'admin.scoreJsonPathPlaceholder': 'score',
        'admin.httpHeaders': 'HTTP Headers',
        'admin.extraBody': '추가 본문',
        'admin.keyValueLines': 'K | V 형식, 한 줄에 하나',
        'public.scriptLoadError': 'CAPTCHA 스크립트를 불러오지 못했습니다.',
        'public.renderError': 'CAPTCHA를 표시하지 못했습니다.',
        'public.loadError': 'CAPTCHA를 불러오지 못했습니다.',
        'public.recaptchaProtected': '이 양식은 reCAPTCHA로 보호됩니다.',
        'public.required': 'CAPTCHA 인증을 완료해주세요.',
        'public.failed': 'CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.',
        'public.serverUnavailable':
          'CAPTCHA 인증 서버에 연결하지 못했습니다.',
      },
    },
    en: {
      meta: {
        name: 'CAPTCHA',
        description:
          'Applies CAPTCHA verification to logins, signups, and link creation to reduce automated abuse.',
        category: 'core',
      },
      strings: {
        'admin.protectedActions': 'Protected actions',
        'admin.protectPasswordLogin': 'Protect password login',
        'admin.protectSignup': 'Protect signup',
        'admin.protectLinkCreation': 'Protect link creation',
        'admin.adminBypassHint':
          'Administrators bypass all CAPTCHA checks.',
        'admin.disabledWithoutCaptchaHint':
          'Protected actions are disabled when CAPTCHA is not used.',
        'admin.completeSettingsHint':
          'Complete CAPTCHA settings before enabling protected actions.',
        'admin.provider': 'Provider',
        'admin.providerNone': 'Disabled',
        'admin.providerTurnstile': 'Cloudflare Turnstile',
        'admin.providerHcaptcha': 'hCaptcha',
        'admin.providerRecaptchaV2': 'Google reCAPTCHA v2',
        'admin.providerRecaptchaV3': 'Google reCAPTCHA v3',
        'admin.providerRecaptchaInvisible': 'Google reCAPTCHA Invisible',
        'admin.providerCustom': 'Custom CAPTCHA',
        'admin.captchaType': 'CAPTCHA type',
        'admin.tokenFieldName': 'Token field name',
        'admin.verifyTimeout': 'Verification timeout',
        'admin.verifyTimeoutHint':
          'Time to wait for the CAPTCHA verification server, in ms.',
        'admin.siteKey': 'Site Key',
        'admin.publicSiteKeyPlaceholder': 'public site key',
        'admin.secretKey': 'Secret Key',
        'admin.keepExistingHint':
          'Leave blank to keep the current value.',
        'admin.changeOnlyPlaceholder': 'Enter only when changing it',
        'admin.scoreThreshold': 'Score Threshold',
        'admin.scoreThresholdHint':
          '0 effectively disables the score limit.',
        'admin.customRendering': 'Custom rendering',
        'admin.scriptUrl': 'Script URL',
        'admin.customWidgetUrlPlaceholder':
          'https://captcha.example.com/widget.js',
        'admin.widgetHtml': 'Widget HTML',
        'admin.customWidgetHint':
          'Rendered directly inside the form. Match the token input name to the token field name.',
        'admin.customVerification': 'Custom verification',
        'admin.verifyEndpoint': 'Verify endpoint',
        'admin.customVerifyUrlPlaceholder':
          'https://captcha.example.com/siteverify',
        'admin.verifyMethod': 'Verify method',
        'admin.verifyMethodPost': 'POST',
        'admin.verifyMethodGet': 'GET',
        'admin.requestFormat': 'Request format',
        'admin.formUrlEncoded': 'Form URL Encoded',
        'admin.requestFormatJson': 'JSON',
        'admin.secretParam': 'Secret param',
        'admin.responseParam': 'Response param',
        'admin.remoteIpParam': 'Remote IP param',
        'admin.successJsonPath': 'Success JSON path',
        'admin.successJsonPathPlaceholder': 'success',
        'admin.scoreJsonPath': 'Score JSON path',
        'admin.scoreJsonPathPlaceholder': 'score',
        'admin.httpHeaders': 'HTTP headers',
        'admin.extraBody': 'Extra body',
        'admin.keyValueLines': 'K | V format, one per line',
        'public.scriptLoadError': 'Could not load the CAPTCHA script.',
        'public.renderError': 'Could not display CAPTCHA.',
        'public.loadError': 'Could not load CAPTCHA.',
        'public.recaptchaProtected': 'This form is protected by reCAPTCHA.',
        'public.required': 'Complete the CAPTCHA verification.',
        'public.failed': 'CAPTCHA verification failed. Try again.',
        'public.serverUnavailable':
          'Could not connect to the CAPTCHA verification server.',
      },
    },
  },
  defaultConfig: defaultCaptchaConfig,
  parseConfig(form, current) {
    const normalized = normalizeCaptchaConfig(current);
    const secretInput = pluginString(form, 'captcha', 'secretKey');
    const provider = parseProvider(
      pluginString(form, 'captcha', 'provider'),
      normalized.provider,
    );
    const disabled = provider === 'none';

    return normalizeCaptchaConfig({
      provider,
      siteKey: disabled
        ? ''
        : pluginString(form, 'captcha', 'siteKey', normalized.siteKey),
      secretKey: disabled ? '' : secretInput || normalized.secretKey,
      scoreThreshold: scoreValue(
        form,
        fieldName('captcha', 'scoreThreshold'),
        normalized.scoreThreshold,
      ),
      verifyTimeoutMs: numberValue(
        form,
        fieldName('captcha', 'verifyTimeoutMs'),
        normalized.verifyTimeoutMs,
        1_000,
        120_000,
      ),
      tokenFieldName: pluginString(
        form,
        'captcha',
        'tokenFieldName',
        normalized.tokenFieldName,
      ),
      loginEnabled: !disabled && pluginChecked(form, 'captcha', 'loginEnabled'),
      signupEnabled:
        !disabled && pluginChecked(form, 'captcha', 'signupEnabled'),
      linkCreateEnabled:
        !disabled && pluginChecked(form, 'captcha', 'linkCreateEnabled'),
      customScriptUrl: pluginString(
        form,
        'captcha',
        'customScriptUrl',
        normalized.customScriptUrl,
      ),
      customWidgetHtml:
        form.get(fieldName('captcha', 'customWidgetHtml')) === null
          ? normalized.customWidgetHtml
          : String(form.get(fieldName('captcha', 'customWidgetHtml')) ?? ''),
      customVerifyEndpoint: pluginString(
        form,
        'captcha',
        'customVerifyEndpoint',
        normalized.customVerifyEndpoint,
      ),
      customVerifyMethod: parseVerifyMethod(
        pluginString(
          form,
          'captcha',
          'customVerifyMethod',
          normalized.customVerifyMethod,
        ),
      ),
      customRequestFormat: parseRequestFormat(
        pluginString(
          form,
          'captcha',
          'customRequestFormat',
          normalized.customRequestFormat,
        ),
      ),
      customHeaders: pluginString(
        form,
        'captcha',
        'customHeaders',
        normalized.customHeaders,
      ),
      customExtraBody: pluginString(
        form,
        'captcha',
        'customExtraBody',
        normalized.customExtraBody,
      ),
      customSecretField: pluginString(
        form,
        'captcha',
        'customSecretField',
        normalized.customSecretField,
      ),
      customResponseField: pluginString(
        form,
        'captcha',
        'customResponseField',
        normalized.customResponseField,
      ),
      customRemoteIpField: pluginString(
        form,
        'captcha',
        'customRemoteIpField',
        normalized.customRemoteIpField,
      ),
      customSuccessPath: pluginString(
        form,
        'captcha',
        'customSuccessPath',
        normalized.customSuccessPath,
      ),
      customScorePath: pluginString(
        form,
        'captcha',
        'customScorePath',
        normalized.customScorePath,
      ),
    });
  },
  prepareAdminConfig(config) {
    return {
      ...normalizeCaptchaConfig(config),
      secretKey: '',
    };
  },
  validateConfig(config) {
    validateCaptchaConfig(normalizeCaptchaConfig(config));
  },
  publicConfig(config) {
    const normalized = normalizeCaptchaConfig(config);
    return {
      provider: normalized.provider,
      siteKey: normalized.siteKey,
      scoreThreshold: normalized.scoreThreshold,
      tokenFieldName: normalized.tokenFieldName,
      loginEnabled: normalized.loginEnabled,
      signupEnabled: normalized.signupEnabled,
      linkCreateEnabled: normalized.linkCreateEnabled,
      customScriptUrl: normalized.customScriptUrl,
      customWidgetHtml: normalized.customWidgetHtml,
    };
  },
};

export default plugin;
