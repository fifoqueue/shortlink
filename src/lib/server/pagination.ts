export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedItems<T> extends PaginationMeta {
  items: T[];
}

export function normalizedPage(value: unknown) {
  const page = Number(value ?? 1);
  return Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
}

export function normalizedPageSize(
  value: unknown = DEFAULT_PAGE_SIZE,
  max = MAX_PAGE_SIZE,
) {
  const pageSize = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(max, Math.trunc(pageSize)));
}

export function pageParam(url: URL, name = 'page') {
  return normalizedPage(url.searchParams.get(name));
}

export function paginationMeta(input: {
  totalItems: number;
  page?: number;
  pageSize?: number;
  maxPage?: number;
}): PaginationMeta {
  const pageSize = normalizedPageSize(input.pageSize);
  const totalItems = Math.max(0, Math.trunc(input.totalItems));
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = Math.min(
    input.maxPage ? normalizedPage(input.maxPage) : totalPages,
    normalizedPage(input.page),
  );
  return {
    page: Math.min(totalPages, requestedPage),
    pageSize,
    totalItems,
    totalPages,
  };
}

export function pageOffset(
  pagination: Pick<PaginationMeta, 'page' | 'pageSize'>,
) {
  return (pagination.page - 1) * pagination.pageSize;
}

export function paginateItems<T>(
  items: T[],
  page?: number,
  pageSize = DEFAULT_PAGE_SIZE,
): PaginatedItems<T> {
  const pagination = paginationMeta({
    totalItems: items.length,
    page,
    pageSize,
  });
  return {
    ...pagination,
    items: items.slice(
      pageOffset(pagination),
      pageOffset(pagination) + pagination.pageSize,
    ),
  };
}
