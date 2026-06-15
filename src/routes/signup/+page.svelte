<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import type { RuntimePluginSlotRender } from '$lib/plugin-contracts';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { publicPluginRegistry } from '../../plugins/public-registry';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      plugins: SiteSettings['plugins'];
      setupRequired: boolean;
      passwordPolicy: string;
      emailVerificationEnabled: boolean;
      registrationAllowed: boolean;
      registrationUnavailableReason: string;
      runtimeSlots: RuntimePluginSlotRender[];
    };
    form?: {
      ok?: boolean;
      verificationRequired?: boolean;
      registrationBlocked?: boolean;
      message?: string;
      values?: { email?: string; name?: string };
    };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<svelte:head>
  <title>{text.auth.signupTitle} · {data.siteName}</title>
</svelte:head>

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
    <div class="topline">
      <p class="kicker">{data.siteName}</p>
      <LocaleSelect locale={data.locale} compact />
    </div>
    <h1>{data.setupRequired ? text.auth.setupTitle : text.auth.signupTitle}</h1>
    <p class="muted">
      {data.setupRequired
        ? text.auth.setupDescription
        : text.auth.signupDescription}
    </p>

    {#if !data.registrationAllowed || form?.registrationBlocked}
      <div class="inline-note">
        {form?.message ?? data.registrationUnavailableReason}
      </div>
    {:else if !form?.verificationRequired}
      <form method="POST" action="?/register" use:enhance>
        <label>
          {text.auth.email}
          <input
            type="email"
            name="email"
            autocomplete="email"
            value={form?.values?.email ?? ''}
            required
          />
        </label>
        <label>
          {text.auth.name}
          <input
            name="name"
            autocomplete="name"
            value={form?.values?.name ?? ''}
            required
          />
        </label>
        <label>
          {text.auth.password}
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            required
          />
          <span>{data.passwordPolicy}</span>
        </label>
        <PluginSlotOutlet
          registry={publicPluginRegistry}
          states={data.plugins}
          slot="signup-extra"
          runtimeSlots={data.runtimeSlots}
          locale={data.locale}
          fallbackLocale={data.defaultLocale}
        />
        <button type="submit">{text.auth.signupSubmit}</button>
      </form>
    {/if}

    {#if data.registrationAllowed && data.emailVerificationEnabled}
      <p class="hint">{text.auth.verificationHint}</p>
    {/if}

    <div class="links">
      <a class="link-button secondary" href={resolve('/login')}
        >{text.common.login}</a
      >
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
    width: min(460px, 100%);
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
  .muted,
  .hint,
  label span {
    color: var(--page-muted);
  }
  .muted {
    margin: 12px 0 26px;
  }
  form,
  label {
    display: grid;
    gap: 10px;
  }
  form {
    gap: 14px;
  }
  label {
    color: var(--page-muted);
    font-size: 0.82rem;
    font-weight: 800;
  }
  label span {
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.5;
  }
  input,
  button,
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
  button {
    display: grid;
    place-items: center;
    border: 0;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
    cursor: pointer;
  }
  .inline-note {
    margin-bottom: 18px;
    border-radius: 11px;
    padding: 13px 14px;
    background: var(--notice-error-bg);
    color: var(--notice-error-text);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .hint {
    margin: 16px 0 0;
    font-size: 0.8rem;
    line-height: 1.6;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 22px;
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
  .link-button.secondary {
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    border-color: var(--page-primary);
  }
  @media (max-width: 520px) {
    .links {
      grid-template-columns: 1fr;
    }
  }
</style>
