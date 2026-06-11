<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import {
    defaultSiteLocale,
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

  let selectedLocale = $state<SiteLocale>(defaultSiteLocale);
  let pending = $state(false);
  const text = $derived(uiText(selectedLocale));
  const returnTo = $derived(
    `${page.url.pathname}${page.url.search}${page.url.hash}`,
  );

  $effect(() => {
    selectedLocale = locale;
  });

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
      {#each siteLocaleKeys as option}
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
    min-height: 38px;
    border: 1px solid var(--locale-border);
    border-radius: 999px;
    padding: 0 34px 0 13px;
    background: var(--locale-bg);
    color: var(--locale-text);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 850;
  }
</style>
