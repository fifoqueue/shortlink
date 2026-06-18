<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import ToastNotice from '$lib/components/ToastNotice.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { siteThemeStyle } from '$lib/theme-vars';
  import { formatText, uiText } from '$lib/i18n/ui-text';

  type RedirectPageSettings = Pick<SiteSettings, 'general' | 'seo' | 'theme'>;
  type RedirectPageLink = {
    code: string;
  };
  type PreviewMetadata = {
    title: string;
    description: string;
    imageUrl: string;
    themeColor: string;
    canonicalUrl: string;
    targetUrl: string;
  };
  type PageData =
    | {
        mode: 'blocked';
        reason: 'expired' | 'maxClicks';
        title: string;
        link: RedirectPageLink;
        settings: RedirectPageSettings;
      }
    | {
        mode: 'password';
        link: RedirectPageLink;
        settings: RedirectPageSettings;
      }
    | {
        mode: 'preview';
        link: RedirectPageLink;
        settings: RedirectPageSettings;
        metadata: PreviewMetadata;
      };

  let {
    data,
    form,
  }: {
    data: PageData;
    form?: { message?: string };
  } = $props();

  const locale = $derived(data.settings.general.language as SiteLocale);
  const text = $derived(uiText(locale));

  function title() {
    if (data.mode === 'preview') return data.metadata.title;
    if (data.mode === 'blocked') return data.title;
    return formatText(text.redirect.unlock, { code: data.link.code });
  }

  function headTitle() {
    return `${title()} · ${data.settings.general.siteName}`;
  }

  function description() {
    if (data.mode === 'preview') return data.metadata.description;
    if (data.mode === 'blocked') {
      return formatText(text.redirect.blockedDescription, {
        code: data.link.code,
      });
    }
    return formatText(text.redirect.passwordDescription, {
      code: data.link.code,
    });
  }
</script>

<svelte:head>
  <title>{headTitle()}</title>
  <meta name="description" content={description()} />
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <link rel="icon" href={data.settings.general.faviconUrl} />
  {#if data.mode === 'preview'}
    <link rel="canonical" href={data.metadata.canonicalUrl} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={data.metadata.canonicalUrl} />
    <meta property="og:title" content={data.metadata.title} />
    <meta property="og:description" content={data.metadata.description} />
    {#if data.metadata.imageUrl}
      <meta property="og:image" content={data.metadata.imageUrl} />
    {/if}
    <meta name="theme-color" content={data.metadata.themeColor} />
    <meta
      name="twitter:card"
      content={data.metadata.imageUrl ? 'summary_large_image' : 'summary'}
    />
    <meta name="twitter:title" content={data.metadata.title} />
    <meta name="twitter:description" content={data.metadata.description} />
    {#if data.metadata.imageUrl}
      <meta name="twitter:image" content={data.metadata.imageUrl} />
    {/if}
  {:else}
    <meta name="robots" content="noindex,nofollow" />
    <meta
      name="theme-color"
      content={data.settings.theme.customTokens.primary}
    />
  {/if}
</svelte:head>

<SiteThemeStyles customHead={data.settings.seo.customHead} />

<main
  class="redirect-page site-theme"
  data-theme-mode={data.settings.theme.mode}
  data-theme-preset={data.settings.theme.preset}
  style={siteThemeStyle(data.settings.theme)}
>
  {#if form?.message}
    {#key form}
      <ToastNotice message={form.message} ok={false} {locale} />
    {/key}
  {/if}

  <section class:blocked={data.mode === 'blocked'}>
    <a class="brand" href={resolve('/')}>
      {#if data.settings.general.logoUrl}
        <img src={data.settings.general.logoUrl} alt="" />
      {:else}
        <span>{data.settings.general.siteName.slice(0, 1).toUpperCase()}</span>
      {/if}
      <strong>{data.settings.general.siteName}</strong>
    </a>

    {#if data.mode === 'password'}
      <div class="content">
        <p class="kicker">/{data.link.code}</p>
        <h1>{text.redirect.protectedLink}</h1>
        <p class="muted">{text.redirect.passwordRequired}</p>
      </div>
      <form method="POST" action="?/unlock" use:enhance>
        <label>
          {text.redirect.password}
          <input
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button type="submit">{text.redirect.open}</button>
      </form>
    {:else if data.mode === 'blocked'}
      <div class="content">
        <p class="kicker">/{data.link.code}</p>
        <h1>{data.title}</h1>
        <p class="muted">{text.redirect.cannotOpen}</p>
      </div>
      <a class="home-link" href={resolve('/')}>{text.common.home}</a>
    {:else}
      <div class="content">
        <p class="kicker">/{data.link.code}</p>
        <h1>{data.metadata.title}</h1>
        {#if data.metadata.description}
          <p class="muted">{data.metadata.description}</p>
        {/if}
      </div>
      <a class="primary-link" href={data.metadata.targetUrl}
        >{text.redirect.openLink}</a
      >
    {/if}
    <LocaleSelect {locale} compact />
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
  }

  .redirect-page {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--page-primary) 12%, transparent),
        transparent 44%
      ),
      var(--page-bg);
    color: var(--page-text);
    font-family: var(--font);
  }

  section {
    display: grid;
    width: min(460px, 100%);
    gap: 24px;
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 34px;
    background: var(--page-surface);
    box-shadow: 0 28px 80px
      color-mix(in srgb, var(--page-text) 10%, transparent);
  }

  section.blocked {
    border-color: color-mix(
      in srgb,
      var(--page-danger) 36%,
      var(--page-border)
    );
  }

  .brand {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    align-items: center;
    gap: 10px;
    color: var(--page-text);
    text-decoration: none;
  }

  .brand img,
  .brand span {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 10px;
  }

  .brand img {
    object-fit: contain;
  }

  .brand span {
    display: grid;
    place-items: center;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
  }

  .brand strong {
    overflow: hidden;
    font-size: 0.94rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content {
    display: grid;
    gap: 10px;
  }

  .kicker {
    margin: 0;
    color: var(--page-primary);
    font-size: 0.74rem;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.8rem, 7vw, 2.45rem);
    line-height: 1.08;
  }

  .muted {
    margin: 0;
    color: var(--page-muted);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  form,
  label {
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
  .home-link,
  .primary-link {
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
  .primary-link,
  .home-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    padding: 0 16px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font-weight: 900;
    text-decoration: none;
  }

  button {
    cursor: pointer;
  }

  .home-link {
    border: 1px solid var(--page-border);
    background: var(--page-surface);
    color: var(--page-primary);
  }

  @media (max-width: 520px) {
    .redirect-page {
      padding: 16px;
    }

    section {
      padding: 26px;
    }
  }
</style>
