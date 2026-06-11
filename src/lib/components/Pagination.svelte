<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  type Props = {
    page: number;
    totalPages: number;
    getHref: (page: number) => string;
    label: string;
    preserveScroll?: boolean;
    locale?: SiteLocale;
  };

  let {
    page,
    totalPages,
    getHref,
    label,
    preserveScroll = true,
    locale = defaultSiteLocale,
  }: Props = $props();

  const text = $derived(uiText(locale));
</script>

{#if totalPages > 1}
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <nav
    class="pagination"
    aria-label={label}
    data-sveltekit-noscroll={preserveScroll ? '' : undefined}
  >
    <a
      href={getHref(page - 1)}
      aria-disabled={page <= 1}
      class:disabled={page <= 1}>{text.common.previous}</a
    >
    <span>{page} / {totalPages}</span>
    <a
      href={getHref(page + 1)}
      aria-disabled={page >= totalPages}
      class:disabled={page >= totalPages}>{text.common.next}</a
    >
  </nav>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 16px;
  }
  .pagination a,
  .pagination span {
    display: grid;
    min-width: 42px;
    min-height: 38px;
    place-items: center;
    border: 1px solid var(--pagination-border, var(--border, #d9ded9));
    border-radius: var(--pagination-radius, 10px);
    padding: 0 12px;
    background: var(--pagination-surface, var(--surface, #fff));
    color: var(--pagination-muted, var(--muted, #59645d));
    font-size: 0.78rem;
    font-weight: 850;
    text-decoration: none;
  }
  .pagination span {
    color: var(--pagination-text, var(--text, CanvasText));
  }
  .pagination a:not(.disabled):hover {
    border-color: var(--pagination-primary, var(--primary, #24623f));
    color: var(--pagination-primary, var(--primary, #24623f));
  }
  .pagination .disabled {
    pointer-events: none;
    opacity: 0.45;
  }
</style>
