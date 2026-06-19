<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  type SecurityTokenInput = {
    name: string;
    value: string;
  };

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const securityTokenInputs = $derived(
    [data.securityFormTokens.csrf, data.securityFormTokens.webAction].filter(
      (input): input is SecurityTokenInput => Boolean(input),
    ),
  );

  function submitterFormMethod(submitter: SubmitEvent['submitter']) {
    if (
      submitter instanceof HTMLButtonElement ||
      submitter instanceof HTMLInputElement
    ) {
      return submitter.formMethod;
    }
    return '';
  }

  function submitterFormAction(submitter: SubmitEvent['submitter']) {
    if (
      submitter instanceof HTMLButtonElement ||
      submitter instanceof HTMLInputElement
    ) {
      return submitter.getAttribute('formaction') || submitter.formAction;
    }
    return '';
  }

  function formMethodIsPost(
    form: HTMLFormElement,
    submitter: SubmitEvent['submitter'] = null,
  ) {
    const method =
      submitterFormMethod(submitter) ||
      form.getAttribute('method') ||
      form.method ||
      'get';
    return method.toLowerCase() === 'post';
  }

  function formActionIsSameOrigin(
    form: HTMLFormElement,
    submitter: SubmitEvent['submitter'] = null,
  ) {
    try {
      const action =
        submitterFormAction(submitter) ||
        form.getAttribute('action') ||
        form.action ||
        window.location.href;
      return (
        new URL(action || window.location.href, window.location.href).origin ===
        window.location.origin
      );
    } catch {
      return false;
    }
  }

  function hiddenInput(form: HTMLFormElement, name: string) {
    for (const input of form.querySelectorAll('input[type="hidden"]')) {
      if (input instanceof HTMLInputElement && input.name === name) {
        return input;
      }
    }
    return null;
  }

  function upsertHiddenInput(form: HTMLFormElement, input: SecurityTokenInput) {
    const field =
      hiddenInput(form, input.name) ?? document.createElement('input');
    field.type = 'hidden';
    field.name = input.name;
    field.value = input.value;
    if (!field.parentElement) form.prepend(field);
  }

  function injectFormSecurityTokens(
    form: HTMLFormElement,
    submitter: SubmitEvent['submitter'] = null,
  ) {
    if (securityTokenInputs.length === 0) return;
    if (!formMethodIsPost(form, submitter)) return;
    if (!formActionIsSameOrigin(form, submitter)) return;
    for (const input of securityTokenInputs) upsertHiddenInput(form, input);
  }

  function injectAllFormSecurityTokens() {
    if (typeof document === 'undefined') return;
    for (const form of document.forms) injectFormSecurityTokens(form);
  }

  function scheduleFormSecurityTokenInjection() {
    void tick().then(injectAllFormSecurityTokens);
  }

  $effect(() => {
    const tokenKey = securityTokenInputs
      .map((input) => `${input.name}:${input.value}`)
      .join('\n');
    if (tokenKey || securityTokenInputs.length === 0) {
      scheduleFormSecurityTokenInjection();
    }
  });

  afterNavigate(scheduleFormSecurityTokenInjection);

  onMount(() => {
    injectAllFormSecurityTokens();

    const handleSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement) {
        injectFormSecurityTokens(event.target, event.submitter);
      }
    };
    document.addEventListener('submit', handleSubmit, true);

    const observer = new MutationObserver(scheduleFormSecurityTokenInjection);
    observer.observe(document.documentElement, {
      attributeFilter: ['action', 'formaction', 'formmethod', 'method'],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      document.removeEventListener('submit', handleSubmit, true);
      observer.disconnect();
    };
  });
</script>

{@render children()}
