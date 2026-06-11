import type { SiteLocale } from '$lib/config';
import { uiText } from '$lib/i18n/ui-text';

export type AdminSection = {
  id: string;
  slug: string;
  label: string;
};

export const adminSections: AdminSection[] = [
  { id: 'general', slug: 'core', label: 'Site' },
  { id: 'links', slug: 'link-and-api', label: 'Links and API' },
  { id: 'theme', slug: 'theme', label: 'Theme' },
  { id: 'plugins', slug: 'plugins', label: 'Plugins' },
  { id: 'data', slug: 'links', label: 'Link management' },
];

export function localizedAdminSections(locale: SiteLocale): AdminSection[] {
  const labels = uiText(locale).admin.sections;
  return adminSections.map((section) => ({
    ...section,
    label: labels[section.id as keyof typeof labels] ?? section.label,
  }));
}
