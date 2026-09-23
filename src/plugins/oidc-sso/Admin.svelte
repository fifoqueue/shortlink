<script lang="ts">
  import { Textarea } from '$lib/components/ui/textarea';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { enhance } from '$app/forms';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { defaultSiteLocale } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import { pluginText } from '$lib/i18n/plugin';
  import { formatText } from '$lib/i18n/ui-text';
  import {
    defaultOidcScopes,
    normalizeOidcConfig,
    type EmailTrustMode,
    type SsoProviderFlow,
  } from './config';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';

  type DetailPart =
    | string
    | {
        text: string | number;
        strong?: boolean;
      };

  type AdminData = {
    callbackUrl: string;
    providerDeletionImpacts?: Record<
      string,
      {
        connectedUserCount: number;
        soleLoginUserCount: number;
      }
    >;
  };

  let {
    config,
    adminData,
    locale = defaultSiteLocale,
    strings = {},
  }: PluginComponentProps = $props();

  const oidc = $derived(normalizeOidcConfig(config));
  const data = $derived((adminData ?? {}) as Partial<AdminData>);
  let copiedCallback = $state<string | null>(null);
  let providerFlows = $state<Record<string, SsoProviderFlow>>({});
  let providerEmailTrustModes = $state<Record<string, EmailTrustMode>>({});
  let newProviderFlow = $state<SsoProviderFlow>('oidc');
  let newProviderEmailTrustMode = $state<EmailTrustMode>('verified-claim');

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }

  async function copyCallback(value: string | undefined, key: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    copiedCallback = key;
    setTimeout(() => {
      if (copiedCallback === key) copiedCallback = null;
    }, 1400);
  }

  function normalizeEmailTrustMode(value: string): EmailTrustMode {
    return value === 'local-verification' ||
      value === 'disabled' ||
      value === 'existing-only'
      ? value
      : 'verified-claim';
  }

  function normalizeProviderFlow(value: string): SsoProviderFlow {
    return value === 'oauth' ? 'oauth' : 'oidc';
  }

  function selectedProviderFlow(providerId: string, fallback: SsoProviderFlow) {
    return providerFlows[providerId] ?? fallback;
  }

  function updateProviderFlow(providerId: string, event: Event) {
    providerFlows[providerId] = normalizeProviderFlow(
      (event.currentTarget as HTMLSelectElement).value,
    );
  }

  function selectedProviderEmailTrustMode(
    providerId: string,
    fallback: EmailTrustMode,
  ) {
    return providerEmailTrustModes[providerId] ?? fallback;
  }

  function updateProviderEmailTrustMode(providerId: string, event: Event) {
    providerEmailTrustModes[providerId] = normalizeEmailTrustMode(
      (event.currentTarget as HTMLSelectElement).value,
    );
  }

  function providerDeletionImpact(providerId: string) {
    return (
      data.providerDeletionImpacts?.[providerId] ?? {
        connectedUserCount: 0,
        soleLoginUserCount: 0,
      }
    );
  }

  function richCountDetail(text: string, count: number): DetailPart[] {
    const placeholder = '{count}';
    if (!text.includes(placeholder)) return [text];
    const [prefix, ...rest] = text.split(placeholder);
    return [
      prefix,
      { text: count, strong: true },
      rest.join(placeholder),
    ].filter((part) => (typeof part === 'string' ? part.length > 0 : true));
  }

  function providerDeleteDetails(providerId: string) {
    const impact = providerDeletionImpact(providerId);
    const details = [
      richCountDetail(
        t('admin.deleteProviderConnectionImpact'),
        impact.connectedUserCount,
      ),
      impact.soleLoginUserCount > 0
        ? {
            tone: 'danger' as const,
            parts: richCountDetail(
              t('admin.deleteProviderSoleLoginImpact'),
              impact.soleLoginUserCount,
            ),
          }
        : t('admin.deleteProviderNoSoleLoginImpact'),
      t('admin.deleteProviderIdentityRetention'),
    ];
    return details;
  }
</script>

<div class="plugin-i18n-root">
  <section>
    <h2>{t('admin.loginPolicy')}</h2>
    <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
      <input type="hidden" name="pluginAction" value="savePolicy" />
      <ToggleField
        name="passwordLoginEnabled"
        label={t('admin.allowPasswordLogin')}
        checked={oidc.passwordLoginEnabled}
      />
      <p>
        {t('admin.passwordLoginPolicyHint')}
      </p>
      <Button type="submit" name="pluginActionSubmit" value="savePolicy">
        {t('admin.savePolicy')}
      </Button>
    </form>
  </section>

  <section>
    <h2>{t('admin.ssoProviders')}</h2>
    {#each oidc.providers as provider (provider.id)}
      <details class="provider">
        <summary>{provider.name} <code>{provider.id}</code></summary>
        <form
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginAction" value="saveProvider" />
          <input type="hidden" name="originalId" value={provider.id} />
          <div class="grid form-grid balanced">
            <label
              >{t('admin.id')}
              <Input name="id" value={provider.id} required /></label
            >
            <label
              >{t('admin.displayName')}
              <Input name="name" value={provider.name} required /></label
            >
            <label>
              {t('admin.flow')}
              <select
                name="flow"
                value={selectedProviderFlow(provider.id, provider.flow)}
                onchange={(event) => updateProviderFlow(provider.id, event)}
              >
                <option value="oidc">{t('admin.flowOidc')}</option>
                <option value="oauth">{t('admin.flowOauth')}</option>
              </select>
            </label>
            <label>
              {t('admin.loginButtonColor')}
              <Input
                name="loginButtonColor"
                value={provider.loginButtonColor}
                placeholder={t('admin.loginButtonColorPlaceholder')}
                pattern={'#[0-9a-fA-F]{6}'}
              />
              <small>{t('admin.defaultButtonColorHint')}</small>
            </label>
            <label>
              {t('admin.loginButtonTextColor')}
              <Input
                name="loginButtonTextColor"
                value={provider.loginButtonTextColor}
                placeholder={t('admin.loginButtonTextColorPlaceholder')}
                pattern={'#[0-9a-fA-F]{6}'}
              />
              <small>{t('admin.autoButtonTextColorHint')}</small>
            </label>
            <label class="wide">
              {t('admin.loginIconUrl')}
              <Input
                name="loginIconUrl"
                value={provider.loginIconUrl}
                placeholder={t('admin.loginIconPlaceholder')}
              />
            </label>
            {#if selectedProviderFlow(provider.id, provider.flow) === 'oidc'}
              <label class="wide">
                {t('admin.issuerUrl')}
                <Input type="url" name="issuerUrl" value={provider.issuerUrl} />
              </label>
            {:else}
              <label>
                {t('admin.oauthMetadataSource')}
                <select
                  name="oauthMetadataSource"
                  value={provider.oauthMetadataSource}
                >
                  <option value="manual"
                    >{t('admin.oauthMetadataManual')}</option
                  >
                  <option value="metadata-url"
                    >{t('admin.oauthMetadataUrlSource')}</option
                  >
                </select>
              </label>
              <label class="wide">
                {t('admin.oauthMetadataUrl')}
                <Input
                  type="url"
                  name="oauthMetadataUrl"
                  value={provider.oauthMetadataUrl}
                  placeholder={t('admin.oauthMetadataUrlPlaceholder')}
                />
              </label>
              <label class="wide">
                {t('admin.authorizationEndpoint')}
                <Input
                  type="url"
                  name="authorizationEndpoint"
                  value={provider.authorizationEndpoint}
                />
              </label>
              <label class="wide">
                {t('admin.tokenEndpoint')}
                <Input
                  type="url"
                  name="tokenEndpoint"
                  value={provider.tokenEndpoint}
                />
                <small>{t('admin.tokenEndpointHint')}</small>
              </label>
              <label class="wide">
                {t('admin.userInfoEndpoint')}
                <Input
                  type="url"
                  name="userInfoEndpoint"
                  value={provider.userInfoEndpoint}
                />
              </label>
            {/if}
            <label
              >{t('admin.clientId')}
              <Input name="clientId" value={provider.clientId} required />
              <small>{t('admin.clientIdHint')}</small></label
            >
            <label>
              {t('admin.clientSecret')}
              <Input
                type="password"
                name="clientSecret"
                placeholder={t('admin.clientSecretChangeOnly')}
              />
            </label>
            <label>
              {t('admin.authMethod')}
              <select name="clientAuthMethod" value={provider.clientAuthMethod}>
                <option value="client_secret_basic"
                  >{t('admin.authMethodClientSecretBasic')}</option
                >
                <option value="client_secret_post"
                  >{t('admin.authMethodClientSecretPost')}</option
                >
                <option value="none">{t('admin.authMethodNone')}</option>
              </select>
              <small>{t('admin.noneRemovesSecretHint')}</small>
            </label>
            <label
              >{t('admin.scopes')}
              <Input name="scopes" value={provider.scopes} />
              <small>{t('admin.scopesHint')}</small></label
            >
            {#if selectedProviderFlow(provider.id, provider.flow) === 'oauth'}
              <label>
                {t('admin.authorizationHintParameter')}
                <Input
                  name="authorizationHintParameter"
                  value={provider.authorizationHintParameter}
                  placeholder={t('admin.authorizationHintParameterPlaceholder')}
                />
              </label>
            {/if}
            <label class="wide">
              {t('admin.allowedEmailDomains')}
              <Textarea
                name="allowedEmailDomains"
                rows={3}
                value={provider.allowedEmailDomains.join('\n')}
              />
            </label>
            {#if selectedProviderFlow(provider.id, provider.flow) === 'oauth'}
              <label class="wide">
                {t('admin.tokenRequestBody')}
                <small>{t('admin.tokenRequestBodyHelp')}</small>
                <Textarea
                  name="tokenRequestBody"
                  rows={3}
                  value={provider.tokenRequestBody}
                />
              </label>
            {/if}
            {#if selectedProviderFlow(provider.id, provider.flow) === 'oauth'}
              <label>
                {t('admin.loginInputName')}
                <Input
                  name="loginInputName"
                  value={provider.loginInputName}
                  placeholder={t('admin.loginInputNamePlaceholder')}
                />
              </label>
              <label>
                {t('admin.loginInputLabel')}
                <Input
                  name="loginInputLabel"
                  value={provider.loginInputLabel}
                />
              </label>
              <label>
                {t('admin.loginInputPlaceholder')}
                <Input
                  name="loginInputPlaceholder"
                  value={provider.loginInputPlaceholder}
                />
              </label>
              <label>
                {t('admin.loginInputDefault')}
                <Input
                  name="loginInputDefault"
                  value={provider.loginInputDefault}
                />
              </label>
              <label class="wide">
                {t('admin.loginInputHelp')}
                <Input name="loginInputHelp" value={provider.loginInputHelp} />
              </label>
              <ToggleField
                name="loginInputRequired"
                label={t('admin.loginInputRequired')}
                checked={provider.loginInputRequired}
              />

              <label>
                {t('admin.subjectPath')}
                <Input name="subjectPath" value={provider.subjectPath} />
              </label>
            {/if}
            <label>
              {t('admin.emailPath')}
              <Input name="emailPath" value={provider.emailPath} />
            </label>
            <label>
              {t('admin.emailVerifiedPath')}
              <Input
                name="emailVerifiedPath"
                value={provider.emailVerifiedPath}
              />
            </label>
            <label>
              {t('admin.namePath')}
              <Input name="namePath" value={provider.namePath} />
            </label>
            <label class="wide">
              {t('admin.emailTrustMode')}
              <select
                name="emailTrustMode"
                value={selectedProviderEmailTrustMode(
                  provider.id,
                  provider.emailTrustMode,
                )}
                onchange={(event) =>
                  updateProviderEmailTrustMode(provider.id, event)}
              >
                <option value="verified-claim"
                  >{t('admin.emailTrustVerifiedClaim')}</option
                >
                <option value="local-verification"
                  >{t('admin.emailTrustLocalVerification')}</option
                >
                <option value="existing-only"
                  >{t('admin.emailTrustExistingOnly')}</option
                >
                <option value="disabled">{t('admin.emailTrustDisabled')}</option
                >
              </select>
              <small>{t('admin.emailTrustModeHelp')}</small>
            </label>
          </div>
          <div class="actions">
            {#if selectedProviderEmailTrustMode(provider.id, provider.emailTrustMode) === 'disabled'}
              <DangerConfirmButton
                label={t('admin.validateAndSave')}
                {locale}
                name="pluginActionSubmit"
                value="saveProvider"
                title={t('admin.emailTrustDisabledTitle')}
                message={t('admin.emailTrustDisabledMessage')}
                details={[provider.name]}
                confirmLabel={t('admin.emailTrustDisabledConfirm')}
                requireConsent
                consentLabel={t('admin.emailTrustDisabledConsent')}
              />
            {:else}
              <Button
                type="submit"
                name="pluginActionSubmit"
                value="saveProvider"
              >
                {t('admin.validateAndSave')}
              </Button>
            {/if}
          </div>
        </form>
        <form
          method="POST"
          action="?/pluginAction"
          use:enhance={keepFormValues}
        >
          <input type="hidden" name="pluginAction" value="deleteProvider" />
          <input type="hidden" name="id" value={provider.id} />
          <DangerConfirmButton
            label={t('admin.delete')}
            {locale}
            name="pluginActionSubmit"
            value="deleteProvider"
            disabled={!oidc.passwordLoginEnabled && oidc.providers.length === 1}
            title={formatText(t('admin.deleteProviderTitle'), {
              name: provider.name,
            })}
            message={t('admin.deleteProviderMessage')}
            details={providerDeleteDetails(provider.id)}
            confirmLabel={t('admin.deleteProviderConfirm')}
            requireConsent={providerDeletionImpact(provider.id)
              .soleLoginUserCount > 0}
            consentLabel={t('admin.deleteProviderSoleLoginConsent')}
          />
        </form>
      </details>
    {/each}

    <details class="provider" open={oidc.providers.length === 0}>
      <summary>{t('admin.addProvider')}</summary>
      <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
        <input type="hidden" name="pluginAction" value="saveProvider" />
        <div class="grid form-grid balanced">
          <label
            >{t('admin.id')}
            <Input
              name="id"
              placeholder={t('admin.providerIdPlaceholder')}
              required
            /></label
          >
          <label
            >{t('admin.displayName')}
            <Input
              name="name"
              placeholder={t('admin.providerNamePlaceholder')}
              required
            /></label
          >
          <label>
            {t('admin.flow')}
            <select name="flow" bind:value={newProviderFlow}>
              <option value="oidc">{t('admin.flowOidc')}</option>
              <option value="oauth">{t('admin.flowOauth')}</option>
            </select>
          </label>
          <label>
            {t('admin.loginButtonColor')}
            <Input
              name="loginButtonColor"
              placeholder={t('admin.loginButtonColorPlaceholder')}
              pattern={'#[0-9a-fA-F]{6}'}
            />
            <small>{t('admin.defaultButtonColorHint')}</small>
          </label>
          <label>
            {t('admin.loginButtonTextColor')}
            <Input
              name="loginButtonTextColor"
              placeholder={t('admin.loginButtonTextColorPlaceholder')}
              pattern={'#[0-9a-fA-F]{6}'}
            />
            <small>{t('admin.autoButtonTextColorHint')}</small>
          </label>
          <label class="wide">
            {t('admin.loginIconUrl')}
            <Input
              name="loginIconUrl"
              placeholder={t('admin.loginIconPlaceholder')}
            />
          </label>
          {#if newProviderFlow === 'oidc'}
            <label class="wide"
              >{t('admin.issuerUrl')}
              <Input type="url" name="issuerUrl" /></label
            >
          {:else}
            <label>
              {t('admin.oauthMetadataSource')}
              <select name="oauthMetadataSource">
                <option value="manual">{t('admin.oauthMetadataManual')}</option>
                <option value="metadata-url"
                  >{t('admin.oauthMetadataUrlSource')}</option
                >
              </select>
            </label>
            <label class="wide">
              {t('admin.oauthMetadataUrl')}
              <Input
                type="url"
                name="oauthMetadataUrl"
                placeholder={t('admin.oauthMetadataUrlPlaceholder')}
              />
            </label>
            <label class="wide">
              {t('admin.authorizationEndpoint')}
              <Input type="url" name="authorizationEndpoint" />
            </label>
            <label class="wide">
              {t('admin.tokenEndpoint')}
              <Input type="url" name="tokenEndpoint" />
              <small>{t('admin.tokenEndpointHint')}</small>
            </label>
            <label class="wide">
              {t('admin.userInfoEndpoint')}
              <Input type="url" name="userInfoEndpoint" />
            </label>
          {/if}
          <label
            >{t('admin.clientId')}
            <Input name="clientId" required />
            <small>{t('admin.clientIdHint')}</small></label
          >
          <label>
            {t('admin.clientSecret')}
            <Input
              type="password"
              name="clientSecret"
              placeholder={t('admin.noneSecretPlaceholder')}
            />
          </label>
          <label>
            {t('admin.authMethod')}
            <select name="clientAuthMethod">
              <option value="client_secret_basic"
                >{t('admin.authMethodClientSecretBasic')}</option
              >
              <option value="client_secret_post"
                >{t('admin.authMethodClientSecretPost')}</option
              >
              <option value="none">{t('admin.authMethodNone')}</option>
            </select>
            <small>{t('admin.nonePublicClientHint')}</small>
          </label>
          <label
            >{t('admin.scopes')}
            <Input
              name="scopes"
              value={newProviderFlow === 'oauth' ? '' : defaultOidcScopes}
            />
            <small>{t('admin.scopesHint')}</small></label
          >
          {#if newProviderFlow === 'oauth'}
            <label>
              {t('admin.authorizationHintParameter')}
              <Input
                name="authorizationHintParameter"
                placeholder={t('admin.authorizationHintParameterPlaceholder')}
              />
            </label>
          {/if}
          <label class="wide">
            {t('admin.allowedEmailDomains')}
            <Textarea name="allowedEmailDomains" rows={3} />
          </label>
          {#if newProviderFlow === 'oauth'}
            <label class="wide">
              {t('admin.tokenRequestBody')}
              <small>{t('admin.tokenRequestBodyHelp')}</small>
              <Textarea name="tokenRequestBody" rows={3} />
            </label>
          {/if}
          {#if newProviderFlow === 'oauth'}
            <label>
              {t('admin.loginInputName')}
              <Input
                name="loginInputName"
                placeholder={t('admin.loginInputNamePlaceholder')}
              />
            </label>
            <label>
              {t('admin.loginInputLabel')}
              <Input name="loginInputLabel" />
            </label>
            <label>
              {t('admin.loginInputPlaceholder')}
              <Input name="loginInputPlaceholder" />
            </label>
            <label>
              {t('admin.loginInputDefault')}
              <Input name="loginInputDefault" />
            </label>
            <label class="wide">
              {t('admin.loginInputHelp')}
              <Input name="loginInputHelp" />
            </label>
            <ToggleField
              name="loginInputRequired"
              label={t('admin.loginInputRequired')}
            />

            <label>
              {t('admin.subjectPath')}
              <Input name="subjectPath" value="sub" />
            </label>
          {/if}
          <label>
            {t('admin.emailPath')}
            <Input name="emailPath" value="email" />
          </label>
          <label>
            {t('admin.emailVerifiedPath')}
            <Input name="emailVerifiedPath" value="email_verified" />
          </label>
          <label>
            {t('admin.namePath')}
            <Input name="namePath" value="name" />
          </label>
          <label class="wide">
            {t('admin.emailTrustMode')}
            <select
              name="emailTrustMode"
              bind:value={newProviderEmailTrustMode}
            >
              <option value="verified-claim"
                >{t('admin.emailTrustVerifiedClaim')}</option
              >
              <option value="local-verification"
                >{t('admin.emailTrustLocalVerification')}</option
              >
              <option value="existing-only"
                >{t('admin.emailTrustExistingOnly')}</option
              >
              <option value="disabled">{t('admin.emailTrustDisabled')}</option>
            </select>
            <small>{t('admin.emailTrustModeHelp')}</small>
          </label>
        </div>
        {#if newProviderEmailTrustMode === 'disabled'}
          <DangerConfirmButton
            label={t('admin.validateIssuerAndAdd')}
            {locale}
            name="pluginActionSubmit"
            value="saveProvider"
            title={t('admin.emailTrustDisabledTitle')}
            message={t('admin.emailTrustDisabledMessage')}
            confirmLabel={t('admin.emailTrustDisabledConfirm')}
            requireConsent
            consentLabel={t('admin.emailTrustDisabledConsent')}
          />
        {:else}
          <Button type="submit" name="pluginActionSubmit" value="saveProvider">
            {t('admin.validateIssuerAndAdd')}
          </Button>
        {/if}
      </form>
    </details>
    <div class="callbacks">
      <h3>{t('admin.callbackUrls')}</h3>
      <CopyValue
        label={t('admin.loginCallback')}
        value={data.callbackUrl ?? ''}
        copied={copiedCallback === 'login'}
        {locale}
        onclick={() => copyCallback(data.callbackUrl, 'login')}
      />
    </div>
  </section>
</div>

<style>
  .plugin-i18n-root {
    display: contents;
  }
  section {
    display: grid;
    gap: 14px;
    border-top: 1px solid var(--admin-border);
    padding-top: 18px;
  }
  section:first-child {
    border-top: 0;
    padding-top: 0;
  }
  h2 {
    margin: 0;
  }
  form {
    display: grid;
    gap: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
    gap: 14px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  label {
    display: grid;
    gap: 7px;
    color: var(--admin-text);
    font-size: 0.82rem;
    font-weight: 600;
  }
  input:not([type='checkbox']),
  select {
    min-height: var(--form-control-height);
  }
  input,
  select {
    width: 100%;
    border: 1px solid var(--admin-border);
    border-radius: var(--form-control-radius);
    padding: 10px 12px;
    background: var(--admin-surface);
    color: var(--admin-text);
    font: inherit;
  }
  small,
  p {
    margin: 0;
    color: var(--admin-muted);
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.6;
  }
  .provider {
    border: 1px solid var(--admin-border);
    border-radius: var(--ui-radius, 8px);
    padding: 14px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  summary code {
    margin-left: 8px;
    color: var(--admin-muted);
    font-weight: 500;
  }
  details form {
    margin-top: 18px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .callbacks {
    display: grid;
    gap: 8px;
    margin-top: 4px;
    border-top: 1px solid var(--admin-border);
    padding-top: 14px;
  }
  .callbacks h3 {
    margin: 0;
    color: var(--admin-text);
    font-size: 0.88rem;
  }
  .callbacks {
    --copy-border: 1px solid var(--admin-border);
    --copy-bg: var(--admin-surface);
    --copy-text: var(--admin-text);
    --copy-label: var(--admin-muted);
    --copy-code: var(--admin-text);
    --copy-accent: var(--admin-primary);
    --copy-padding: 12px;
  }
  @media (prefers-color-scheme: dark) {
    label,
    small,
    p,
    .callbacks h3 {
      color: var(--admin-muted);
    }
    section {
      --toggle-border: var(--admin-border);
      --toggle-surface: var(--admin-surface);
      --toggle-primary: var(--admin-primary);
      --toggle-focus: color-mix(in srgb, var(--admin-primary) 16%, transparent);
    }
  }
  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
  }
</style>
