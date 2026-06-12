import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  isHttpHeaderName,
  parseHeaderRecord,
  parseSingleHeaderLine,
} from '$lib/delimited';
import {
  checkLinkHealth,
  countLinksByDomain,
  deleteLinks as deleteShortLinks,
  listLinksPage,
  updateLink as updateShortLink,
} from '$lib/server/shortener';
import {
  deleteLinksMessage,
  linkOperationsFromForm,
  linkPreviewFromForm,
  linkSelectionsFromForm,
} from '$lib/server/link-form';
import { parseLinkSearch } from '$lib/server/link-search';
import { DEFAULT_PAGE_SIZE, pageParam } from '$lib/server/pagination';
import { getClientIp } from '$lib/server/client-ip';
import { validateGeoipSettings } from '$lib/server/geoip';
import { getLinkOwner } from '$lib/server/link-owner';
import {
  canAccessAdminSection,
  canManageAdminSection,
  effectivePermissions,
  linkSettingsForPermissions,
  LINK_EDIT_FIELD_KEYS,
  LINK_OPTION_KEYS,
  type AdminSectionKey,
  type EffectivePermissions,
  type LinkEditField,
  type LinkOptionKey,
} from '$lib/server/permissions';
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
  updateSettings,
} from '$lib/server/settings';
import {
  defaultLocalizedContentFor,
  defaultGeoipSettings,
  defaultOutboundProxySettings,
  linkedLinkEditFieldPairs,
  linkedLinkOptionKeyPairs,
  redirectRuleConditionKeys,
  siteLocaleKeys,
  type LocalizedSiteContent,
  type SiteLocale,
  themePresets,
  type ThemeTokens,
} from '$lib/config';
import { localeFromValue } from '$lib/i18n';
import { parseOutboundProxyUrl } from '$lib/server/outbound-http';
import {
  formatText,
  localizeServerMessage,
  serverMessage,
  uiText,
} from '$lib/i18n/ui-text';
import {
  normalizeShortLinkDomain,
  normalizeShortLinkDomains,
  normalizeShortLinkDomainScheme,
  normalizeShortLinkDomainSettings,
  shortLinkLookupDomain,
  shortUrl,
} from '$lib/server/url';
import { clearPluginSessions } from '../../../plugins/auth-registry';

function parseColor(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function actionErrorMessage(
  cause: unknown,
  locale: SiteLocale,
  fallbackLocale: SiteLocale,
  fallback: string,
) {
  return cause instanceof Error
    ? localizeServerMessage(locale, cause.message, fallbackLocale)
    : fallback;
}

const sectionIds = {
  core: 'general',
  'link-and-api': 'links',
  theme: 'theme',
  plugins: 'plugins',
  links: 'data',
} as const;

async function permissionContext(input: {
  locals: App.Locals;
  request: Request;
  getClientAddress: () => string;
}) {
  const settings = input.locals.settings;
  const clientIp = getClientIp(
    input.request,
    input.getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  const permissions = await effectivePermissions({
    settings,
    user: input.locals.user,
    isAdmin: input.locals.isAdmin,
    ip: clientIp,
  });
  return { clientIp, permissions };
}

function requireAdminAccess(permissions: EffectivePermissions) {
  if (!permissions.admin.access) redirect(303, '/admin');
}

function requireSectionAccess(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
) {
  requireAdminAccess(permissions);
  if (!canAccessAdminSection(permissions, section)) redirect(303, '/admin');
}

function requireSectionManage(
  permissions: EffectivePermissions,
  section: AdminSectionKey,
  deniedMessage: string,
) {
  requireSectionAccess(permissions, section);
  if (!canManageAdminSection(permissions, section)) {
    throw new Error(deniedMessage);
  }
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

function parseGeoipSettings(form: FormData) {
  const settings = {
    enabled: parseBoolean(form, 'geoipEnabled'),
    headersEnabled: parseBoolean(form, 'geoipHeadersEnabled'),
    maxmindEnabled: parseBoolean(form, 'geoipMaxmindEnabled'),
    cityDatabasePath: stringValue(
      form,
      'geoipCityDatabasePath',
      defaultGeoipSettings.cityDatabasePath,
    ),
    countryDatabasePath: stringValue(
      form,
      'geoipCountryDatabasePath',
      defaultGeoipSettings.countryDatabasePath,
    ),
    asnDatabasePath: stringValue(
      form,
      'geoipAsnDatabasePath',
      defaultGeoipSettings.asnDatabasePath,
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

function parseOutboundProxySettings(form: FormData) {
  const enabled = parseBoolean(form, 'outboundProxyEnabled');
  const url = stringValue(
    form,
    'outboundProxyUrl',
    defaultOutboundProxySettings.url,
  ).slice(0, 1_000);
  if (enabled) parseOutboundProxyUrl(url);
  return { enabled, url };
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

export const load: PageServerLoad = async ({
  locals,
  url,
  params,
  cookies,
  request,
  getClientAddress,
}) => {
  if (!(params.section in sectionIds)) redirect(303, '/admin/core');
  const section = sectionIds[
    params.section as keyof typeof sectionIds
  ] as AdminSectionKey;
  const { clientIp, permissions } = await permissionContext({
    locals,
    request,
    getClientAddress,
  });
  requireSectionAccess(permissions, section);

  const search = parseLinkSearch(url);
  const currentOwner = getLinkOwner({
    cookies,
    userId: locals.user?.id,
    ip: clientIp,
  });
  const owner = permissions.links.viewAll ? undefined : currentOwner;
  const settings = await getSettings();
  const [linkPage, domainLinkCounts] = await Promise.all([
    listLinksPage(
      pageParam(url),
      DEFAULT_PAGE_SIZE,
      owner,
      search,
      currentOwner,
    ),
    countLinksByDomain(settings.general.domains),
  ]);

  return {
    authenticated: true as const,
    locale: locals.locale,
    section,
    settings,
    permissions,
    themePresets,
    search,
    links: linkPage.items.map((link) => ({
      ...link,
      short_url: shortUrl(url.origin, link.code, link.domain, settings),
    })),
    domainLinkCounts,
    pagination: {
      page: linkPage.page,
      pageSize: linkPage.pageSize,
      totalItems: linkPage.totalItems,
      totalPages: linkPage.totalPages,
    },
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const settings = await getSettings();
    await clearPluginSessions(cookies, settings.plugins);
    redirect(303, '/admin');
  },

  saveGeneral: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'general',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveGeneral',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    const settings = await getSettings();
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
    let shortLinkDomains: ReturnType<typeof parseShortLinkDomains>;

    try {
      shortLinkDomains = parseShortLinkDomains(
        form,
        settings.general.defaultDomain,
      );
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveGeneral',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.generalSettingsFailed,
        ),
      });
    }

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
    };
    settings.legal = defaultContent.legal;
    settings.i18n = {
      defaultLocale,
      locales,
    };
    settings.access.visibility =
      stringValue(form, 'visibility') === 'public' ? 'public' : 'private';
    try {
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
        emailVerification: mergeEmailSettings(form, settings),
      };
      settings.network.outboundProxy = parseOutboundProxySettings(form);
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveGeneral',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.generalSettingsFailed,
        ),
      });
    }

    await updateSettings(settings);
    return {
      ok: true,
      action: 'saveGeneral',
      message: text.admin.messages.generalSettingsSaved,
    };
  },

  saveLinks: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'links',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveLinks',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    const settings = await getSettings();
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
      healthAll: parseBoolean(form, 'healthAllLinks'),
      editableFields: linkEditFieldsFromForm(form),
      trackClicks: parseBoolean(form, 'trackClicks'),
      redirectStatus: parseRedirectStatus(stringValue(form, 'redirectStatus')),
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
    settings.api = {
      enabled: parseBoolean(form, 'apiGlobalEnabled'),
      allowCreate: parseBoolean(form, 'apiAllowCreate'),
      allowList: parseBoolean(form, 'apiAllowList'),
      allowStats: parseBoolean(form, 'apiAllowStats'),
      allowDelete: parseBoolean(form, 'apiAllowDelete'),
      allowUpdate: parseBoolean(form, 'apiAllowUpdate'),
    };
    try {
      settings.network = {
        trustProxyHeaders: parseBoolean(form, 'trustProxyHeaders'),
        proxyIpHeaders: parseProxyIpHeaders(
          stringValue(form, 'proxyIpHeaders'),
        ),
        geoip: parseGeoipSettings(form),
        outboundProxy:
          settings.network.outboundProxy ?? defaultOutboundProxySettings,
      };
    } catch (cause) {
      return fail(400, {
        ok: false,
        action: 'saveLinks',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.proxyHeadersFailed,
        ),
      });
    }

    await updateSettings(settings);
    return {
      ok: true,
      action: 'saveLinks',
      message: text.admin.messages.linksSettingsSaved,
    };
  },

  saveTheme: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'theme',
        text.admin.messages.sectionSaveDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'saveTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.sectionSaveDenied,
        ),
      });
    }
    const form = await request.formData();
    const settings = await getSettings();
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
      radius: numberValue(form, 'radius', base.radius, 0, 48),
      fontFamily: stringValue(form, 'fontFamily', base.fontFamily).slice(
        0,
        240,
      ),
    };

    settings.theme = {
      preset,
      mode: parseColorMode(stringValue(form, 'mode')),
      customTokens: tokens,
      customCss: String(form.get('customCss') ?? '').slice(0, 20000),
    };
    await updateSettings(settings);
    return {
      ok: true,
      action: 'saveTheme',
      message: text.admin.messages.themeSettingsSaved,
    };
  },

  resetTheme: async ({ request, locals, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    try {
      requireSectionManage(
        permissions,
        'theme',
        text.admin.messages.themeResetDenied,
      );
    } catch (cause) {
      return fail(403, {
        ok: false,
        action: 'resetTheme',
        message: actionErrorMessage(
          cause,
          locals.locale,
          locals.settings.i18n.defaultLocale,
          text.admin.messages.themeResetDenied,
        ),
      });
    }
    const form = await request.formData();
    const settings = await getSettings();
    const preset = parseThemePreset(stringValue(form, 'preset'));
    settings.theme.customTokens = { ...themePresets[preset] };
    settings.theme.preset = preset;
    settings.theme.customCss = '';
    await updateSettings(settings);
    return {
      ok: true,
      action: 'resetTheme',
      message: text.admin.messages.themeReset,
    };
  },

  deleteLink: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const links = linkSelectionsFromForm(form);
    if (links.length === 0) {
      return fail(400, {
        action: 'deleteLink',
        message: text.messages.deleteNeedsSelection,
      });
    }

    const result = await deleteShortLinks(links, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.deleteAll,
      owner: getLinkOwner({
        cookies,
        userId: locals.user?.id,
        ip: clientIp,
      }),
      allowUserDelete: permissions.links.deleteOwn,
      maxClicks: permissions.links.deleteMaxClicks,
    });
    if (result.deleted === 0) {
      return fail(404, {
        action: 'deleteLink',
        message:
          deleteLinksMessage(result, {
            includePolicyDetails: false,
            text: text.messages,
          }) || text.messages.linkNotFound,
      });
    }
    return {
      ok: true,
      action: 'deleteLink',
      message: deleteLinksMessage(result, {
        includePolicyDetails: false,
        text: text.messages,
      }),
    };
  },

  updateLink: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const settings = locals.settings;
    const code = stringValue(form, 'code');
    const domain = shortLinkLookupDomain(
      settings,
      stringValue(form, 'domain'),
      new URL(request.url).origin,
    );
    if (!code) {
      return fail(400, {
        action: 'updateLink',
        message: text.messages.editNeedsSelection,
      });
    }
    if (
      permissions.links.editableFields.length === 0 ||
      (!permissions.links.editAll && !permissions.links.editOwn)
    ) {
      return fail(403, {
        action: 'updateLink',
        message: text.admin.messages.linkEditDenied,
      });
    }

    try {
      const result = await updateShortLink(
        code,
        {
          url: stringValue(form, 'url'),
          preview: linkPreviewFromForm(form),
          operations: linkOperationsFromForm(form),
        },
        {
          isAdmin: locals.isAdmin,
          allowAnyOwner: permissions.links.editAll,
          editableFields: permissions.links.editableFields,
          linkSettings: linkSettingsForPermissions(settings.links, permissions),
          owner: getLinkOwner({
            cookies,
            userId: locals.user?.id,
            ip: clientIp,
          }),
          domain,
        },
      );

      if (result.status === 'not_found') {
        return fail(404, {
          action: 'updateLink',
          message: text.messages.linkNotFound,
        });
      }
      if (result.status === 'denied') {
        return fail(403, {
          action: 'updateLink',
          message: text.admin.messages.linkEditDenied,
        });
      }

      return {
        ok: true,
        action: 'updateLink',
        message: formatText(text.messages.linkEdited, {
          code: result.link.code,
        }),
      };
    } catch (error) {
      return fail(400, {
        action: 'updateLink',
        message:
          error instanceof Error ? error.message : text.messages.editFailed,
      });
    }
  },

  checkHealth: async ({ request, locals, cookies, getClientAddress }) => {
    const text = uiText(locals.locale, locals.settings.i18n.defaultLocale);
    const { clientIp, permissions } = await permissionContext({
      locals,
      request,
      getClientAddress,
    });
    requireSectionAccess(permissions, 'data');
    const form = await request.formData();
    const code = stringValue(form, 'code');
    const domain = shortLinkLookupDomain(
      locals.settings,
      stringValue(form, 'domain'),
      new URL(request.url).origin,
    );
    if (!code) {
      return fail(400, {
        action: 'checkHealth',
        message: text.messages.healthNeedsSelection,
      });
    }

    const result = await checkLinkHealth(code, {
      isAdmin: locals.isAdmin,
      allowAnyOwner: permissions.links.healthAll,
      siteSettings: locals.settings,
      domain,
      owner: getLinkOwner({
        cookies,
        userId: locals.user?.id,
        ip: clientIp,
      }),
    });
    if (result.status === 'not_found') {
      return fail(404, {
        action: 'checkHealth',
        message: text.messages.linkNotFound,
      });
    }
    if (result.status === 'denied') {
      return fail(403, {
        action: 'checkHealth',
        message: text.messages.healthOwnOnly,
      });
    }

    return {
      ok: true,
      action: 'checkHealth',
      message: formatText(text.messages.healthChecked, {
        code: result.link.code,
      }),
      healthResponseBody: result.link.health.responseBody,
      healthStatus: result.link.health.status,
      healthStatusCode: result.link.health.statusCode,
    };
  },
};
