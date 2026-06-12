import type { PluginDefinition } from '$lib/plugin-contracts';
import { geoipConfigured } from '$lib/config';
import { pluginChecked, pluginString } from '../utils';
import {
  defaultEnhancedTrackingConfig,
  normalizeEnhancedTrackingConfig,
  parseProxyHeaderMappings,
} from './config';

const plugin: PluginDefinition = {
  meta: {
    id: 'enhanced-tracking',
    name: 'Enhanced Tracking',
    description:
      'Extends click tracking with GeoIP2 and reverse proxy header metadata.',
    version: '1.0.0',
    category: 'tracking',
    order: 70,
  },
  translations: {
    ko: {
      meta: {
        name: 'Enhanced Tracking',
        description:
          'GeoIP2와 리버스 프록시 헤더 기반 클릭 추적 정보를 확장합니다.',
        category: 'tracking',
      },
      strings: {
        'admin.coreGeoipRequired':
          '국가, 도시, ASN 수집은 관리자 사이트 설정의 GeoIP2가 먼저 활성화되어야 합니다.',
        'admin.collectReverseProxyHeaders': '리버스 프록시 헤더 수집',
        'admin.trackingHeaders': '추적 헤더',
        'admin.trackingHeadersHint':
          '한 줄에 표시 이름 | 헤더 이름 | 표시 범위. 1은 관리자만, 2는 링크 생성자도 표시',
        'admin.country': '국가',
        'admin.city': '도시',
        'admin.asn': 'ASN',
        'admin.collect': '수집',
        'admin.showToCreators': '링크 생성자에게도 표시',
      },
    },
    en: {
      meta: {
        name: 'Enhanced Tracking',
        description:
          'Extends click tracking data using GeoIP2 and reverse proxy headers.',
        category: 'tracking',
      },
      strings: {
        'admin.coreGeoipRequired':
          'Country, city, and ASN collection requires GeoIP2 to be enabled in site settings first.',
        'admin.collectReverseProxyHeaders': 'Collect reverse proxy headers',
        'admin.trackingHeaders': 'Tracking headers',
        'admin.trackingHeadersHint':
          'One display name | header name | visibility per line. 1 is admin-only, 2 is also visible to the link creator.',
        'admin.country': 'Country',
        'admin.city': 'City',
        'admin.asn': 'ASN',
        'admin.collect': 'Collect',
        'admin.showToCreators': 'Also show to link creators',
      },
    },
  },
  defaultConfig: defaultEnhancedTrackingConfig,
  parseConfig(form, _current, input) {
    const geoipAvailable = input?.settings
      ? geoipConfigured(input.settings)
      : false;
    return normalizeEnhancedTrackingConfig(
      {
        proxyHeadersEnabled: pluginChecked(
          form,
          'enhanced-tracking',
          'proxyHeadersEnabled',
        ),
        proxyHeaders: pluginString(form, 'enhanced-tracking', 'proxyHeaders'),
        collectCountry: pluginChecked(
          form,
          'enhanced-tracking',
          'collectCountry',
        ),
        exposeCountryToUsers: pluginChecked(
          form,
          'enhanced-tracking',
          'exposeCountryToUsers',
        ),
        collectCity: pluginChecked(form, 'enhanced-tracking', 'collectCity'),
        exposeCityToUsers: pluginChecked(
          form,
          'enhanced-tracking',
          'exposeCityToUsers',
        ),
        collectAsn: pluginChecked(form, 'enhanced-tracking', 'collectAsn'),
        exposeAsnToUsers: pluginChecked(
          form,
          'enhanced-tracking',
          'exposeAsnToUsers',
        ),
      },
      { geoipAvailable },
    );
  },
  validateConfig(config) {
    const normalized = normalizeEnhancedTrackingConfig(config);
    if (normalized.proxyHeadersEnabled) {
      parseProxyHeaderMappings(normalized.proxyHeaders);
    }
  },
};

export default plugin;
