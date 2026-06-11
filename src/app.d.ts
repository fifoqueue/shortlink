import type { AuthenticatedUser } from '$lib/plugin-contracts';
import type { SiteLocale, SiteSettings } from './lib/config';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      isAdmin: boolean;
      locale: SiteLocale;
      localizedSettings: SiteSettings;
      settings: SiteSettings;
      user: AuthenticatedUser | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
