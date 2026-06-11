<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteURL } from 'svelte/reactivity';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import type { SearchOption } from '$lib/search';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    baseHref,
    field,
    query,
    options,
    fieldName = 'searchBy',
    queryName = 'q',
    pageName = 'page',
    label,
    placeholder,
    submitLabel,
    clearLabel,
    locale = defaultSiteLocale,
  }: {
    baseHref: string;
    field: string;
    query: string;
    options: SearchOption[];
    fieldName?: string;
    queryName?: string;
    pageName?: string;
    label?: string;
    placeholder?: string;
    submitLabel?: string;
    clearLabel?: string;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
  const resolvedLabel = $derived(label ?? text.common.search);
  const resolvedPlaceholder = $derived(
    placeholder ?? text.common.searchPlaceholder,
  );
  const resolvedSubmitLabel = $derived(submitLabel ?? text.common.search);
  const resolvedClearLabel = $derived(clearLabel ?? text.common.clear);
  function resolvePath(path: string) {
    return resolve(path as '/');
  }

  const resolvedBaseHref = $derived(resolvePath(baseHref));
  const selectedField = $derived(
    options.some((option) => option.value === field)
      ? field
      : (options[0]?.value ?? ''),
  );
  const hasQuery = $derived(query.trim().length > 0);

  function searchTarget(form: HTMLFormElement) {
    const formData = new FormData(form);
    const nextField = String(formData.get(fieldName) ?? selectedField);
    const nextQuery = String(formData.get(queryName) ?? '').trim();
    const current = new SvelteURL(window.location.href);
    const target = new SvelteURL(baseHref || current.pathname, current.origin);

    if (!target.search) target.search = current.search;
    target.searchParams.delete(pageName);

    if (nextQuery) {
      target.searchParams.set(fieldName, nextField);
      target.searchParams.set(queryName, nextQuery);
    } else {
      target.searchParams.delete(fieldName);
      target.searchParams.delete(queryName);
    }

    return `${target.pathname}${target.search}`;
  }

  async function submitSearch(event: SubmitEvent) {
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    event.preventDefault();
    await goto(resolvePath(searchTarget(form)), {
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<form
  class="search-form"
  method="GET"
  action={resolvedBaseHref}
  role="search"
  onsubmit={submitSearch}
>
  <span class="search-label">{resolvedLabel}</span>
  <div class="search-controls">
    <select
      name={fieldName}
      value={selectedField}
      aria-label={text.search.ariaField}
    >
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <input
      name={queryName}
      type="search"
      value={query}
      placeholder={resolvedPlaceholder}
      autocomplete="off"
      aria-label={text.search.ariaQuery}
    />
    <button type="submit">{resolvedSubmitLabel}</button>
    {#if hasQuery}
      <a href={resolvedBaseHref}>{resolvedClearLabel}</a>
    {/if}
  </div>
</form>

<style>
  .search-form {
    display: grid;
    gap: 10px;
    margin-bottom: 12px;
    border: 1px solid
      var(
        --search-border,
        var(--managed-link-border, var(--admin-border, var(--border)))
      );
    border-radius: var(
      --search-radius,
      var(--managed-link-radius, var(--admin-radius, var(--radius)))
    );
    padding: 12px;
    background: var(
      --search-surface,
      var(--managed-link-surface, var(--admin-panel, var(--surface)))
    );
  }
  .search-label {
    color: var(
      --search-muted,
      var(--managed-link-muted, var(--admin-muted, var(--muted)))
    );
    font-size: 0.76rem;
    font-weight: 850;
  }
  .search-controls {
    display: grid;
    grid-template-columns: minmax(130px, 190px) minmax(0, 1fr) auto auto;
    gap: 8px;
  }
  select,
  input,
  button,
  a {
    min-height: 42px;
    border: 1px solid
      var(
        --search-border,
        var(--managed-link-border, var(--admin-border, var(--border)))
      );
    border-radius: calc(
      var(
          --search-radius,
          var(--managed-link-radius, var(--admin-radius, var(--radius)))
        ) *
        0.45
    );
    font: inherit;
  }
  select,
  input {
    width: 100%;
    min-width: 0;
    padding: 0 12px;
    background: var(
      --search-input-bg,
      var(--managed-link-bg, var(--admin-surface, var(--page-bg)))
    );
    color: var(
      --search-text,
      var(--managed-link-text, var(--admin-text, var(--text)))
    );
    outline: none;
  }
  select:focus,
  input:focus {
    border-color: var(
      --search-primary,
      var(--managed-link-primary, var(--admin-primary, var(--primary)))
    );
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(
            --search-primary,
            var(--managed-link-primary, var(--admin-primary, var(--primary)))
          )
          14%,
        transparent
      );
  }
  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    font-size: 0.8rem;
    font-weight: 850;
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
  }
  button {
    background: var(
      --search-primary,
      var(--managed-link-primary, var(--admin-primary, var(--primary)))
    );
    color: var(
      --search-primary-contrast,
      var(
        --managed-link-primary-contrast,
        var(--admin-primary-contrast, var(--primary-contrast))
      )
    );
    cursor: pointer;
  }
  a {
    background: transparent;
    color: var(
      --search-muted,
      var(--managed-link-muted, var(--admin-muted, var(--muted)))
    );
  }
  @media (max-width: 640px) {
    .search-controls {
      grid-template-columns: 1fr;
    }
    button,
    a {
      width: 100%;
    }
  }
</style>
