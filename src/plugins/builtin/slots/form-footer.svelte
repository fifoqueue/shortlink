<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import type { PluginComponentProps } from '$lib/plugin-contracts';

  let {
    config,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
  }: PluginComponentProps = $props();

  function localizedConfigString(
    field: string,
    itemLocale: SiteLocale,
  ) {
    const value = config[field];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const source = value as Partial<Record<SiteLocale, unknown>>;
      const localized = source[itemLocale];
      if (typeof localized === 'string') return localized;
      const fallback = source[fallbackLocale];
      if (typeof fallback === 'string') return fallback;
    }
    return '';
  }

  const privacyNoticeText = $derived(
    localizedConfigString('privacyNoticeMessages', locale),
  );
</script>

{#if config.privacyNoticeEnabled === true && privacyNoticeText}
  <p>ⓘ {privacyNoticeText}</p>
{/if}

<style>
  p {
    margin: 12px 4px 1px;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.6;
  }
</style>
