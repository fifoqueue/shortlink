<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { configString, fieldName } from '../utils';
  import {
    captchaProviderOptions,
    defaultCaptchaConfig,
    normalizeCaptchaConfig,
    type CaptchaProvider,
  } from './config';

  type AdminData = {
    configured: boolean;
    hasSecretKey: boolean;
  };

  let { config, adminData, strings = {} }: PluginComponentProps = $props();
  const captcha = $derived(normalizeCaptchaConfig(config));
  const data = $derived((adminData ?? {}) as Partial<AdminData>);
  let provider: CaptchaProvider = $derived(captcha.provider);
  let siteKey = $derived(captcha.siteKey);
  let secretKey = $state('');
  let tokenFieldName = $derived(captcha.tokenFieldName);
  let customVerifyEndpoint = $derived(captcha.customVerifyEndpoint);
  let customSuccessPath = $derived(captcha.customSuccessPath);
  const protectionAvailable = $derived(
    provider === 'none'
      ? false
      : provider === 'custom'
        ? Boolean(
            customVerifyEndpoint.trim() &&
            tokenFieldName.trim() &&
            customSuccessPath.trim(),
          )
        : Boolean(siteKey.trim() && (secretKey.trim() || data.hasSecretKey)),
  );
  const captchaProviderTextKeys: Record<CaptchaProvider, PluginLocaleKey> = {
    none: 'admin.providerNone',
    turnstile: 'admin.providerTurnstile',
    hcaptcha: 'admin.providerHcaptcha',
    'recaptcha-v2': 'admin.providerRecaptchaV2',
    'recaptcha-v3': 'admin.providerRecaptchaV3',
    'recaptcha-invisible': 'admin.providerRecaptchaInvisible',
    custom: 'admin.providerCustom',
  };

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<div class="plugin-i18n-root">
  <section>
    <h2>{t('admin.protectedActions')}</h2>
    <div class="toggle-grid">
      <ToggleField
        name={fieldName('captcha', 'loginEnabled')}
        label={t('admin.protectPasswordLogin')}
        checked={captcha.loginEnabled}
        disabled={!protectionAvailable}
      />
      <ToggleField
        name={fieldName('captcha', 'signupEnabled')}
        label={t('admin.protectSignup')}
        checked={captcha.signupEnabled}
        disabled={!protectionAvailable}
      />
      <ToggleField
        name={fieldName('captcha', 'linkCreateEnabled')}
        label={t('admin.protectLinkCreation')}
        checked={captcha.linkCreateEnabled}
        disabled={!protectionAvailable}
      />
    </div>
    {#if protectionAvailable}
      <p class="hint">
        {t('admin.adminBypassHint')}
      </p>
    {:else}
      <p class="hint warning">
        {provider === 'none'
          ? t('admin.disabledWithoutCaptchaHint')
          : t('admin.completeSettingsHint')}
      </p>
    {/if}
  </section>

  <section>
    <h2>{t('admin.provider')}</h2>
    <div class="grid form-grid balanced">
      <label>
        {t('admin.captchaType')}
        <select name={fieldName('captcha', 'provider')} bind:value={provider}>
          {#each captchaProviderOptions as option (option.id)}
            <option value={option.id}
              >{t(captchaProviderTextKeys[option.id])}</option
            >
          {/each}
        </select>
      </label>
      {#if provider !== 'none'}
        <label>
          {t('admin.tokenFieldName')}
          <input
            name={fieldName('captcha', 'tokenFieldName')}
            bind:value={tokenFieldName}
            placeholder={defaultCaptchaConfig.tokenFieldName}
          />
        </label>
        <label>
          {t('admin.verifyTimeout')}
          <small>{t('admin.verifyTimeoutHint')}</small>
          <input
            name={fieldName('captcha', 'verifyTimeoutMs')}
            type="number"
            min="1000"
            max="120000"
            step="500"
            value={captcha.verifyTimeoutMs}
          />
        </label>
      {/if}
      {#if provider !== 'custom' && provider !== 'none'}
        <label>
          {t('admin.siteKey')}
          <input
            name={fieldName('captcha', 'siteKey')}
            bind:value={siteKey}
            placeholder={t('admin.publicSiteKeyPlaceholder')}
          />
        </label>
        <label>
          {t('admin.secretKey')}
          <small>{t('admin.keepExistingHint')}</small>
          <input
            name={fieldName('captcha', 'secretKey')}
            type="password"
            bind:value={secretKey}
            placeholder={t('admin.changeOnlyPlaceholder')}
          />
        </label>
      {/if}
      {#if provider === 'recaptcha-v3' || provider === 'custom'}
        <label>
          {t('admin.scoreThreshold')}
          <small>{t('admin.scoreThresholdHint')}</small>
          <input
            name={fieldName('captcha', 'scoreThreshold')}
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={captcha.scoreThreshold}
          />
        </label>
      {/if}
    </div>
  </section>

  {#if provider === 'custom'}
    <section>
      <h2>{t('admin.customRendering')}</h2>
      <div class="grid form-grid balanced">
        <label class="wide">
          {t('admin.scriptUrl')}
          <input
            name={fieldName('captcha', 'customScriptUrl')}
            type="url"
            value={captcha.customScriptUrl}
            placeholder={t('admin.customWidgetUrlPlaceholder')}
          />
        </label>
        <label class="wide">
          {t('admin.widgetHtml')}
          <small>{t('admin.customWidgetHint')}</small>
          <textarea name={fieldName('captcha', 'customWidgetHtml')} rows="6"
            >{configString(config, 'customWidgetHtml')}</textarea
          >
        </label>
      </div>
    </section>

    <section>
      <h2>{t('admin.customVerification')}</h2>
      <div class="grid form-grid balanced">
        <label class="wide">
          {t('admin.verifyEndpoint')}
          <input
            name={fieldName('captcha', 'customVerifyEndpoint')}
            type="url"
            bind:value={customVerifyEndpoint}
            placeholder={t('admin.customVerifyUrlPlaceholder')}
          />
        </label>
        <label>
          {t('admin.verifyMethod')}
          <select
            name={fieldName('captcha', 'customVerifyMethod')}
            value={captcha.customVerifyMethod}
          >
            <option value="POST">{t('admin.verifyMethodPost')}</option>
            <option value="GET">{t('admin.verifyMethodGet')}</option>
          </select>
        </label>
        <label>
          {t('admin.requestFormat')}
          <select
            name={fieldName('captcha', 'customRequestFormat')}
            value={captcha.customRequestFormat}
          >
            <option value="form">{t('admin.formUrlEncoded')}</option>
            <option value="json">{t('admin.requestFormatJson')}</option>
          </select>
        </label>
        <label>
          {t('admin.secretParam')}
          <input
            name={fieldName('captcha', 'customSecretField')}
            value={captcha.customSecretField}
          />
        </label>
        <label>
          {t('admin.responseParam')}
          <input
            name={fieldName('captcha', 'customResponseField')}
            value={captcha.customResponseField}
          />
        </label>
        <label>
          {t('admin.remoteIpParam')}
          <input
            name={fieldName('captcha', 'customRemoteIpField')}
            value={captcha.customRemoteIpField}
          />
        </label>
        <label>
          {t('admin.successJsonPath')}
          <input
            name={fieldName('captcha', 'customSuccessPath')}
            bind:value={customSuccessPath}
            placeholder={t('admin.successJsonPathPlaceholder')}
          />
        </label>
        <label>
          {t('admin.scoreJsonPath')}
          <input
            name={fieldName('captcha', 'customScorePath')}
            value={captcha.customScorePath}
            placeholder={t('admin.scoreJsonPathPlaceholder')}
          />
        </label>
        <label class="wide">
          {t('admin.httpHeaders')}
          <small>{t('admin.keyValueLines')}</small>
          <textarea name={fieldName('captcha', 'customHeaders')} rows="4"
            >{captcha.customHeaders}</textarea
          >
        </label>
        <label class="wide">
          {t('admin.extraBody')}
          <small>{t('admin.keyValueLines')}</small>
          <textarea name={fieldName('captcha', 'customExtraBody')} rows="4"
            >{captcha.customExtraBody}</textarea
          >
        </label>
      </div>
    </section>
  {/if}
</div>

<style>
  .plugin-i18n-root {
    display: contents;
  }
  section {
    display: grid;
    gap: 14px;
    border-top: 1px solid var(--admin-border);
    padding-top: 18px;
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .hint {
    margin: 0;
    color: var(--admin-muted);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .hint.warning {
    color: var(--admin-danger-text);
  }
  .toggle-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    --toggle-min-height: 42px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  label {
    display: grid;
    gap: 7px;
    color: var(--admin-text);
    font-size: 0.82rem;
    font-weight: 750;
  }
  label small {
    color: var(--admin-muted);
    font-size: 0.76rem;
    font-weight: 650;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: var(--form-control-height);
    border: 1px solid var(--admin-border);
    border-radius: var(--form-control-radius);
    padding: 10px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font: inherit;
    outline: none;
  }
  select {
    height: var(--form-control-height);
    padding-top: 0;
    padding-bottom: 0;
  }
  textarea {
    line-height: 1.5;
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--admin-primary);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--admin-primary) 14%, transparent);
  }
  @media (max-width: 720px) {
    .toggle-grid,
    .grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
  }
</style>
