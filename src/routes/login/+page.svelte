<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import { providerButtonStyle } from '$lib/auth-provider-style';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import type { RuntimePluginSlotRender } from '$lib/plugin-contracts';
  import { publicPluginRegistry } from '../../plugins/public-registry';
  import { uiText } from '$lib/i18n/ui-text';

  type LoginProvider = {
    pluginId: string;
    id: string;
    label: string;
    buttonColor?: string;
    buttonTextColor?: string;
    iconUrl?: string;
    identifier?: {
      name: string;
      label: string;
      placeholder?: string;
      value?: string;
      required?: boolean;
      help?: string;
    };
  };

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      returnTo: string;
      notice: string;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      plugins: SiteSettings['plugins'];
      passwordEnabled: boolean;
      passkeyEnabled: boolean;
      registrationAllowed: boolean;
      resendVerificationAvailable: boolean;
      passwordResetAvailable: boolean;
      providers: LoginProvider[];
      runtimeSlots: RuntimePluginSlotRender[];
    };
    form?: { message?: string; totpRequired?: boolean };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
  let identifierProvider = $state<LoginProvider | null>(null);
  let identifierInput = $state<HTMLInputElement>();

  async function openIdentifierModal(provider: LoginProvider) {
    identifierProvider = provider;
    await tick();
    identifierInput?.focus();
  }

  function closeIdentifierModal() {
    identifierProvider = null;
  }

  function closeIdentifierModalFromBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeIdentifierModal();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeIdentifierModal();
  }

  function base64urlToBuffer(value: string) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function bufferToBase64url(value: ArrayBuffer) {
    const bytes = new Uint8Array(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function authenticationPublicKeyOptions(options: Record<string, unknown>) {
    return {
      ...options,
      challenge: base64urlToBuffer(String(options.challenge ?? '')),
    } as PublicKeyCredentialRequestOptions;
  }

  function serializeAssertionCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        authenticatorData: bufferToBase64url(response.authenticatorData),
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        signature: bufferToBase64url(response.signature),
        userHandle: response.userHandle
          ? bufferToBase64url(response.userHandle)
          : null,
      },
    };
  }

  async function attemptPasskeyLogin() {
    if (!data.passkeyEnabled || !window.PublicKeyCredential) return;
    const optionsResponse = await fetch(
      `${resolve('/login/passkey')}?returnTo=${encodeURIComponent(data.returnTo)}`,
    );
    if (!optionsResponse.ok) return;
    const credential = (await navigator.credentials.get({
      publicKey: authenticationPublicKeyOptions(await optionsResponse.json()),
      mediation: 'optional',
    })) as PublicKeyCredential | null;
    if (!credential) return;
    const loginResponse = await fetch(resolve('/login/passkey'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(serializeAssertionCredential(credential)),
    });
    if (!loginResponse.ok) return;
    const body = (await loginResponse.json().catch(() => ({}))) as {
      returnTo?: string;
    };
    window.location.assign(body.returnTo ?? data.returnTo);
  }

  onMount(() => {
    void attemptPasskeyLogin().catch(() => {
      // Password and SSO login remain available when passkey mediation is canceled.
    });
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>{text.auth.loginTitle} · {data.siteName}</title>
</svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message || data.notice}
    {#key form?.message ?? data.notice}
      <ToastNotice
        message={form?.message ?? data.notice}
        locale={data.locale}
      />
    {/key}
  {/if}

  <section>
    <div class="topline">
      <p class="kicker">{data.siteName}</p>
      <LocaleSelect locale={data.locale} compact />
    </div>
    <h1>{text.auth.loginTitle}</h1>
    <p class="muted">{text.auth.loginDescription}</p>

    {#if form?.totpRequired}
      <form method="POST" action="?/login" use:enhance>
        <input type="hidden" name="returnTo" value={data.returnTo} />
        <label>
          {text.auth.totpCode}
          <input
            type="text"
            name="totpCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
          />
        </label>
        <button type="submit">{text.auth.verifyTotp}</button>
      </form>
    {:else if data.passwordEnabled}
      <form method="POST" action="?/login" use:enhance>
        <input type="hidden" name="returnTo" value={data.returnTo} />
        <label
          >{text.auth.email} <input type="email" name="email" required /></label
        >
        <label
          >{text.auth.password}
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            required
          /></label
        >
        <PluginSlotOutlet
          registry={publicPluginRegistry}
          states={data.plugins}
          slot="login-extra"
          runtimeSlots={data.runtimeSlots}
          locale={data.locale}
          fallbackLocale={data.defaultLocale}
        />
        <button type="submit">{text.auth.passwordLogin}</button>
      </form>
    {/if}

    {#if data.providers.length}
      <div class="divider"><span>SSO</span></div>
      <div class="providers">
        {#each data.providers as provider (`${provider.pluginId}:${provider.id}`)}
          {#if provider.identifier}
            <button
              class:custom-provider={Boolean(provider.buttonColor) ||
                Boolean(provider.buttonTextColor)}
              class="provider-launch"
              style={providerButtonStyle(provider)}
              type="button"
              onclick={() => openIdentifierModal(provider)}
            >
              {#if provider.iconUrl}
                <img src={provider.iconUrl} alt="" aria-hidden="true" />
              {/if}
              <span>{provider.label}</span>
            </button>
          {:else}
            <form
              method="GET"
              action={resolve(
                `/auth/${provider.pluginId}/${provider.id}/login`,
              )}
            >
              <input type="hidden" name="returnTo" value={data.returnTo} />
              <button
                class:custom-provider={Boolean(provider.buttonColor) ||
                  Boolean(provider.buttonTextColor)}
                style={providerButtonStyle(provider)}
                type="submit"
              >
                {#if provider.iconUrl}
                  <img src={provider.iconUrl} alt="" aria-hidden="true" />
                {/if}
                <span>{provider.label}</span>
              </button>
            </form>
          {/if}
        {/each}
      </div>
    {/if}

    {#if identifierProvider?.identifier}
      <div
        class="identifier-backdrop"
        role="presentation"
        onclick={closeIdentifierModalFromBackdrop}
      >
        <div
          class="identifier-modal"
          role="dialog"
          aria-modal="true"
          aria-label={identifierProvider.label}
        >
          <form
            method="GET"
            action={resolve(
              `/auth/${identifierProvider.pluginId}/${identifierProvider.id}/login`,
            )}
          >
            <input type="hidden" name="returnTo" value={data.returnTo} />
            <div class="modal-head">
              <h2>{identifierProvider.label}</h2>
              <button
                class="close-button"
                type="button"
                aria-label={text.common.cancel}
                onclick={closeIdentifierModal}>&times;</button
              >
            </div>
            <label>
              {identifierProvider.identifier.label}
              {#if identifierProvider.identifier.help}
                <small>{identifierProvider.identifier.help}</small>
              {/if}
              <input
                bind:this={identifierInput}
                name={identifierProvider.identifier.name}
                value={identifierProvider.identifier.value ?? ''}
                placeholder={identifierProvider.identifier.placeholder ?? ''}
                required={identifierProvider.identifier.required}
              />
            </label>
            <div class="modal-actions">
              <button
                class="secondary"
                type="button"
                onclick={closeIdentifierModal}>{text.common.cancel}</button
              >
              <button
                class:custom-provider={Boolean(
                  identifierProvider.buttonColor,
                ) || Boolean(identifierProvider.buttonTextColor)}
                style={providerButtonStyle(identifierProvider)}
                type="submit"
              >
                {#if identifierProvider.iconUrl}
                  <img
                    src={identifierProvider.iconUrl}
                    alt=""
                    aria-hidden="true"
                  />
                {/if}
                <span>{identifierProvider.label}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    {/if}

    {#if !data.passwordEnabled && !data.providers.length && !data.passkeyEnabled}
      <div class="inline-note">{text.auth.noLoginMethods}</div>
    {/if}
    <div
      class:single={!data.registrationAllowed &&
        !data.passwordResetAvailable &&
        !data.resendVerificationAvailable}
      class="links"
    >
      {#if data.passwordResetAvailable}
        <a class="link-button" href={resolve('/login/forgot-password')}
          >{text.auth.forgotPassword}</a
        >
      {/if}
      {#if data.resendVerificationAvailable}
        <a class="link-button" href={resolve('/login/resend-verification')}
          >{text.auth.resendVerification}</a
        >
      {/if}
      {#if data.registrationAllowed}
        <a class="link-button primary" href={resolve('/signup')}
          >{text.common.signup}</a
        >
      {/if}
      <a class="link-button" href={resolve('/')}>{text.common.home}</a>
    </div>
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  main {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  section {
    width: min(440px, 100%);
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 38px;
    background: var(--page-surface);
    box-shadow: 0 28px 80px
      color-mix(in srgb, var(--page-text) 10%, transparent);
  }
  .topline {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .kicker {
    margin: 0 0 8px;
    color: var(--page-primary);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }
  .topline .kicker {
    margin-bottom: 0;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  .muted {
    margin: 12px 0 26px;
    color: var(--page-muted);
  }
  form,
  label,
  .providers,
  .providers form,
  .provider-launch {
    display: grid;
    gap: 10px;
  }
  label {
    color: var(--page-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  input,
  button,
  .providers button,
  .provider-launch,
  .link-button {
    min-height: 48px;
    border-radius: 11px;
    font: inherit;
  }
  input {
    border: 1px solid var(--page-border);
    padding: 0 14px;
    background: var(--page-surface);
    color: var(--page-text);
  }
  button,
  .providers button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 0;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
    text-decoration: none;
    cursor: pointer;
  }
  .providers button {
    width: 100%;
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-primary);
  }
  .providers button.custom-provider {
    border-color: var(--provider-border, var(--page-border));
    background: var(--provider-bg, var(--page-surface));
    color: var(--provider-text, var(--page-primary));
  }
  .providers img,
  .modal-actions img {
    width: 20px;
    height: 20px;
    flex: none;
    object-fit: contain;
  }
  .identifier-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 18px;
    background: color-mix(in srgb, #000 42%, transparent);
  }
  .identifier-modal {
    display: grid;
    width: min(420px, 100%);
    gap: 18px;
    border: 1px solid var(--page-border);
    border-radius: 18px;
    padding: 22px;
    background: var(--page-surface);
    box-shadow: 0 28px 90px color-mix(in srgb, #000 28%, transparent);
    color: var(--page-text);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .modal-head h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .close-button {
    width: 40px;
    min-height: 40px;
    border: 1px solid var(--page-border);
    border-radius: 10px;
    padding: 0;
    background: var(--page-surface);
    color: var(--page-muted);
    font-size: 1.35rem;
    line-height: 1;
  }
  .modal-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .modal-actions .secondary {
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-text);
  }
  .modal-actions button.custom-provider {
    border-color: var(--provider-border, var(--page-primary));
    background: var(--provider-bg, var(--page-primary));
    color: var(--provider-text, var(--page-primary-contrast));
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 22px 0;
    color: var(--page-muted);
    font-size: 0.72rem;
  }
  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    background: var(--page-border);
    content: '';
  }
  .inline-note {
    margin-bottom: 18px;
    border-radius: 11px;
    padding: 13px 14px;
    background: color-mix(in srgb, #c84432 12%, var(--page-surface));
    color: #9b3829;
    font-size: 0.8rem;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 22px;
  }
  .links.single {
    grid-template-columns: 1fr;
  }
  .link-button {
    display: grid;
    place-items: center;
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-primary);
    font-size: 0.82rem;
    font-weight: 900;
    text-decoration: none;
  }
  .link-button.primary {
    border-color: var(--page-primary);
    background: var(--page-primary);
    color: var(--page-primary-contrast);
  }
  @media (max-width: 520px) {
    .links {
      grid-template-columns: 1fr;
    }
    .modal-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
