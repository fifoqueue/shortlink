import {
  isHttpHeaderName,
  parseHeaderRecord,
  parseSingleHeaderLine,
} from '$lib/delimited';
import {
  defaultLocalizedContentFor,
  defaultGeoipSettings,
  defaultOutboundProxySettings,
  linkedLinkEditFieldPairs,
  linkedLinkOptionKeyPairs,
  redirectRuleConditionKeys,
  siteLocaleKeys,
  themePresets,
  type LocalizedSiteContent,
  type SiteLocale,
  type SiteSettings,
  type ThemeTokens,
  type ThemeColors,
} from '$lib/config';
import { darkThemeTokens, defaultDarkThemeTokens } from '$lib/theme-vars';
import { localeFromValue } from '$lib/i18n';
import { serverMessage } from '$lib/i18n/ui-text';
import { validateGeoipSettings } from './geoip';
import { hashWebActionBypassToken } from './web-action-guard';
import { parseOutboundProxyUrl } from './outbound-http';
import {
  LINK_EDIT_FIELD_KEYS,
  LINK_OPTION_KEYS,
  type LinkEditField,
  type LinkOptionKey,
} from './permissions';
import {
  getSettings,
  numberValue,
  parseBoolean,
  parseColorMode,
  parseEmailHttpAuthMode,
  parseEmailHttpMethod,
  parseEmailProvider,
  parseLines,
  parseRedirectStatus,
  parseThemePreset,
  stringValue,
} from './settings';
import {
  normalizeShortLinkDomain,
  normalizeShortLinkDomains,
  normalizeShortLinkDomainScheme,
  normalizeShortLinkDomainSettings,
} from './url';

function parseColor(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function parseSchemes(value: string) {
  const schemes = parseLines(value)
    .flatMap((line) => line.split(/[\s,]+/))
    .map((scheme) => scheme.trim().toLowerCase().replace(/:$/, ''))
    .filter((scheme) => /^[a-z][a-z0-9+.-]*$/.test(scheme));
  return [...new Set(schemes)].slice(0, 30);
}

function parseProxyIpHeaders(value: string) {
  const headers = parseLines(value).map((header) => header.trim());
  const uniqueHeaders: string[] = [];
  const seen = new Set<string>();

  headers.forEach((header, index) => {
    if (!isHttpHeaderName(header)) {
      throw new Error(
        serverMessage('proxyIpHeaderInvalid', { line: index + 1 }),
      );
    }

    const key = header.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    uniqueHeaders.push(header);
  });

  return uniqueHeaders.slice(0, 20);
}

function preservedStringValue(form: FormData, name: string, current = '') {
  return stringValue(form, name) || current;
}

function parseGeoipSettings(
  form: FormData,
  current: Awaited<
    ReturnType<typeof getSettings>
  >['network']['geoip'] = defaultGeoipSettings,
) {
  const settings = {
    enabled: parseBoolean(form, 'geoipEnabled'),
    headersEnabled: parseBoolean(form, 'geoipHeadersEnabled'),
    maxmindEnabled: parseBoolean(form, 'geoipMaxmindEnabled'),
    cityDatabasePath: preservedStringValue(
      form,
      'geoipCityDatabasePath',
      current.cityDatabasePath,
    ),
    countryDatabasePath: preservedStringValue(
      form,
      'geoipCountryDatabasePath',
      current.countryDatabasePath,
    ),
    asnDatabasePath: preservedStringValue(
      form,
      'geoipAsnDatabasePath',
      current.asnDatabasePath,
    ),
    countryCodeHeader: stringValue(
      form,
      'geoipCountryCodeHeader',
      defaultGeoipSettings.countryCodeHeader,
    ),
    countryNameHeader: stringValue(
      form,
      'geoipCountryNameHeader',
      defaultGeoipSettings.countryNameHeader,
    ),
    cityNameHeader: stringValue(
      form,
      'geoipCityNameHeader',
      defaultGeoipSettings.cityNameHeader,
    ),
    asnNumberHeader: stringValue(
      form,
      'geoipAsnNumberHeader',
      defaultGeoipSettings.asnNumberHeader,
    ),
    asnOrganizationHeader: stringValue(
      form,
      'geoipAsnOrganizationHeader',
      defaultGeoipSettings.asnOrganizationHeader,
    ),
  };
  validateGeoipSettings(settings);
  return settings;
}

function parseOutboundProxySettings(
  form: FormData,
  current: Awaited<
    ReturnType<typeof getSettings>
  >['network']['outboundProxy'] = defaultOutboundProxySettings,
) {
  const enabled = parseBoolean(form, 'outboundProxyEnabled');
  const url = preservedStringValue(form, 'outboundProxyUrl', current.url).slice(
    0,
    1_000,
  );
  if (enabled) parseOutboundProxyUrl(url);
  return { enabled, url };
}

function parseSecuritySettings(
  form: FormData,
  current: Awaited<ReturnType<typeof getSettings>>['security'],
) {
  const bypassToken = stringValue(form, 'webActionGuardBypassToken');
  return {
    webActionGuard: {
      enabled: parseBoolean(form, 'webActionGuardEnabled'),
      tokenTtlSeconds: numberValue(
        form,
        'webActionGuardTokenTtlSeconds',
        current.webActionGuard.tokenTtlSeconds,
        60,
        24 * 60 * 60,
      ),
      bypassTokenHash: parseBoolean(form, 'webActionGuardClearBypassToken')
        ? ''
        : bypassToken
          ? hashWebActionBypassToken(bypassToken)
          : current.webActionGuard.bypassTokenHash,
      adminBypass: parseBoolean(form, 'webActionGuardAdminBypass'),
    },
    csrf: {
      enabled: parseBoolean(form, 'csrfEnabled'),
      tokenTtlSeconds: numberValue(
        form,
        'csrfTokenTtlSeconds',
        current.csrf.tokenTtlSeconds,
        60,
        24 * 60 * 60,
      ),
    },
  };
}

function parseShortLinkDomains(form: FormData, currentDefaultDomain = '') {
  const domainValues = form.getAll('shortLinkDomains');
  const schemeValues = form.getAll('shortLinkDomainSchemes');
  const domainSchemes: Record<string, string> = {};

  domainValues.forEach((value, index) => {
    const domain = normalizeShortLinkDomain(String(value ?? ''));
    if (!domain) return;
    domainSchemes[domain] = normalizeShortLinkDomainScheme(schemeValues[index]);
  });

  return normalizeShortLinkDomainSettings({
    defaultDomain: stringValue(form, 'defaultDomain') || currentDefaultDomain,
    domains: domainValues,
    domainSchemes,
  });
}

function parseAllowedShortLinkDomains(value: string) {
  return normalizeShortLinkDomains(
    parseLines(value).flatMap((line) => line.split(/[\s,]+/)),
  );
}

function selectedKeys<T extends string>(
  values: FormDataEntryValue[],
  keys: readonly T[],
) {
  const allowed = new Set<string>(keys);
  return [
    ...new Set(
      values
        .map((value) => String(value))
        .filter((value): value is T => allowed.has(value)),
    ),
  ];
}

function linkOptionsFromForm(form: FormData) {
  const options = Object.fromEntries(
    LINK_OPTION_KEYS.map((key) => [
      key,
      parseBoolean(form, `linkOption.${key}`),
    ]),
  ) as Record<LinkOptionKey, boolean>;
  for (const [left, right] of linkedLinkOptionKeyPairs) {
    if (options[left] !== options[right]) {
      const allowed = options[left] || options[right];
      options[left] = allowed;
      options[right] = allowed;
    }
  }
  if (options.redirectRules) {
    const hasCondition = redirectRuleConditionKeys.some((key) => options[key]);
    if (!hasCondition) {
      for (const key of redirectRuleConditionKeys) options[key] = true;
    }
  } else {
    for (const key of redirectRuleConditionKeys) options[key] = false;
  }
  if (redirectRuleConditionKeys.some((key) => options[key])) {
    options.redirectRules = true;
  }
  return options;
}

function linkEditFieldsFromForm(form: FormData): LinkEditField[] {
  const fields = selectedKeys(
    form.getAll('editableFields'),
    LINK_EDIT_FIELD_KEYS,
  ) as LinkEditField[];
  const fieldSet = new Set<LinkEditField>(fields);
  for (const pair of linkedLinkEditFieldPairs) {
    if (pair.some((field) => fieldSet.has(field))) {
      for (const field of pair) fieldSet.add(field);
    }
  }
  if (fieldSet.has('redirectRules')) {
    const hasCondition = redirectRuleConditionKeys.some((key) =>
      fieldSet.has(key),
    );
    if (!hasCondition) {
      for (const key of redirectRuleConditionKeys) fieldSet.add(key);
    }
  } else {
    for (const key of redirectRuleConditionKeys) fieldSet.delete(key);
  }
  if (redirectRuleConditionKeys.some((key) => fieldSet.has(key))) {
    fieldSet.add('redirectRules');
  }
  return [...fieldSet];
}

function mergeEmailSettings(
  form: FormData,
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  const current = settings.auth.emailVerification;
  const provider = parseEmailProvider(stringValue(form, 'emailProvider'));
  const authMode = parseEmailHttpAuthMode(
    stringValue(form, 'emailHttpAuthMode'),
  );
  const httpHeaders = stringValue(form, 'emailHttpHeaders').slice(0, 5000);
  const authHeaderInput = stringValue(form, 'emailHttpAuthHeaders').slice(
    0,
    1000,
  );

  if (provider === 'http') {
    parseHeaderRecord(httpHeaders, 'HTTP extra headers');
    if (authMode === 'headers' && authHeaderInput) {
      parseSingleHeaderLine(authHeaderInput, 'Custom auth header');
    }
  }

  return {
    enabled: parseBoolean(form, 'emailVerificationEnabled'),
    provider,
    tokenTtlHours: numberValue(
      form,
      'emailTokenTtlHours',
      current.tokenTtlHours,
      1,
      24 * 30,
    ),
    timeoutMs: numberValue(
      form,
      'emailTimeoutMs',
      current.timeoutMs,
      1_000,
      120_000,
    ),
    fromEmail: stringValue(form, 'emailFromEmail').slice(0, 320),
    fromName: stringValue(form, 'emailFromName').slice(0, 120),
    smtp:
      provider === 'smtp'
        ? {
            host: stringValue(form, 'smtpHost').slice(0, 320),
            port: numberValue(form, 'smtpPort', current.smtp.port, 1, 65535),
            secure: parseBoolean(form, 'smtpSecure'),
            username: stringValue(form, 'smtpUsername').slice(0, 320),
            password:
              stringValue(form, 'smtpPassword') || current.smtp.password,
          }
        : current.smtp,
    http:
      provider === 'http'
        ? {
            endpoint: stringValue(form, 'emailHttpEndpoint').slice(0, 1000),
            method: parseEmailHttpMethod(stringValue(form, 'emailHttpMethod')),
            authMode,
            authorizationHeader:
              authMode === 'authorization'
                ? stringValue(form, 'emailHttpAuthorizationHeader') ||
                  current.http.authorizationHeader
                : current.http.authorizationHeader,
            basicUsername:
              authMode === 'basic'
                ? stringValue(form, 'emailHttpBasicUsername').slice(0, 320)
                : current.http.basicUsername,
            basicPassword:
              authMode === 'basic'
                ? stringValue(form, 'emailHttpBasicPassword') ||
                  current.http.basicPassword
                : current.http.basicPassword,
            authHeaders:
              authMode === 'headers'
                ? authHeaderInput
                  ? parseSingleHeaderLine(authHeaderInput, 'Custom auth header')
                  : current.http.authHeaders
                : current.http.authHeaders,
            headers: httpHeaders,
          }
        : current.http,
  };
}

function formText(
  form: FormData,
  name: string,
  fallback: string,
  maxLength: number,
  trim = true,
) {
  const value = String(form.get(name) ?? fallback);
  return (trim ? value.trim() : value).slice(0, maxLength);
}

function localizedContentFromForm(
  form: FormData,
  locale: SiteLocale,
  fallback: LocalizedSiteContent,
): LocalizedSiteContent {
  const defaultContent = defaultLocalizedContentFor(locale);
  const content = {
    general: {
      ...defaultContent.general,
      ...fallback.general,
    },
    seo: {
      ...defaultContent.seo,
      ...fallback.seo,
    },
    legal: {
      ...defaultContent.legal,
      ...fallback.legal,
    },
  };

  return {
    general: {
      siteName: formText(
        form,
        `${locale}SiteName`,
        content.general.siteName,
        80,
      ),
      eyebrow: formText(form, `${locale}Eyebrow`, content.general.eyebrow, 120),
      headline: formText(
        form,
        `${locale}Headline`,
        content.general.headline,
        180,
      ),
      description: formText(
        form,
        `${locale}Description`,
        content.general.description,
        500,
      ),
      footerText: formText(
        form,
        `${locale}FooterText`,
        content.general.footerText,
        180,
      ),
    },
    seo: {
      title: formText(form, `${locale}SeoTitle`, content.seo.title, 120),
      description: formText(
        form,
        `${locale}SeoDescription`,
        content.seo.description,
        320,
      ),
    },
    legal: {
      termsTitle: formText(
        form,
        `${locale}TermsTitle`,
        content.legal.termsTitle,
        120,
      ),
      termsContent: formText(
        form,
        `${locale}TermsContent`,
        content.legal.termsContent,
        100_000,
        false,
      ),
      privacyTitle: formText(
        form,
        `${locale}PrivacyTitle`,
        content.legal.privacyTitle,
        120,
      ),
      privacyContent: formText(
        form,
        `${locale}PrivacyContent`,
        content.legal.privacyContent,
        100_000,
        false,
      ),
    },
  };
}

// Parse and validate only the section being saved; the caller owns persistence.
export function applySettingsForm(
  section: 'general' | 'links' | 'security' | 'theme' | 'resetTheme',
  form: FormData,
  settings: SiteSettings,
) {
  if (section === 'general') {
    const locales = Object.fromEntries(
      siteLocaleKeys.map((locale) => [
        locale,
        localizedContentFromForm(
          form,
          locale,
          settings.i18n.locales[locale] ?? defaultLocalizedContentFor(locale),
        ),
      ]),
    ) as Record<SiteLocale, LocalizedSiteContent>;
    const defaultLocale =
      localeFromValue(stringValue(form, 'defaultLocale')) ??
      settings.i18n.defaultLocale;
    const defaultContent = locales[defaultLocale];
    const shortLinkDomains = parseShortLinkDomains(
      form,
      settings.general.defaultDomain,
    );

    settings.general = {
      ...settings.general,
      ...defaultContent.general,
      logoUrl: stringValue(form, 'logoUrl').slice(0, 500),
      faviconUrl: stringValue(form, 'faviconUrl', '/favicon.svg').slice(0, 500),
      defaultDomain: shortLinkDomains.defaultDomain,
      domains: shortLinkDomains.domains,
      domainSchemes: shortLinkDomains.domainSchemes,
      language: defaultLocale,
    };
    settings.seo = {
      ...settings.seo,
      ...defaultContent.seo,
      ogImageUrl: stringValue(form, 'ogImageUrl').slice(0, 500),
      indexable: parseBoolean(form, 'indexable'),
      robotsTxt: String(form.get('robotsTxt') ?? '').slice(0, 20000),
      customHead: String(form.get('customHead') ?? '').slice(0, 50000),
    };
    settings.legal = defaultContent.legal;
    settings.i18n = {
      defaultLocale,
      locales,
    };
    settings.access.visibility =
      stringValue(form, 'visibility') === 'public' ? 'public' : 'private';

    return;
  }
  if (section === 'links') {
    const minLength = numberValue(form, 'codeMinLength', 3, 1, 30);
    const maxLength = numberValue(form, 'codeMaxLength', 32, minLength, 64);
    const linkOptions = linkOptionsFromForm(form);

    settings.links = {
      allowCreate: parseBoolean(form, 'allowLinkCreate'),
      allowCustomCodes: linkOptions.customCode,
      options: linkOptions,
      codeMinLength: minLength,
      codeMaxLength: maxLength,
      generatedCodeLength: numberValue(
        form,
        'generatedCodeLength',
        7,
        minLength,
        maxLength,
      ),
      allowedDomains: parseAllowedShortLinkDomains(
        stringValue(form, 'allowedDomains'),
      ),
      allowUserDelete: parseBoolean(form, 'allowUserDelete'),
      userDeleteMaxClicks: numberValue(
        form,
        'userDeleteMaxClicks',
        0,
        0,
        1_000_000,
      ),
      editOwn: parseBoolean(form, 'editOwnLinks'),
      viewAll: parseBoolean(form, 'viewAllLinks'),
      editAll: parseBoolean(form, 'editAllLinks'),
      deleteAll: parseBoolean(form, 'deleteAllLinks'),
      statsAll: parseBoolean(form, 'statsAllLinks'),
      statsCsv: parseBoolean(form, 'statsCsvLinks'),
      share: parseBoolean(form, 'shareLinks'),
      healthAll: parseBoolean(form, 'healthAllLinks'),
      editableFields: linkEditFieldsFromForm(form),
      trackClicks: parseBoolean(form, 'trackClicks'),
      redirectStatus: parseRedirectStatus(stringValue(form, 'redirectStatus')),
      stripUrlHash: settings.links.stripUrlHash,
      allowedSchemes: settings.links.allowedSchemes,
      blockedHosts: settings.links.blockedHosts,
    };
    settings.api = {
      enabled: parseBoolean(form, 'apiGlobalEnabled'),
      allowCreate: parseBoolean(form, 'apiAllowCreate'),
      allowList: parseBoolean(form, 'apiAllowList'),
      allowStats: parseBoolean(form, 'apiAllowStats'),
      allowDelete: parseBoolean(form, 'apiAllowDelete'),
      allowUpdate: parseBoolean(form, 'apiAllowUpdate'),
    };

    return;
  }
  if (section === 'security') {
    settings.auth = {
      password: {
        minLength: numberValue(
          form,
          'passwordMinLength',
          settings.auth.password.minLength,
          8,
          128,
        ),
        requireLetters: parseBoolean(form, 'passwordRequireLetters'),
        requireNumbers: parseBoolean(form, 'passwordRequireNumbers'),
        requireSymbols: parseBoolean(form, 'passwordRequireSymbols'),
      },
      registration: {
        enabled: parseBoolean(form, 'registrationEnabled'),
      },
      accountRecovery: {
        resendVerificationDailyLimit: numberValue(
          form,
          'resendVerificationDailyLimit',
          settings.auth.accountRecovery.resendVerificationDailyLimit,
          0,
          1_000,
        ),
        passwordResetDailyLimit: numberValue(
          form,
          'passwordResetDailyLimit',
          settings.auth.accountRecovery.passwordResetDailyLimit,
          0,
          1_000,
        ),
      },
      emailVerification: mergeEmailSettings(form, settings),
    };
    settings.network = {
      trustProxyHeaders: parseBoolean(form, 'trustProxyHeaders'),
      proxyIpHeaders: parseProxyIpHeaders(stringValue(form, 'proxyIpHeaders')),
      geoip: parseGeoipSettings(form, settings.network.geoip),
      outboundProxy: parseOutboundProxySettings(
        form,
        settings.network.outboundProxy,
      ),
    };
    settings.links = {
      ...settings.links,
      stripUrlHash: parseBoolean(form, 'stripUrlHash'),
      allowedSchemes: parseSchemes(stringValue(form, 'allowedSchemes')),
      blockedHosts: parseLines(stringValue(form, 'blockedHosts'))
        .map(
          (host) =>
            host
              .toLowerCase()
              .replace(/^https?:\/\//, '')
              .split('/')[0],
        )
        .filter(Boolean),
    };
    settings.security = parseSecuritySettings(form, settings.security);
    return;
  }
  if (section === 'theme') {
    const preset = parseThemePreset(stringValue(form, 'preset'));
    const base = themePresets[preset];
    const tokens: ThemeTokens = {
      background: parseColor(stringValue(form, 'background'), base.background),
      surface: parseColor(stringValue(form, 'surface'), base.surface),
      text: parseColor(stringValue(form, 'text'), base.text),
      muted: parseColor(stringValue(form, 'muted'), base.muted),
      primary: parseColor(stringValue(form, 'primary'), base.primary),
      primaryContrast: parseColor(
        stringValue(form, 'primaryContrast'),
        base.primaryContrast,
      ),
      border: parseColor(stringValue(form, 'border'), base.border),
      radius: form.has('radius')
        ? numberValue(form, 'radius', base.radius, 0, 48)
        : base.radius,
      fontFamily: (
        stringValue(form, 'fontFamily', base.fontFamily) || base.fontFamily
      ).slice(0, 240),
    };

    const darkBase = darkThemeTokens({
      customTokens: tokens,
      darkTokens: settings.theme.darkTokens,
    });
    const darkTokens = Object.fromEntries(
      Object.entries(darkBase).map(([key, fallback]) => [
        key,
        parseColor(stringValue(form, `dark.${key}`, fallback), fallback),
      ]),
    ) as ThemeColors;
    settings.theme = {
      preset,
      mode: parseColorMode(stringValue(form, 'mode')),
      customTokens: tokens,
      darkTokens,
    };
    return;
  }
  if (section === 'resetTheme') {
    const preset = parseThemePreset(stringValue(form, 'preset'));
    settings.theme.customTokens = { ...themePresets[preset] };
    settings.theme.darkTokens = defaultDarkThemeTokens(
      settings.theme.customTokens,
    );
    settings.theme.preset = preset;
    return;
  }
}
