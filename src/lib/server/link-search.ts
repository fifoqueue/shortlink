import {
  isLinkSearchField,
  LINK_SEARCH_PARAMS,
  type LinkSearchState,
} from '$lib/search';

export function parseLinkSearch(url: URL): LinkSearchState {
  const requestedField = url.searchParams.get(LINK_SEARCH_PARAMS.field) ?? '';
  const field = isLinkSearchField(requestedField) ? requestedField : 'code';
  const query = (url.searchParams.get(LINK_SEARCH_PARAMS.query) ?? '')
    .trim()
    .slice(0, 300);

  return { field, query };
}
