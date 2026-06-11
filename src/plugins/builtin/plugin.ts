import type { PluginDefinition } from '$lib/plugin-contracts';
import {
  fieldName,
  parseDelimitedLines,
  pluginChecked,
  pluginString,
} from '../utils';
import {
  defaultSiteLocale,
  siteLocaleKeys,
  type SiteLocale,
} from '$lib/config';

function localizedMessageConfig(
  form: FormData,
  field: string,
  current: Record<string, unknown>,
  fallback: Record<string, string>,
  fallbackLocale: SiteLocale,
) {
  const existing =
    typeof current[field] === 'object' &&
    current[field] !== null &&
    !Array.isArray(current[field])
      ? (current[field] as Partial<Record<SiteLocale, unknown>>)
      : {};
  return Object.fromEntries(
    siteLocaleKeys.map((locale) => {
      const name = fieldName('builtin', `${field}.${locale}`);
      const fallbackValue =
        typeof existing[locale] === 'string'
          ? String(existing[locale])
          : (fallback[locale] ?? fallback[fallbackLocale] ?? '');
      return [
        locale,
        form.get(name) === null
          ? fallbackValue
          : String(form.get(name) ?? '').slice(0, 500),
      ];
    }),
  ) as Record<SiteLocale, string>;
}

function parseLinks(value: string) {
  return parseDelimitedLines<{ label: string; url: string }>(
    value,
    [
      {
        key: 'label',
        label: 'Name',
        transform: (label) => label.slice(0, 40),
      },
      {
        key: 'url',
        label: 'URL',
        validate: (url) => {
          try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
          } catch {
            return false;
          }
        },
        transform: (url) => new URL(url).toString(),
      },
    ],
    { description: 'Social links', maxRows: 20 },
  );
}

function normalizedSocialLinks(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (link): link is { label: string; url: string } =>
          typeof link === 'object' &&
          link !== null &&
          'label' in link &&
          'url' in link &&
          typeof link.label === 'string' &&
          typeof link.url === 'string',
      )
    : [];
}

const plugin: PluginDefinition = {
  meta: {
    id: 'builtin',
    name: 'Built-in extensions',
    description: 'Provides announcements, social links, and privacy notices.',
    version: '2.0.0',
    category: 'core',
    required: true,
    order: 10,
  },
  translations: {
    ko: {
      meta: {
        name: '기본 확장 기능',
        description: '공지, 소셜 링크와 개인정보 안내를 제공합니다.',
        category: 'core',
      },
      strings: {
        'admin.stringLanguage': '문자열 언어',
        'admin.announcementBanner': '공지 배너',
        'admin.html': 'HTML',
        'admin.socialLinks': '소셜 링크',
        'admin.privacyNotice': '개인정보 안내',
        'admin.links': '링크 목록',
        'admin.linksHelp': '한 줄에 이름 | URL',
        'admin.noticeText': '안내 문구',
        'public.externalLinks': '외부 링크',
      },
    },
    en: {
      meta: {
        name: 'Built-in extensions',
        description:
          'Provides announcements, social links, and privacy notices.',
        category: 'core',
      },
      strings: {
        'admin.stringLanguage': 'String language',
        'admin.announcementBanner': 'Announcement banner',
        'admin.html': 'HTML',
        'admin.socialLinks': 'Social links',
        'admin.privacyNotice': 'Privacy notice',
        'admin.links': 'Links',
        'admin.linksHelp': 'One Name | URL per line',
        'admin.noticeText': 'Notice text',
        'public.externalLinks': 'External links',
      },
    },
  },
  defaultConfig: {
    announcementEnabled: false,
    announcementMessages: {
      ko: '새로운 기능이 출시되었습니다.',
      en: 'New features are now available.',
    },
    socialLinksEnabled: false,
    socialLinks: [],
    privacyNoticeEnabled: false,
    privacyNoticeMessages: {
      ko: '클릭 통계 수집 시 IP 주소는 단방향 해시로 처리됩니다.',
      en: 'IP addresses are hashed one-way when click statistics are collected.',
    },
  },
  parseConfig(form, current, input) {
    const fallbackLocale = input?.defaultLocale ?? defaultSiteLocale;
    const announcementMessages = localizedMessageConfig(
      form,
      'announcementMessages',
      current,
      {
        ko: '새로운 기능이 출시되었습니다.',
        en: 'New features are now available.',
      },
      fallbackLocale,
    );
    const privacyNoticeMessages = localizedMessageConfig(
      form,
      'privacyNoticeMessages',
      current,
      {
        ko: '클릭 통계 수집 시 IP 주소는 단방향 해시로 처리됩니다.',
        en: 'IP addresses are hashed one-way when click statistics are collected.',
      },
      fallbackLocale,
    );
    return {
      announcementEnabled: pluginChecked(
        form,
        'builtin',
        'announcementEnabled',
      ),
      announcementMessages,
      socialLinksEnabled: pluginChecked(form, 'builtin', 'socialLinksEnabled'),
      socialLinks: parseLinks(pluginString(form, 'builtin', 'socialLinks')),
      privacyNoticeEnabled: pluginChecked(
        form,
        'builtin',
        'privacyNoticeEnabled',
      ),
      privacyNoticeMessages,
    };
  },
  publicConfig(config) {
    return {
      announcementEnabled: config.announcementEnabled === true,
      announcementMessages: config.announcementMessages,
      socialLinksEnabled: config.socialLinksEnabled === true,
      socialLinks: normalizedSocialLinks(config.socialLinks),
      privacyNoticeEnabled: config.privacyNoticeEnabled === true,
      privacyNoticeMessages: config.privacyNoticeMessages,
    };
  },
};

export default plugin;
