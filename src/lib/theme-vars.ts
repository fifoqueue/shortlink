import type { SiteSettings } from '$lib/config';

type ThemeLike = Pick<SiteSettings['theme'], 'customTokens'>;

export function siteThemeStyle(theme: ThemeLike) {
  const tokens = theme.customTokens;
  return [
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
