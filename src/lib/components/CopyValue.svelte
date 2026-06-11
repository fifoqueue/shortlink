<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    value,
    copied = false,
    label,
    copiedLabel,
    copyLabel,
    onclick,
    locale = defaultSiteLocale,
  }: {
    value: string;
    copied?: boolean;
    label?: string;
    copiedLabel?: string;
    copyLabel?: string;
    onclick?: (event: MouseEvent) => void;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
</script>

<button class="copy-value" type="button" {onclick}>
  {#if label}
    <span>{label}</span>
  {/if}
  <code>{value}</code>
  <em
    >{copied
      ? (copiedLabel ?? text.common.copied)
      : (copyLabel ?? text.common.copiedHint)}</em
  >
</button>

<style>
  .copy-value {
    display: grid;
    width: 100%;
    min-height: auto;
    gap: 6px;
    justify-items: start;
    border: var(--copy-border, 0);
    border-radius: var(--copy-radius, 12px);
    padding: var(--copy-padding, 13px 15px);
    background: var(--copy-bg, var(--page-text, var(--admin-text, CanvasText)));
    color: var(--copy-text, var(--page-bg, var(--admin-bg, Canvas)));
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  span {
    color: var(--copy-label, var(--page-muted, var(--admin-muted, GrayText)));
    font-size: 0.76rem;
    font-weight: 850;
  }
  code {
    width: 100%;
    overflow-x: auto;
    color: var(--copy-code, currentColor);
    font:
      0.88rem ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    font-weight: 650;
    overflow-wrap: anywhere;
    white-space: nowrap;
  }
  em {
    color: var(
      --copy-accent,
      var(--page-primary, var(--admin-primary, LinkText))
    );
    font-size: 0.74rem;
    font-style: normal;
    font-weight: 850;
  }
</style>
