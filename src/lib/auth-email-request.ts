import type { SiteLocale, SiteSettings } from '$lib/config';

export type AuthEmailRequestPageData = {
  locale: SiteLocale;
  defaultLocale: SiteLocale;
  siteName: string;
  theme: SiteSettings['theme'];
  customHead: string;
  available: boolean;
  unavailableReason: string;
};

export type AuthEmailRequestForm = {
  ok?: boolean;
  message?: string;
  values?: { email?: string };
};
