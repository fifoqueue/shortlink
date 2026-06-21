import type { SiteLocale, SiteSettings } from '$lib/config';
import type { PluginSlot } from '$lib/plugin-contracts';
import type { PublicPluginComponentSlotRender } from '$lib/public-plugin-slots';
import { publicPluginStrings, slotAllowed } from './shared';

function localizedConfigString(
  value: unknown,
  locale: SiteLocale,
  fallbackLocale: SiteLocale,
) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const source = value as Partial<Record<SiteLocale, unknown>>;
    const localized = source[locale];
    if (typeof localized === 'string') return localized;
    const fallback = source[fallbackLocale];
    if (typeof fallback === 'string') return fallback;
  }
  return '';
}

function publicLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (link): link is { label: string; url: string } =>
      typeof link === 'object' &&
      link !== null &&
      'label' in link &&
      'url' in link &&
      typeof link.label === 'string' &&
      typeof link.url === 'string',
  );
}

export function loadBuiltinSlots(input: {
  settings: SiteSettings;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
  slots: ReadonlySet<PluginSlot> | null;
}): PublicPluginComponentSlotRender[] {
  const config = input.settings.plugins.builtin?.config ?? {};
  const componentSlots: PublicPluginComponentSlotRender[] = [];

  if (slotAllowed(input.slots, 'top') && config.announcementEnabled === true) {
    const topHtml = localizedConfigString(
      config.announcementMessages,
      input.locale,
      input.fallbackLocale,
    );
    if (topHtml) {
      componentSlots.push({
        pluginId: 'builtin',
        slot: 'top',
        config: { html: topHtml },
        strings: {},
      });
    }
  }

  if (
    slotAllowed(input.slots, 'form-footer') &&
    config.privacyNoticeEnabled === true
  ) {
    const formFooterText = localizedConfigString(
      config.privacyNoticeMessages,
      input.locale,
      input.fallbackLocale,
    );
    if (formFooterText) {
      componentSlots.push({
        pluginId: 'builtin',
        slot: 'form-footer',
        config: { text: formFooterText },
        strings: {},
      });
    }
  }

  if (
    slotAllowed(input.slots, 'footer') &&
    config.socialLinksEnabled === true
  ) {
    const footerLinks = publicLinks(config.socialLinks);
    if (footerLinks.length > 0) {
      const strings = publicPluginStrings(
        'builtin',
        input.locale,
        input.fallbackLocale,
      );
      componentSlots.push({
        pluginId: 'builtin',
        slot: 'footer',
        config: { links: footerLinks },
        strings,
      });
    }
  }

  return componentSlots;
}
