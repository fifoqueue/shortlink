<script lang="ts">
  import {
    defaultSiteLocale,
    siteLocaleKeys,
    siteLocaleLabel,
  } from '$lib/config';
  import LocaleFieldSelector from '$lib/components/LocaleFieldSelector.svelte';
  import { pluginText } from '$lib/i18n/plugin';
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import { fieldName } from '../utils';
  import { normalizeRateLimitConfig } from './config';

  let {
    config,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
    strings = {},
  }: PluginComponentProps = $props();
  let activeLocale = $derived(locale);
  const localeTabs = siteLocaleKeys.map((id) => ({
    id,
    label: siteLocaleLabel(id),
  }));
  const rateLimit = $derived(normalizeRateLimitConfig(config, fallbackLocale));
  const rulesJson = $derived(JSON.stringify(rateLimit.rules, null, 2));

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<div class="plugin-i18n-root">
  <LocaleFieldSelector
    bind:activeLocale
    label={t('admin.stringLanguage')}
    options={localeTabs}
  />

  <section>
    {#key activeLocale}
      <label>
        {t('admin.responseMessage')}
        <input
          name={fieldName('rate-limit', `responseMessages.${activeLocale}`)}
          value={rateLimit.responseMessages[activeLocale]}
        />
      </label>
    {/key}
  </section>

  <section>
    <label>
      {t('admin.rulesJson')}
      <small>
        {t('admin.rulesHelp')}
      </small>
      <textarea name={fieldName('rate-limit', 'rulesJson')} rows="22"
        >{rulesJson}</textarea
      >
    </label>
  </section>

  <section>
    <h2>{t('admin.conditionFields')}</h2>
    <p>
      {t('admin.conditionsHelp')}
    </p>
  </section>
</div>

<style>
  .plugin-i18n-root {
    display: contents;
  }
  section {
    display: grid;
    gap: 12px;
    border-top: 1px solid var(--admin-border);
    padding-top: 16px;
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  label {
    display: grid;
    gap: 8px;
    color: var(--admin-text);
    font-size: 0.86rem;
    font-weight: 750;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 0.95rem;
  }
  p,
  small {
    color: var(--admin-muted);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.55;
  }
  input,
  textarea {
    width: 100%;
    min-height: var(--form-control-height);
    border: 1px solid var(--admin-border);
    border-radius: var(--form-control-radius);
    padding: 11px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font: inherit;
    line-height: 1.5;
    outline: none;
  }
  textarea {
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 0.78rem;
    resize: vertical;
  }
  input:focus,
  textarea:focus {
    border-color: var(--admin-primary);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--admin-primary) 14%, transparent);
  }
</style>
