<script lang="ts">
  import { resolve } from '$app/paths';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    mode,
    shortUrl,
    acceptedAsOwner = false,
    canViewStats = false,
    statsHref,
    locale,
  }: {
    mode: 'accepted' | 'inviteExpired';
    shortUrl: string;
    acceptedAsOwner?: boolean;
    canViewStats?: boolean;
    statsHref?: string;
    locale: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));

  function resolvePath(path: string) {
    return resolve(path as '/');
  }
</script>

<section class="result-panel">
  <p>{text.linkPermission.acceptedKicker}</p>
  {#if mode === 'accepted'}
    <h1>
      {acceptedAsOwner
        ? text.linkPermission.ownerAcceptedTitle
        : text.linkPermission.acceptedTitle}
    </h1>
    <span>{shortUrl}</span>
    <div class="result-actions">
      <a href={resolve('/')}>{text.linkPermission.openLinkList}</a>
      {#if canViewStats && statsHref}
        <a href={resolvePath(statsHref)}>{text.managedLinks.stats}</a>
      {/if}
    </div>
  {:else}
    <h1>{text.linkPermission.inviteExpiredTitle}</h1>
    <span>{shortUrl}</span>
    <p>{text.linkPermission.inviteExpiredDescription}</p>
    <div class="result-actions">
      <a href={resolve('/')}>{text.common.home}</a>
    </div>
  {/if}
</section>

<style>
  .result-panel {
    display: grid;
    max-width: 680px;
    gap: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin: 70px auto 0;
    padding: 22px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 22px 64px color-mix(in srgb, var(--text) 7%, transparent);
  }
  .result-panel > p:first-child {
    margin: 0;
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  h1,
  p {
    margin-top: 0;
  }
  h1 {
    margin-bottom: 0;
    font-size: clamp(2.2rem, 6vw, 4rem);
    font-weight: 500;
    line-height: 1;
  }
  .result-panel > span {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .result-panel p:not(:first-child) {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .result-actions a {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.4);
    padding: 0 14px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 850;
    text-decoration: none;
  }
  .result-actions a:first-child {
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
    background: var(--primary);
    color: var(--primary-contrast);
  }
  @media (max-width: 720px) {
    .result-actions {
      display: grid;
    }
    .result-actions a {
      width: 100%;
    }
  }
</style>
