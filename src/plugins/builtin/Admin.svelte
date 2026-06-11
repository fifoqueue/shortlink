<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import LocaleFieldSelector from '$lib/components/LocaleFieldSelector.svelte';
  import {
    defaultSiteLocale,
    siteLocaleKeys,
    siteLocaleLabel,
    type SiteLocale,
  } from '$lib/config';
  import { pluginText } from '$lib/i18n/plugin';
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import { fieldName } from '../utils';

  let {
    config,
    locale = defaultSiteLocale,
    strings = {},
  }: PluginComponentProps = $props();
  let activeLocale = $derived(locale);
  const localeTabs = siteLocaleKeys.map((id) => ({
    id,
    label: siteLocaleLabel(id),
  }));

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }

  const socialLinks = $derived(
    Array.isArray(config.socialLinks)
      ? config.socialLinks
          .filter(
            (link): link is { label: string; url: string } =>
              typeof link === 'object' &&
              link !== null &&
              'label' in link &&
              'url' in link &&
              typeof link.label === 'string' &&
              typeof link.url === 'string',
          )
          .map((link) => `${link.label} | ${link.url}`)
          .join('\n')
      : '',
  );

  function localizedConfigString(
    field: string,
    itemLocale: SiteLocale,
    fallback = '',
  ) {
    const value = config[field];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const localized = (value as Partial<Record<SiteLocale, unknown>>)[
        itemLocale
      ];
      if (typeof localized === 'string') return localized;
    }
    return fallback;
  }
</script>

<div class="plugin-i18n-root">
  <LocaleFieldSelector
    bind:activeLocale
    label={t('admin.stringLanguage')}
    options={localeTabs}
  />

  <section>
    <ToggleField
      name={fieldName('builtin', 'announcementEnabled')}
      label={t('admin.announcementBanner')}
      checked={config.announcementEnabled === true}
    />
    {#key activeLocale}
      <label>
        {t('admin.html')}
        <textarea
          name={fieldName('builtin', `announcementMessages.${activeLocale}`)}
          rows="6"
          >{localizedConfigString(
            'announcementMessages',
            activeLocale,
          )}</textarea
        >
      </label>
    {/key}
  </section>

  <section>
    <ToggleField
      name={fieldName('builtin', 'socialLinksEnabled')}
      label={t('admin.socialLinks')}
      checked={config.socialLinksEnabled === true}
    />
    <label>
      {t('admin.links')} <small>{t('admin.linksHelp')}</small>
      <textarea name={fieldName('builtin', 'socialLinks')} rows="5"
        >{socialLinks}</textarea
      >
    </label>
  </section>

  <section>
    <ToggleField
      name={fieldName('builtin', 'privacyNoticeEnabled')}
      label={t('admin.privacyNotice')}
      checked={config.privacyNoticeEnabled === true}
    />
    {#key activeLocale}
      <label>
        {t('admin.noticeText')}
        <textarea
          name={fieldName('builtin', `privacyNoticeMessages.${activeLocale}`)}
          rows="4"
          >{localizedConfigString(
            'privacyNoticeMessages',
            activeLocale,
          )}</textarea
        >
      </label>
    {/key}
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
  section {
    --toggle-min-height: 24px;
    --toggle-font-size: 0.92rem;
    --toggle-label: var(--admin-text);
    --toggle-primary: var(--admin-primary);
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
  small {
    color: var(--admin-muted);
    font-weight: 500;
  }
  @media (prefers-color-scheme: dark) {
    label,
    small {
      color: var(--admin-muted);
    }
    textarea:focus {
      border-color: var(--admin-primary);
      outline: 0;
      box-shadow: 0 0 0 3px
        color-mix(in srgb, var(--admin-primary) 16%, transparent);
    }
    section {
      --toggle-border: var(--admin-border);
      --toggle-surface: var(--admin-surface);
      --toggle-primary: var(--admin-primary);
      --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    }
  }
</style>
