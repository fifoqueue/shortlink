<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { configString, fieldName } from '../utils';
  import { defaultProxyHeaders } from './config';

  let { config, strings = {} }: PluginComponentProps = $props();

  function checked(field: string) {
    return config[field] === true;
  }

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<div class="plugin-i18n-root">
  <section>
    <ToggleField
      name={fieldName('enhanced-tracking', 'geoipHeadersEnabled')}
      label={t('admin.useProxyGeoipHeaders')}
      checked={checked('geoipHeadersEnabled')}
    />
    <p class="hint">
      {t('admin.proxyGeoipHeadersHint')}
    </p>
    <div class="two form-grid balanced">
      <label>
        {t('admin.countryCodeHeader')}
        <input
          name={fieldName('enhanced-tracking', 'countryCodeHeader')}
          value={configString(config, 'countryCodeHeader')}
        />
      </label>
      <label>
        {t('admin.countryNameHeader')}
        <input
          name={fieldName('enhanced-tracking', 'countryNameHeader')}
          value={configString(config, 'countryNameHeader')}
        />
      </label>
      <label>
        {t('admin.cityHeader')}
        <input
          name={fieldName('enhanced-tracking', 'cityNameHeader')}
          value={configString(config, 'cityNameHeader')}
        />
      </label>
      <label>
        {t('admin.asnNumberHeader')}
        <input
          name={fieldName('enhanced-tracking', 'asnNumberHeader')}
          value={configString(config, 'asnNumberHeader')}
        />
      </label>
      <label class="wide">
        {t('admin.asnOrganizationHeader')}
        <input
          name={fieldName('enhanced-tracking', 'asnOrganizationHeader')}
          value={configString(config, 'asnOrganizationHeader')}
        />
      </label>
    </div>

    <ToggleField
      name={fieldName('enhanced-tracking', 'geoipEnabled')}
      label={t('admin.queryMaxmindDirectly')}
      checked={checked('geoipEnabled')}
    />
    <label>
      {t('admin.cityDatabasePath')}
      <input
        name={fieldName('enhanced-tracking', 'cityDatabasePath')}
        placeholder={t('admin.cityDatabasePathPlaceholder')}
        value={configString(config, 'cityDatabasePath')}
      />
    </label>
    <label>
      {t('admin.countryDatabasePath')}
      <small>{t('admin.countryDatabaseHint')}</small>
      <input
        name={fieldName('enhanced-tracking', 'countryDatabasePath')}
        placeholder={t('admin.countryDatabasePathPlaceholder')}
        value={configString(config, 'countryDatabasePath')}
      />
    </label>
    <label>
      {t('admin.asnDatabasePath')}
      <input
        name={fieldName('enhanced-tracking', 'asnDatabasePath')}
        placeholder={t('admin.asnDatabasePathPlaceholder')}
        value={configString(config, 'asnDatabasePath')}
      />
    </label>
  </section>

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
    <div class="visibility-grid">
      <div>
        <strong>{t('admin.country')}</strong>
        <ToggleField
          name={fieldName('enhanced-tracking', 'showCountry')}
          label={t('admin.showToAdmins')}
          checked={checked('showCountry')}
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
          name={fieldName('enhanced-tracking', 'showCity')}
          label={t('admin.showToAdmins')}
          checked={checked('showCity')}
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
          name={fieldName('enhanced-tracking', 'showAsn')}
          label={t('admin.showToAdmins')}
          checked={checked('showAsn')}
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
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .wide {
    grid-column: 1 / -1;
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
  input:focus,
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
    .two,
    .visibility-grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
  }
</style>
