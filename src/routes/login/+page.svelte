<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import { providerButtonStyle } from '$lib/auth-provider-style';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import type { PublicPluginSlots } from '$lib/public-plugin-slots';
  import { uiText } from '$lib/i18n/ui-text';
  import {
    authenticationPublicKeyOptions,
    serializeAssertionCredential,
  } from '$lib/webauthn-client';

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
      passwordEnabled: boolean;
      passkeyEnabled: boolean;
      registrationAllowed: boolean;
      resendVerificationAvailable: boolean;
      passwordResetAvailable: boolean;
      providers: LoginProvider[];
      publicSlots: PublicPluginSlots;
    };
    form?: { message?: string; totpRequired?: boolean };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
  const toastMessage = $derived(form?.message ?? data.notice);
  const footerLinks = $derived([
    ...(data.passwordResetAvailable
      ? [{ href: '/login/forgot-password', label: text.auth.forgotPassword }]
      : []),
    ...(data.resendVerificationAvailable
      ? [
          {
            href: '/login/resend-verification',
            label: text.auth.resendVerification,
          },
        ]
      : []),
    ...(data.registrationAllowed
      ? [{ href: '/signup', label: text.common.signup, primary: true }]
      : []),
    { href: '/', label: text.common.home },
  ]);
  let identifierProvider = $state<LoginProvider | null>(null);
  let identifierInput = $state<HTMLInputElement | null>(null);

  async function openIdentifierModal(provider: LoginProvider) {
    identifierProvider = provider;
    await tick();
    identifierInput?.focus();
  }

  function closeIdentifierModal() {
    identifierProvider = null;
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

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  title={text.auth.loginTitle}
  description={text.auth.loginDescription}
  toast={toastMessage ? { message: toastMessage } : undefined}
  links={footerLinks}
>
  {#if form?.totpRequired}
    <form method="POST" action="?/login" use:enhance>
      <input type="hidden" name="returnTo" value={data.returnTo} />
      <label>
        {text.auth.totpCode}
        <Input
          type="text"
          name="totpCode"
          inputmode="numeric"
          autocomplete="one-time-code"
          required
        />
      </label>
      <Button type="submit">{text.auth.verifyTotp}</Button>
    </form>
  {:else if data.passwordEnabled}
    <form method="POST" action="?/login" use:enhance>
      <input type="hidden" name="returnTo" value={data.returnTo} />
      <label
        >{text.auth.email} <Input type="email" name="email" required /></label
      >
      <label
        >{text.auth.password}
        <Input
          type="password"
          name="password"
          autocomplete="current-password"
          required
        /></label
      >
      <PluginSlotOutlet
        slots={data.publicSlots}
        slot="login-extra"
        locale={data.locale}
        fallbackLocale={data.defaultLocale}
      />
      <Button type="submit">{text.auth.passwordLogin}</Button>
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
            action={resolve(`/auth/${provider.pluginId}/${provider.id}/login`)}
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

  <Dialog.Root
    open={Boolean(identifierProvider)}
    onOpenChange={(open) => {
      if (!open) identifierProvider = null;
    }}
  >
    <Dialog.Content portalProps={{ disabled: true }} showCloseButton={false}>
      {#if identifierProvider?.identifier}
        <form
          method="GET"
          action={resolve(
            `/auth/${identifierProvider.pluginId}/${identifierProvider.id}/login`,
          )}
        >
          <input type="hidden" name="returnTo" value={data.returnTo} />
          <div class="modal-head">
            <Dialog.Title>{identifierProvider.label}</Dialog.Title>
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
            <Input
              bind:ref={identifierInput}
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
              class:custom-provider={Boolean(identifierProvider.buttonColor) ||
                Boolean(identifierProvider.buttonTextColor)}
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
      {/if}
    </Dialog.Content>
  </Dialog.Root>

  {#if !data.passwordEnabled && !data.providers.length && !data.passkeyEnabled}
    <div class="inline-note">{text.auth.noLoginMethods}</div>
  {/if}
</AuthCardPage>

<style>
  .providers,
  .providers form,
  .provider-launch {
    display: grid;
    gap: 10px;
  }
  .providers button,
  .provider-launch {
    min-height: 48px;
    border-radius: var(--ui-radius, 8px);
    font: inherit;
  }
  .providers button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 0;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 600;
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
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .close-button {
    width: 40px;
    min-height: 40px;
    border: 1px solid var(--page-border);
    border-radius: var(--ui-radius, 8px);
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
  @media (max-width: 520px) {
    .modal-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
