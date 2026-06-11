<script lang="ts">
  import { enhance } from '$app/forms';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { defaultSiteLocale } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import { pluginText } from '$lib/i18n/plugin';
  import { formatText } from '$lib/i18n/ui-text';
  import { defaultOidcScopes, normalizeOidcConfig } from './config';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';

  type AdminData = {
    callbackUrl: string;
    accountLinkCallbackUrl: string;
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
      <button type="submit" name="pluginActionSubmit" value="savePolicy">
        {t('admin.savePolicy')}
      </button>
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
              <input name="id" value={provider.id} required /></label
            >
            <label
              >{t('admin.displayName')}
              <input name="name" value={provider.name} required /></label
            >
            <label>
              {t('admin.loginButtonColor')}
              <input
                name="loginButtonColor"
                value={provider.loginButtonColor}
                placeholder={t('admin.loginButtonColorPlaceholder')}
                pattern={'#[0-9a-fA-F]{6}'}
              />
              <small>{t('admin.defaultButtonColorHint')}</small>
            </label>
            <label>
              {t('admin.loginButtonTextColor')}
              <input
                name="loginButtonTextColor"
                value={provider.loginButtonTextColor}
                placeholder={t('admin.loginButtonTextColorPlaceholder')}
                pattern={'#[0-9a-fA-F]{6}'}
              />
              <small>{t('admin.autoButtonTextColorHint')}</small>
            </label>
            <label class="wide">
              {t('admin.loginIconUrl')}
              <input
                name="loginIconUrl"
                value={provider.loginIconUrl}
                placeholder={t('admin.loginIconPlaceholder')}
              />
            </label>
            <label class="wide">
              {t('admin.issuerUrl')}
              <input
                type="url"
                name="issuerUrl"
                value={provider.issuerUrl}
                required
              />
            </label>
            <label
              >{t('admin.clientId')}
              <input
                name="clientId"
                value={provider.clientId}
                required
              /></label
            >
            <label>
              {t('admin.clientSecret')}
              <input
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
              <input name="scopes" value={provider.scopes} /></label
            >
            <label class="wide">
              {t('admin.allowedEmailDomains')}
              <textarea name="allowedEmailDomains" rows="3"
                >{provider.allowedEmailDomains.join('\n')}</textarea
              >
            </label>
          </div>
          <div class="actions">
            <button
              type="submit"
              name="pluginActionSubmit"
              value="saveProvider"
            >
              {t('admin.validateAndSave')}
            </button>
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
            details={[provider.id]}
            confirmLabel={t('admin.deleteProviderConfirm')}
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
            <input
              name="id"
              placeholder={t('admin.providerIdPlaceholder')}
              required
            /></label
          >
          <label
            >{t('admin.displayName')}
            <input
              name="name"
              placeholder={t('admin.providerNamePlaceholder')}
              required
            /></label
          >
          <label>
            {t('admin.loginButtonColor')}
            <input
              name="loginButtonColor"
              placeholder={t('admin.loginButtonColorPlaceholder')}
              pattern={'#[0-9a-fA-F]{6}'}
            />
            <small>{t('admin.defaultButtonColorHint')}</small>
          </label>
          <label>
            {t('admin.loginButtonTextColor')}
            <input
              name="loginButtonTextColor"
              placeholder={t('admin.loginButtonTextColorPlaceholder')}
              pattern={'#[0-9a-fA-F]{6}'}
            />
            <small>{t('admin.autoButtonTextColorHint')}</small>
          </label>
          <label class="wide">
            {t('admin.loginIconUrl')}
            <input
              name="loginIconUrl"
              placeholder={t('admin.loginIconPlaceholder')}
            />
          </label>
          <label class="wide"
            >{t('admin.issuerUrl')}
            <input type="url" name="issuerUrl" required /></label
          >
          <label>{t('admin.clientId')} <input name="clientId" required /></label
          >
          <label>
            {t('admin.clientSecret')}
            <input
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
            <input name="scopes" value={defaultOidcScopes} /></label
          >
          <label class="wide">
            {t('admin.allowedEmailDomains')}
            <textarea name="allowedEmailDomains" rows="3"></textarea>
          </label>
        </div>
        <button type="submit" name="pluginActionSubmit" value="saveProvider">
          {t('admin.validateIssuerAndAdd')}
        </button>
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
      <CopyValue
        label={t('admin.accountLinkCallback')}
        value={data.accountLinkCallbackUrl ?? ''}
        copied={copiedCallback === 'account'}
        {locale}
        onclick={() => copyCallback(data.accountLinkCallbackUrl, 'account')}
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
    font-weight: 750;
  }
  input:not([type='checkbox']),
  select {
    min-height: var(--form-control-height);
  }
  input,
  select,
  textarea {
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
  button {
    width: fit-content;
    border: 0;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--admin-primary);
    color: var(--admin-primary-contrast);
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  .provider {
    border: 1px solid var(--admin-border);
    border-radius: 12px;
    padding: 14px;
  }
  summary {
    cursor: pointer;
    font-weight: 850;
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
