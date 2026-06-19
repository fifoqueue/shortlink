<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
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
  let pageInput = $state<string | null>(null);
  const visiblePageInput = $derived(pageInput ?? String(page));
  const pageInputWidth = $derived(
    `${Math.max(String(totalPages).length, visiblePageInput.length, 1) + 1}ch`,
  );
  const pageVersion = $derived(`${page}:${totalPages}`);

  $effect(() => {
    if (pageVersion) pageInput = null;
  });

  function normalizedInputPage() {
    const input = visiblePageInput.trim();
    const requestedPage = Number(input);
    if (!input || !Number.isFinite(requestedPage)) return null;
    return Math.max(1, Math.min(totalPages, Math.trunc(requestedPage)));
  }

  function updatePageInput(event: Event) {
    pageInput = (event.currentTarget as HTMLInputElement).value;
  }

  function resolvePath(path: string) {
    return resolve(path as '/');
  }

  function resetInvalidPageInput() {
    pageInput = String(normalizedInputPage() ?? page);
  }

  async function navigateToInputPage(event: SubmitEvent) {
    event.preventDefault();
    const targetPage = normalizedInputPage();
    if (!targetPage) {
      pageInput = String(page);
      return;
    }
    pageInput = String(targetPage);
    if (targetPage === page) return;
    await goto(resolvePath(getHref(targetPage)), { noScroll: preserveScroll });
  }
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
    <form class="page-status" onsubmit={navigateToInputPage}>
      <input
        type="number"
        min="1"
        max={totalPages}
        inputmode="numeric"
        value={visiblePageInput}
        style={`--page-input-width: ${pageInputWidth}`}
        aria-label={`${label} ${page} / ${totalPages}`}
        oninput={updatePageInput}
        onblur={resetInvalidPageInput}
      />
      <span aria-hidden="true">/</span>
      <span>{totalPages}</span>
    </form>
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
  .page-status {
    display: inline-flex;
    min-width: 42px;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--pagination-border, var(--border, #d9ded9));
    border-radius: var(--pagination-radius, 10px);
    padding: 0 12px;
    background: var(--pagination-surface, var(--surface, #fff));
    color: var(--pagination-muted, var(--muted, #59645d));
    font-size: 0.78rem;
    font-weight: 850;
    text-decoration: none;
  }
  .page-status {
    gap: 6px;
    margin: 0;
    color: var(--pagination-text, var(--text, CanvasText));
  }
  .page-status input {
    width: var(--page-input-width, 3ch);
    min-width: 2ch;
    border: 0;
    border-radius: 5px;
    padding: 2px 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    line-height: 1;
    text-align: center;
    outline: none;
  }
  .page-status input:focus {
    background: color-mix(
      in srgb,
      var(--pagination-primary, var(--primary, #24623f)) 10%,
      transparent
    );
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--pagination-primary, var(--primary, #24623f)) 18%,
        transparent
      );
  }
  .page-status input::-webkit-inner-spin-button,
  .page-status input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  .page-status input[type='number'] {
    appearance: textfield;
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
