<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import type { PluginComponentProps } from '$lib/plugin-contracts';

  let {
    config,
    locale = defaultSiteLocale,
    fallbackLocale = locale,
  }: PluginComponentProps = $props();

  function localizedConfigString(field: string, itemLocale: SiteLocale) {
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

  const announcementHtml = $derived(
    localizedConfigString('announcementMessages', locale),
  );
</script>

{#if config.announcementEnabled === true && announcementHtml}
  <aside>
    <div class="content">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html announcementHtml}
    </div>
  </aside>
{/if}

<style>
  aside {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 20px;
    background: var(--primary);
    color: var(--primary-contrast);
    font-size: 0.82rem;
    font-weight: 700;
    text-align: center;
  }
  .content :global(*) {
    margin-top: 0;
    margin-bottom: 0;
  }
  .content :global(a) {
    color: inherit;
    font-weight: 900;
  }
</style>
