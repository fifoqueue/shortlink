import type {
  PluginDefinition,
  PluginLocaleKey,
  PluginLocaleStrings,
} from '$lib/plugin-contracts';
import {
  defaultSiteLocale,
  siteLocaleKeys,
  type SiteLocale,
} from '$lib/config';
import { pluginText } from '$lib/i18n/plugin';
import { formatText } from '$lib/i18n/ui-text';
import { fieldName, pluginString } from '../utils';
import {
  defaultRateLimitConfig,
  normalizeRateLimitConfig,
  validateRateLimitConfig,
  type RateLimitConfigMessageKey,
} from './config';

function parseLocalizedMessages(
  form: FormData,
  normalized: ReturnType<typeof normalizeRateLimitConfig>,
) {
  return Object.fromEntries(
    siteLocaleKeys.map((locale) => {
      const name = fieldName('rate-limit', `responseMessages.${locale}`);
      return [
        locale,
        form.get(name) === null
          ? normalized.responseMessages[locale]
          : String(form.get(name) ?? '')
              .trim()
              .slice(0, 300),
      ];
    }),
  ) as Record<SiteLocale, string>;
}

function firstLocalizedMessage(messages: Record<string, string>) {
  return siteLocaleKeys.map((locale) => messages[locale]).find(Boolean) ?? '';
}

function messageFromStrings(
  strings: PluginLocaleStrings | undefined,
  key: PluginLocaleKey,
  values: Record<string, string | number> = {},
) {
  return formatText(pluginText(strings, key), values);
}

function parseRules(value: string, strings: PluginLocaleStrings | undefined) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(messageFromStrings(strings, 'server.rulesJsonInvalid'));
  }
}

const plugin: PluginDefinition = {
  meta: {
    id: 'rate-limit',
    name: 'Rate limiting',
    description:
      'Limits request rates by path, HTTP method, user, API token, IP, headers, query parameters, and cookies.',
    version: '1.0.0',
    category: 'security',
    order: 30,
  },
  translations: {
    ko: {
      meta: {
        name: '속도 제한',
        description:
          '경로, HTTP 메소드, 사용자, API 토큰, IP, 헤더, 쿼리, 쿠키 조건별로 요청 속도를 제한합니다.',
        category: 'security',
      },
      strings: {
        'admin.stringLanguage': '문자열 언어',
        'admin.responseMessage': '429 응답 메시지',
        'admin.rulesJson': '규칙 JSON',
        'admin.conditionFields': '조건 필드',
        'admin.rulesHelp':
          'pathMode는 exact, prefix, glob, regex를 지원합니다. scope는 global, ip, user, apiToken, method, path, route, header:name, query:name, cookie:name을 조합할 수 있습니다.',
        'admin.conditionsHelp':
          'requireAuthenticated, requireAdmin, requireApiToken, requireAdminApiToken은 true, false, null 중 하나를 사용합니다. requireAdminApiToken은 유효한 관리자 API 토큰인지 검사합니다. headers, query, cookies 값에는 * 와일드카드를 사용할 수 있습니다. 여러 규칙에 동시에 매칭되면 모든 규칙을 통과해야 요청이 처리됩니다.',
        'server.rulesJsonInvalid': 'Rate limit 규칙 JSON이 올바르지 않습니다.',
        'server.ruleDuplicate': 'Rate limit 규칙 ID "{id}"가 중복되었습니다.',
        'server.ruleIdInvalid':
          'Rate limit 규칙 ID "{id}"가 올바르지 않습니다.',
        'server.regexInvalid':
          'Rate limit 규칙 "{name}"의 regex path가 올바르지 않습니다.',
      },
    },
    en: {
      meta: {
        name: 'Rate limiting',
        description:
          'Limits request rates by path, HTTP method, user, API token, IP, header, query, and cookie conditions.',
        category: 'security',
      },
      strings: {
        'admin.stringLanguage': 'String language',
        'admin.responseMessage': '429 response message',
        'admin.rulesJson': 'Rules JSON',
        'admin.conditionFields': 'Condition fields',
        'admin.rulesHelp':
          'pathMode supports exact, prefix, glob, and regex. scope can combine global, ip, user, apiToken, method, path, route, header:name, query:name, and cookie:name.',
        'admin.conditionsHelp':
          'requireAuthenticated, requireAdmin, requireApiToken, and requireAdminApiToken accept true, false, or null. requireAdminApiToken checks for a valid admin API token. headers, query, and cookies values support the * wildcard. If multiple rules match, every rule must pass for the request to continue.',
        'server.rulesJsonInvalid': 'Rate limit rules JSON is invalid.',
        'server.ruleDuplicate': 'Rate limit rule ID "{id}" is duplicated.',
        'server.ruleIdInvalid': 'Rate limit rule ID "{id}" is invalid.',
        'server.regexInvalid':
          'Regex path for rate limit rule "{name}" is invalid.',
      },
    },
  },
  defaultConfig: defaultRateLimitConfig,
  parseConfig(form, current, input) {
    const fallbackLocale = input?.defaultLocale ?? defaultSiteLocale;
    const normalized = normalizeRateLimitConfig(current, fallbackLocale);
    const responseMessages = parseLocalizedMessages(form, normalized);
    const rawRules =
      form.get(fieldName('rate-limit', 'rulesJson')) === null
        ? normalized.rules
        : parseRules(
            pluginString(form, 'rate-limit', 'rulesJson'),
            input?.strings,
          );

    return normalizeRateLimitConfig(
      {
        responseMessage:
          responseMessages[fallbackLocale] ??
          firstLocalizedMessage(responseMessages),
        responseMessages,
        rules: rawRules,
      },
      fallbackLocale,
    );
  },
  validateConfig(config, context) {
    validateRateLimitConfig(
      normalizeRateLimitConfig(config),
      (key: RateLimitConfigMessageKey, values) =>
        messageFromStrings(context?.strings, key, values),
    );
  },
};

export default plugin;
