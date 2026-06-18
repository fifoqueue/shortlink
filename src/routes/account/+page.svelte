<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { providerButtonStyle } from '$lib/auth-provider-style';
  import { keepFormValues } from '$lib/forms';
  import { pluginLocaleStrings } from '$lib/i18n/plugin';
  import {
    allAllowedSelected,
    reconcileSelection,
    selectAll,
    selectedAllowedCount,
    toggleSelection,
  } from '$lib/selection';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type {
    AuthenticatedUser,
    PluginIntegrationData,
    RuntimePluginSlotRender,
  } from '$lib/plugin-contracts';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import { accountPluginRegistry } from '../../plugins/account-registry';
  import { publicPluginRegistry } from '../../plugins/public-registry';

  type Token = {
    id: number;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  };

  type PermissionGroup = {
    id: number;
    name: string;
    description: string;
    priority: number;
    expiresAt: string | null;
    assignmentSource: 'manual' | 'automatic';
  };

  type Passkey = {
    id: number;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
  };

  type ExternalUnlockMethod = {
    pluginId: string;
    id: string;
    label: string;
    buttonColor?: string;
    buttonTextColor?: string;
    iconUrl?: string;
  };

  type AccountSecurity = {
    passwordAvailable: boolean;
    passwordDeleteAvailable: boolean;
    unlocked: boolean;
    totpAvailable: boolean;
    passkeyAvailable: boolean;
    totpEnabled: boolean;
    passkeyCount: number;
    passkeys: Passkey[];
    externalUnlockMethods: ExternalUnlockMethod[];
  };

  type SecurityTab = 'totp' | 'passkey';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      user: AuthenticatedUser;
      integrations: PluginIntegrationData[];
      tokens: Token[];
      permissionGroups: PermissionGroup[];
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      pendingEmail: string | null;
      security: AccountSecurity;
      plugins: SiteSettings['plugins'];
      runtimeSlots: RuntimePluginSlotRender[];
      passwordMinLength: number;
      passwordPolicy: string;
    };
    form?: {
      ok?: boolean;
      message?: string;
      token?: string;
      setupTotp?: {
        secret: string;
        otpauthUrl: string;
        qrDataUrl: string;
      };
      passkeyUnlock?: Record<string, unknown>;
    };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
  let copiedValue = $state<string | null>(null);
  let passkeyName = $state('');
  let passkeyBusy = $state(false);
  let passkeyMessage = $state('');
  let passkeyOk = $state<boolean | undefined>(undefined);
  let securityUnlockOpen = $state(false);
  let passkeyUnlockChallenge = $state('');
  let passkeyUnlockBusy = $state(false);
  let activeSecurityTab = $state<SecurityTab>('totp');
  let selectedTokenIds = $state<string[]>([]);
  const apiTokenBulkFormId = 'api-token-bulk-revoke-form';
  const externalSecurityUnlockAvailable = $derived(
    !data.security.passwordAvailable &&
      !data.security.totpEnabled &&
      data.security.passkeyCount === 0 &&
      data.security.externalUnlockMethods.length > 0,
  );
  const selectableTokenIds = $derived(
    data.tokens.map((token) => tokenSelectionValue(token)),
  );
  const selectedTokenCount = $derived(
    selectedAllowedCount(selectedTokenIds, selectableTokenIds),
  );
  const allTokensSelected = $derived(
    allAllowedSelected(selectedTokenIds, selectableTokenIds),
  );

  async function copyIssuedToken(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    copiedValue = label;
    setTimeout(() => {
      if (copiedValue === label) copiedValue = null;
    }, 1400);
  }

  function permissionGroupMeta(group: PermissionGroup) {
    const source =
      group.assignmentSource === 'automatic'
        ? text.account.automaticPermissionGroup
        : text.account.manualPermissionGroup;
    if (!group.expiresAt) return source;
    const date = new Date(group.expiresAt);
    if (Number.isNaN(date.getTime())) return source;
    return `${source} · ${formatText(text.account.permissionGroupExpires, {
      value: date.toLocaleString(data.locale),
    })}`;
  }

  function tokenSelectionValue(token: Pick<Token, 'id'>) {
    return String(token.id);
  }

  function toggleToken(token: Token, checked: boolean) {
    selectedTokenIds = toggleSelection(
      selectedTokenIds,
      tokenSelectionValue(token),
      checked,
    );
  }

  function toggleAllTokens(checked: boolean) {
    selectedTokenIds = selectAll(selectableTokenIds, checked);
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

  async function responseMessage(response: Response) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    return body?.message ?? text.common.genericError;
  }

  function registrationPublicKeyOptions(options: Record<string, unknown>) {
    const user = options.user as { id: string };
    const excludeCredentials = Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials
      : [];
    return {
      ...options,
      challenge: base64urlToBuffer(String(options.challenge ?? '')),
      user: {
        ...user,
        id: base64urlToBuffer(user.id),
      },
      excludeCredentials: excludeCredentials.map((credential) => ({
        ...(credential as Record<string, unknown>),
        id: base64urlToBuffer(
          String((credential as Record<string, unknown>).id ?? ''),
        ),
      })),
    } as PublicKeyCredentialCreationOptions;
  }

  function serializeRegistrationCredential(credential: PublicKeyCredential) {
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
        },
      },
      transports: response.getTransports?.() ?? [],
    };
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

  function openSecurityUnlock() {
    securityUnlockOpen = true;
  }

  function closeSecurityUnlock() {
    if (passkeyUnlockBusy) return;
    securityUnlockOpen = false;
  }

  function closeSecurityUnlockFromBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeSecurityUnlock();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeSecurityUnlock();
  }

  const securityUnlockEnhance: SubmitFunction = () => {
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type !== 'success') return;
      const resultData = (result.data ?? {}) as { passkeyUnlock?: unknown };
      if (!resultData.passkeyUnlock) {
        securityUnlockOpen = false;
      }
    };
  };

  async function finishPasskeyUnlock(options: Record<string, unknown>) {
    if (!window.PublicKeyCredential) {
      passkeyMessage = text.account.passkeyUnsupported;
      passkeyOk = false;
      return;
    }
    passkeyUnlockBusy = true;
    try {
      const credential = (await navigator.credentials.get({
        publicKey: authenticationPublicKeyOptions(options),
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error(text.account.securityUnlockFailed);
      const unlockResponse = await fetch(
        resolve('/account/security/unlock/passkey'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(serializeAssertionCredential(credential)),
        },
      );
      if (!unlockResponse.ok) {
        throw new Error(await responseMessage(unlockResponse));
      }
      passkeyMessage = await responseMessage(unlockResponse);
      passkeyOk = true;
      securityUnlockOpen = false;
      await invalidateAll();
    } catch (cause) {
      passkeyMessage =
        cause instanceof Error
          ? cause.message
          : text.account.securityUnlockFailed;
      passkeyOk = false;
    } finally {
      passkeyUnlockBusy = false;
    }
  }

  async function registerPasskey(event: SubmitEvent) {
    event.preventDefault();
    passkeyMessage = '';
    passkeyOk = undefined;
    if (!window.PublicKeyCredential) {
      passkeyMessage = text.account.passkeyUnsupported;
      passkeyOk = false;
      return;
    }
    passkeyBusy = true;
    try {
      const optionsResponse = await fetch(
        resolve('/account/security/passkeys/register/options'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: passkeyName,
          }),
        },
      );
      if (!optionsResponse.ok) {
        throw new Error(await responseMessage(optionsResponse));
      }
      const credential = (await navigator.credentials.create({
        publicKey: registrationPublicKeyOptions(await optionsResponse.json()),
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error(text.account.passkeyCreateFailed);

      const saveResponse = await fetch(
        resolve('/account/security/passkeys/register'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(serializeRegistrationCredential(credential)),
        },
      );
      if (!saveResponse.ok)
        throw new Error(await responseMessage(saveResponse));
      passkeyName = '';
      passkeyMessage = await responseMessage(saveResponse);
      passkeyOk = true;
      await invalidateAll();
    } catch (cause) {
      passkeyMessage =
        cause instanceof Error
          ? cause.message
          : text.account.passkeyCreateFailed;
      passkeyOk = false;
    } finally {
      passkeyBusy = false;
    }
  }

  $effect(() => {
    const unlock = form?.passkeyUnlock;
    const challenge = String(unlock?.challenge ?? '');
    if (!challenge || challenge === passkeyUnlockChallenge) return;
    passkeyUnlockChallenge = challenge;
    securityUnlockOpen = true;
    void finishPasskeyUnlock(unlock ?? {});
  });

  $effect(() => {
    const next = reconcileSelection(selectedTokenIds, selectableTokenIds);
    if (next.length !== selectedTokenIds.length) selectedTokenIds = next;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head><title>{text.account.title} · {data.siteName}</title></svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} locale={data.locale} />
    {/key}
  {/if}

  <header>
    <div>
      <a href={resolve('/')}>← {text.common.home}</a>
      <h1>{text.account.title}</h1>
      <p>{formatText(text.account.description, { name: data.user.name })}</p>
    </div>
    <LocaleSelect locale={data.locale} compact />
  </header>

  <section>
    <h2>{text.account.profile}</h2>
    <form method="POST" action="?/profile" use:enhance={keepFormValues}>
      <div class="grid form-grid balanced">
        <label>
          {text.auth.email}
          <input
            name="email"
            type="email"
            value={data.user.email ?? ''}
            required
          />
          {#if data.pendingEmail}
            <span>
              {formatText(text.account.pendingEmail, {
                email: data.pendingEmail,
              })}
            </span>
          {/if}
        </label>
        <label>
          {text.auth.name}
          <input name="name" value={data.user.name} required />
        </label>
      </div>
      <button type="submit">{text.common.save}</button>
    </form>
  </section>

  <section>
    <h2>{text.account.permissionGroups}</h2>
    <p>{text.account.permissionGroupsDescription}</p>
    <div class="permission-groups">
      {#each data.permissionGroups as group (group.id)}
        <article>
          <div>
            <strong>{group.name}</strong>
            <span>{group.description || text.account.noGroupDescription}</span>
            <span>{permissionGroupMeta(group)}</span>
          </div>
        </article>
      {:else}
        <p class="empty">{text.account.emptyPermissionGroups}</p>
      {/each}
    </div>
  </section>

  <section>
    <h2>{text.account.password}</h2>
    {#if data.security.passwordAvailable}
      <form method="POST" action="?/password" use:enhance={keepFormValues}>
        <div class="grid form-grid balanced">
          <label>
            {text.account.currentPassword}
            <input
              name="currentPassword"
              type="password"
              autocomplete="current-password"
            />
          </label>
          <label>
            {text.account.nextPassword}
            <input
              name="nextPassword"
              type="password"
              minlength={data.passwordMinLength}
              autocomplete="new-password"
              required
            />
            <span>{data.passwordPolicy}</span>
          </label>
        </div>
        <button type="submit">{text.account.changePassword}</button>
      </form>
      <div class="password-delete">
        <div>
          <strong>{text.account.deletePassword}</strong>
          <p>
            {data.security.passwordDeleteAvailable
              ? text.account.deletePasswordDescription
              : text.account.deletePasswordUnavailable}
          </p>
        </div>
        {#if data.security.passwordDeleteAvailable}
          <form
            method="POST"
            action="?/deletePassword"
            use:enhance={keepFormValues}
          >
            <label>
              {text.account.currentPassword}
              <input
                name="currentPassword"
                type="password"
                autocomplete="current-password"
                required
              />
            </label>
            <DangerConfirmButton
              label={text.account.deletePassword}
              title={text.account.deletePasswordTitle}
              message={text.account.deletePasswordMessage}
              confirmLabel={text.account.deletePasswordConfirm}
              locale={data.locale}
            />
          </form>
        {/if}
      </div>
    {:else if data.security.unlocked}
      <form method="POST" action="?/password" use:enhance={keepFormValues}>
        <p>{text.account.externalPasswordUnavailable}</p>
        <label>
          {text.account.nextPassword}
          <input
            name="nextPassword"
            type="password"
            minlength={data.passwordMinLength}
            autocomplete="new-password"
            required
          />
          <span>{data.passwordPolicy}</span>
        </label>
        <button type="submit">{text.account.setPassword}</button>
      </form>
    {:else}
      <div class="security-locked">
        <div>
          <strong>{text.account.securityLockedTitle}</strong>
          <p>{text.account.externalPasswordUnavailable}</p>
        </div>
        <button type="button" onclick={openSecurityUnlock}>
          {text.account.unlockSecurity}
        </button>
      </div>
    {/if}
  </section>

  <section>
    <h2>{text.account.security}</h2>
    <p>{text.account.securityDescription}</p>
    {#if data.security.unlocked}
      <div
        class="security-tabs"
        role="tablist"
        aria-label={text.account.security}
      >
        <button
          class:active={activeSecurityTab === 'totp'}
          role="tab"
          aria-selected={activeSecurityTab === 'totp'}
          type="button"
          onclick={() => (activeSecurityTab = 'totp')}
        >
          {text.account.totp}
        </button>
        <button
          class:active={activeSecurityTab === 'passkey'}
          role="tab"
          aria-selected={activeSecurityTab === 'passkey'}
          type="button"
          onclick={() => (activeSecurityTab = 'passkey')}
        >
          {text.account.passkeys}
        </button>
      </div>

      <div class="security-panel">
        {#if activeSecurityTab === 'totp'}
          <div>
            <strong>{text.account.totp}</strong>
            <span>{text.account.totpDescription}</span>
          </div>
          {#if data.security.totpAvailable}
            {#if data.security.totpEnabled}
              <p class="status-ok">{text.account.totpEnabledState}</p>
              <form method="POST" action="?/disableTotp" use:enhance>
                <button type="submit">{text.account.disableTotp}</button>
              </form>
            {:else if form?.setupTotp}
              <div class="totp-setup">
                <img src={form.setupTotp.qrDataUrl} alt={text.common.qrCode} />
                <label>
                  {text.account.totpSecret}
                  <CopyValue
                    value={form.setupTotp.secret}
                    copied={copiedValue === 'totpSecret'}
                    onclick={() =>
                      copyIssuedToken(form.setupTotp!.secret, 'totpSecret')}
                    locale={data.locale}
                  />
                </label>
              </div>
              <form method="POST" action="?/enableTotp" use:enhance>
                <label>
                  {text.account.totpCode}
                  <input
                    name="totpCode"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    required
                  />
                  <span>{text.account.totpSetupInstructions}</span>
                </label>
                <button type="submit">{text.account.enableTotp}</button>
              </form>
            {:else}
              <form method="POST" action="?/startTotp" use:enhance>
                <button type="submit">{text.account.setupTotp}</button>
              </form>
            {/if}
          {:else}
            <p class="empty">{text.account.securityMethodDisabled}</p>
          {/if}
        {:else}
          <div>
            <strong>{text.account.passkeys}</strong>
            <span>{text.account.passkeysDescription}</span>
          </div>
          {#if data.security.passkeyAvailable}
            {#if passkeyMessage}
              <p
                class:status-ok={passkeyOk}
                class:error-note={passkeyOk === false}
              >
                {passkeyMessage}
              </p>
            {/if}
            <form onsubmit={registerPasskey}>
              <label>
                {text.account.passkeyName}
                <input
                  bind:value={passkeyName}
                  autocomplete="off"
                  placeholder={text.account.passkeyNamePlaceholder}
                />
              </label>
              <button type="submit" disabled={passkeyBusy}>
                {passkeyBusy ? text.common.preparing : text.account.addPasskey}
              </button>
            </form>
            <div class="passkey-list">
              {#each data.security.passkeys as passkey (passkey.id)}
                <div class="passkey-row">
                  <div>
                    <strong>{passkey.name}</strong>
                    <span>
                      {text.account.created}
                      {new Date(passkey.createdAt).toLocaleString()}
                      {passkey.lastUsedAt
                        ? ` · ${text.account.lastUsed} ${new Date(passkey.lastUsedAt).toLocaleString()}`
                        : ''}
                    </span>
                  </div>
                  <form method="POST" action="?/revokePasskey" use:enhance>
                    <input type="hidden" name="id" value={passkey.id} />
                    <button type="submit">{text.account.revoke}</button>
                  </form>
                </div>
              {:else}
                <p class="empty">{text.account.emptyPasskeys}</p>
              {/each}
            </div>
          {:else}
            <p class="empty">{text.account.securityMethodDisabled}</p>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="security-locked">
        <div>
          <strong>{text.account.securityLockedTitle}</strong>
          <p>
            {externalSecurityUnlockAvailable
              ? text.account.securityInitialSetupDescription
              : text.account.securityLockedDescription}
          </p>
        </div>
        {#if passkeyMessage}
          <p class:status-ok={passkeyOk} class:error-note={passkeyOk === false}>
            {passkeyMessage}
          </p>
        {/if}
        <button type="button" onclick={openSecurityUnlock}>
          {text.account.unlockSecurity}
        </button>
      </div>
    {/if}
  </section>

  {#if securityUnlockOpen}
    <div
      class="modal-backdrop"
      role="presentation"
      onclick={closeSecurityUnlockFromBackdrop}
    >
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-unlock-title"
      >
        <div class="modal-heading">
          <div>
            <h2 id="security-unlock-title">
              {text.account.securityUnlockTitle}
            </h2>
            <p>
              {externalSecurityUnlockAvailable
                ? text.account.securityInitialSetupDescription
                : text.account.securityUnlockDescription}
            </p>
          </div>
          <button
            class="secondary-button"
            type="button"
            onclick={closeSecurityUnlock}
          >
            {text.common.close}
          </button>
        </div>
        <form
          method="POST"
          action="?/unlockSecurity"
          use:enhance={securityUnlockEnhance}
        >
          <div class="unlock-methods">
            {#if data.security.passwordAvailable}
              <div class="unlock-method">
                <label>
                  {text.account.securityPassword}
                  <input
                    name="securityPassword"
                    type="password"
                    autocomplete="current-password"
                  />
                </label>
                <button name="securityMethod" value="password" type="submit">
                  {text.account.unlockWithPassword}
                </button>
              </div>
            {/if}
            {#if data.security.totpEnabled}
              <div class="unlock-method">
                <label>
                  {text.account.securityTotpCode}
                  <input
                    name="securityTotpCode"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                  />
                </label>
                <button name="securityMethod" value="totp" type="submit">
                  {text.account.unlockWithTotp}
                </button>
              </div>
            {/if}
            {#if data.security.passkeyCount > 0}
              <div class="unlock-method compact">
                <p>{text.account.securityPasskeyDescription}</p>
                <button
                  name="securityMethod"
                  value="passkey"
                  type="submit"
                  disabled={passkeyUnlockBusy}
                >
                  {passkeyUnlockBusy
                    ? text.common.preparing
                    : text.account.unlockWithPasskey}
                </button>
              </div>
            {/if}
            {#if externalSecurityUnlockAvailable}
              <div class="unlock-method external-unlock-method">
                <div class="external-unlock-actions">
                  <input type="hidden" name="securityMethod" value="external" />
                  {#each data.security.externalUnlockMethods as method (`${method.pluginId}:${method.id}`)}
                    <button
                      class:custom-provider={Boolean(method.buttonColor) ||
                        Boolean(method.buttonTextColor)}
                      name="securityProvider"
                      value={`${method.pluginId}:${method.id}`}
                      type="submit"
                      style={providerButtonStyle(method)}
                    >
                      {#if method.iconUrl}
                        <img src={method.iconUrl} alt="" aria-hidden="true" />
                      {/if}
                      <span>{method.label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          <PluginSlotOutlet
            registry={publicPluginRegistry}
            states={data.plugins}
            slot="account-security-unlock"
            runtimeSlots={data.runtimeSlots}
            user={data.user}
            locale={data.locale}
            fallbackLocale={data.defaultLocale}
          />
        </form>
      </div>
    </div>
  {/if}

  <section>
    <h2>{text.account.sessions}</h2>
    <form method="POST" action="?/logoutOtherSessions" use:enhance>
      <p>{text.account.sessionsDescription}</p>
      <button type="submit">{text.account.logoutOtherSessions}</button>
    </form>
  </section>

  {#each data.integrations as integration (integration.pluginId)}
    {@const registered = accountPluginRegistry.find(
      (plugin) => plugin.definition.meta.id === integration.pluginId,
    )}
    {#if registered?.account}
      {@const PluginAccount = registered.account}
      <PluginAccount
        config={integration.config ?? {}}
        integrationData={integration.data}
        locale={data.locale}
        fallbackLocale={data.defaultLocale}
        strings={pluginLocaleStrings(
          registered.definition,
          data.locale,
          data.defaultLocale,
        )}
      />
    {:else if integration.runtimeSchema}
      <section>
        <h2>{integration.pluginName}</h2>
        <form
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginId" value={integration.pluginId} />
          <input type="hidden" name="pluginAction" value="save" />
          <RuntimePluginSchemaForm schema={integration.runtimeSchema} />
          <button type="submit">{text.common.save}</button>
        </form>
      </section>
    {:else if integration.runtimeUi?.mode === 'iframe' && integration.runtimeUi.src}
      <section>
        <h2>{integration.pluginName}</h2>
        <form method="POST" action="?/pluginAction" use:enhance>
          <RuntimePluginFrame
            src={integration.runtimeUi.src}
            pluginId={integration.pluginId}
            config={integration.config ?? {}}
            adminData={integration.data}
            locale={data.locale}
            fallbackLocale={data.defaultLocale}
            strings={integration.strings ?? {}}
            pluginFieldName="pluginId"
            pluginFieldValue={integration.pluginId}
            actionFieldName="pluginAction"
          />
        </form>
      </section>
    {/if}
  {/each}

  <section>
    <h2>{text.account.apiTokens}</h2>
    {#if form?.token}
      <div class="issued-token">
        <strong>{text.account.newApiToken}</strong>
        <p>{text.account.tokenOnce}</p>
        <CopyValue
          value={form.token}
          copied={copiedValue === 'token'}
          onclick={() => copyIssuedToken(form.token!, 'token')}
          locale={data.locale}
        />
        <label>
          {text.account.authorizationHeader}
          <CopyValue
            value={`Bearer ${form.token}`}
            copied={copiedValue === 'header'}
            onclick={() => copyIssuedToken(`Bearer ${form.token}`, 'header')}
            locale={data.locale}
          />
        </label>
      </div>
    {/if}
    <form method="POST" action="?/createToken" use:enhance={keepFormValues}>
      <label>
        {text.account.tokenName}
        <input name="name" placeholder="local script" />
      </label>
      <button type="submit">{text.account.issueToken}</button>
    </form>

    {#if data.tokens.length > 0}
      <form
        id={apiTokenBulkFormId}
        method="POST"
        action="?/revokeTokens"
        use:enhance={keepFormValues}
      ></form>
      <div class="token-bulk-actions">
        <ToggleField
          form={apiTokenBulkFormId}
          checked={allTokensSelected}
          label={formatText(text.account.selectedApiTokens, {
            count: selectedTokenCount,
          })}
          onchange={(event) => toggleAllTokens(event.currentTarget.checked)}
        />
        <DangerConfirmButton
          formId={apiTokenBulkFormId}
          label={text.account.revokeSelectedTokens}
          title={text.account.revokeSelectedTokensTitle}
          message={formatText(text.account.revokeSelectedTokensMessage, {
            count: selectedTokenCount,
          })}
          confirmLabel={text.account.revokeSelectedTokensConfirm}
          locale={data.locale}
          disabled={selectedTokenCount === 0}
        />
      </div>
    {/if}

    <div class="tokens">
      {#each data.tokens as token (token.id)}
        <article class="token-row">
          <ToggleField
            form={apiTokenBulkFormId}
            class="token-check"
            name="ids"
            value={tokenSelectionValue(token)}
            ariaLabel={formatText(text.account.selectApiToken, {
              name: token.name,
            })}
            checked={selectedTokenIds.includes(tokenSelectionValue(token))}
            onchange={(event) =>
              toggleToken(token, event.currentTarget.checked)}
          />
          <div>
            <strong>{token.name}</strong>
            <span>
              {token.prefix}... · {text.account.created}
              {new Date(token.createdAt).toLocaleString()}
              {token.lastUsedAt
                ? ` · ${text.account.lastUsed} ${new Date(token.lastUsedAt).toLocaleString()}`
                : ''}
            </span>
          </div>
          <form
            method="POST"
            action="?/revokeTokens"
            use:enhance={keepFormValues}
          >
            <input type="hidden" name="ids" value={token.id} />
            <DangerConfirmButton
              label={text.account.revoke}
              title={text.account.revokeTokensTitle}
              message={text.account.revokeTokensMessage}
              details={[`${token.name} (${token.prefix}...)`]}
              confirmLabel={text.account.revokeTokensConfirm}
              locale={data.locale}
            />
          </form>
        </article>
      {:else}
        <p class="empty">{text.account.emptyTokens}</p>
      {/each}
    </div>
  </section>

  <section>
    <h2>{text.account.danger}</h2>
    <form method="POST" action="?/delete" use:enhance>
      <DangerConfirmButton
        label={text.account.deleteAccount}
        title={text.account.deleteAccountTitle}
        message={text.account.deleteAccountMessage}
        details={text.account.deleteAccountDetails}
        confirmLabel={text.account.deleteAccountConfirm}
        requireConsent
        consentLabel={text.account.deleteAccountConsent}
        locale={data.locale}
      />
    </form>
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
    width: min(860px, calc(100% - 36px));
    margin: 0 auto;
    padding: 48px 0 100px;
    gap: 18px;
    color: var(--page-text);
    font-family: var(--font);
  }
  main::before {
    position: fixed;
    inset: 0;
    z-index: -1;
    background: var(--page-bg);
    content: '';
  }
  header,
  section {
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 26px;
    background: var(--page-surface);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }
  header a {
    color: var(--page-primary);
    font-size: 0.82rem;
    font-weight: 800;
    text-decoration: none;
  }
  h1 {
    margin: 12px 0 6px;
    font-size: 2.2rem;
  }
  h2 {
    margin: 0 0 14px;
    font-size: 1.05rem;
  }
  p,
  span {
    margin: 0;
    color: var(--page-muted);
    line-height: 1.6;
  }
  form {
    display: grid;
    gap: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-items: start;
  }
  label {
    display: grid;
    gap: 7px;
    color: var(--page-muted);
    font-size: 0.82rem;
    font-weight: 750;
  }
  input {
    width: 100%;
    min-height: var(--form-control-height);
    border: 1px solid var(--page-border);
    border-radius: var(--form-control-radius);
    padding: 10px 12px;
    background: var(--page-surface);
    color: var(--page-text);
    font: inherit;
  }
  button {
    display: inline-flex;
    width: fit-content;
    min-height: 40px;
    align-items: center;
    border: 0;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font: inherit;
    font-weight: 850;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.62;
    cursor: wait;
  }
  .secondary-button {
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-text);
  }
  .password-delete {
    display: grid;
    gap: 12px;
    margin-top: 18px;
    border-top: 1px solid var(--page-border);
    padding-top: 16px;
  }
  .password-delete strong {
    display: block;
    margin-bottom: 4px;
  }
  .password-delete form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 14px;
    align-items: end;
  }
  .password-delete :global(.danger-confirm-trigger) {
    min-height: var(--form-control-height);
  }
  .security-locked {
    display: grid;
    gap: 14px;
    margin-top: 18px;
    border-top: 1px solid var(--page-border);
    padding-top: 16px;
  }
  .security-locked strong {
    display: block;
    margin-bottom: 4px;
  }
  .security-tabs {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    gap: 6px;
    margin-top: 18px;
    border: 1px solid var(--page-border);
    border-radius: var(--form-control-radius);
    padding: 4px;
    background: color-mix(in srgb, var(--page-border) 18%, transparent);
  }
  .security-tabs button {
    min-height: 34px;
    border: 0;
    border-radius: calc(var(--form-control-radius) - 3px);
    padding: 8px 14px;
    background: transparent;
    color: var(--page-muted);
  }
  .security-tabs button.active {
    background: var(--page-primary);
    color: var(--page-primary-contrast);
  }
  .security-panel {
    display: grid;
    gap: 14px;
    margin-top: 16px;
    border-top: 1px solid var(--page-border);
    padding-top: 18px;
  }
  .security-panel strong,
  .security-panel span,
  .passkey-row strong,
  .passkey-row span {
    display: block;
  }
  .status-ok {
    color: var(--page-primary);
    font-weight: 850;
  }
  .error-note {
    color: #a43428;
    font-weight: 850;
  }
  .totp-setup {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    align-items: center;
  }
  .totp-setup img {
    width: 132px;
    height: 132px;
    border: 1px solid var(--page-border);
    border-radius: 10px;
    background: #fff;
  }
  .passkey-list {
    display: grid;
    margin-top: 2px;
  }
  .passkey-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-top: 1px solid var(--page-border);
    padding: 12px 0;
  }
  .passkey-row:first-child {
    border-top: 0;
  }
  .passkey-row form {
    flex: 0 0 auto;
  }
  .passkey-row button {
    min-width: 58px;
    justify-content: center;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgb(15 23 42 / 0.42);
  }
  .modal-panel {
    width: min(560px, 100%);
    max-height: min(760px, calc(100vh - 36px));
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 26px;
    background: var(--page-surface);
    overflow: auto;
    box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
  }
  .modal-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }
  .modal-heading h2 {
    margin-bottom: 6px;
  }
  .unlock-methods {
    display: grid;
    gap: 12px;
    --unlock-action-width: 190px;
  }
  .unlock-method {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 14px;
    align-items: end;
    border-top: 1px solid var(--page-border);
    padding-top: 12px;
  }
  .unlock-method.compact {
    grid-template-columns: minmax(0, 1fr) var(--unlock-action-width);
  }
  .unlock-method:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .unlock-method label,
  .unlock-method p {
    min-width: 0;
  }
  .unlock-method button {
    height: var(--form-control-height);
    min-height: var(--form-control-height);
    width: auto;
    min-width: 132px;
    justify-content: center;
    justify-self: center;
    align-self: end;
  }
  .unlock-method.compact {
    align-items: center;
  }
  .unlock-method.compact button {
    width: 100%;
    min-width: 0;
    align-self: center;
  }
  .external-unlock-method {
    grid-template-columns: 1fr;
  }
  .external-unlock-actions {
    display: grid;
    gap: 8px;
  }
  .external-unlock-actions input {
    display: none;
  }
  .external-unlock-actions button {
    width: 100%;
    gap: 8px;
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-primary);
  }
  .external-unlock-actions button.custom-provider {
    border-color: var(--provider-border, var(--page-border));
    background: var(--provider-bg, var(--page-surface));
    color: var(--provider-text, var(--page-primary));
  }
  .external-unlock-actions img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .issued-token {
    display: grid;
    gap: 10px;
    margin-bottom: 16px;
    border: 1px solid
      color-mix(in srgb, var(--page-primary) 34%, var(--page-border));
    border-radius: 14px;
    padding: 16px;
    background: color-mix(in srgb, var(--page-primary) 8%, var(--page-surface));
  }
  .issued-token strong {
    color: var(--page-primary);
  }
  .issued-token p {
    font-size: 0.84rem;
  }
  .tokens,
  .permission-groups {
    display: grid;
    margin-top: 16px;
  }
  .token-bulk-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    border-top: 1px solid var(--page-border);
    padding-top: 14px;
    --toggle-border: var(--page-border);
    --toggle-surface: var(--page-surface);
    --toggle-primary: var(--page-primary);
    --toggle-focus: color-mix(in srgb, var(--page-primary) 18%, transparent);
    --toggle-label: var(--page-muted);
  }
  article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--page-border);
    padding: 12px 0;
  }
  article:first-child {
    border-top: 0;
  }
  article strong,
  article span {
    display: block;
  }
  .token-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }
  .token-row > div {
    min-width: 0;
  }
  :global(.token-check) {
    --toggle-border: var(--page-border);
    --toggle-surface: var(--page-surface);
    --toggle-primary: var(--page-primary);
    --toggle-focus: color-mix(in srgb, var(--page-primary) 18%, transparent);
  }
  .empty {
    margin: 0;
    border-top: 1px solid var(--page-border);
    padding-top: 16px;
  }
  @media (max-width: 720px) {
    header,
    article {
      align-items: start;
      flex-direction: column;
    }
    .grid {
      grid-template-columns: 1fr;
    }
    .passkey-row {
      align-items: start;
      flex-direction: column;
    }
    .token-bulk-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .token-row {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .token-row form {
      grid-column: 2;
    }
    .password-delete form {
      grid-template-columns: 1fr;
    }
    .modal-heading,
    .unlock-method {
      grid-template-columns: 1fr;
      flex-direction: column;
    }
    .modal-heading button,
    .unlock-method button {
      width: 100%;
      justify-content: center;
    }
    .totp-setup {
      grid-template-columns: 1fr;
    }
  }
</style>
