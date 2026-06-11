<script lang="ts">
  import {
    defaultSiteLocale,
    type LinkOptionKey,
    type SiteLocale,
    type SiteSettings,
  } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  type PreviewValues = {
    title?: string;
    description?: string;
    imageUrl?: string;
    themeColor?: string;
  };

  type LinkOperationValues = {
    tags?: string[] | string;
    expiresAt?: string | null;
    maxClicks?: string | number | null;
    passwordProtected?: boolean;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    mobileUrl?: string;
    desktopUrl?: string;
    abUrl?: string;
    abPercent?: string | number | null;
  };

  type LinkOptionValues = LinkOperationValues & {
    preview?: PreviewValues;
    operations?: LinkOperationValues;
  };

  type TabId = 'preview' | 'utm' | 'security' | 'ab' | 'misc';

  let {
    mode = 'create',
    values = {},
    seo,
    allowedOptions,
    collapsible = true,
    open = false,
    idPrefix = 'link-options',
    locale = defaultSiteLocale,
  }: {
    mode?: 'create' | 'edit';
    values?: LinkOptionValues;
    seo?: Pick<SiteSettings['seo'], 'title' | 'description' | 'ogImageUrl'>;
    allowedOptions?: Partial<Record<LinkOptionKey, boolean>>;
    collapsible?: boolean;
    open?: boolean;
    idPrefix?: string;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
  const tabs = $derived<Array<{ id: TabId; label: string }>>([
    { id: 'preview', label: text.linkOptions.tabs.preview },
    { id: 'utm', label: text.linkOptions.tabs.utm },
    { id: 'security', label: text.linkOptions.tabs.security },
    { id: 'ab', label: text.linkOptions.tabs.ab },
    { id: 'misc', label: text.linkOptions.tabs.misc },
  ]);

  let activeTab = $state<TabId>('preview');
  function optionAllowed(key: LinkOptionKey) {
    return allowedOptions?.[key] !== false;
  }

  function tabAllowed(tab: TabId) {
    if (tab === 'preview') {
      return (
        optionAllowed('previewTitle') ||
        optionAllowed('previewDescription') ||
        optionAllowed('previewImageUrl') ||
        optionAllowed('themeColor')
      );
    }
    if (tab === 'utm') {
      return (
        optionAllowed('utmSource') ||
        optionAllowed('utmMedium') ||
        optionAllowed('utmCampaign') ||
        optionAllowed('utmTerm') ||
        optionAllowed('utmContent')
      );
    }
    if (tab === 'security') {
      return (
        optionAllowed('expiresAt') ||
        optionAllowed('maxClicks') ||
        optionAllowed('password')
      );
    }
    if (tab === 'ab')
      return optionAllowed('abUrl') || optionAllowed('abPercent');
    return (
      optionAllowed('tags') ||
      optionAllowed('mobileUrl') ||
      optionAllowed('desktopUrl')
    );
  }

  const visibleTabs = $derived(tabs.filter((tab) => tabAllowed(tab.id)));
  const hasExistingPassword = $derived(
    mode === 'edit' && Boolean(values?.passwordProtected),
  );
  let clearPassword = $state(false);
  const initialExpiresAtParts = datetimeLocalParts();
  let expiresAtDate = $state(initialExpiresAtParts.date);
  let expiresAtTime = $state(initialExpiresAtParts.time);
  const passwordPlaceholder = $derived(
    hasExistingPassword
      ? clearPassword
        ? text.linkOptions.passwordWillClear
        : text.linkOptions.keepPassword
      : '',
  );

  $effect(() => {
    if (!hasExistingPassword) clearPassword = false;
  });

  $effect(() => {
    if (!tabAllowed(activeTab)) activeTab = visibleTabs[0]?.id ?? 'preview';
  });

  $effect(() => {
    const parts = datetimeLocalParts();
    expiresAtDate = parts.date;
    expiresAtTime = parts.time;
  });

  function textValue(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function optionValue(name: keyof LinkOperationValues) {
    const direct = values?.[name];
    const operation = values?.operations?.[name];
    return direct ?? operation;
  }

  function stringOption(name: keyof LinkOperationValues) {
    return textValue(optionValue(name));
  }

  function numberOption(name: keyof LinkOperationValues) {
    const value = optionValue(name);
    if (value === null || value === undefined || value === '' || value === 0) {
      return '';
    }
    return String(value);
  }

  function tagsValue() {
    const value = optionValue('tags');
    return Array.isArray(value) ? value.join(', ') : textValue(value);
  }

  function datetimeLocalValue() {
    const value = optionValue('expiresAt');
    if (!value) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function datetimeLocalParts() {
    const value = datetimeLocalValue();
    if (!value) return { date: '', time: '' };
    const [date = '', time = ''] = value.split('T');
    return { date, time };
  }

  function hasOptionValues() {
    return Boolean(
      values?.preview?.title ||
      values?.preview?.description ||
      values?.preview?.imageUrl ||
      values?.preview?.themeColor ||
      tagsValue() ||
      datetimeLocalValue() ||
      numberOption('maxClicks') ||
      stringOption('utmSource') ||
      stringOption('utmMedium') ||
      stringOption('utmCampaign') ||
      stringOption('utmTerm') ||
      stringOption('utmContent') ||
      stringOption('mobileUrl') ||
      stringOption('desktopUrl') ||
      stringOption('abUrl') ||
      numberOption('abPercent') ||
      values?.passwordProtected,
    );
  }
</script>

{#snippet optionTabs()}
  <div
    class="option-tabs"
    role="tablist"
    aria-label={text.linkOptions.ariaLabel}
  >
    {#each visibleTabs as tab (tab.id)}
      <button
        type="button"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`${idPrefix}-${tab.id}`}
        onclick={() => (activeTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if tabAllowed('preview')}
    <div
      id={`${idPrefix}-preview`}
      class="option-panel"
      role="tabpanel"
      hidden={activeTab !== 'preview'}
    >
      {#if optionAllowed('previewTitle')}
        <label>
          <span
            >{text.linkOptions.previewTitle}
            <em>{text.common.optional}</em></span
          >
          <input
            name="previewTitle"
            type="text"
            maxlength="160"
            placeholder={seo?.title ?? ''}
            value={values?.preview?.title ?? ''}
          />
        </label>
      {/if}
      {#if optionAllowed('previewImageUrl')}
        <label>
          <span
            >{text.linkOptions.previewImageUrl}
            <em>{text.common.optional}</em></span
          >
          <input
            name="previewImageUrl"
            type="url"
            inputmode="url"
            placeholder={seo?.ogImageUrl || 'https://example.com/preview.png'}
            value={values?.preview?.imageUrl ?? ''}
          />
        </label>
      {/if}
      {#if optionAllowed('themeColor')}
        <label>
          <span
            >{text.linkOptions.themeColor} <em>{text.common.optional}</em></span
          >
          <input
            name="themeColor"
            type="text"
            maxlength="7"
            pattern={'#[0-9a-fA-F]{6}'}
            placeholder="#22c55e"
            value={values?.preview?.themeColor ?? ''}
          />
        </label>
      {/if}
      {#if optionAllowed('previewDescription')}
        <label class="wide">
          <span
            >{text.linkOptions.previewDescription}
            <em>{text.common.optional}</em></span
          >
          <textarea
            name="previewDescription"
            rows="3"
            maxlength="500"
            placeholder={seo?.description ?? ''}
            >{values?.preview?.description ?? ''}</textarea
          >
        </label>
      {/if}
    </div>
  {/if}

  {#if tabAllowed('utm')}
    <div
      id={`${idPrefix}-utm`}
      class="option-panel"
      role="tabpanel"
      hidden={activeTab !== 'utm'}
    >
      {#if optionAllowed('utmSource')}
        <label>
          <span>UTM source <em>{text.common.optional}</em></span>
          <input
            name="utmSource"
            type="text"
            placeholder="newsletter"
            value={stringOption('utmSource')}
          />
        </label>
      {/if}
      {#if optionAllowed('utmMedium')}
        <label>
          <span>UTM medium <em>{text.common.optional}</em></span>
          <input
            name="utmMedium"
            type="text"
            placeholder="email"
            value={stringOption('utmMedium')}
          />
        </label>
      {/if}
      {#if optionAllowed('utmCampaign')}
        <label>
          <span>UTM campaign <em>{text.common.optional}</em></span>
          <input
            name="utmCampaign"
            type="text"
            placeholder="launch"
            value={stringOption('utmCampaign')}
          />
        </label>
      {/if}
      {#if optionAllowed('utmTerm')}
        <label>
          <span>UTM term <em>{text.common.optional}</em></span>
          <input
            name="utmTerm"
            type="text"
            placeholder="keyword"
            value={stringOption('utmTerm')}
          />
        </label>
      {/if}
      {#if optionAllowed('utmContent')}
        <label>
          <span>UTM content <em>{text.common.optional}</em></span>
          <input
            name="utmContent"
            type="text"
            placeholder="cta-button"
            value={stringOption('utmContent')}
          />
        </label>
      {/if}
    </div>
  {/if}

  {#if tabAllowed('security')}
    <div
      id={`${idPrefix}-security`}
      class="option-panel"
      role="tabpanel"
      hidden={activeTab !== 'security'}
    >
      {#if optionAllowed('expiresAt')}
        <div class="datetime-field-group">
          <label>
            <span
              >{text.linkOptions.expiresAtDate}
              <em>{text.common.optional}</em></span
            >
            <input
              name="expiresAtDate"
              type="date"
              bind:value={expiresAtDate}
              required={Boolean(expiresAtTime)}
            />
          </label>
          <label>
            <span
              >{text.linkOptions.expiresAtTime}
              <em>{text.common.optional}</em></span
            >
            <input
              name="expiresAtTime"
              type="time"
              step="60"
              bind:value={expiresAtTime}
            />
          </label>
        </div>
      {/if}
      {#if optionAllowed('maxClicks')}
        <label>
          <span
            >{text.linkOptions.maxClicks}
            <em>{text.linkOptions.unlimitedZero}</em></span
          >
          <input
            name="maxClicks"
            type="number"
            min="0"
            max="2000000000"
            value={numberOption('maxClicks')}
          />
        </label>
      {/if}
      {#if optionAllowed('password')}
        <div class="password-field" class:clearing={clearPassword}>
          <div class="field-heading">
            <span id={`${idPrefix}-password-label`}
              >{mode === 'edit'
                ? text.linkOptions.newPassword
                : text.linkOptions.password}
              <em>{text.common.optional}</em></span
            >
            {#if hasExistingPassword}
              <label class="clear-password-toggle">
                <input
                  name="clearPassword"
                  type="checkbox"
                  bind:checked={clearPassword}
                  aria-label={text.linkOptions.clearPassword}
                />
                <span>
                  {clearPassword
                    ? text.linkOptions.clearingPassword
                    : text.linkOptions.clearPassword}
                </span>
              </label>
            {/if}
          </div>
          <input
            id={`${idPrefix}-password`}
            name="password"
            type="password"
            autocomplete="new-password"
            aria-labelledby={`${idPrefix}-password-label`}
            placeholder={passwordPlaceholder}
            disabled={clearPassword}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if tabAllowed('ab')}
    <div
      id={`${idPrefix}-ab`}
      class="option-panel"
      role="tabpanel"
      hidden={activeTab !== 'ab'}
    >
      {#if optionAllowed('abUrl')}
        <label>
          <span>{text.linkOptions.abUrl} <em>{text.common.optional}</em></span>
          <input
            name="abUrl"
            type="text"
            inputmode="url"
            placeholder="https://example.com/variant"
            value={stringOption('abUrl')}
          />
        </label>
      {/if}
      {#if optionAllowed('abPercent')}
        <label>
          <span>{text.linkOptions.abPercent} <em>0-100</em></span>
          <input
            name="abPercent"
            type="number"
            min="0"
            max="100"
            value={numberOption('abPercent')}
          />
        </label>
      {/if}
    </div>
  {/if}

  {#if tabAllowed('misc')}
    <div
      id={`${idPrefix}-misc`}
      class="option-panel"
      role="tabpanel"
      hidden={activeTab !== 'misc'}
    >
      {#if optionAllowed('tags')}
        <label>
          <span
            >{text.linkOptions.tags}
            <em>{text.linkOptions.commaSeparated}</em></span
          >
          <input
            name="tags"
            type="text"
            placeholder="ads, blog, client-a"
            value={tagsValue()}
          />
        </label>
      {/if}
      {#if optionAllowed('mobileUrl')}
        <label>
          <span
            >{text.linkOptions.mobileUrl} <em>{text.common.optional}</em></span
          >
          <input
            name="mobileUrl"
            type="text"
            inputmode="url"
            placeholder="https://m.example.com"
            value={stringOption('mobileUrl')}
          />
        </label>
      {/if}
      {#if optionAllowed('desktopUrl')}
        <label>
          <span
            >{text.linkOptions.desktopUrl} <em>{text.common.optional}</em></span
          >
          <input
            name="desktopUrl"
            type="text"
            inputmode="url"
            placeholder="https://www.example.com"
            value={stringOption('desktopUrl')}
          />
        </label>
      {/if}
    </div>
  {/if}
{/snippet}

{#if visibleTabs.length > 0}
  {#if collapsible}
    <details class="link-options" open={open || hasOptionValues()}>
      <summary>
        <span>{text.linkOptions.more}</span>
        <em>{text.linkOptions.linkOptions}</em>
      </summary>
      {@render optionTabs()}
    </details>
  {:else}
    <div class="link-options expanded">
      {@render optionTabs()}
    </div>
  {/if}
{/if}

<style>
  .link-options {
    --_link-options-bg: var(
      --link-options-bg,
      var(--managed-link-bg, var(--admin-bg, var(--page-bg, #f7f7f5)))
    );
    --_link-options-border: var(
      --link-options-border,
      var(--managed-link-border, var(--admin-border, var(--border, #d9ded9)))
    );
    --_link-options-danger: var(
      --link-options-danger,
      var(
        --managed-link-danger,
        var(--admin-danger, var(--page-danger, #c84432))
      )
    );
    --_link-options-muted: var(
      --link-options-muted,
      var(--managed-link-muted, var(--admin-muted, var(--muted, #59645d)))
    );
    --_link-options-primary: var(
      --link-options-primary,
      var(--managed-link-primary, var(--admin-primary, var(--primary, #24623f)))
    );
    --_link-options-radius: var(
      --link-options-radius,
      var(--managed-link-radius, var(--admin-radius, var(--radius, 16px)))
    );
    --_link-options-surface: var(
      --link-options-surface,
      var(--managed-link-surface, var(--admin-surface, var(--surface, #fff)))
    );
    --_link-options-text: var(
      --link-options-text,
      var(--managed-link-text, var(--admin-text, var(--text, #171717)))
    );
    margin-top: 10px;
    border-top: 1px solid var(--_link-options-border);
    padding: 2px 4px 0;
  }

  .link-options.expanded {
    margin-top: 0;
    border-top: 0;
    padding: 0;
  }

  .link-options summary {
    display: flex;
    min-height: 42px;
    align-items: center;
    gap: 12px;
    color: var(--_link-options-muted);
    cursor: pointer;
    list-style: none;
  }

  .link-options summary::-webkit-details-marker {
    display: none;
  }

  .link-options summary span {
    font-size: 0.8rem;
    font-weight: 850;
  }

  .link-options summary em {
    margin-left: auto;
    color: color-mix(in srgb, var(--_link-options-muted) 65%, transparent);
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 650;
  }

  .option-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0;
  }

  .option-tabs button {
    min-height: 36px;
    border: 1px solid var(--_link-options-border);
    border-radius: 9px;
    padding: 8px 11px;
    background: var(--_link-options-surface);
    color: var(--_link-options-muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 850;
    cursor: pointer;
  }

  .option-tabs button.active {
    border-color: color-mix(
      in srgb,
      var(--_link-options-primary) 46%,
      var(--_link-options-border)
    );
    background: color-mix(
      in srgb,
      var(--_link-options-primary) 12%,
      var(--_link-options-surface)
    );
    color: var(--_link-options-primary);
  }

  .option-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .option-panel[hidden] {
    display: none;
  }

  .datetime-field-group {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  label,
  .password-field {
    display: grid;
    gap: 8px;
    color: var(--_link-options-muted);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  label > span,
  .field-heading > span {
    display: block;
    margin: 0 0 2px 4px;
  }

  .field-heading {
    display: flex;
    min-height: 22px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .field-heading > span {
    margin-bottom: 0;
  }

  label em {
    color: color-mix(in srgb, var(--_link-options-muted) 65%, transparent);
    font-style: normal;
    font-weight: 600;
  }

  .clear-password-toggle {
    display: inline-flex;
    align-items: center;
    margin: 0;
    color: var(--_link-options-muted);
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: 0;
    cursor: pointer;
  }

  .clear-password-toggle input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .clear-password-toggle > span {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    border: 1px solid var(--_link-options-border);
    border-radius: 8px;
    margin: 0;
    padding: 0 9px;
    background: var(--_link-options-surface);
    color: var(--_link-options-muted);
  }

  .clear-password-toggle input:checked + span {
    border-color: color-mix(
      in srgb,
      var(--_link-options-danger) 38%,
      var(--_link-options-border)
    );
    background: color-mix(
      in srgb,
      var(--_link-options-danger) 10%,
      var(--_link-options-surface)
    );
    color: var(--_link-options-danger);
  }

  .clear-password-toggle input:focus-visible + span {
    outline: 3px solid
      color-mix(in srgb, var(--_link-options-primary) 18%, transparent);
    outline-offset: 2px;
  }

  input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
  textarea {
    width: 100%;
    border: 1px solid var(--_link-options-border);
    border-radius: calc(var(--_link-options-radius) * 0.55);
    background: var(--_link-options-bg);
    color: var(--_link-options-text);
    font: inherit;
    outline: none;
  }

  input:not([type='checkbox']):not([type='radio']):not([type='hidden']) {
    min-height: 44px;
    padding: 0 12px;
  }

  input:is([type='date'], [type='time']) {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    display: block;
    height: 44px;
    min-height: 44px;
    line-height: 1.2;
    padding-top: 0;
    padding-bottom: 0;
  }

  input:is([type='date'], [type='time'])::-webkit-date-and-time-value {
    display: flex;
    min-height: 42px;
    align-items: center;
    padding: 0;
    line-height: 1.2;
    text-align: left;
  }

  input:is([type='date'], [type='time'])::-webkit-datetime-edit {
    display: flex;
    min-height: 42px;
    align-items: center;
    padding: 0;
  }

  input:is([type='date'], [type='time'])::-webkit-datetime-edit-fields-wrapper {
    display: flex;
    align-items: center;
  }

  input:is([type='date'], [type='time'])::-webkit-calendar-picker-indicator {
    margin-inline-start: auto;
  }

  textarea {
    min-height: 86px;
    padding: 12px;
    line-height: 1.5;
    resize: vertical;
  }

  input:not([type='checkbox']):not([type='radio']):not([type='hidden']):focus,
  textarea:focus {
    border-color: var(--_link-options-primary);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--_link-options-primary) 15%, transparent);
  }

  .password-field input:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .wide {
    grid-column: 1 / -1;
  }

  @media (max-width: 820px) {
    .option-panel {
      grid-template-columns: 1fr;
    }

    .wide {
      grid-column: auto;
    }

    .datetime-field-group {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .option-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .option-tabs button {
      width: 100%;
    }
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
      textarea {
        font-size: 16px;
        font-size: max(16px, 1em);
      }
    }
  }
</style>
