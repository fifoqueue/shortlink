export type AuthProviderButtonStyleSource = {
  buttonColor?: string;
  buttonTextColor?: string;
};

export function contrastTextColor(color: string) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!match) return 'var(--page-primary-contrast)';
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const linear = [r, g, b].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance =
    0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.55 ? '#111827' : '#ffffff';
}

export function providerButtonStyle(provider: AuthProviderButtonStyleSource) {
  const values: string[] = [];
  if (provider.buttonColor) {
    values.push(`--provider-bg:${provider.buttonColor}`);
    values.push(`--provider-border:${provider.buttonColor}`);
    values.push(
      `--provider-text:${provider.buttonTextColor || contrastTextColor(provider.buttonColor)}`,
    );
  } else if (provider.buttonTextColor) {
    values.push(`--provider-text:${provider.buttonTextColor}`);
  }
  return values.join(';');
}
