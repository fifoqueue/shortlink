export type SearchOption = {
  value: string;
  label: string;
};

export type LinkSearchField = 'code' | 'url' | 'tags';

export type LinkSearchState = {
  field: LinkSearchField;
  query: string;
};

export type StatsSearchState = {
  field: string;
  query: string;
};

export type RecipientSearchField = 'all' | 'name' | 'email';

export type RecipientSearchState = {
  field: RecipientSearchField;
  query: string;
};

export const LINK_SEARCH_PARAMS = {
  field: 'searchBy',
  query: 'q',
} as const;

export const STATS_SEARCH_PARAMS = {
  field: 'searchBy',
  query: 'q',
} as const;

export const RECIPIENT_SEARCH_PARAMS = {
  field: 'recipientSearchBy',
  query: 'recipientQ',
  page: 'recipientPage',
} as const;

export const LINK_SEARCH_OPTIONS: SearchOption[] = [
  { value: 'code', label: 'Generated slug' },
  { value: 'url', label: 'Destination URL' },
  { value: 'tags', label: 'Tags' },
];

export function isLinkSearchField(value: string): value is LinkSearchField {
  return value === 'code' || value === 'url' || value === 'tags';
}

export function isRecipientSearchField(
  value: string,
): value is RecipientSearchField {
  return value === 'all' || value === 'name' || value === 'email';
}

function queryPair(name: string, value: string) {
  return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

export function searchPageHref(
  basePath: string,
  search: LinkSearchState,
  page: number,
  pageName = 'page',
) {
  const params: string[] = [];

  if (search.query) {
    params.push(queryPair(LINK_SEARCH_PARAMS.field, search.field));
    params.push(queryPair(LINK_SEARCH_PARAMS.query, search.query));
  }
  if (page > 1) params.push(queryPair(pageName, String(page)));

  return `${basePath}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
