import { serverMessage } from '$lib/i18n/ui-text';

export interface DelimitedColumn<T extends Record<string, unknown>> {
  key: keyof T & string;
  label: string;
  validate?: (value: string) => boolean;
  transform?: (value: string) => unknown;
}

export function isHttpHeaderName(value: string) {
  return /^[A-Za-z0-9-]+$/.test(value);
}

export function parseDelimitedLines<T extends Record<string, unknown>>(
  value: string,
  columns: DelimitedColumn<T>[],
  options: {
    description: string;
    maxRows?: number;
  },
) {
  const rows: T[] = [];
  const lines = value.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split('|').map((part) => part.trim());
    if (parts.length !== columns.length) {
      throw new Error(
        serverMessage('delimitedLineFormat', {
          description: options.description,
          line: index + 1,
          columns: columns.map((column) => column.label).join(' | '),
        }),
      );
    }

    const row: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      const part = parts[columnIndex] ?? '';
      if (!part) {
        throw new Error(
          serverMessage('delimitedEmptyValue', {
            description: options.description,
            line: index + 1,
            column: column.label,
          }),
        );
      }
      if (column.validate && !column.validate(part)) {
        throw new Error(
          serverMessage('delimitedInvalidValue', {
            description: options.description,
            line: index + 1,
            column: column.label,
          }),
        );
      }
      row[column.key] = column.transform ? column.transform(part) : part;
    });
    rows.push(row as T);
  });

  return rows.slice(0, options.maxRows ?? 250);
}

export interface HeaderPair extends Record<string, unknown> {
  header: string;
  value: string;
}

export function parseHeaderPairs(value: string, description = 'HTTP headers') {
  return parseDelimitedLines<HeaderPair>(
    value,
    [
      {
        key: 'header',
        label: 'Header',
        validate: isHttpHeaderName,
      },
      {
        key: 'value',
        label: 'Value',
      },
    ],
    { description },
  );
}

export function parseHeaderRecord(value: string, description = 'HTTP headers') {
  const headers: Record<string, string> = {};
  for (const pair of parseHeaderPairs(value, description)) {
    headers[pair.header] = pair.value;
  }
  return headers;
}

export function parseSingleHeaderLine(
  value: string,
  description = 'HTTP headers',
) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    throw new Error(serverMessage('singleHeaderLineFormat', { description }));
  }

  if (lines.length === 0) return '';
  const [pair] = parseHeaderPairs(lines[0], description);
  return `${pair.header} | ${pair.value}`;
}
