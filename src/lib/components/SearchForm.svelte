<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
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
    <Input
      name={queryName}
      type="search"
      value={query}
      placeholder={resolvedPlaceholder}
      autocomplete="off"
      aria-label={text.search.ariaQuery}
    />
    <Button type="submit" variant="outline">{resolvedSubmitLabel}</Button>
    {#if hasQuery}
      <a href={resolvedBaseHref}>{resolvedClearLabel}</a>
    {/if}
  </div>
</form>

<style>
  .search-form {
    margin-bottom: 16px;
  }
  .search-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .search-controls {
    display: grid;
    grid-template-columns: minmax(100px, 145px) minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }
  select {
    width: 100%;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius, 8px);
    background: var(--ui-card);
    color: var(--ui-foreground);
    font-size: 0.8rem;
  }
  a {
    color: var(--ui-muted-foreground);
    font-size: 0.8rem;
    text-underline-offset: 4px;
  }
  @media (max-width: 520px) {
    .search-controls {
      grid-template-columns: 110px minmax(0, 1fr);
    }
    .search-controls :global(button),
    a {
      justify-self: end;
    }
  }
</style>
