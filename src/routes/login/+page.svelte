<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { publicPluginRegistry } from '../../plugins/public-registry';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      returnTo: string;
      siteName: string;
      theme: SiteSettings['theme'];
      plugins: SiteSettings['plugins'];
      passwordEnabled: boolean;
      registrationAllowed: boolean;
      providers: Array<{
        pluginId: string;
        id: string;
        label: string;
        buttonColor?: string;
        buttonTextColor?: string;
        iconUrl?: string;
      }>;
    };
    form?: { message?: string };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));

  function contrastTextColor(color: string) {
    const match = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (!match) return 'var(--page-primary-contrast)';
    const value = match[1];
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const linear = [r, g, b].map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    const luminance =
      0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance > 0.55 ? '#111827' : '#ffffff';
  }

  function providerButtonStyle(provider: {
    buttonColor?: string;
    buttonTextColor?: string;
  }) {
    const values: string[] = [];
    if (provider.buttonColor) {
      values.push(`--provider-bg:${provider.buttonColor}`);
      values.push(`--provider-border:${provider.buttonColor}`);
      values.push(
        `--provider-text:${provider.buttonTextColor || contrastTextColor(provider.buttonColor)}`,
      );
    } else if (provider.buttonTextColor) {
      values.push(`--provider-text:${provider.buttonTextColor}`);
    }
    return values.join(';');
  }
</script>

<svelte:head>
  <title>{text.auth.loginTitle} · {data.siteName}</title>
</svelte:head>

<SiteThemeStyles />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} locale={data.locale} />
    {/key}
  {/if}

  <section>
    <div class="topline">
      <p class="kicker">{data.siteName}</p>
      <LocaleSelect locale={data.locale} compact />
    </div>
    <h1>{text.auth.loginTitle}</h1>
    <p class="muted">{text.auth.loginDescription}</p>

    {#if data.passwordEnabled}
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
        {/each}
      </div>
    {/if}

    {#if !data.passwordEnabled && !data.providers.length}
      <div class="inline-note">{text.auth.noLoginMethods}</div>
    {/if}
    <div class:single={!data.registrationAllowed} class="links">
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
  .providers form {
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
  .providers img {
    width: 20px;
    height: 20px;
    flex: none;
    object-fit: contain;
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
  }
</style>
