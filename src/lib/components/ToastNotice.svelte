<script lang="ts">
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    message,
    ok = false,
    duration = 3600,
    fadeDuration = 260,
    locale = defaultSiteLocale,
  }: {
    message?: string;
    ok?: boolean;
    duration?: number;
    fadeDuration?: number;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
  const closeLabel = $derived(text.common.closeNotification);
  const closeText = $derived(text.common.close);

  let mounted = $state(false);
  let leaving = $state(false);
  let removeTimer: number | undefined;

  function clearRemoveTimer() {
    if (removeTimer === undefined) return;
    window.clearTimeout(removeTimer);
    removeTimer = undefined;
  }

  function dismiss() {
    if (!mounted || leaving) return;
    leaving = true;
    clearRemoveTimer();
    removeTimer = window.setTimeout(() => {
      mounted = false;
      removeTimer = undefined;
    }, fadeDuration);
  }

  $effect(() => {
    clearRemoveTimer();
    if (!message) {
      mounted = false;
      leaving = false;
      return;
    }

    mounted = true;
    leaving = false;
    if (duration <= 0) return;

    const timer = window.setTimeout(dismiss, duration);
    return () => {
      window.clearTimeout(timer);
      clearRemoveTimer();
    };
  });
</script>

{#if message && mounted}
  <div
    class:error={!ok}
    class:leaving
    class:success={ok}
    class="toast-notice"
    role={ok ? 'status' : 'alert'}
    style={`--toast-fade-duration:${fadeDuration}ms`}
  >
    <span>{message}</span>
    <button type="button" aria-label={closeLabel} onclick={dismiss}
      >{closeText}</button
    >
  </div>
{/if}

<style>
  .toast-notice {
    position: fixed;
    right: var(--notice-toast-right, 24px);
    bottom: var(--notice-toast-bottom, 24px);
    z-index: 100;
    display: grid;
    width: min(440px, calc(100vw - 32px));
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    border: 1px solid
      var(--notice-border, color-mix(in srgb, currentColor 18%, transparent));
    border-radius: var(--notice-radius, 12px);
    padding: 13px 14px 13px 16px;
    box-shadow: 0 18px 52px
      var(--notice-shadow, color-mix(in srgb, #000 18%, transparent));
    font-size: 0.88rem;
    font-weight: 720;
    line-height: 1.5;
    opacity: 1;
    transform: translateY(0);
    contain: layout paint;
    transition:
      opacity var(--toast-fade-duration, 260ms) ease,
      transform var(--toast-fade-duration, 260ms) ease;
    will-change: opacity, transform;
  }
  .toast-notice.success {
    background: var(--notice-success-bg, #eaf6ee);
    color: var(--notice-success-text, #215e40);
  }
  .toast-notice.error {
    background: var(--notice-error-bg, #fff0ed);
    color: var(--notice-error-text, #9b3829);
  }
  .toast-notice.leaving {
    opacity: 0;
    transform: translateY(8px);
  }
  .toast-notice span {
    min-width: 0;
  }
  .toast-notice button {
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 999px;
    padding: 5px 9px;
    background: color-mix(in srgb, currentColor 7%, transparent);
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 850;
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    .toast-notice {
      transition: none;
    }
  }
  @media (max-width: 640px) {
    .toast-notice {
      right: var(--notice-toast-mobile-right, 16px);
      bottom: var(--notice-toast-mobile-bottom, 16px);
    }
  }
</style>
