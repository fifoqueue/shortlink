import type { SiteLocale } from '$lib/config';

import en from './ui-text.en';
import ko from './ui-text.ko';

export type UiText = typeof ko;
export type UiMessageKey = keyof UiText['messages'];

const serverMessagePrefix = 'i18n:';

export function uiText(
  locale: SiteLocale,
  fallbackLocale: SiteLocale = locale,
): UiText {
  const dictionaries: Record<string, UiText> = { ko, en };
  const fallback =
    dictionaries[fallbackLocale] ?? Object.values(dictionaries)[0];
  if (!fallback) throw new Error('At least one UI dictionary is required.');
  return dictionaries[locale] ?? fallback;
}

export function formatText(
  template: string,
  values: Record<string, string | number | null | undefined> = {},
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? ''),
  );
}

export function serverMessage(
  key: UiMessageKey,
  values: Record<string, string | number | null | undefined> = {},
) {
  const payload =
    Object.keys(values).length > 0
      ? `:${encodeURIComponent(JSON.stringify(values))}`
      : '';
  return `${serverMessagePrefix}${key}${payload}`;
}

function parseServerMessage(message: string) {
  if (!message.startsWith(serverMessagePrefix)) return null;
  const body = message.slice(serverMessagePrefix.length);
  const separator = body.indexOf(':');
  const key = (
    separator === -1 ? body : body.slice(0, separator)
  ) as UiMessageKey;
  if (!(key in ko.messages)) return null;
  if (separator === -1) return { key, values: {} };
  try {
    const parsed = JSON.parse(decodeURIComponent(body.slice(separator + 1)));
    const values =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, string | number | null | undefined>)
        : {};
    return { key, values };
  } catch {
    return { key, values: {} };
  }
}

export function localizeServerMessage(
  locale: SiteLocale,
  message: string,
  fallbackLocale: SiteLocale = locale,
) {
  const text = uiText(locale, fallbackLocale);
  const keyed = parseServerMessage(message);
  if (keyed) return formatText(text.messages[keyed.key], keyed.values);
  if (message in text.messages) {
    return text.messages[message as UiMessageKey];
  }
  return message;
}
