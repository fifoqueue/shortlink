<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';

  type LocaleOption = {
    id: SiteLocale;
    label: string;
    note?: string;
  };

  let {
    activeLocale = $bindable(defaultSiteLocale),
    label,
    options,
  }: {
    activeLocale?: SiteLocale;
    label: string;
    options: LocaleOption[];
  } = $props();

  $effect(() => {
    if (options.some((option) => option.id === activeLocale)) return;
    activeLocale = options[0]?.id ?? defaultSiteLocale;
  });
</script>

<label class="locale-field-selector">
  <span>{label}</span>
  <select bind:value={activeLocale} aria-label={label}>
    {#each options as option (option.id)}
      <option value={option.id}>{option.label}</option>
    {/each}
  </select>
</label>

<style>
  .locale-field-selector {
    display: grid;
    width: min(280px, 100%);
    gap: 7px;
    color: var(--admin-text, var(--text, #171717));
    font-size: 0.82rem;
    font-weight: 850;
  }
  select {
    width: 100%;
    min-height: var(--form-control-height, 42px);
    border: 1px solid var(--admin-border, var(--border, #d4d4d4));
    border-radius: var(--form-control-radius, 10px);
    padding: 0 12px;
    background: var(--admin-surface, var(--surface, #ffffff));
    color: var(--admin-text, var(--text, #171717));
    font: inherit;
    outline: none;
  }
  select:focus {
    border-color: var(--admin-primary, var(--primary, #24623f));
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--admin-primary, var(--primary, #24623f)) 14%,
        transparent
      );
  }
</style>
