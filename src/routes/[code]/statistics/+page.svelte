<script lang="ts">
  import { resolve } from '$app/paths';
  import LocaleSelect from '$lib/components/LocaleSelect.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import SearchForm from '$lib/components/SearchForm.svelte';
  import SiteThemeStyles from '$lib/components/SiteThemeStyles.svelte';
  import LinkQr from '$lib/components/LinkQr.svelte';
  import { siteThemeStyle } from '$lib/theme-vars';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import {
    STATS_SEARCH_PARAMS,
    type SearchOption,
    type StatsSearchState,
  } from '$lib/search';
  import { formatText, uiText } from '$lib/i18n/ui-text';

  type ClickEvent = {
    created_at: string;
    ip: string | null;
    user_agent: string | null;
    referer: string | null;
    details: Array<{ label: string; value: string }>;
  };

  type LinkStats = {
    code: string;
    url: string;
    short_url: string;
    created_at: string;
    clicks: number;
    last_clicked_at: string | null;
    creator: {
      name: string;
      account: {
        id: number;
        email: string | null;
        enabled: boolean;
      } | null;
      ipAddress: string | null;
    } | null;
    click_events: ClickEvent[];
    insights: {
      sampleSize: number;
      last24h: number;
      previous24h: number;
      topReferrers: Array<{ label: string; count: number }>;
      topBrowsers: Array<{ label: string; count: number }>;
      topCountries: Array<{ label: string; count: number }>;
      alerts: Array<{ label: string; message: string }>;
    };
    health: {
      status: 'unchecked' | 'ok' | 'warning' | 'broken';
      statusCode: number | null;
      checkedAt: string | null;
      error: string;
      latencyMs: number | null;
    };
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };

  let {
    data,
  }: {
    data: {
      link: LinkStats;
      locale: SiteLocale;
      siteName: string;
      theme: SiteSettings['theme'];
      returnTo: string;
      search: StatsSearchState;
      searchOptions: SearchOption[];
    };
  } = $props();

  const text = $derived(uiText(data.locale));
  const hasSearch = $derived(data.search.query.trim().length > 0);

  function returnToQuery() {
    return data.returnTo !== '/'
      ? `returnTo=${encodeURIComponent(data.returnTo)}`
      : '';
  }

  function statsBaseHref() {
    const query = returnToQuery();
    return `/${data.link.code}/statistics${query ? `?${query}` : ''}`;
  }

  function pageHref(page: number) {
    const query = [
      page > 1 ? `page=${encodeURIComponent(String(page))}` : '',
      returnToQuery(),
      hasSearch
        ? `${STATS_SEARCH_PARAMS.field}=${encodeURIComponent(data.search.field)}`
        : '',
      hasSearch
        ? `${STATS_SEARCH_PARAMS.query}=${encodeURIComponent(data.search.query)}`
        : '',
    ].filter(Boolean);

    const suffix = query.join('&');
    return resolve(
      `/${data.link.code}/statistics${suffix ? `?${suffix}` : ''}`,
    );
  }

  function resolvePath(path: string) {
    return resolve(path as '/');
  }

  function deltaText() {
    const delta = data.link.insights.last24h - data.link.insights.previous24h;
    if (delta === 0) return text.stats.noChange;
    return `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
  }

  function healthText() {
    const code = data.link.health.statusCode
      ? ` ${data.link.health.statusCode}`
      : '';
    if (data.link.health.status === 'ok')
      return `${text.common.healthy}${code}`;
    if (data.link.health.status === 'warning')
      return `${text.common.warning}${code}`;
    if (data.link.health.status === 'broken')
      return `${text.common.broken}${code}`;
    return text.common.notChecked;
  }

  function healthDetail() {
    if (data.link.health.status === 'unchecked')
      return text.stats.checkedBefore;
    const checkedAt = data.link.health.checkedAt
      ? new Date(data.link.health.checkedAt).toLocaleString()
      : '';
    const latency = data.link.health.latencyMs
      ? `${data.link.health.latencyMs}ms`
      : '';
    return [data.link.health.error, latency, checkedAt]
      .filter(Boolean)
      .join(' · ');
  }

  function creatorDetail() {
    const creator = data.link.creator;
    if (!creator) return '';
    const details = [
      creator.account
        ? `#${creator.account.id}${creator.account.email ? ` · ${creator.account.email}` : ''}`
        : '',
      creator.account
        ? creator.account.enabled
          ? text.stats.activeAccount
          : text.stats.inactiveAccount
        : '',
      creator.ipAddress ? `IP ${creator.ipAddress}` : '',
    ];
    return details.filter(Boolean).join(' · ');
  }
</script>

<svelte:head>
  <title
    >{formatText(text.stats.title, { code: data.link.code })} · {data.siteName}</title
  >
</svelte:head>

<SiteThemeStyles />

<main
  class="site-theme"
  data-theme-mode={data.theme.mode}
  data-theme-preset={data.theme.preset}
  style={siteThemeStyle(data.theme)}
>
  <header>
    <div>
      <a class="back-button" href={resolvePath(data.returnTo)}
        >← {text.common.back}</a
      >
      <h1>{formatText(text.stats.title, { code: data.link.code })}</h1>
      <p>{data.link.url}</p>
    </div>
    <LocaleSelect locale={data.locale} compact />
  </header>

  <section class="summary">
    <div class="summary-primary">
      <article>
        <span>{text.stats.totalClicks}</span>
        <strong>{data.link.clicks.toLocaleString()}</strong>
      </article>
      <article>
        <span>{text.stats.createdAt}</span>
        <strong>{new Date(data.link.created_at).toLocaleDateString()}</strong>
      </article>
      <article>
        <span>{text.stats.lastClick}</span>
        <strong>
          {data.link.last_clicked_at
            ? new Date(data.link.last_clicked_at).toLocaleString()
            : text.common.none}
        </strong>
      </article>
    </div>
    <div class="summary-secondary">
      <article>
        <span>{text.stats.status}</span>
        <strong>{healthText()}</strong>
        <small>{healthDetail()}</small>
      </article>
      {#if data.link.creator}
        <article>
          <span>{text.stats.creator}</span>
          <strong>{data.link.creator.name}</strong>
          {#if creatorDetail()}<small>{creatorDetail()}</small>{/if}
        </article>
      {/if}
    </div>
  </section>

  <section class="insights">
    <div class="insight-head">
      <div>
        <h2>{text.stats.insights}</h2>
        <p>
          {formatText(text.stats.sampleBasis, {
            count: data.link.insights.sampleSize.toLocaleString(),
          })}
        </p>
      </div>
      <LinkQr
        value={data.link.short_url}
        code={data.link.code}
        brandName={data.siteName}
        accentColor={data.theme.customTokens.primary}
        locale={data.locale}
      />
    </div>
    <div class="insight-grid">
      <article>
        <span>{text.stats.last24h}</span>
        <strong>{data.link.insights.last24h.toLocaleString()}</strong>
        <small>
          {formatText(text.stats.compared24h, { delta: deltaText() })}
        </small>
      </article>
      <article>
        <span>{text.stats.topReferrers}</span>
        {#if data.link.insights.topReferrers.length}
          <ol>
            {#each data.link.insights.topReferrers as item (item.label)}
              <li><span>{item.label}</span><strong>{item.count}</strong></li>
            {/each}
          </ol>
        {:else}
          <small>{text.common.noData}</small>
        {/if}
      </article>
      <article>
        <span>{text.stats.browsers}</span>
        {#if data.link.insights.topBrowsers.length}
          <ol>
            {#each data.link.insights.topBrowsers as item (item.label)}
              <li><span>{item.label}</span><strong>{item.count}</strong></li>
            {/each}
          </ol>
        {:else}
          <small>{text.common.noData}</small>
        {/if}
      </article>
      <article>
        <span>{text.stats.countries}</span>
        {#if data.link.insights.topCountries.length}
          <ol>
            {#each data.link.insights.topCountries as item (item.label)}
              <li><span>{item.label}</span><strong>{item.count}</strong></li>
            {/each}
          </ol>
        {:else}
          <small>{text.common.noData}</small>
        {/if}
      </article>
    </div>
    {#if data.link.insights.alerts.length > 0}
      <div class="alerts">
        {#each data.link.insights.alerts as alert (`${alert.label}:${alert.message}`)}
          <p><strong>{alert.label}</strong> {alert.message}</p>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <div class="section-heading">
      <div>
        <h2>{hasSearch ? text.stats.searchResults : text.stats.allClicks}</h2>
        <p>
          {formatText(text.home.showingCount, {
            total: data.link.pagination.totalItems,
            shown: data.link.click_events.length,
            pageSize: data.link.pagination.pageSize,
          })}
        </p>
      </div>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href={data.link.short_url} target="_blank" rel="noreferrer"
        >{text.stats.openShortLink}</a
      >
    </div>

    <SearchForm
      baseHref={statsBaseHref()}
      field={data.search.field}
      query={data.search.query}
      options={data.searchOptions}
      fieldName={STATS_SEARCH_PARAMS.field}
      queryName={STATS_SEARCH_PARAMS.query}
      label={text.stats.clickSearch}
      placeholder={text.stats.query}
      submitLabel={text.common.search}
      clearLabel={text.common.all}
      locale={data.locale}
    />

    {#if data.link.click_events.length === 0}
      <p class="empty">
        {hasSearch ? text.stats.noSearchResults : text.stats.emptyClicks}
      </p>
    {:else}
      <div class="events">
        {#each data.link.click_events as click, index (`${click.created_at}-${index}`)}
          <article>
            <div class="event-topline">
              <strong>{new Date(click.created_at).toLocaleString()}</strong>
              <span>IP: {click.ip ?? text.common.none}</span>
            </div>
            <span class="event-referrer"
              >{click.referer ?? text.stats.direct}</span
            >
            {#if click.details.length > 0}
              <dl class="event-details">
                {#each click.details as detail (`${detail.label}:${detail.value}`)}
                  <div>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
            <p>{click.user_agent ?? text.stats.noUserAgent}</p>
          </article>
        {/each}
      </div>
      <Pagination
        page={data.link.pagination.page}
        totalPages={data.link.pagination.totalPages}
        getHref={pageHref}
        label={text.stats.pageLabel}
        locale={data.locale}
      />
    {/if}
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
    --pagination-border: var(--page-border);
    --pagination-surface: var(--page-surface);
    --pagination-muted: var(--page-muted);
    --pagination-text: var(--page-text);
    --pagination-primary: var(--page-primary);
    --pagination-radius: 10px;
    --search-border: var(--page-border);
    --search-input-bg: var(--page-bg);
    --search-muted: var(--page-muted);
    --search-primary: var(--page-primary);
    --search-primary-contrast: var(--page-primary-contrast);
    --search-radius: 12px;
    --search-surface: color-mix(
      in srgb,
      var(--page-bg) 62%,
      var(--page-surface)
    );
    --search-text: var(--page-text);
    display: grid;
    width: min(940px, calc(100% - 36px));
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
  a {
    color: var(--page-primary);
    font-weight: 850;
    text-decoration: none;
  }
  .back-button {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--page-primary);
    font-size: 0.82rem;
    font-family: inherit;
    font-weight: 850;
    cursor: pointer;
  }
  h1 {
    margin: 12px 0 8px;
    font-size: 2.2rem;
  }
  h2,
  p {
    margin: 0;
  }
  header p,
  .section-heading p,
  .events span,
  .events p,
  .empty {
    color: var(--page-muted);
    line-height: 1.6;
  }
  .section-heading a {
    height: fit-content;
    border: 1px solid var(--page-border);
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 0.82rem;
  }
  .summary {
    display: grid;
    gap: 14px;
  }
  .summary-primary,
  .summary-secondary {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 14px;
  }
  .summary article {
    display: grid;
    gap: 7px;
    border: 1px solid var(--page-border);
    border-radius: 14px;
    padding: 16px;
  }
  .summary span {
    color: var(--page-muted);
    font-size: 0.78rem;
    font-weight: 850;
  }
  .summary small {
    overflow: hidden;
    color: var(--page-muted);
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .summary strong {
    font-size: 1.45rem;
  }
  .insights {
    display: grid;
    gap: 18px;
  }
  .insight-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 18px;
  }
  .insight-head p,
  .insight-grid small,
  .alerts p {
    color: var(--page-muted);
    line-height: 1.6;
  }
  .insight-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .insight-grid article {
    display: grid;
    gap: 8px;
    border: 1px solid var(--page-border);
    border-radius: 14px;
    padding: 14px;
    background: color-mix(in srgb, var(--page-bg) 54%, var(--page-surface));
  }
  .insight-grid article > span {
    color: var(--page-muted);
    font-size: 0.74rem;
    font-weight: 900;
  }
  .insight-grid article > strong {
    font-size: 1.4rem;
  }
  .insight-grid ol {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .insight-grid li {
    display: flex;
    min-width: 0;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.78rem;
  }
  .insight-grid li span {
    min-width: 0;
    overflow: hidden;
    color: var(--page-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .alerts {
    display: grid;
    gap: 8px;
  }
  .alerts p {
    margin: 0;
    border: 1px solid color-mix(in srgb, #a13b2b 34%, var(--page-border));
    border-radius: 10px;
    padding: 10px 12px;
    background: #fff0ed;
    color: #a13b2b;
  }
  .section-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 16px;
  }
  .events {
    display: grid;
  }
  .events article {
    display: grid;
    gap: 7px;
    border-top: 1px solid var(--page-border);
    padding: 15px 0;
  }
  .events article:first-child {
    border-top: 0;
  }
  .event-topline {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
  }
  .event-topline strong {
    min-width: 0;
    line-height: 1.3;
  }
  .event-topline span {
    flex: none;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
  }
  .event-referrer {
    overflow-wrap: anywhere;
    font-size: 0.84rem;
  }
  .events p {
    overflow-wrap: anywhere;
    font-size: 0.82rem;
  }
  .event-details {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 2px 0 1px;
  }
  .event-details div {
    display: inline-flex;
    max-width: 100%;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--page-border);
    border-radius: 999px;
    padding: 5px 9px 5px 10px;
    background: color-mix(in srgb, var(--page-primary) 7%, var(--page-surface));
    box-shadow: inset 0 1px 0
      color-mix(in srgb, var(--page-primary-contrast) 35%, transparent);
  }
  .event-details dt {
    flex: none;
    color: color-mix(in srgb, var(--page-primary) 82%, var(--page-text));
    font-size: 0.68rem;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }
  .event-details dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--page-text);
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.25;
  }
  @media (max-width: 720px) {
    header,
    .section-heading,
    .insight-head {
      flex-direction: column;
    }
    .summary-primary,
    .summary-secondary,
    .insight-grid {
      grid-auto-flow: row;
      grid-template-columns: 1fr;
    }
    .event-topline {
      align-items: start;
      flex-direction: column;
      gap: 4px;
    }
    .event-topline span {
      white-space: normal;
    }
  }
</style>
