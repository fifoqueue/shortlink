<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';
  import ToggleField from './ToggleField.svelte';

  type ConfirmDetailPart =
    | string
    | {
        text: string | number;
        strong?: boolean;
      };
  type ConfirmDetail =
    | string
    | ConfirmDetailPart[]
    | {
        tone?: 'danger';
        parts: ConfirmDetailPart[];
      };

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
    details?: ConfirmDetail[];
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
  let confirmedSubmit = false;
  let triggerButton = $state<HTMLButtonElement | null>(null);

  const canConfirm = $derived(!requireConsent || consent);

  function openDialog() {
    if (disabled) return;
    consent = false;
    open = true;
  }

  function targetForm() {
    if (formId) {
      return document.getElementById(formId) as HTMLFormElement | null;
    }
    return triggerButton?.closest('form');
  }

  onMount(() => {
    if (formId || onconfirm) return;
    const form = triggerButton?.closest('form');
    if (!form) return;

    const handleSubmit = (event: SubmitEvent) => {
      if (confirmedSubmit) {
        confirmedSubmit = false;
        return;
      }
      if (disabled || onconfirm) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void openDialog();
    };

    form.addEventListener('submit', handleSubmit, { capture: true });
    return () => {
      form.removeEventListener('submit', handleSubmit, { capture: true });
    };
  });

  function submitConfirmed() {
    if (!canConfirm || disabled) return;
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
    confirmedSubmit = true;
    form.requestSubmit(submitter);
    window.setTimeout(() => {
      confirmedSubmit = false;
      submitter.remove();
    }, 0);
  }
</script>

<AlertDialog.Root bind:open>
  <Button
    bind:ref={triggerButton}
    variant="destructive"
    size={size === 'small' ? 'sm' : 'default'}
    class="danger-confirm-trigger"
    type="button"
    title={buttonTitle}
    {disabled}
    onclick={openDialog}>{label}</Button
  >
  <AlertDialog.Content
    portalProps={{
      to:
        triggerButton?.closest<HTMLElement>('.site-theme, .admin-theme') ??
        'body',
    }}
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      triggerButton?.focus();
    }}
  >
    <AlertDialog.Header>
      <AlertDialog.Title>{resolvedTitle}</AlertDialog.Title>
      <AlertDialog.Description class="text-pretty leading-relaxed"
        >{resolvedMessage}</AlertDialog.Description
      >
    </AlertDialog.Header>
    {#if details.length > 0}
      <ul class:single={details.length === 1}>
        {#each details as detail, index (index)}
          <li
            class:danger-detail={typeof detail !== 'string' &&
              !Array.isArray(detail) &&
              detail.tone === 'danger'}
          >
            {#if typeof detail === 'string'}
              {detail}
            {:else}
              {@const parts = Array.isArray(detail) ? detail : detail.parts}
              {#each parts as part, partIndex (partIndex)}
                {#if typeof part === 'string'}
                  {part}
                {:else if part.strong}
                  <strong>{part.text}</strong>
                {:else}
                  {part.text}
                {/if}
              {/each}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if requireConsent}
      <div class="consent">
        <ToggleField bind:checked={consent} label={resolvedConsentLabel} />
      </div>
    {/if}

    <AlertDialog.Footer>
      <AlertDialog.Cancel type="button"
        >{resolvedCancelLabel}</AlertDialog.Cancel
      >
      <Button
        variant="destructive"
        type="button"
        disabled={!canConfirm || disabled}
        onclick={submitConfirmed}>{resolvedConfirmLabel}</Button
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  ul {
    list-style: disc;
    margin: 0;
    padding-left: 20px;
    font-size: 0.85rem;
    line-height: 1.65;
    overflow-wrap: anywhere;
    color: var(--ui-muted-foreground);
  }
  ul.single {
    list-style: none;
    padding-left: 0;
  }
  li + li {
    margin-top: 8px;
  }
  .danger-detail {
    color: var(--ui-destructive);
  }
  .consent {
    border-top: 1px solid var(--ui-border);
    padding-top: 16px;
  }
</style>
