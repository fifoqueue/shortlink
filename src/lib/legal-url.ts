export function normalizeLegalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const url = URL.parse(value.trim());
  return url &&
    ['http:', 'https:'].includes(url.protocol) &&
    !url.username &&
    !url.password
    ? url.href
    : '';
}
