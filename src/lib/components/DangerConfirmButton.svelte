<script lang="ts">
  import { tick } from 'svelte';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import ToggleField from './ToggleField.svelte';

  let {
    label,
    title,
    message,
    details = [],
    confirmLabel,
    cancelLabel,
    disabled = false,
    formId,
    name,
    value,
    requireConsent = false,
    consentLabel,
    size = 'regular',
    buttonTitle,
    locale = defaultSiteLocale,
    onconfirm,
  }: {
    label: string;
    title?: string;
    message?: string;
    details?: string[];
    confirmLabel?: string;
    cancelLabel?: string;
    disabled?: boolean;
    formId?: string;
    name?: string;
    value?: string;
    requireConsent?: boolean;
    consentLabel?: string;
    size?: 'regular' | 'small';
    buttonTitle?: string;
    locale?: SiteLocale;
    onconfirm?: () => void;
  } = $props();

  const text = $derived(uiText(locale));
  const resolvedTitle = $derived(title ?? text.common.runActionTitle);
  const resolvedMessage = $derived(message ?? text.common.irreversibleAction);
  const resolvedConfirmLabel = $derived(confirmLabel ?? text.common.confirm);
  const resolvedCancelLabel = $derived(cancelLabel ?? text.common.cancel);
  const resolvedConsentLabel = $derived(consentLabel ?? text.common.understood);
  let open = $state(false);
  let consent = $state(false);
  let triggerButton = $state<HTMLButtonElement>();
  let cancelButton = $state<HTMLButtonElement>();

  const canConfirm = $derived(!requireConsent || consent);

  async function openDialog() {
    if (disabled) return;
    consent = false;
    open = true;
    await tick();
    cancelButton?.focus();
  }

  function closeDialog() {
    open = false;
    triggerButton?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') closeDialog();
  }

  function closeFromBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeDialog();
  }

  function targetForm() {
    if (formId) {
      return document.getElementById(formId) as HTMLFormElement | null;
    }
    return triggerButton?.closest('form');
  }

  function submitConfirmed() {
    if (!canConfirm) return;
    if (onconfirm) {
      open = false;
      onconfirm();
      return;
    }

    const form = targetForm();
    if (!form) return;

    const submitter = document.createElement('button');
    submitter.type = 'submit';
    submitter.hidden = true;
    if (name) submitter.name = name;
    if (value !== undefined) submitter.value = value;
    form.append(submitter);
    open = false;
    form.requestSubmit(submitter);
    window.setTimeout(() => submitter.remove(), 0);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  bind:this={triggerButton}
  class:small={size === 'small'}
  class="danger-confirm-trigger"
  type="button"
  title={buttonTitle}
  {disabled}
  onclick={openDialog}
>
  {label}
</button>

{#if open}
  <div class="confirm-backdrop" role="presentation" onclick={closeFromBackdrop}>
    <div
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={resolvedTitle}
    >
      <div>
        <p class="eyebrow">{text.common.confirmRequired}</p>
        <h2>{resolvedTitle}</h2>
        <p class="message">{resolvedMessage}</p>
      </div>

      {#if details.length > 0}
        <ul>
          {#each details as detail (detail)}
            <li>{detail}</li>
          {/each}
        </ul>
      {/if}

      {#if requireConsent}
        <div class="consent">
          <ToggleField bind:checked={consent} label={resolvedConsentLabel} />
        </div>
      {/if}

      <div class="dialog-actions">
        <button
          bind:this={cancelButton}
          class="secondary"
          type="button"
          onclick={closeDialog}>{resolvedCancelLabel}</button
        >
        <button
          class="danger-action"
          type="button"
          disabled={!canConfirm}
          onclick={submitConfirmed}>{resolvedConfirmLabel}</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .danger-confirm-trigger {
    --confirm-danger: var(
      --managed-link-danger,
      var(--page-danger, var(--admin-danger, #c84432))
    );
    --confirm-danger-text: var(
      --managed-link-danger-text,
      var(--page-danger-text, var(--admin-danger-text, #9b3829))
    );
    --confirm-surface: var(
      --managed-link-surface,
      var(--page-surface, var(--admin-surface, #ffffff))
    );
    --confirm-border: var(
      --managed-link-border,
      var(--page-border, var(--admin-border, #e6e1dc))
    );
    display: inline-flex;
    width: fit-content;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    border: 1px solid
      color-mix(in srgb, var(--confirm-danger) 32%, var(--confirm-border));
    border-radius: 10px;
    padding: 10px 15px;
    background: color-mix(
      in srgb,
      var(--confirm-danger) 12%,
      var(--confirm-surface)
    );
    color: var(--confirm-danger-text);
    font: inherit;
    font-weight: 850;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }
  .danger-confirm-trigger.small {
    min-height: 34px;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.76rem;
    font-weight: 800;
  }
  .danger-confirm-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 18px;
    background: color-mix(in srgb, #000 42%, transparent);
  }
  .confirm-dialog {
    --confirm-dialog-surface: var(
      --page-surface,
      var(--admin-panel, var(--admin-surface, #ffffff))
    );
    --confirm-dialog-text: var(
      --page-text,
      var(--admin-text, var(--text, #171717))
    );
    --confirm-dialog-muted: var(
      --page-muted,
      var(--admin-muted, var(--muted, #6b7280))
    );
    --confirm-dialog-primary: var(
      --page-primary,
      var(--admin-primary, var(--primary, #171717))
    );
    --confirm-dialog-danger: var(--page-danger, var(--admin-danger, #c84432));
    --confirm-dialog-danger-text: var(
      --page-danger-text,
      var(--admin-danger-text, #9b3829)
    );
    --confirm-dialog-border: var(
      --page-border,
      var(--admin-border, var(--border, #e6e1dc))
    );
    display: grid;
    width: min(480px, 100%);
    gap: 18px;
    border: 1px solid var(--confirm-dialog-border);
    border-radius: 18px;
    padding: 22px;
    background: var(--confirm-dialog-surface);
    box-shadow: 0 28px 90px color-mix(in srgb, #000 28%, transparent);
    color: var(--confirm-dialog-text);
  }
  .eyebrow,
  h2,
  .message,
  ul {
    margin: 0;
  }
  .eyebrow {
    color: var(--confirm-dialog-danger);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }
  h2 {
    margin-top: 6px;
    font-size: 1.2rem;
    line-height: 1.35;
  }
  .message,
  li,
  .consent {
    color: var(--confirm-dialog-muted);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  ul {
    display: grid;
    gap: 8px;
    padding-left: 19px;
  }
  .consent {
    border: 1px solid
      color-mix(
        in srgb,
        var(--confirm-dialog-danger) 22%,
        var(--confirm-dialog-border)
      );
    border-radius: 12px;
    padding: 12px;
    background: color-mix(
      in srgb,
      var(--confirm-dialog-danger) 7%,
      var(--confirm-dialog-surface)
    );
    font-weight: 760;
    --toggle-border: var(--confirm-dialog-border);
    --toggle-surface: var(--confirm-dialog-surface);
    --toggle-primary: var(--confirm-dialog-danger);
    --toggle-focus: color-mix(
      in srgb,
      var(--confirm-dialog-danger) 18%,
      transparent
    );
    --toggle-label: var(--confirm-dialog-muted);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .dialog-actions button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--confirm-dialog-border);
    border-radius: 10px;
    padding: 10px 14px;
    background: var(--confirm-dialog-surface);
    color: var(--confirm-dialog-text);
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }
  .dialog-actions .danger-action {
    border-color: color-mix(
      in srgb,
      var(--confirm-dialog-danger) 34%,
      var(--confirm-dialog-border)
    );
    background: color-mix(
      in srgb,
      var(--confirm-dialog-danger) 12%,
      var(--confirm-dialog-surface)
    );
    color: var(--confirm-dialog-danger-text);
  }
  .dialog-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  @media (max-width: 520px) {
    .confirm-dialog {
      padding: 18px;
    }
    .dialog-actions {
      display: grid;
    }
    .dialog-actions button {
      width: 100%;
    }
  }
</style>
