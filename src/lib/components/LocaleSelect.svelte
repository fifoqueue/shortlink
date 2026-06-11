<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import {
    siteLocaleKeys,
    siteLocaleLabel,
    type SiteLocale,
  } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    locale,
    compact = false,
  }: {
    locale: SiteLocale;
    compact?: boolean;
  } = $props();

  let selectedLocale = $derived(locale);
  let pending = $state(false);
  const text = $derived(uiText(selectedLocale));
  const returnTo = $derived(
    `${page.url.pathname}${page.url.search}${page.url.hash}`,
  );

  function submit(event: Event & { currentTarget: HTMLSelectElement }) {
    event.currentTarget.form?.requestSubmit();
  }

  async function changeLocale(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || pending) return;

    pending = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: {
          accept: 'application/json',
        },
      });
      if (!response.ok) {
        form.submit();
        return;
      }
      document.documentElement.lang = selectedLocale;
      await invalidateAll();
    } finally {
      pending = false;
    }
  }
</script>

<form
  class:compact
  class="locale-select"
  method="POST"
  action={resolve('/language')}
  onsubmit={changeLocale}
>
  <input type="hidden" name="returnTo" value={returnTo} />
  <label>
    <span>{text.locale.label}</span>
    <select
      name="locale"
      bind:value={selectedLocale}
      aria-label={text.locale.label}
      disabled={pending}
      onchange={submit}
    >
      {#each siteLocaleKeys as option (option)}
        <option value={option}>{siteLocaleLabel(option)}</option>
      {/each}
    </select>
  </label>
</form>

<style>
  .locale-select {
    --locale-border: var(
      --page-border,
      var(--admin-border, var(--border, #d4d4d4))
    );
    --locale-bg: var(
      --page-surface,
      var(--admin-surface, var(--surface, #ffffff))
    );
    --locale-text: var(--page-text, var(--admin-text, var(--text, #171717)));
    --locale-muted: var(
      --page-muted,
      var(--admin-muted, var(--muted, #6b7280))
    );
    width: fit-content;
  }
  label {
    display: inline-grid;
    gap: 5px;
    color: var(--locale-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }
  .compact label {
    display: block;
  }
  .compact span {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  select {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    min-width: 0;
    height: 38px;
    min-height: 38px;
    border: 1px solid var(--locale-border);
    border-radius: 999px;
    padding: 0 36px 0 13px;
    background-color: var(--locale-bg);
    background-image:
      linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 18px) 50%,
      calc(100% - 13px) 50%;
    background-repeat: no-repeat;
    background-size:
      5px 5px,
      5px 5px;
    color: var(--locale-text);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 850;
    line-height: 1.2;
    text-align: left;
    text-align-last: left;
  }
  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      select {
        font-size: 16px;
      }
    }
  }
</style>
