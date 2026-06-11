<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { adminSections } from '$lib/admin-sections';
  import AdminShell from '$lib/components/AdminShell.svelte';
  import LocaleFieldSelector from '$lib/components/LocaleFieldSelector.svelte';
  import ManagedLinkList from '$lib/components/ManagedLinkList.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import {
    LINK_SEARCH_OPTIONS,
    LINK_SEARCH_PARAMS,
    searchPageHref,
    type LinkSearchState,
  } from '$lib/search';
  import {
    linkedLinkEditFieldPairs,
    linkedLinkOptionKeyPairs,
    siteLocaleKeys,
    siteLocaleLabel,
    themePresets as builtInThemePresets,
    type ColorMode,
    type EmailHttpAuthMode,
    type EmailProvider,
    type LinkEditFieldKey,
    type LinkOptionKey,
    type SiteLocale,
    type SiteSettings,
    type ThemePreset,
    type ThemeTokens,
  } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import { localizedPluginMeta } from '$lib/i18n/plugin';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import { adminPluginRegistry } from '../../../plugins/admin-registry';

  type AdminLink = {
    id: number;
    code: string;
    url: string;
    preview: {
      title: string;
      description: string;
      imageUrl: string;
      themeColor: string;
    };
    tags: string[];
    short_url: string;
    owned?: boolean;
    clicks: number;
    created_at: string;
    smart: {
      expiresAt: string | null;
      maxClicks: number;
      passwordProtected: boolean;
    };
    routing: {
      mobileUrl: string;
      desktopUrl: string;
      abUrl: string;
      abPercent: number;
    };
    health: {
      status: 'unchecked' | 'ok' | 'warning' | 'broken';
      statusCode: number | null;
      checkedAt: string | null;
      error: string;
      latencyMs: number | null;
    };
  };

  type AdminData = {
    authenticated: true;
    locale: SiteLocale;
    section: string;
    settings: SiteSettings;
    permissions: {
      isAdmin: boolean;
      links: {
        deleteOwn: boolean;
        deleteAll: boolean;
        deleteMaxClicks: number;
        editOwn: boolean;
        viewAll: boolean;
        editAll: boolean;
        editableFields: LinkEditFieldKey[];
      };
      admin: {
        sections: string[];
        plugins: string[];
      };
    };
    themePresets: Record<ThemePreset, ThemeTokens>;
    search: LinkSearchState;
    links: AdminLink[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };

  type ActionResult = { ok?: boolean; action?: string; message?: string };
  type SettingsTextKey = keyof ReturnType<typeof uiText>['admin']['settings'];

  let { data, form }: { data: AdminData; form?: ActionResult } = $props();
  const activeSection = $derived(data.authenticated ? data.section : 'general');
  const text = $derived(uiText(data.locale, data.settings.i18n.defaultLocale));
  const linkPermissionDefaults = [
    ['allowLinkCreate', 'allowLinkCreate'],
    ['allowUserDelete', 'allowUserDelete'],
    ['editOwnLinks', 'editOwnLinks'],
    ['viewAllLinks', 'viewAllLinks'],
    ['editAllLinks', 'editAllLinks'],
    ['deleteAllLinks', 'deleteAllLinks'],
    ['statsAllLinks', 'statsAllLinks'],
    ['healthAllLinks', 'healthAllLinks'],
  ] as const;
  const linkOptionDefaults = [
    ['customCode', 'customCode'],
    ['previewTitle', 'previewTitle'],
    ['previewDescription', 'previewDescriptionLabel'],
    ['previewImageUrl', 'previewImageUrl'],
    ['themeColor', 'themeColor'],
    ['utmSource', 'utmSource'],
    ['utmMedium', 'utmMedium'],
    ['utmCampaign', 'utmCampaign'],
    ['utmTerm', 'utmTerm'],
    ['utmContent', 'utmContent'],
    ['expiresAt', 'expirationDate'],
    ['maxClicks', 'maxClicks'],
    ['password', 'password'],
    ['tags', 'tags'],
    ['mobileUrl', 'mobileDestination'],
    ['desktopUrl', 'desktopDestination'],
    ['abUrl', 'abDestination'],
    ['abPercent', 'abPercentage'],
  ] as const;
  const editableFieldDefaults = [
    ['url', 'destinationUrl'],
    ['previewTitle', 'previewTitle'],
    ['previewDescription', 'previewDescriptionLabel'],
    ['previewImageUrl', 'previewImageUrl'],
    ['themeColor', 'themeColor'],
    ['utmSource', 'utmSource'],
    ['utmMedium', 'utmMedium'],
    ['utmCampaign', 'utmCampaign'],
    ['utmTerm', 'utmTerm'],
    ['utmContent', 'utmContent'],
    ['expiresAt', 'expirationDate'],
    ['maxClicks', 'maxClicks'],
    ['password', 'password'],
    ['tags', 'tags'],
    ['mobileUrl', 'mobileDestination'],
    ['desktopUrl', 'desktopDestination'],
    ['abUrl', 'abDestination'],
    ['abPercent', 'abPercentage'],
  ] as const;
  const localePanels = $derived(siteLocaleKeys.map((id) => ({
    id,
    label: siteLocaleLabel(id),
    note:
      id === data.settings.i18n.defaultLocale
        ? text.admin.settings.defaultLocaleNote
        : id,
  })));
  let brandContentLocale = $state<SiteLocale>(siteLocaleKeys[0]);
  let searchContentLocale = $state<SiteLocale>(siteLocaleKeys[0]);
  let legalContentLocale = $state<SiteLocale>(siteLocaleKeys[0]);
  let contentLocalesInitialized = $state(false);
  const brandContent = $derived(
    data.settings.i18n.locales[brandContentLocale] ??
      data.settings.i18n.locales[data.settings.i18n.defaultLocale],
  );
  const searchContent = $derived(
    data.settings.i18n.locales[searchContentLocale] ??
      data.settings.i18n.locales[data.settings.i18n.defaultLocale],
  );
  const legalContent = $derived(
    data.settings.i18n.locales[legalContentLocale] ??
      data.settings.i18n.locales[data.settings.i18n.defaultLocale],
  );

  function linkPermissionChecked(
    name: (typeof linkPermissionDefaults)[number][0],
  ) {
    if (name === 'allowLinkCreate') return data.settings.links.allowCreate;
    if (name === 'allowUserDelete') return data.settings.links.allowUserDelete;
    if (name === 'editOwnLinks') return data.settings.links.editOwn;
    if (name === 'viewAllLinks') return data.settings.links.viewAll;
    if (name === 'editAllLinks') return data.settings.links.editAll;
    if (name === 'deleteAllLinks') return data.settings.links.deleteAll;
    if (name === 'statsAllLinks') return data.settings.links.statsAll;
    return data.settings.links.healthAll;
  }

  function getInitialTheme() {
    return data.authenticated ? data.settings.theme : null;
  }

  function getInitialEmailProvider() {
    return data.settings.auth.emailVerification.provider;
  }

  function getInitialEmailHttpAuthMode() {
    return data.settings.auth.emailVerification.http.authMode;
  }

  function getInitialApiSettings() {
    return data.settings.api;
  }

  const initialTheme = getInitialTheme();
  const initialApi = getInitialApiSettings();
  let selectedPreset = $state<ThemePreset>(initialTheme?.preset ?? 'emerald');
  let selectedMode = $state<ColorMode>(initialTheme?.mode ?? 'light');
  let themeDraft = $state<ThemeTokens>({
    ...(initialTheme?.customTokens ?? builtInThemePresets.emerald),
  });
  let customCssDraft = $state(initialTheme?.customCss ?? '');
  let emailProvider = $state<EmailProvider>(getInitialEmailProvider());
  let emailHttpAuthMode = $state<EmailHttpAuthMode>(
    getInitialEmailHttpAuthMode(),
  );
  let apiGlobalEnabled = $state(initialApi.enabled);
  let apiAllowCreate = $state(initialApi.allowCreate);
  let apiAllowList = $state(initialApi.allowList);
  let apiAllowStats = $state(initialApi.allowStats);
  let apiAllowDelete = $state(initialApi.allowDelete);
  let apiAllowUpdate = $state(initialApi.allowUpdate);

  function linkedOptionKeys(key: LinkOptionKey) {
    for (const [left, right] of linkedLinkOptionKeyPairs) {
      if (left === key || right === key) return [left, right] as const;
    }
    return [key] as const;
  }

  function linkedEditFieldKeys(key: LinkEditFieldKey) {
    for (const [left, right] of linkedLinkEditFieldPairs) {
      if (left === key || right === key) return [left, right] as const;
    }
    return [key] as const;
  }

  function formCheckbox(form: HTMLFormElement, name: string, value?: string) {
    return Array.from(form.elements).find(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement &&
        element.type === 'checkbox' &&
        element.name === name &&
        (value === undefined || element.value === value),
    );
  }

  function setAllApiCapabilities(checked: boolean) {
    apiGlobalEnabled = checked;
    apiAllowCreate = checked;
    apiAllowList = checked;
    apiAllowStats = checked;
    apiAllowDelete = checked;
    apiAllowUpdate = checked;
  }

  function syncLinkedLinkOptionCheckbox(
    event: Event & { currentTarget: HTMLInputElement },
    key: LinkOptionKey,
  ) {
    const form = event.currentTarget.form;
    if (!form) return;
    for (const linkedKey of linkedOptionKeys(key)) {
      const checkbox = formCheckbox(form, `linkOption.${linkedKey}`);
      if (checkbox) checkbox.checked = event.currentTarget.checked;
    }
  }

  function syncLinkedEditableFieldCheckbox(
    event: Event & { currentTarget: HTMLInputElement },
    key: LinkEditFieldKey,
  ) {
    const form = event.currentTarget.form;
    if (!form) return;
    for (const linkedKey of linkedEditFieldKeys(key)) {
      const checkbox = formCheckbox(form, 'editableFields', linkedKey);
      if (checkbox) checkbox.checked = event.currentTarget.checked;
    }
  }

  $effect(() => {
    if (!data.authenticated) return;
    if (!contentLocalesInitialized) {
      brandContentLocale = data.settings.i18n.defaultLocale;
      searchContentLocale = data.settings.i18n.defaultLocale;
      legalContentLocale = data.settings.i18n.defaultLocale;
      contentLocalesInitialized = true;
    }
    if (!siteLocaleKeys.includes(brandContentLocale)) {
      brandContentLocale = data.settings.i18n.defaultLocale;
    }
    if (!siteLocaleKeys.includes(searchContentLocale)) {
      searchContentLocale = data.settings.i18n.defaultLocale;
    }
    if (!siteLocaleKeys.includes(legalContentLocale)) {
      legalContentLocale = data.settings.i18n.defaultLocale;
    }
    selectedPreset = data.settings.theme.preset;
    selectedMode = data.settings.theme.mode;
    themeDraft = { ...data.settings.theme.customTokens };
    customCssDraft = data.settings.theme.customCss;
    emailProvider = data.settings.auth.emailVerification.provider;
    emailHttpAuthMode = data.settings.auth.emailVerification.http.authMode;
    apiGlobalEnabled = data.settings.api.enabled;
    apiAllowCreate = data.settings.api.allowCreate;
    apiAllowList = data.settings.api.allowList;
    apiAllowStats = data.settings.api.allowStats;
    apiAllowDelete = data.settings.api.allowDelete;
    apiAllowUpdate = data.settings.api.allowUpdate;
  });

  const colorTokens: Array<
    [
      keyof Pick<
        ThemeTokens,
        | 'background'
        | 'surface'
        | 'text'
        | 'muted'
        | 'primary'
        | 'primaryContrast'
        | 'border'
      >,
      SettingsTextKey,
    ]
  > = [
    ['background', 'backgroundColor'],
    ['surface', 'surfaceColor'],
    ['text', 'textColor'],
    ['muted', 'mutedColor'],
    ['primary', 'primaryColor'],
    ['primaryContrast', 'primaryContrastColor'],
    ['border', 'borderColor'],
  ];

  const themePreviewStyle = $derived(
    [
      `--preview-bg:${themeDraft.background}`,
      `--preview-surface:${themeDraft.surface}`,
      `--preview-text:${themeDraft.text}`,
      `--preview-muted:${themeDraft.muted}`,
      `--preview-primary:${themeDraft.primary}`,
      `--preview-primary-contrast:${themeDraft.primaryContrast}`,
      `--preview-border:${themeDraft.border}`,
      `--preview-radius:${themeDraft.radius}px`,
      `--preview-font:${themeDraft.fontFamily}`,
    ].join(';'),
  );
  function applyPreset(event: Event) {
    if (!data.authenticated) return;
    const preset = (event.currentTarget as HTMLSelectElement)
      .value as ThemePreset;
    selectedPreset = preset;
    themeDraft = { ...data.themePresets[preset] };
  }

  function adminLinksPageHref(page: number) {
    return resolve(searchPageHref('/admin/links', data.search, page) as '/');
  }

  function adminLinkStatsHref(code: string) {
    return resolve(
      `/${code}/statistics?returnTo=${encodeURIComponent(
        adminLinksPageHref(data.pagination.page),
      )}`,
    );
  }

  const allowedAdminSections = $derived(
    data.permissions.isAdmin
      ? adminSections
      : adminSections.filter((section) =>
          data.permissions.admin.sections.includes(section.id),
        ),
  );

  function canDeleteAdminLink(link: { clicks: number; owned?: boolean }) {
    if (data.permissions.links.deleteAll) return true;
    return (
      data.permissions.links.deleteOwn &&
      (!data.permissions.links.viewAll || link.owned === true) &&
      (data.permissions.links.deleteMaxClicks <= 0 ||
        link.clicks <= data.permissions.links.deleteMaxClicks)
    );
  }

  function canEditAdminLink(link: { owned?: boolean }) {
    return (
      data.permissions.links.editableFields.length > 0 &&
      (data.permissions.links.editAll ||
        (data.permissions.links.editOwn &&
          (!data.permissions.links.viewAll || link.owned === true)))
    );
  }

  function canViewPlugin(pluginId: string) {
    return (
      data.permissions.isAdmin ||
      data.permissions.admin.plugins.includes('*') ||
      data.permissions.admin.plugins.includes(pluginId) ||
      pluginId === 'permission-management'
    );
  }

  const activeSectionLabel = $derived(
    text.admin.sections[activeSection as keyof typeof text.admin.sections] ??
      text.admin.fallbackTitle,
  );
</script>

<svelte:head>
  <title>{activeSectionLabel} · {data.settings.general.siteName}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<AdminShell
  siteName={data.settings.general.siteName}
  logoUrl={data.settings.general.logoUrl}
  theme={data.settings.theme}
  locale={data.locale}
  {activeSection}
  title={activeSectionLabel}
  sections={allowedAdminSections}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} locale={data.locale} />
    {/key}
  {/if}

  {#if activeSection === 'general'}
    <form
      class="settings-form"
      method="POST"
      action="?/saveGeneral"
      use:enhance={keepFormValues}
    >
      <section class="setting-card">
        <div class="card-copy">
          <p class="step">01</p>
          <h2>{text.admin.settings.accessPolicyTitle}</h2>
          <p>{text.admin.settings.accessPolicyDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label class="wide">
            {text.admin.settings.linkCreationAccess}
            <select name="visibility" value={data.settings.access.visibility}>
              <option value="private">{text.admin.settings.privateVisibility}</option>
              <option value="public">{text.admin.settings.publicVisibility}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">02</p>
          <h2>{text.admin.settings.brandContentTitle}</h2>
          <p>{text.admin.settings.brandContentDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label>
            {text.admin.settings.defaultLanguage}
            <select name="defaultLocale" value={data.settings.i18n.defaultLocale}>
              {#each siteLocaleKeys as locale (locale)}
                <option value={locale}>{siteLocaleLabel(locale)}</option>
              {/each}
            </select>
            <small>{text.admin.settings.defaultLanguageHelp}</small>
          </label>
          <label
            >{text.admin.settings.logoUrl} <input
              name="logoUrl"
              value={data.settings.general.logoUrl}
            /></label
          >
          <label
            >{text.admin.settings.faviconUrl} <input
              name="faviconUrl"
              value={data.settings.general.faviconUrl}
            /></label
          >
          <div class="wide">
            <LocaleFieldSelector
              bind:activeLocale={brandContentLocale}
              label={text.admin.settings.contentLanguage}
              options={localePanels}
            />
          </div>
          {#key brandContentLocale}
            <div class="wide locale-panel">
                <label
                  >{text.admin.settings.siteName} <input
                    name={`${brandContentLocale}SiteName`}
                    value={brandContent.general.siteName}
                  /></label
                >
                <label
                  >{text.admin.settings.eyebrow} <input
                    name={`${brandContentLocale}Eyebrow`}
                    value={brandContent.general.eyebrow}
                  /></label
                >
                <label class="wide"
                  >{text.admin.settings.headline}
                  <textarea name={`${brandContentLocale}Headline`} rows="2"
                    >{brandContent.general.headline}</textarea
                  ></label
                >
                <label class="wide"
                  >{text.admin.settings.description}
                  <textarea name={`${brandContentLocale}Description`} rows="3"
                    >{brandContent.general.description}</textarea
                  ></label
                >
                <label
                  >{text.admin.settings.footerText} <input
                    name={`${brandContentLocale}FooterText`}
                    value={brandContent.general.footerText}
                  /></label
                >
            </div>
          {/key}
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">03</p>
          <h2>{text.admin.settings.searchSharingTitle}</h2>
          <p>{text.admin.settings.searchSharingDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label
            >{text.admin.settings.ogImageUrl} <input
              name="ogImageUrl"
              value={data.settings.seo.ogImageUrl}
            /></label
          >
          <div class="wide">
            <ToggleField
              name="indexable"
              label={text.admin.settings.indexable}
              checked={data.settings.seo.indexable}
            />
          </div>
          <div class="wide">
            <LocaleFieldSelector
              bind:activeLocale={searchContentLocale}
              label={text.admin.settings.contentLanguage}
              options={localePanels}
            />
          </div>
          {#key searchContentLocale}
            <div class="wide locale-panel">
                <label
                  >{text.admin.settings.seoTitle} <input
                    name={`${searchContentLocale}SeoTitle`}
                    value={searchContent.seo.title}
                  /></label
                >
                <label class="wide"
                  >{text.admin.settings.seoDescription}
                  <textarea name={`${searchContentLocale}SeoDescription`} rows="3"
                    >{searchContent.seo.description}</textarea
                  ></label
                >
            </div>
          {/key}
          <label class="wide"
            >{text.admin.settings.robotsTxt}
            <small>{text.admin.settings.robotsTxtHelp}</small>
            <textarea class="code" name="robotsTxt" rows="8"
              >{data.settings.seo.robotsTxt}</textarea
            ></label
          >
        </div>
      </section>
      <section class="setting-card">
        <div class="card-copy">
          <p class="step">04</p>
          <h2>{text.admin.settings.legalDocumentsTitle}</h2>
          <p>{text.admin.settings.legalDocumentsDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <div class="wide">
            <LocaleFieldSelector
              bind:activeLocale={legalContentLocale}
              label={text.admin.settings.contentLanguage}
              options={localePanels}
            />
          </div>
          {#key legalContentLocale}
            <div class="wide locale-panel legal-locale-panel">
                <label>
                  {text.admin.settings.termsTitle}
                  <input
                    name={`${legalContentLocale}TermsTitle`}
                    value={legalContent.legal.termsTitle}
                  />
                </label>
                <label>
                  {text.admin.settings.privacyTitle}
                  <input
                    name={`${legalContentLocale}PrivacyTitle`}
                    value={legalContent.legal.privacyTitle}
                  />
                </label>
                <label class="wide">
                  {text.admin.settings.termsContent}
                  <textarea name={`${legalContentLocale}TermsContent`} rows="12"
                    >{legalContent.legal.termsContent}</textarea
                  >
                </label>
                <label class="wide">
                  {text.admin.settings.privacyContent}
                  <textarea name={`${legalContentLocale}PrivacyContent`} rows="12"
                    >{legalContent.legal.privacyContent}</textarea
                  >
                </label>
            </div>
          {/key}
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">05</p>
          <h2>{text.admin.settings.signupPasswordTitle}</h2>
          <p>{text.admin.settings.signupPasswordDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <div class="wide">
            <ToggleField
              name="registrationEnabled"
              label={text.admin.settings.registrationEnabled}
              checked={data.settings.auth.registration.enabled}
            />
          </div>
          <label
            >{text.admin.settings.passwordMinLength}
            <input
              type="number"
              name="passwordMinLength"
              min="8"
              max="128"
              value={data.settings.auth.password.minLength}
            /></label
          >
          <div></div>
          <div class="wide">
            <ToggleField
              name="passwordRequireLetters"
              label={text.admin.settings.passwordRequireLetters}
              checked={data.settings.auth.password.requireLetters}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="passwordRequireNumbers"
              label={text.admin.settings.passwordRequireNumbers}
              checked={data.settings.auth.password.requireNumbers}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="passwordRequireSymbols"
              label={text.admin.settings.passwordRequireSymbols}
              checked={data.settings.auth.password.requireSymbols}
            />
          </div>
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">06</p>
          <h2>{text.admin.settings.emailVerificationTitle}</h2>
          <p>{text.admin.settings.emailVerificationDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <div class="wide">
            <ToggleField
              name="emailVerificationEnabled"
              label={text.admin.settings.emailVerificationEnabled}
              checked={data.settings.auth.emailVerification.enabled}
            />
          </div>
          <label
            >{text.admin.settings.emailProvider}
            <select name="emailProvider" bind:value={emailProvider}>
              <option value="smtp">SMTP</option>
              <option value="http">RESTful HTTP API</option>
            </select>
          </label>
          <label
            >{text.admin.settings.emailTokenTtlHours}
            <input
              type="number"
              name="emailTokenTtlHours"
              min="1"
              max="720"
              value={data.settings.auth.emailVerification.tokenTtlHours}
            /></label
          >
          <label
            >{text.admin.settings.emailTimeoutMs}
            <small>{text.admin.settings.emailTimeoutHelp}</small>
            <input
              type="number"
              name="emailTimeoutMs"
              min="1000"
              max="120000"
              step="500"
              value={data.settings.auth.emailVerification.timeoutMs}
            /></label
          >
          <label
            >{text.admin.settings.emailFromEmail}
            <input
              name="emailFromEmail"
              type="email"
              value={data.settings.auth.emailVerification.fromEmail}
              placeholder="noreply@example.com"
            /></label
          >
          <label
            >{text.admin.settings.emailFromName}
            <input
              name="emailFromName"
              value={data.settings.auth.emailVerification.fromName}
              placeholder={data.settings.general.siteName}
            /></label
          >
          {#if emailProvider === 'smtp'}
            <label
              >{text.admin.settings.smtpHost}
              <input
                name="smtpHost"
                value={data.settings.auth.emailVerification.smtp.host}
                placeholder="smtp.example.com"
              /></label
            >
            <label
              >{text.admin.settings.smtpPort}
              <input
                type="number"
                name="smtpPort"
                min="1"
                max="65535"
                value={data.settings.auth.emailVerification.smtp.port}
              /></label
            >
            <label
              >{text.admin.settings.smtpUsername}
              <input
                name="smtpUsername"
                value={data.settings.auth.emailVerification.smtp.username}
              /></label
            >
            <label
              >{text.admin.settings.smtpPassword}
              <small>{text.admin.settings.keepExisting}</small>
              <input
                name="smtpPassword"
                type="password"
                placeholder={text.admin.settings.changeOnlyPlaceholder}
              /></label
            >
            <div class="wide">
              <ToggleField
                name="smtpSecure"
                label={text.admin.settings.smtpSecure}
                checked={data.settings.auth.emailVerification.smtp.secure}
              />
            </div>
          {:else}
            <label class="wide"
              >{text.admin.settings.httpApiEndpoint}
              <input
                name="emailHttpEndpoint"
                type="url"
                value={data.settings.auth.emailVerification.http.endpoint}
                placeholder="https://api.example.com/send"
              /></label
            >
            <label
              >{text.admin.settings.httpMethod}
              <select
                name="emailHttpMethod"
                value={data.settings.auth.emailVerification.http.method}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label
              >{text.admin.settings.httpAuthMode}
              <select name="emailHttpAuthMode" bind:value={emailHttpAuthMode}>
                <option value="none">{text.admin.settings.httpAuthNone}</option>
                <option value="authorization"
                  >{text.admin.settings.httpAuthAuthorization}</option
                >
                <option value="basic">{text.admin.settings.httpAuthBasic}</option>
                <option value="headers">{text.admin.settings.httpAuthHeaders}</option>
              </select>
            </label>
            {#if emailHttpAuthMode === 'authorization'}
              <label class="wide"
                >{text.admin.settings.authorizationHeaderValue}
                <input
                  name="emailHttpAuthorizationHeader"
                  type="password"
                  placeholder={text.admin.settings.authorizationHeaderPlaceholder}
                /></label
              >
            {:else if emailHttpAuthMode === 'basic'}
              <label
                >{text.admin.settings.basicAuthId}
                <input
                  name="emailHttpBasicUsername"
                  value={data.settings.auth.emailVerification.http
                    .basicUsername}
                /></label
              >
              <label
                >{text.admin.settings.basicAuthPassword}
                <small>{text.admin.settings.keepExisting}</small>
                <input
                  name="emailHttpBasicPassword"
                  type="password"
                  placeholder={text.admin.settings.changeOnlyPlaceholder}
                /></label
              >
            {:else if emailHttpAuthMode === 'headers'}
              <label class="wide"
                >{text.admin.settings.customAuthHeader}
                <small>{text.admin.settings.customAuthHeaderHelp}</small>
                <input
                  name="emailHttpAuthHeaders"
                  type="password"
                  placeholder={text.admin.settings.customAuthHeaderPlaceholder}
                /></label
              >
            {/if}
            <label class="wide"
              >{text.admin.settings.httpExtraHeaders}
              <small>{text.admin.settings.httpExtraHeadersHelp}</small>
              <textarea name="emailHttpHeaders" rows="4"
                >{data.settings.auth.emailVerification.http.headers}</textarea
              ></label
            >
          {/if}
        </div>
      </section>
      <div class="savebar">
        <button type="submit">{text.admin.settings.saveGeneral}</button>
      </div>
    </form>
  {:else if activeSection === 'links'}
    <form
      class="settings-form"
      method="POST"
      action="?/saveLinks"
      use:enhance={keepFormValues}
    >
      <section class="setting-card">
        <div class="card-copy">
          <p class="step">01</p>
          <h2>{text.admin.settings.linkPermissionTitle}</h2>
          <p>{text.admin.settings.linkPermissionDescription}</p>
        </div>
        <div class="fields form-grid balanced checkbox-grid">
          {#each linkPermissionDefaults as permission (permission[0])}
            <div class="wide">
              <ToggleField
                name={permission[0]}
                label={text.admin.settings[permission[1]]}
                checked={linkPermissionChecked(permission[0])}
              />
            </div>
          {/each}
          <label
            >{text.admin.settings.userDeleteMaxClicks}
            <small>{text.admin.settings.noLimitZero}</small>
            <input
              type="number"
              name="userDeleteMaxClicks"
              min="0"
              value={data.settings.links.userDeleteMaxClicks}
            /></label
          >
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">02</p>
          <h2>{text.admin.settings.codeRulesTitle}</h2>
          <p>{text.admin.settings.codeRulesDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label
            >{text.admin.settings.minLength}
            <input
              type="number"
              name="codeMinLength"
              value={data.settings.links.codeMinLength}
            /></label
          >
          <label
            >{text.admin.settings.maxLength}
            <input
              type="number"
              name="codeMaxLength"
              value={data.settings.links.codeMaxLength}
            /></label
          >
          <label
            >{text.admin.settings.generatedCodeLength}
            <input
              type="number"
              name="generatedCodeLength"
              value={data.settings.links.generatedCodeLength}
            /></label
          >
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">03</p>
          <h2>{text.admin.settings.linkOptionsTitle}</h2>
          <p>{text.admin.settings.linkOptionsDescription}</p>
        </div>
        <div class="fields form-grid balanced checkbox-grid">
          {#each linkOptionDefaults as option (option[0])}
            <div class="wide">
              <ToggleField
                name={`linkOption.${option[0]}`}
                label={text.admin.settings[option[1]]}
                checked={data.settings.links.options[option[0]]}
                onchange={(event) =>
                  syncLinkedLinkOptionCheckbox(event, option[0])}
              />
            </div>
          {/each}
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">04</p>
          <h2>{text.admin.settings.editableFieldsTitle}</h2>
          <p>{text.admin.settings.editableFieldsDescription}</p>
        </div>
        <div class="fields form-grid balanced checkbox-grid">
          {#each editableFieldDefaults as field (field[0])}
            <div class="wide">
              <ToggleField
                name="editableFields"
                value={field[0]}
                label={text.admin.settings[field[1]]}
                checked={data.settings.links.editableFields.includes(field[0])}
                onchange={(event) =>
                  syncLinkedEditableFieldCheckbox(event, field[0])}
              />
            </div>
          {/each}
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">05</p>
          <h2>{text.admin.settings.redirectSecurityTitle}</h2>
          <p>{text.admin.settings.redirectSecurityDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label
            >{text.admin.settings.redirectStatus}
            <select
              name="redirectStatus"
              value={String(data.settings.links.redirectStatus)}
            >
              <option value="301"
                >{formatText(text.admin.settings.permanentRedirect, {
                  code: 301,
                })}</option
              >
              <option value="302"
                >{formatText(text.admin.settings.temporaryRedirect, {
                  code: 302,
                })}</option
              >
              <option value="307"
                >{formatText(text.admin.settings.temporaryRedirect, {
                  code: 307,
                })}</option
              >
              <option value="308"
                >{formatText(text.admin.settings.permanentRedirect, {
                  code: 308,
                })}</option
              >
            </select>
          </label>
          <div></div>
          <div class="wide">
            <ToggleField
              name="trackClicks"
              label={text.admin.settings.trackClicks}
              checked={data.settings.links.trackClicks}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="trustProxyHeaders"
              label={text.admin.settings.trustProxyHeaders}
              checked={data.settings.network.trustProxyHeaders}
            />
          </div>
          <label class="wide"
            >{text.admin.settings.proxyIpHeaders}
            <textarea name="proxyIpHeaders" rows="5"
              >{data.settings.network.proxyIpHeaders.join('\n')}</textarea
            ></label
          >
          <div class="wide">
            <ToggleField
              name="stripUrlHash"
              label={text.admin.settings.stripUrlHash}
              checked={data.settings.links.stripUrlHash}
            />
          </div>
          <label class="wide"
            >{text.admin.settings.allowedSchemes}
            <textarea name="allowedSchemes" rows="4"
              >{data.settings.links.allowedSchemes.join('\n')}</textarea
            ></label
          >
          <label class="wide"
            >{text.admin.settings.blockedHosts}
            <textarea name="blockedHosts" rows="5"
              >{data.settings.links.blockedHosts.join('\n')}</textarea
            ></label
          >
        </div>
      </section>

      <section class="setting-card">
        <div class="card-copy">
          <p class="step">06</p>
          <h2>{text.admin.settings.apiTitle}</h2>
          <p>{text.admin.settings.apiDescription}</p>
        </div>
        <div class="fields form-grid balanced checkbox-grid">
          <div class="wide">
            <ToggleField
              name="apiGlobalEnabled"
              label={text.admin.settings.apiGlobalEnabled}
              bind:checked={apiGlobalEnabled}
              onchange={(event) =>
                setAllApiCapabilities(event.currentTarget.checked)}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="apiAllowCreate"
              label={text.admin.settings.apiAllowCreate}
              bind:checked={apiAllowCreate}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="apiAllowList"
              label={text.admin.settings.apiAllowList}
              bind:checked={apiAllowList}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="apiAllowStats"
              label={text.admin.settings.apiAllowStats}
              bind:checked={apiAllowStats}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="apiAllowDelete"
              label={text.admin.settings.apiAllowDelete}
              bind:checked={apiAllowDelete}
            />
          </div>
          <div class="wide">
            <ToggleField
              name="apiAllowUpdate"
              label={text.admin.settings.apiAllowUpdate}
              bind:checked={apiAllowUpdate}
            />
          </div>
        </div>
      </section>
      <div class="savebar">
        <button type="submit">{text.admin.settings.saveLinks}</button>
      </div>
    </form>
  {:else if activeSection === 'theme'}
    <form
      class="settings-form"
      method="POST"
      action="?/saveTheme"
      use:enhance={keepFormValues}
    >
      <section class="setting-card">
        <div class="card-copy">
          <p class="step">01</p>
          <h2>{text.admin.settings.themePresetTitle}</h2>
          <p>{text.admin.settings.themePresetDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label
            >{text.admin.settings.preset}
            <select name="preset" value={selectedPreset} onchange={applyPreset}>
              {#each Object.keys(data.themePresets) as preset (preset)}
                <option value={preset}>{preset}</option>
              {/each}
            </select>
          </label>
          <label
            >{text.admin.settings.colorMode}
            <select name="mode" bind:value={selectedMode}>
              <option value="light">{text.admin.settings.lightMode}</option>
              <option value="dark">{text.admin.settings.darkMode}</option>
              <option value="system">{text.admin.settings.systemMode}</option>
            </select>
          </label>
          {#each colorTokens as token (token[0])}
            <label
              >{text.admin.settings[token[1]]}
              <input
                type="color"
                name={token[0]}
                bind:value={themeDraft[token[0]]}
              /></label
            >
          {/each}
          <label
            >{text.admin.settings.radius}
            <input
              type="number"
              name="radius"
              min="0"
              max="48"
              bind:value={themeDraft.radius}
            /></label
          >
          <label class="wide"
            >{text.admin.settings.fontFamily}
            <input
              name="fontFamily"
              bind:value={themeDraft.fontFamily}
            /></label
          >
          <div
            class="theme-preview wide"
            data-preview-mode={selectedMode}
            style={themePreviewStyle}
            aria-label={text.admin.settings.themePreview}
          >
            <div>
              <span>{text.admin.settings.livePreview}</span>
              <strong>{text.admin.settings.previewHeadline}</strong>
              <p>{text.admin.settings.previewDescription}</p>
              <button type="button">{text.admin.settings.previewButton}</button>
            </div>
          </div>
        </div>
      </section>
      <section class="setting-card">
        <div class="card-copy">
          <p class="step">02</p>
          <h2>{text.admin.settings.advancedCssTitle}</h2>
          <p>{text.admin.settings.advancedCssDescription}</p>
        </div>
        <div class="fields form-grid balanced">
          <label class="wide"
            >{text.admin.settings.customCss}
            <textarea
              class="code"
              name="customCss"
              rows="12"
              bind:value={customCssDraft}
            ></textarea></label
          >
        </div>
      </section>
      <div class="savebar split">
        <button type="submit" formaction="?/resetTheme" class="ghost"
          >{text.admin.settings.resetPreset}</button
        >
        <button type="submit">{text.admin.settings.saveTheme}</button>
      </div>
    </form>
  {:else if activeSection === 'plugins'}
    <section class="plugin-grid">
      {#each adminPluginRegistry.filter( (plugin) => canViewPlugin(plugin.definition.meta.id), ) as plugin (plugin.definition.meta.id)}
        {@const meta = localizedPluginMeta(
          plugin.definition,
          data.locale,
          data.settings.i18n.defaultLocale,
        )}
        {@const state = data.settings.plugins[meta.id]}
        <article class="plugin-card">
          <div class="plugin-heading">
            <div>
              <span>
                {meta.required
                  ? text.admin.plugins.requiredCore
                  : meta.category.toUpperCase()} · v{meta.version}
              </span>
              <h2>{meta.name}</h2>
            </div>
            <b class:enabled={state?.enabled}>
              {state?.enabled
                ? text.admin.plugins.enabled
                : text.admin.plugins.disabled}
            </b>
          </div>
          <p>{meta.description}</p>
          <a class="plugin-settings" href={resolve(`/admin/plugins/${meta.id}`)}
            >{text.admin.plugins.openSettings} →</a
          >
        </article>
      {/each}
    </section>
  {:else}
    <section class="data-panel">
      <div class="data-heading">
        <div>
          <p class="kicker">{text.admin.data.kicker}</p>
          <h2>
            {formatText(text.admin.data.count, {
              count: data.pagination.totalItems,
            })}
          </h2>
        </div>
        <p>
          {formatText(text.admin.data.description, {
            pageSize: data.pagination.pageSize,
          })}
        </p>
      </div>
      <ManagedLinkList
        links={data.links}
        emptyMessage={data.search.query
          ? text.admin.data.emptySearch
          : text.admin.data.emptyStored}
        deleteFormId="admin-link-delete-form"
        deleteAction="?/deleteLink"
        updateAction="?/updateLink"
        healthAction="?/checkHealth"
        statsHref={adminLinkStatsHref}
        canDelete={canDeleteAdminLink}
        canEdit={canEditAdminLink}
        editableFields={data.permissions.links.editableFields}
        page={data.pagination.page}
        totalPages={data.pagination.totalPages}
        getPageHref={adminLinksPageHref}
        pageLabel={text.admin.data.pageLabel}
        locale={data.locale}
        search={{
          baseHref: '/admin/links',
          field: data.search.field,
          query: data.search.query,
          options: LINK_SEARCH_OPTIONS.map((option) => ({
            ...option,
            label:
              text.search.linkFields[
                option.value as keyof typeof text.search.linkFields
              ] ?? option.label,
          })),
          fieldName: LINK_SEARCH_PARAMS.field,
          queryName: LINK_SEARCH_PARAMS.query,
          label: text.admin.data.searchLabel,
          placeholder: text.admin.data.searchPlaceholder,
        }}
        brandName={data.settings.general.siteName}
        accentColor={data.settings.theme.customTokens.primary}
        seo={data.settings.seo}
      />
    </section>
  {/if}
</AdminShell>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: var(--admin-bg);
    color: var(--admin-text);
  }
  :global(.admin-shell) {
    --notice-toast-bottom: 104px;
    --notice-toast-mobile-bottom: 96px;
  }
  :global(button),
  :global(input),
  :global(textarea),
  :global(select) {
    font: inherit;
  }
  .kicker,
  .step {
    margin: 22px 0 8px;
    color: var(--admin-primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  h2,
  p {
    margin-top: 0;
  }
  .card-copy p,
  .plugin-card > p,
  .data-heading > p {
    color: var(--admin-muted);
    line-height: 1.6;
  }
  label {
    display: grid;
    gap: 8px;
    color: var(--admin-text);
    font-size: 0.86rem;
    font-weight: 750;
  }
  label small {
    color: var(--admin-muted);
    font-size: 0.76rem;
    font-weight: 650;
  }
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
  textarea,
  select {
    width: 100%;
    min-height: var(--form-control-height);
    border: 1px solid var(--admin-border);
    border-radius: var(--form-control-radius);
    padding: 11px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    outline: none;
  }
  select {
    height: var(--form-control-height);
    padding-top: 0;
    padding-bottom: 0;
    line-height: 1.2;
  }
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']):focus,
  textarea:focus,
  select:focus {
    border-color: var(--admin-primary);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--admin-primary) 14%, transparent);
  }
  textarea {
    resize: vertical;
    line-height: 1.5;
  }
  button {
    border: 0;
    cursor: pointer;
  }
  .savebar > button {
    min-height: 46px;
    border-radius: calc(var(--admin-radius) * 0.5);
    padding: 0 20px;
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font-weight: 850;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .settings-form {
    display: grid;
    gap: 16px;
  }
  .setting-card {
    display: grid;
    grid-template-columns: 270px 1fr;
    gap: 46px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.8);
    padding: 30px;
    background: var(--admin-panel);
  }
  .card-copy .step {
    margin-top: 0;
  }
  .card-copy h2,
  .plugin-card h2,
  .data-heading h2 {
    margin-bottom: 9px;
    font-family: inherit;
    font-size: 1.45rem;
    font-weight: 500;
  }
  .card-copy p {
    font-size: 0.87rem;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  .locale-panel {
    display: grid;
    min-width: 0;
    margin: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.55);
    padding: 20px;
    background: color-mix(in srgb, var(--admin-surface) 72%, transparent);
  }
  .locale-panel > .wide {
    grid-column: 1 / -1;
  }
  .checkbox-grid > .wide {
    grid-column: auto;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .savebar {
    position: sticky;
    bottom: 18px;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.65);
    padding: 12px;
    background: color-mix(in srgb, var(--admin-surface) 90%, transparent);
    box-shadow: 0 15px 40px var(--admin-shadow);
    backdrop-filter: blur(12px);
  }
  .savebar.split {
    justify-content: space-between;
  }
  .savebar .ghost {
    border: 1px solid var(--admin-border);
    background: var(--admin-surface);
    color: var(--admin-muted);
  }
  .code {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.84rem;
  }
  input[type='color'] {
    height: 45px;
    padding: 5px;
  }
  .theme-preview {
    border: 1px solid var(--preview-border);
    border-radius: var(--preview-radius);
    padding: 24px;
    background: var(--preview-bg);
    color: var(--preview-text);
    font-family: var(--preview-font);
  }
  .theme-preview > div {
    border: 1px solid var(--preview-border);
    border-radius: calc(var(--preview-radius) * 0.7);
    padding: 24px;
    background: var(--preview-surface);
  }
  .theme-preview span {
    color: var(--preview-primary);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }
  .theme-preview strong {
    display: block;
    margin-top: 10px;
    font-size: 1.65rem;
  }
  .theme-preview p {
    margin: 8px 0 18px;
    color: var(--preview-muted);
    font-size: 0.84rem;
  }
  .theme-preview button {
    border-radius: calc(var(--preview-radius) * 0.45);
    padding: 10px 14px;
    background: var(--preview-primary);
    color: var(--preview-primary-contrast);
    font-weight: 800;
  }
  .theme-preview[data-preview-mode='dark'] {
    color-scheme: dark;
  }
  .plugin-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .plugin-card {
    display: grid;
    align-content: start;
    gap: 16px;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.8);
    padding: 26px;
    background: var(--admin-panel);
  }
  .plugin-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 20px;
  }
  .plugin-heading > div {
    min-width: 0;
  }
  .plugin-heading span {
    color: var(--admin-primary);
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }
  .plugin-heading h2 {
    margin: 5px 0 0;
  }
  .plugin-heading b {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    border-radius: 99px;
    padding: 6px 9px;
    background: var(--admin-soft);
    color: var(--admin-muted);
    font-size: 0.7rem;
    line-height: 1;
    white-space: nowrap;
  }
  .plugin-heading b.enabled {
    background: var(--admin-soft);
    color: var(--admin-primary);
  }
  .plugin-card > p {
    margin-bottom: 0;
    font-size: 0.84rem;
  }
  .plugin-settings {
    width: fit-content;
    color: var(--admin-primary);
    font-size: 0.82rem;
    font-weight: 850;
    text-decoration: none;
  }
  .data-panel {
    min-width: 0;
    border: 1px solid var(--admin-border);
    border-radius: calc(var(--admin-radius) * 0.8);
    overflow: visible;
    background: var(--admin-panel);
  }
  .data-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 30px;
    padding: 28px;
    border-bottom: 1px solid var(--admin-border);
  }
  .data-heading .kicker {
    margin-top: 0;
  }
  .data-heading h2 {
    margin-bottom: 0;
  }
  .data-heading > p {
    max-width: 440px;
    margin-bottom: 0;
    font-size: 0.85rem;
  }
  @media (prefers-color-scheme: dark) {
    .theme-preview[data-preview-mode='system'] {
      color-scheme: dark;
    }
  }
  @media (max-width: 900px) {
    .setting-card {
      grid-template-columns: 1fr;
      gap: 20px;
    }
    .plugin-grid {
      grid-template-columns: 1fr;
    }
    .data-heading {
      align-items: start;
      flex-direction: column;
      gap: 12px;
    }
  }
  @media (max-width: 560px) {
    .fields {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
    .locale-panel {
      grid-template-columns: 1fr;
    }
    .locale-panel > .wide {
      grid-column: auto;
    }
  }
  @media (max-width: 380px) {
    .plugin-card {
      padding: 20px;
    }
    .plugin-heading {
      flex-direction: column;
      gap: 10px;
    }
    .plugin-heading b {
      align-self: flex-start;
    }
  }
</style>
