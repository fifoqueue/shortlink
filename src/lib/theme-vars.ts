import type { SiteSettings, ThemeColors, ThemeTokens } from '$lib/config';

type ThemeLike = Pick<SiteSettings['theme'], 'customTokens' | 'darkTokens'>;

// Preserve the previous dark appearance when upgrading settings without a dark palette.
export function defaultDarkThemeTokens(tokens: ThemeTokens): ThemeColors {
  const primary = /^#[\da-f]{6}$/i.test(tokens.primary)
    ? tokens.primary
    : '#171717';
  const lighterPrimary =
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(primary.slice(offset, offset + 2), 16) * 0.45 + 255 * 0.55,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return {
    background: '#141414',
    surface: '#1e1e1e',
    text: '#f5f5f5',
    muted: '#adadad',
    primary: lighterPrimary,
    primaryContrast: '#141414',
    border: '#363636',
  };
}

export function darkThemeTokens(theme: ThemeLike): ThemeColors {
  const fallback = defaultDarkThemeTokens(theme.customTokens);
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => {
      const configured = theme.darkTokens?.[key as keyof ThemeColors];
      return [
        key,
        typeof configured === 'string' && /^#[\da-f]{6}$/i.test(configured)
          ? configured
          : value,
      ];
    }),
  ) as ThemeColors;
}

function darkColorVariables(prefix: string, theme: ThemeLike) {
  const tokens = darkThemeTokens(theme);
  return [
    `--${prefix}-dark-bg:${tokens.background}`,
    `--${prefix}-dark-surface:${tokens.surface}`,
    `--${prefix}-dark-text:${tokens.text}`,
    `--${prefix}-dark-muted:${tokens.muted}`,
    `--${prefix}-dark-primary:${tokens.primary}`,
    `--${prefix}-dark-primary-contrast:${tokens.primaryContrast}`,
    `--${prefix}-dark-border:${tokens.border}`,
  ];
}

export function siteThemeStyle(theme: ThemeLike) {
  const tokens = theme.customTokens;
  return [
    ...darkColorVariables('theme', theme),
    `--theme-bg:${tokens.background}`,
    `--theme-surface:${tokens.surface}`,
    `--theme-text:${tokens.text}`,
    `--theme-muted:${tokens.muted}`,
    `--theme-primary:${tokens.primary}`,
    `--theme-primary-contrast:${tokens.primaryContrast}`,
    `--theme-border:${tokens.border}`,
    `--page-bg:${tokens.background}`,
    `--page-surface:${tokens.surface}`,
    `--page-text:${tokens.text}`,
    `--page-muted:${tokens.muted}`,
    `--page-primary:${tokens.primary}`,
    `--page-primary-contrast:${tokens.primaryContrast}`,
    `--page-border:${tokens.border}`,
    `--page-radius:${tokens.radius}px`,
    `--surface:${tokens.surface}`,
    `--text:${tokens.text}`,
    `--muted:${tokens.muted}`,
    `--primary:${tokens.primary}`,
    `--primary-contrast:${tokens.primaryContrast}`,
    `--border:${tokens.border}`,
    `--radius:${tokens.radius}px`,
    `--font:${tokens.fontFamily}`,
  ].join(';');
}

export function adminThemeStyle(theme: ThemeLike) {
  const tokens = theme.customTokens;
  return [
    ...darkColorVariables('admin', theme),
    `--admin-bg:${tokens.background}`,
    `--admin-surface:${tokens.surface}`,
    `--admin-text:${tokens.text}`,
    `--admin-muted:${tokens.muted}`,
    `--admin-primary:${tokens.primary}`,
    `--admin-primary-contrast:${tokens.primaryContrast}`,
    `--admin-border:${tokens.border}`,
    `--admin-danger:#c84432`,
    `--admin-danger-contrast:#fffaf8`,
    `--admin-danger-text:#9b3829`,
    `--admin-source-bg:${tokens.background}`,
    `--admin-source-surface:${tokens.surface}`,
    `--admin-source-text:${tokens.text}`,
    `--admin-source-muted:${tokens.muted}`,
    `--admin-source-primary:${tokens.primary}`,
    `--admin-source-primary-contrast:${tokens.primaryContrast}`,
    `--admin-source-border:${tokens.border}`,
    `--admin-radius:${tokens.radius}px`,
    `--font:${tokens.fontFamily}`,
  ].join(';');
}
