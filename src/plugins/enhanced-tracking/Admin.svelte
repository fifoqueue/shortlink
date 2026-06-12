<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { configString, fieldName } from '../utils';
  import {
    defaultProxyHeaders,
    normalizeEnhancedTrackingConfig,
  } from './config';

  let { config, adminData, strings = {} }: PluginComponentProps = $props();
  const data = $derived(
    (adminData ?? {}) as Partial<{ geoipAvailable: boolean }>,
  );
  const geoipAvailable = $derived(data.geoipAvailable === true);
  const normalizedConfig = $derived(
    normalizeEnhancedTrackingConfig(config, { geoipAvailable }),
  );

  function checked(field: string) {
    return normalizedConfig[field] === true;
  }

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<div class="plugin-i18n-root">
  <section>
    <ToggleField
      name={fieldName('enhanced-tracking', 'proxyHeadersEnabled')}
      label={t('admin.collectReverseProxyHeaders')}
      checked={checked('proxyHeadersEnabled')}
    />
    <label>
      {t('admin.trackingHeaders')}
      <small>{t('admin.trackingHeadersHint')}</small>
      <textarea name={fieldName('enhanced-tracking', 'proxyHeaders')} rows="6"
        >{configString(config, 'proxyHeaders', defaultProxyHeaders)}</textarea
      >
    </label>
  </section>

  <section>
    {#if !geoipAvailable}
      <p class="hint">
        {t('admin.coreGeoipRequired')}
      </p>
    {/if}
    <div class="visibility-grid">
      <div>
        <strong>{t('admin.country')}</strong>
        <ToggleField
          name={fieldName('enhanced-tracking', 'collectCountry')}
          label={t('admin.collect')}
          checked={checked('collectCountry')}
          disabled={!geoipAvailable}
        />
        <ToggleField
          name={fieldName('enhanced-tracking', 'exposeCountryToUsers')}
          label={t('admin.showToCreators')}
          checked={checked('exposeCountryToUsers')}
        />
      </div>
      <div>
        <strong>{t('admin.city')}</strong>
        <ToggleField
          name={fieldName('enhanced-tracking', 'collectCity')}
          label={t('admin.collect')}
          checked={checked('collectCity')}
          disabled={!geoipAvailable}
        />
        <ToggleField
          name={fieldName('enhanced-tracking', 'exposeCityToUsers')}
          label={t('admin.showToCreators')}
          checked={checked('exposeCityToUsers')}
        />
      </div>
      <div>
        <strong>{t('admin.asn')}</strong>
        <ToggleField
          name={fieldName('enhanced-tracking', 'collectAsn')}
          label={t('admin.collect')}
          checked={checked('collectAsn')}
          disabled={!geoipAvailable}
        />
        <ToggleField
          name={fieldName('enhanced-tracking', 'exposeAsnToUsers')}
          label={t('admin.showToCreators')}
          checked={checked('exposeAsnToUsers')}
        />
      </div>
    </div>
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
  section {
    --toggle-min-height: 24px;
    --toggle-font-size: 0.86rem;
    --toggle-label: var(--admin-text);
    --toggle-primary: var(--admin-primary);
  }
  label {
    display: grid;
    gap: 8px;
    color: var(--admin-text);
    font-size: 0.86rem;
    font-weight: 750;
  }
  small {
    color: var(--admin-muted);
    font-weight: 550;
  }
  .hint {
    margin: 0;
    color: var(--admin-muted);
    font-size: 0.82rem;
    line-height: 1.55;
  }
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
  textarea:focus {
    border-color: var(--admin-primary);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--admin-primary) 14%, transparent);
  }
  .visibility-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .visibility-grid > div {
    display: grid;
    gap: 8px;
    border: 1px solid var(--admin-border);
    border-radius: 12px;
    padding: 13px;
    background: var(--admin-surface);
  }
  strong {
    color: var(--admin-text);
    font-size: 0.9rem;
  }
  @media (prefers-color-scheme: dark) {
    section {
      --toggle-border: var(--admin-border);
      --toggle-surface: var(--admin-surface);
      --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    }
  }
  @media (max-width: 640px) {
    .visibility-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
