import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClientIp } from '$lib/server/client-ip';
import {
  canViewStats,
  getStatsForLink,
  type ClickEventSearch,
} from '$lib/server/shortener';
import { shortUrl } from '$lib/server/url';
import { getSettings } from '$lib/server/settings';
import { getLinkOwner } from '$lib/server/link-owner';
import { effectivePermissions } from '$lib/server/permissions';
import { DEFAULT_PAGE_SIZE, pageParam } from '$lib/server/pagination';
import {
  combineClickMetadataDisplayLists,
  CORE_CLICK_METADATA_KEY,
  formatCoreClickMetadataList,
} from '$lib/server/click-metadata';
import {
  formatClickMetadataListPlugins,
  getClickMetadataSearchFieldsPlugins,
} from '../../../plugins/server';
import {
  STATS_SEARCH_PARAMS,
  type SearchOption,
  type StatsSearchState,
} from '$lib/search';
import { uiText } from '$lib/i18n/ui-text';

type StatsSearchTemplate =
  | { field: 'created_at' | 'ip_address' | 'referer' | 'user_agent' }
  | { field: 'metadata'; paths: string[][] };

type StatsSearchSpec = SearchOption & {
  template: StatsSearchTemplate;
};

function baseSearchSpecs(text: ReturnType<typeof uiText>): StatsSearchSpec[] {
  return [
    {
      value: 'created_at',
      label: text.stats.clickFields.created_at,
      template: { field: 'created_at' },
    },
    {
      value: 'referer',
      label: text.stats.clickFields.referer,
      template: { field: 'referer' },
    },
    {
      value: 'user_agent',
      label: text.stats.clickFields.user_agent,
      template: { field: 'user_agent' },
    },
    {
      value: 'redirect_rule',
      label: text.stats.clickFields.redirect_rule,
      template: {
        field: 'metadata',
        paths: [
          [CORE_CLICK_METADATA_KEY, 'redirect', 'source'],
          [CORE_CLICK_METADATA_KEY, 'redirect', 'ruleNumber'],
          [CORE_CLICK_METADATA_KEY, 'redirect', 'destinationUrl'],
        ],
      },
    },
  ];
}

function cleanReturnTo(value: string | null, url: URL) {
  if (!value) return null;

  try {
    const parsed = new URL(value, url.origin);
    if (parsed.origin !== url.origin) return null;
    if (parsed.pathname === url.pathname) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function parseStatsSearch(
  url: URL,
  specs: StatsSearchSpec[],
): StatsSearchState {
  const requestedField = url.searchParams.get(STATS_SEARCH_PARAMS.field) ?? '';
  const field = specs.some((spec) => spec.value === requestedField)
    ? requestedField
    : (specs[0]?.value ?? '');
  const query = (url.searchParams.get(STATS_SEARCH_PARAMS.query) ?? '')
    .trim()
    .slice(0, 300);

  return { field, query };
}

function clickEventSearch(
  search: StatsSearchState,
  specs: StatsSearchSpec[],
): ClickEventSearch | undefined {
  if (!search.query) return undefined;
  const spec = specs.find((item) => item.value === search.field);
  if (!spec) return undefined;

  if (spec.template.field === 'metadata') {
    return {
      field: 'metadata',
      query: search.query,
      paths: spec.template.paths,
    };
  }

  return {
    field: spec.template.field,
    query: search.query,
  };
}

export const load: PageServerLoad = async ({
  params,
  url,
  locals,
  cookies,
  getClientAddress,
  request,
}) => {
  const settings = locals.settings ?? (await getSettings());
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const code = params.code;
  if (!code) error(404, text.messages.linkNotFound);

  const displaySettings = locals.localizedSettings ?? settings;
  const clientIp = getClientIp(
    request,
    getClientAddress,
    settings.network.trustProxyHeaders,
    settings.network.proxyIpHeaders,
  );
  const permissions = await effectivePermissions({
    settings,
    user: locals.user,
    isAdmin: locals.isAdmin,
    ip: clientIp,
  });
  const owner = getLinkOwner({
    cookies,
    userId: locals.user?.id,
    ip: clientIp,
  });
  const access = await canViewStats({
    code,
    isAdmin: locals.isAdmin,
    allowAnyOwner: permissions.links.statsAll,
    owner,
  });

  if (!access.link) error(404, text.messages.linkNotFound);
  if (!access.allowed) {
    error(403, text.messages.statsViewDenied);
  }

  const pluginSearchFields = await getClickMetadataSearchFieldsPlugins({
    states: settings.plugins,
    isAdmin: locals.isAdmin,
    isOwner: access.isOwner,
  });
  const searchSpecs: StatsSearchSpec[] = [
    ...baseSearchSpecs(text),
    ...(locals.isAdmin
      ? [
          {
            value: 'ip_address',
            label: text.stats.clickFields.ip_address,
            template: { field: 'ip_address' as const },
          },
        ]
      : []),
    ...pluginSearchFields.map((field) => ({
      value: `metadata:${field.pluginId}:${field.id}`,
      label: `${field.pluginName}: ${field.label}`,
      template: {
        field: 'metadata' as const,
        paths: field.paths.map((path) => [field.pluginId, ...path]),
      },
    })),
  ];
  const search = parseStatsSearch(url, searchSpecs);
  const stats = await getStatsForLink(access.link, {
    isAdmin: locals.isAdmin,
    creatorVisibility: locals.isAdmin
      ? 'admin'
      : permissions.links.statsAll
        ? 'name'
        : 'none',
    page: pageParam(url),
    pageSize: DEFAULT_PAGE_SIZE,
    search: clickEventSearch(search, searchSpecs),
  });
  if (!stats) error(404, text.messages.linkNotFound);
  const metadataItems = stats.click_events.map((click) => click.metadata);
  const coreDetails = formatCoreClickMetadataList({
    metadataItems,
    locale: locals.locale,
    fallbackLocale: settings.i18n.defaultLocale,
  });
  const pluginDetails = await formatClickMetadataListPlugins({
    metadataItems,
    states: settings.plugins,
    isAdmin: locals.isAdmin,
    isOwner: access.isOwner,
  });
  const clickDetails = combineClickMetadataDisplayLists(
    coreDetails,
    pluginDetails,
  );
  const clickEvents = stats.click_events.map((click, index) => ({
    created_at: click.created_at,
    ip: click.ip,
    browser: click.browser,
    user_agent: click.user_agent,
    referer: click.referer,
    details: clickDetails[index] ?? [],
  }));

  return {
    link: {
      ...stats,
      click_events: clickEvents,
      short_url: shortUrl(url.origin, stats.code),
    },
    locale: locals.locale,
    returnTo:
      cleanReturnTo(url.searchParams.get('returnTo'), url) ??
      cleanReturnTo(request.headers.get('referer'), url) ??
      '/',
    siteName: displaySettings.general.siteName,
    theme: displaySettings.theme,
    search,
    searchOptions: searchSpecs.map(({ value, label }) => ({ value, label })),
    canDownloadCsv: permissions.links.statsCsv,
  };
};
