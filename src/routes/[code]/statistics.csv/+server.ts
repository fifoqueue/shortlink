import { error, type RequestHandler } from '@sveltejs/kit';
import { getClientIp } from '$lib/server/client-ip';
import {
  canViewStats,
  listClickEventsForLink,
  type ClickEvent,
} from '$lib/server/shortener';
import { getSettings } from '$lib/server/settings';
import { getLinkOwner } from '$lib/server/link-owner';
import { effectivePermissions } from '$lib/server/permissions';
import {
  combineClickMetadataDisplayLists,
  formatCoreClickMetadataList,
} from '$lib/server/click-metadata';
import { formatClickMetadataListPlugins } from '../../../plugins/server';
import { uiText } from '$lib/i18n/ui-text';

function csvValue(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRows(rows: unknown[][]) {
  return `${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}\r\n`;
}

function detailsText(details: Array<{ label: string; value: string }>) {
  return details
    .map((detail) => `${detail.label}: ${detail.value}`)
    .join(' | ');
}

function safeFilename(code: string) {
  return `${code.replaceAll(/[^a-zA-Z0-9_-]/g, '_') || 'link'}-statistics.csv`;
}

function clickRow(
  click: ClickEvent,
  details: Array<{ label: string; value: string }>,
) {
  return [
    click.created_at,
    click.ip ?? '',
    click.browser,
    click.referer ?? '',
    click.user_agent ?? '',
    detailsText(details),
  ];
}

export const GET: RequestHandler = async ({
  params,
  request,
  locals,
  cookies,
  getClientAddress,
}) => {
  const settings = locals.settings ?? (await getSettings());
  const text = uiText(locals.locale, settings.i18n.defaultLocale);
  const code = params.code;
  if (!code) error(404, text.messages.linkNotFound);

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
  if (!access.allowed) error(403, text.messages.statsViewDenied);
  if (!permissions.links.statsCsv) error(403, text.messages.statsCsvDenied);

  const clicks = await listClickEventsForLink(access.link, {
    isAdmin: locals.isAdmin,
  });
  const metadataItems = clicks.map((click) => click.metadata);
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

  const csv = csvRows([
    [
      text.stats.clickFields.created_at,
      text.stats.clickFields.ip_address,
      text.stats.browser,
      text.stats.clickFields.referer,
      text.stats.clickFields.user_agent,
      text.stats.metadata,
    ],
    ...clicks.map((click, index) => clickRow(click, clickDetails[index] ?? [])),
  ]);

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${safeFilename(code)}"`,
    },
  });
};
