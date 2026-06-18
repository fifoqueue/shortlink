<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import CopyValue from '$lib/components/CopyValue.svelte';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import { keepFormValues } from '$lib/forms';
  import type { AuthenticatedUser } from '$lib/plugin-contracts';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { formatText, uiText } from '$lib/i18n/ui-text';

  type Token = {
    id: number;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  };

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      user: AuthenticatedUser;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      tokens: Token[];
    };
    form?: { ok?: boolean; message?: string; token?: string };
  } = $props();

  const text = $derived(uiText(data.locale));
  let copied = $state(false);

  async function copyToken(value: string) {
    await navigator.clipboard.writeText(value);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1400);
  }
</script>

<svelte:head
  ><title>{text.account.apiTokens} · {data.siteName}</title></svelte:head
>

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

  <section>
    <header>
      <div>
        <a href={resolve('/')}>← {text.common.home}</a>
        <h1>{text.account.apiTokens}</h1>
        <p>
          {formatText(text.account.apiTokenDescription, {
            name: data.user.name,
          })}
        </p>
      </div>
      <div class="header-tools">
        <span
          >{data.user.isAdmin
            ? text.account.adminRole
            : text.account.userRole}</span
        >
        <LocaleSelect locale={data.locale} compact />
      </div>
    </header>

    {#if form?.token}
      <CopyValue
        value={form.token}
        {copied}
        onclick={() => copyToken(form.token!)}
        locale={data.locale}
      />
    {/if}

    <form method="POST" action="?/create" use:enhance={keepFormValues}>
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
          <form method="POST" action="?/revoke" use:enhance>
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
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
  }
  main {
    width: min(860px, calc(100% - 36px));
    margin: 0 auto;
    padding: 48px 0 100px;
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
  section {
    display: grid;
    gap: 18px;
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 28px;
    background: var(--page-surface);
  }
  header,
  article {
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }
  .header-tools {
    display: flex;
    align-items: start;
    gap: 12px;
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
  p,
  span {
    margin: 0;
    color: var(--page-muted);
    line-height: 1.6;
  }
  form {
    display: grid;
    gap: 10px;
  }
  label {
    display: grid;
    gap: 8px;
    color: var(--page-muted);
    font-size: 0.86rem;
    font-weight: 750;
  }
  input {
    width: 100%;
    border: 1px solid var(--page-border);
    border-radius: var(--form-control-radius);
    padding: 11px 12px;
    background: var(--page-surface);
    color: var(--page-text);
    font: inherit;
  }
  button {
    width: fit-content;
    border: 0;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }
  .tokens {
    display: grid;
    gap: 0;
  }
  article {
    align-items: center;
    border-top: 1px solid var(--page-border);
    padding: 14px 0;
  }
  article strong,
  article span {
    display: block;
  }
  article span {
    font-size: 0.78rem;
  }
  .empty {
    border-top: 1px solid var(--page-border);
    padding-top: 18px;
  }
</style>
