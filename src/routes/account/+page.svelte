<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import RuntimePluginFrame from '$lib/components/RuntimePluginFrame.svelte';
  import RuntimePluginSchemaForm from '$lib/components/RuntimePluginSchemaForm.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import { keepFormValues } from '$lib/forms';
  import { pluginLocaleStrings } from '$lib/i18n/plugin';
  import type {
    AuthenticatedUser,
    PluginIntegrationData,
  } from '$lib/plugin-contracts';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { formatText, uiText } from '$lib/i18n/ui-text';
  import { accountPluginRegistry } from '../../plugins/account-registry';

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
      passwordMinLength: number;
      passwordPolicy: string;
    };
    form?: { ok?: boolean; message?: string; token?: string };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
  let copiedValue = $state<string | null>(null);

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
</script>

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
    <form method="POST" action="?/password" use:enhance={keepFormValues}>
      <div class="grid form-grid balanced">
        <label>
          {text.account.currentPassword}
          <input name="currentPassword" type="password" />
        </label>
        <label>
          {text.account.nextPassword}
          <input
            name="nextPassword"
            type="password"
            minlength={data.passwordMinLength}
            required
          />
          <span>{data.passwordPolicy}</span>
        </label>
      </div>
      <button type="submit">{text.account.changePassword}</button>
    </form>
  </section>

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

    <div class="tokens">
      {#each data.tokens as token (token.id)}
        <article>
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
            action="?/revokeToken"
            use:enhance={keepFormValues}
          >
            <input type="hidden" name="id" value={token.id} />
            <DangerConfirmButton
              label={text.account.revoke}
              title={text.account.revokeTokenTitle}
              message={text.account.revokeTokenMessage}
              details={[`${token.name} (${token.prefix}...)`]}
              confirmLabel={text.account.revokeTokenConfirm}
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
    cursor: pointer;
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
  }
</style>
