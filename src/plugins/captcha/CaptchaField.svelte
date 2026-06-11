<script lang="ts">
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    AuthenticatedUser,
    PluginConfig,
    PluginLocaleKey,
    PluginLocaleStrings,
  } from '$lib/plugin-contracts';
  import {
    actionName,
    isActionProtected,
    normalizeCaptchaConfig,
    scriptUrlForProvider,
    type CaptchaAction,
  } from './config';

  let {
    config,
    action,
    user = null,
    strings = {},
  }: {
    config: PluginConfig;
    action: CaptchaAction;
    user?: AuthenticatedUser | null;
    strings?: PluginLocaleStrings;
  } = $props();

  const captcha = $derived(normalizeCaptchaConfig(config));
  const enabled = $derived(
    user?.isAdmin !== true && isActionProtected(captcha, action),
  );
  const tokenField = $derived(captcha.tokenFieldName);
  const scriptUrl = $derived(enabled ? scriptUrlForProvider(captcha) : '');
  const actionValue = $derived(actionName(action));
  let clientError = $state('');
  let resetNonce = $state(0);

  const loadedScripts: Record<string, Promise<void> | undefined> = {};

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }

  type Grecaptcha = {
    ready: (callback: () => void) => void;
    execute: (
      siteKeyOrWidgetId: string | number,
      options?: { action?: string },
    ) => Promise<string> | void;
    render: (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => number;
    reset: (widgetId?: number) => void;
  };

  type RenderCaptchaApi = {
    render: (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => string | number;
    reset?: (widgetId?: string | number) => void;
    remove?: (widgetId: string | number) => void;
  };

  function scriptId(src: string) {
    let hash = 0;
    for (const char of src) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return `captcha-script-${Math.abs(hash)}`;
  }

  function loadScript(src: string) {
    if (!src) return Promise.resolve();
    const existingPromise = loadedScripts[src];
    if (existingPromise) return existingPromise;

    const promise = new Promise<void>((resolve, reject) => {
      const id = scriptId(src);
      const existing = document.getElementById(id) as HTMLScriptElement | null;
      if (existing?.dataset.loaded === 'true') {
        resolve();
        return;
      }
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener(
        'load',
        () => {
          script.dataset.loaded = 'true';
          resolve();
        },
        { once: true },
      );
      script.addEventListener('error', () => reject(), { once: true });
      document.head.append(script);
    });

    loadedScripts[src] = promise;
    return promise;
  }

  async function waitForGlobal<T>(name: string) {
    await loadScript(scriptUrl);
    return new Promise<T>((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        const api = (window as unknown as Record<string, T | undefined>)[name];
        if (api) {
          window.clearInterval(timer);
          resolve(api);
          return;
        }
        if (Date.now() - started > 10000) {
          window.clearInterval(timer);
          reject(new Error('CAPTCHA script load timeout'));
        }
      }, 80);
    });
  }

  function ensureInput(form: HTMLFormElement, name: string) {
    let input = form.querySelector<HTMLInputElement>(
      `input[name="${CSS.escape(name)}"]`,
    );
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.append(input);
    }
    return input;
  }

  function waitForGrecaptcha() {
    return waitForGlobal<Grecaptcha>('grecaptcha');
  }

  function submissionMethod(form: HTMLFormElement, event: SubmitEvent) {
    const submitter = event.submitter;
    if (
      submitter instanceof HTMLButtonElement ||
      submitter instanceof HTMLInputElement
    ) {
      return (submitter.formMethod || form.method || 'get').toLowerCase();
    }
    return (form.method || 'get').toLowerCase();
  }

  function shouldResetAfterSubmit(form: HTMLFormElement, event: SubmitEvent) {
    return ['post', 'patch', 'put'].includes(submissionMethod(form, event));
  }

  function scheduleResetAfterSubmit(form: HTMLFormElement, event: SubmitEvent) {
    if (!shouldResetAfterSubmit(form, event)) return;
    window.setTimeout(() => {
      ensureInput(form, tokenField).value = '';
      resetNonce += 1;
    }, 0);
  }

  function loadCaptchaScript(_node: HTMLElement) {
    void _node;
    if (!scriptUrl) return {};
    loadScript(scriptUrl).catch(() => {
      clientError = t('public.scriptLoadError');
    });
    return {};
  }

  function renderChallenge(node: HTMLElement) {
    const targetForm = node.closest('form');
    if (!(targetForm instanceof HTMLFormElement)) return {};
    const form = targetForm;
    let widgetId: string | number | null = null;
    let api: RenderCaptchaApi | null = null;

    async function render() {
      if (widgetId !== null || !scriptUrl) return;
      clientError = '';
      try {
        const providerApi =
          captcha.provider === 'turnstile'
            ? await waitForGlobal<RenderCaptchaApi>('turnstile')
            : captcha.provider === 'hcaptcha'
              ? await waitForGlobal<RenderCaptchaApi>('hcaptcha')
              : await waitForGlobal<RenderCaptchaApi>('grecaptcha');
        api = providerApi;
        const input = ensureInput(form, tokenField);
        widgetId = providerApi.render(node, {
          sitekey: captcha.siteKey,
          callback: (token: string) => {
            input.value = token;
          },
          'expired-callback': () => {
            input.value = '';
          },
          'error-callback': () => {
            input.value = '';
          },
          'response-field': false,
        });
      } catch {
        clientError = t('public.renderError');
      }
    }

    render();

    return {
      destroy() {
        if (widgetId === null) return;
        api?.remove?.(widgetId);
      },
    };
  }

  function bindSubmit(node: HTMLElement) {
    const targetForm = node.closest('form');
    if (!(targetForm instanceof HTMLFormElement)) return {};
    const form = targetForm;

    let submitting = false;
    let lastTokenAt = 0;
    let submitter: HTMLElement | null = null;
    let invisibleWidgetId: number | null = null;
    let invisibleResolve: ((token: string) => void) | null = null;
    let invisibleReject: (() => void) | null = null;

    async function executeCaptcha() {
      const grecaptcha = await waitForGrecaptcha();
      if (captcha.provider === 'recaptcha-v3') {
        return new Promise<string>((resolve, reject) => {
          grecaptcha.ready(() => {
            Promise.resolve(
              grecaptcha.execute(captcha.siteKey, { action: actionValue }),
            )
              .then((token) => resolve(String(token)))
              .catch(reject);
          });
        });
      }

      return new Promise<string>((resolve, reject) => {
        invisibleResolve = resolve;
        invisibleReject = reject;
        grecaptcha.ready(() => {
          if (invisibleWidgetId === null) {
            invisibleWidgetId = grecaptcha.render(node, {
              sitekey: captcha.siteKey,
              size: 'invisible',
              callback: (token: string) => invisibleResolve?.(token),
              'error-callback': () => invisibleReject?.(),
              'expired-callback': () => invisibleReject?.(),
            });
          }
          grecaptcha.reset(invisibleWidgetId);
          grecaptcha.execute(invisibleWidgetId);
        });
      });
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest<HTMLElement>(
        'button[type="submit"], input[type="submit"]',
      );
      if (button && form.contains(button)) submitter = button;
    }

    async function onSubmit(event: SubmitEvent) {
      if (
        captcha.provider !== 'recaptcha-v3' &&
        captcha.provider !== 'recaptcha-invisible'
      ) {
        scheduleResetAfterSubmit(form, event);
        return;
      }

      if (submitting) return;

      const input = ensureInput(form, tokenField);
      if (input.value && Date.now() - lastTokenAt < 90000) {
        scheduleResetAfterSubmit(form, event);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      clientError = '';

      try {
        submitting = true;
        input.value = await executeCaptcha();
        lastTokenAt = Date.now();
        window.requestAnimationFrame(() => {
          form.requestSubmit(submitter ?? undefined);
        });
      } catch {
        input.value = '';
        clientError = t('public.loadError');
      } finally {
        submitting = false;
      }
    }

    form.addEventListener('click', onClick, true);
    form.addEventListener('submit', onSubmit, true);

    return {
      destroy() {
        form.removeEventListener('click', onClick, true);
        form.removeEventListener('submit', onSubmit, true);
      },
    };
  }
</script>

{#if enabled}
  {#key resetNonce}
    <div class="captcha-field" use:loadCaptchaScript use:bindSubmit>
      {#if captcha.provider === 'turnstile'}
        <input type="hidden" name={tokenField} />
        <div class="captcha-widget" use:renderChallenge></div>
      {:else if captcha.provider === 'hcaptcha'}
        <input type="hidden" name={tokenField} />
        <div class="captcha-widget" use:renderChallenge></div>
      {:else if captcha.provider === 'recaptcha-v2'}
        <input type="hidden" name={tokenField} />
        <div class="captcha-widget" use:renderChallenge></div>
      {:else if captcha.provider === 'recaptcha-v3'}
        <input type="hidden" name={tokenField} />
        <p>{t('public.recaptchaProtected')}</p>
      {:else if captcha.provider === 'recaptcha-invisible'}
        <input type="hidden" name={tokenField} />
      {:else}
        <div class="captcha-custom">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html captcha.customWidgetHtml}
        </div>
      {/if}
      {#if clientError}
        <p class="captcha-error" aria-live="polite">{clientError}</p>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .captcha-field {
    display: grid;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    gap: 8px;
    margin-top: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
  }
  .captcha-widget,
  .captcha-custom {
    max-width: 100%;
    min-width: 0;
  }
  .captcha-widget {
    width: max-content;
  }
  .captcha-widget :global(iframe),
  .captcha-custom :global(iframe) {
    max-width: 100%;
  }
  .captcha-field > p {
    margin: 0;
    color: var(--page-muted, var(--admin-muted));
    font-size: 0.76rem;
    line-height: 1.5;
  }
  .captcha-error {
    color: var(--notice-error-text, #a13b2b);
  }
</style>
