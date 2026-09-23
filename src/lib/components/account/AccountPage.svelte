<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import * as Card from '$lib/components/ui/card';
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
  } from '$lib/plugin-contracts';
  import type { PublicPluginSlots } from '$lib/public-plugin-slots';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import {
    authenticationPublicKeyOptions,
    registrationPublicKeyOptions,
    serializeAssertionCredential,
    serializeRegistrationCredential,
  } from '$lib/webauthn-client';
  import { accountPluginRegistry } from '../../../plugins/account-registry';

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
      publicSlots: PublicPluginSlots;
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
    if (!group.expiresAt) return '';
    const date = new Date(group.expiresAt);
    if (Number.isNaN(date.getTime())) return '';
    return formatText(text.account.permissionGroupExpires, {
      value: date.toLocaleString(data.locale),
    });
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

  async function responseMessage(response: Response) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    return body?.message ?? text.common.genericError;
  }

  function openSecurityUnlock() {
    securityUnlockOpen = true;
  }

  function closeSecurityUnlock() {
    if (passkeyUnlockBusy) return;
    securityUnlockOpen = false;
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

<svelte:head><title>{text.account.title} · {data.siteName}</title></svelte:head>

<SiteThemeStyles customHead={data.customHead} />

<div
  class="account-page site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={form.ok} locale={data.locale} />
    {/key}
  {/if}

  <SiteHeader />
  <div class="account-layout">
    <nav class="account-nav" aria-label={text.account.title}>
      <a href={resolve('/account#profile')}>{text.account.profile}</a>
      <a href={resolve('/account#password')}>{text.account.password}</a>
      <a href={resolve('/account#security')}>{text.account.security}</a>
      <a href={resolve('/account#sessions')}>{text.account.sessions}</a>
      <a href={resolve('/account#tokens')}>{text.account.apiTokens}</a>
    </nav>
    <main class="account-content">
      <header>
        <div>
          <h1>{text.account.title}</h1>
          <p>
            {formatText(text.account.description, { name: data.user.name })}
          </p>
        </div>
      </header>

      <section id="profile">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
            <h2>{text.account.profile}</h2>
            <form method="POST" action="?/profile" use:enhance={keepFormValues}>
              <div class="grid form-grid balanced">
                <label>
                  {text.auth.email}
                  <Input
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
                  <Input name="name" value={data.user.name} required />
                </label>
              </div>
              <Button type="submit">{text.common.save}</Button>
            </form>
          </Card.Content></Card.Root
        >
      </section>

      {#if data.permissionGroups.length > 0}
        <section>
          <Card.Root
            class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
            ><Card.Content class="p-6">
              <h2>{text.account.permissionGroups}</h2>

              <div class="permission-groups">
                {#each data.permissionGroups as group (group.id)}
                  <article>
                    <div>
                      <strong>{group.name}</strong>
                      <span
                        >{group.description ||
                          text.account.noGroupDescription}</span
                      >
                      {#if group.expiresAt}<span
                          >{permissionGroupMeta(group)}</span
                        >{/if}
                    </div>
                  </article>
                {:else}
                  <p class="empty">{text.account.emptyPermissionGroups}</p>
                {/each}
              </div>
            </Card.Content></Card.Root
          >
        </section>
      {/if}

      <section id="password">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
            <h2>{text.account.password}</h2>
            {#if data.security.passwordAvailable}
              <form
                method="POST"
                action="?/password"
                use:enhance={keepFormValues}
              >
                <div class="grid form-grid balanced">
                  <label>
                    {text.account.currentPassword}
                    <Input
                      name="currentPassword"
                      type="password"
                      autocomplete="current-password"
                    />
                  </label>
                  <label>
                    {text.account.nextPassword}
                    <Input
                      name="nextPassword"
                      type="password"
                      minlength={data.passwordMinLength}
                      autocomplete="new-password"
                      required
                    />
                    <span>{data.passwordPolicy}</span>
                  </label>
                </div>
                <Button type="submit">{text.account.changePassword}</Button>
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
                      <Input
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
              <form
                method="POST"
                action="?/password"
                use:enhance={keepFormValues}
              >
                <p>{text.account.externalPasswordUnavailable}</p>
                <label>
                  {text.account.nextPassword}
                  <Input
                    name="nextPassword"
                    type="password"
                    minlength={data.passwordMinLength}
                    autocomplete="new-password"
                    required
                  />
                  <span>{data.passwordPolicy}</span>
                </label>
                <Button type="submit">{text.account.setPassword}</Button>
              </form>
            {:else}
              <div class="security-locked">
                <div>
                  <strong>{text.account.securityLockedTitle}</strong>
                  <p>{text.account.externalPasswordUnavailable}</p>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  onclick={openSecurityUnlock}
                >
                  {text.account.unlockSecurity}
                </Button>
              </div>
            {/if}
          </Card.Content></Card.Root
        >
      </section>

      <section id="security">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
            <h2>{text.account.security}</h2>
            <p>{text.account.securityDescription}</p>
            {#if data.security.unlocked}
              <Tabs.Root
                value={activeSecurityTab}
                onValueChange={(value) =>
                  (activeSecurityTab = value as SecurityTab)}
              >
                <Tabs.List class="mt-5" aria-label={text.account.security}>
                  <Tabs.Trigger value="totp">{text.account.totp}</Tabs.Trigger>
                  <Tabs.Trigger value="passkey"
                    >{text.account.passkeys}</Tabs.Trigger
                  >
                </Tabs.List>
                <div class="security-panel">
                  <Tabs.Content value="totp">
                    <div>
                      <strong>{text.account.totp}</strong>
                      <span>{text.account.totpDescription}</span>
                    </div>
                    {#if data.security.totpAvailable}
                      {#if data.security.totpEnabled}
                        <p class="status-ok">{text.account.totpEnabledState}</p>
                        <form method="POST" action="?/disableTotp" use:enhance>
                          <Button type="submit"
                            >{text.account.disableTotp}</Button
                          >
                        </form>
                      {:else if form?.setupTotp}
                        <div class="totp-setup">
                          <img
                            src={form.setupTotp.qrDataUrl}
                            alt={text.common.qrCode}
                          />
                          <label>
                            {text.account.totpSecret}
                            <CopyValue
                              value={form.setupTotp.secret}
                              copied={copiedValue === 'totpSecret'}
                              onclick={() =>
                                copyIssuedToken(
                                  form.setupTotp!.secret,
                                  'totpSecret',
                                )}
                              locale={data.locale}
                            />
                          </label>
                        </div>
                        <form method="POST" action="?/enableTotp" use:enhance>
                          <label>
                            {text.account.totpCode}
                            <Input
                              name="totpCode"
                              inputmode="numeric"
                              autocomplete="one-time-code"
                              required
                            />
                            <span>{text.account.totpSetupInstructions}</span>
                          </label>
                          <Button type="submit"
                            >{text.account.enableTotp}</Button
                          >
                        </form>
                      {:else}
                        <form method="POST" action="?/startTotp" use:enhance>
                          <Button type="submit">{text.account.setupTotp}</Button
                          >
                        </form>
                      {/if}
                    {:else}
                      <p class="empty">{text.account.securityMethodDisabled}</p>
                    {/if}
                  </Tabs.Content>
                  <Tabs.Content value="passkey">
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
                          <Input
                            bind:value={passkeyName}
                            autocomplete="off"
                            placeholder={text.account.passkeyNamePlaceholder}
                          />
                        </label>
                        <Button type="submit" disabled={passkeyBusy}>
                          {passkeyBusy
                            ? text.common.preparing
                            : text.account.addPasskey}
                        </Button>
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
                            <form
                              method="POST"
                              action="?/revokePasskey"
                              use:enhance
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={passkey.id}
                              />
                              <Button type="submit"
                                >{text.account.revoke}</Button
                              >
                            </form>
                          </div>
                        {:else}
                          <p class="empty">{text.account.emptyPasskeys}</p>
                        {/each}
                      </div>
                    {:else}
                      <p class="empty">{text.account.securityMethodDisabled}</p>
                    {/if}
                  </Tabs.Content>
                </div>
              </Tabs.Root>
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
                  <p
                    class:status-ok={passkeyOk}
                    class:error-note={passkeyOk === false}
                  >
                    {passkeyMessage}
                  </p>
                {/if}
                <Button
                  variant="outline"
                  type="button"
                  onclick={openSecurityUnlock}
                >
                  {text.account.unlockSecurity}
                </Button>
              </div>
            {/if}
          </Card.Content></Card.Root
        >
      </section>

      <Dialog.Root bind:open={securityUnlockOpen}>
        <Dialog.Content
          portalProps={{ disabled: true }}
          showCloseButton={false}
          class="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(event) => {
            if (passkeyUnlockBusy) event.preventDefault();
          }}
          onEscapeKeydown={(event) => {
            if (passkeyUnlockBusy) event.preventDefault();
          }}
        >
          <div class="modal-heading">
            <div>
              <Dialog.Title>
                {text.account.securityUnlockTitle}
              </Dialog.Title>
              <Dialog.Description>
                {externalSecurityUnlockAvailable
                  ? text.account.securityInitialSetupDescription
                  : text.account.securityUnlockDescription}
              </Dialog.Description>
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
                    <Input
                      name="securityPassword"
                      type="password"
                      autocomplete="current-password"
                    />
                  </label>
                  <Button name="securityMethod" value="password" type="submit">
                    {text.account.unlockWithPassword}
                  </Button>
                </div>
              {/if}
              {#if data.security.totpEnabled}
                <div class="unlock-method">
                  <label>
                    {text.account.securityTotpCode}
                    <Input
                      name="securityTotpCode"
                      inputmode="numeric"
                      autocomplete="one-time-code"
                    />
                  </label>
                  <Button name="securityMethod" value="totp" type="submit">
                    {text.account.unlockWithTotp}
                  </Button>
                </div>
              {/if}
              {#if data.security.passkeyCount > 0}
                <div class="unlock-method compact">
                  <p>{text.account.securityPasskeyDescription}</p>
                  <Button
                    name="securityMethod"
                    value="passkey"
                    type="submit"
                    disabled={passkeyUnlockBusy}
                  >
                    {passkeyUnlockBusy
                      ? text.common.preparing
                      : text.account.unlockWithPasskey}
                  </Button>
                </div>
              {/if}
              {#if externalSecurityUnlockAvailable}
                <div class="unlock-method external-unlock-method">
                  <div class="external-unlock-actions">
                    <input
                      type="hidden"
                      name="securityMethod"
                      value="external"
                    />
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
              slots={data.publicSlots}
              slot="account-security-unlock"
              locale={data.locale}
              fallbackLocale={data.defaultLocale}
            />
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <section id="sessions">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
            <h2>{text.account.sessions}</h2>
            <form method="POST" action="?/logoutOtherSessions" use:enhance>
              <p>{text.account.sessionsDescription}</p>
              <Button type="submit">{text.account.logoutOtherSessions}</Button>
            </form>
          </Card.Content></Card.Root
        >
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
            <Card.Root
              class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
              ><Card.Content class="p-6">
                <h2>{integration.pluginName}</h2>
                <form
                  method="POST"
                  action="?/pluginAction"
                  use:enhance={keepFormValues}
                >
                  <input
                    type="hidden"
                    name="pluginId"
                    value={integration.pluginId}
                  />
                  <input type="hidden" name="pluginAction" value="save" />
                  <RuntimePluginSchemaForm schema={integration.runtimeSchema} />
                  <Button type="submit">{text.common.save}</Button>
                </form>
              </Card.Content></Card.Root
            >
          </section>
        {:else if integration.runtimeUi?.mode === 'iframe' && integration.runtimeUi.src}
          <section>
            <Card.Root
              class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
              ><Card.Content class="p-6">
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
              </Card.Content></Card.Root
            >
          </section>
        {/if}
      {/each}

      <section id="tokens">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
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
                    onclick={() =>
                      copyIssuedToken(`Bearer ${form.token}`, 'header')}
                    locale={data.locale}
                  />
                </label>
              </div>
            {/if}
            <form
              method="POST"
              action="?/createToken"
              use:enhance={keepFormValues}
            >
              <label>
                {text.account.tokenName}
                <Input name="name" placeholder="local script" />
              </label>
              <Button type="submit">{text.account.issueToken}</Button>
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
                  onchange={(event) =>
                    toggleAllTokens(event.currentTarget.checked)}
                />
                <DangerConfirmButton
                  formId={apiTokenBulkFormId}
                  label={text.account.revokeSelectedTokens}
                  title={text.account.revokeSelectedTokensTitle}
                  message={formatText(
                    text.account.revokeSelectedTokensMessage,
                    {
                      count: selectedTokenCount,
                    },
                  )}
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
                    checked={selectedTokenIds.includes(
                      tokenSelectionValue(token),
                    )}
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
          </Card.Content></Card.Root
        >
      </section>

      <section id="danger">
        <Card.Root
          class="rounded-lg border border-border bg-card p-0 shadow-none ring-0"
          ><Card.Content class="p-6">
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
          </Card.Content></Card.Root
        >
      </section>
    </main>
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  .account-page {
    min-height: 100dvh;
    background: var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }
  .account-layout {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 40px;
    width: min(1120px, calc(100% - 48px));
    margin: 0 auto;
    padding: 40px 0 80px;
    align-items: start;
  }
  .account-nav {
    display: grid;
    gap: 4px;
    position: sticky;
    top: 24px;
    padding-top: 8px;
  }
  .account-nav a {
    display: block;
    border-radius: calc(var(--ui-radius, 8px) * 0.75);
    padding: 10px 12px;
    color: var(--page-muted);
    font-size: 0.85rem;
    font-weight: 500;
    text-decoration: none;
  }
  .account-nav a:hover,
  .account-nav a:focus-visible {
    background: var(--ui-muted);
    color: var(--page-text);
  }
  .account-content {
    display: grid;
    gap: 20px;
    min-width: 0;
  }
  header {
    padding-bottom: 4px;
  }
  section {
    min-width: 0;
    scroll-margin-top: 24px;
  }
  section :global([data-slot='card']) {
    overflow: visible;
  }
  section:target :global([data-slot='card']) {
    border-color: var(--page-muted);
  }

  section :global(button[data-slot]) {
    width: fit-content;
  }
  section p {
    max-width: 65ch;
    font-size: 0.85rem;
  }
  section p {
    margin-bottom: 12px;
  }
  form > :global(button[data-slot]) {
    justify-self: start;
  }
  .grid :global(input) {
    margin-top: 4px;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.8rem;
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
    gap: 18px;
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
    font-weight: 600;
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
    border-radius: var(--ui-radius, 8px);
    padding: 10px 15px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font: inherit;
    font-weight: 600;
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
    font-weight: 600;
  }
  .error-note {
    color: #a43428;
    font-weight: 600;
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
    border-radius: var(--ui-radius, 8px);
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
  .modal-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
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
    border-radius: var(--ui-radius, 8px);
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
  @media (max-width: 900px) {
    .account-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
      width: calc(100% - 32px);
      padding-top: 24px;
    }
    .account-nav {
      position: static;
      display: flex;
      overflow-x: auto;
      padding: 0 0 8px;
      gap: 4px;
      border-bottom: 1px solid var(--page-border);
    }
    .account-nav a {
      white-space: nowrap;
      padding: 8px 10px;
    }
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
