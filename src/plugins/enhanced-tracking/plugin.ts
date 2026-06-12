import type { PluginDefinition } from '$lib/plugin-contracts';
import { pluginChecked, pluginString } from '../utils';
import {
  defaultEnhancedTrackingConfig,
  normalizeEnhancedTrackingConfig,
  parseProxyHeaderMappings,
  validateGeoipHeaderConfig,
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
        'admin.useProxyGeoipHeaders': '프록시 GeoIP 헤더 사용',
        'admin.proxyGeoipHeadersHint':
          '이 옵션이 켜져 있으면 MaxMind DB 조회가 켜져 있어도 GeoIP 헤더 값을 우선합니다.',
        'admin.countryCodeHeader': 'Country Code 헤더',
        'admin.countryNameHeader': 'Country Name 헤더',
        'admin.cityHeader': 'City 헤더',
        'admin.asnNumberHeader': 'ASN Number 헤더',
        'admin.asnOrganizationHeader': 'ASN Organization 헤더',
        'admin.queryMaxmindDirectly': 'MaxMind GeoIP2 데이터베이스 직접 조회',
        'admin.cityDatabasePath': 'City 데이터베이스 경로',
        'admin.cityDatabasePathPlaceholder': '/var/lib/GeoIP/GeoIP2-City.mmdb',
        'admin.countryDatabasePath': 'Country 데이터베이스 경로',
        'admin.countryDatabaseHint': 'City DB가 없을 때 사용',
        'admin.countryDatabasePathPlaceholder':
          '/var/lib/GeoIP/GeoIP2-Country.mmdb',
        'admin.asnDatabasePath': 'ASN 데이터베이스 경로',
        'admin.asnDatabasePathPlaceholder': '/var/lib/GeoIP/GeoLite2-ASN.mmdb',
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
        'admin.useProxyGeoipHeaders': 'Use proxy GeoIP headers',
        'admin.proxyGeoipHeadersHint':
          'When enabled, GeoIP header values take priority even if MaxMind DB lookup is enabled.',
        'admin.countryCodeHeader': 'Country Code header',
        'admin.countryNameHeader': 'Country Name header',
        'admin.cityHeader': 'City header',
        'admin.asnNumberHeader': 'ASN Number header',
        'admin.asnOrganizationHeader': 'ASN Organization header',
        'admin.queryMaxmindDirectly': 'Query MaxMind GeoIP2 databases directly',
        'admin.cityDatabasePath': 'City database path',
        'admin.cityDatabasePathPlaceholder': '/var/lib/GeoIP/GeoIP2-City.mmdb',
        'admin.countryDatabasePath': 'Country database path',
        'admin.countryDatabaseHint': 'Used when no City DB is available',
        'admin.countryDatabasePathPlaceholder':
          '/var/lib/GeoIP/GeoIP2-Country.mmdb',
        'admin.asnDatabasePath': 'ASN database path',
        'admin.asnDatabasePathPlaceholder': '/var/lib/GeoIP/GeoLite2-ASN.mmdb',
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
  parseConfig(form) {
    return normalizeEnhancedTrackingConfig({
      geoipEnabled: pluginChecked(form, 'enhanced-tracking', 'geoipEnabled'),
      geoipHeadersEnabled: pluginChecked(
        form,
        'enhanced-tracking',
        'geoipHeadersEnabled',
      ),
      cityDatabasePath: pluginString(
        form,
        'enhanced-tracking',
        'cityDatabasePath',
      ),
      countryDatabasePath: pluginString(
        form,
        'enhanced-tracking',
        'countryDatabasePath',
      ),
      asnDatabasePath: pluginString(
        form,
        'enhanced-tracking',
        'asnDatabasePath',
      ),
      countryCodeHeader: pluginString(
        form,
        'enhanced-tracking',
        'countryCodeHeader',
      ),
      countryNameHeader: pluginString(
        form,
        'enhanced-tracking',
        'countryNameHeader',
      ),
      cityNameHeader: pluginString(form, 'enhanced-tracking', 'cityNameHeader'),
      asnNumberHeader: pluginString(
        form,
        'enhanced-tracking',
        'asnNumberHeader',
      ),
      asnOrganizationHeader: pluginString(
        form,
        'enhanced-tracking',
        'asnOrganizationHeader',
      ),
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
    });
  },
  validateConfig(config) {
    const normalized = normalizeEnhancedTrackingConfig(config);
    validateGeoipHeaderConfig(normalized);
    if (normalized.proxyHeadersEnabled) {
      parseProxyHeaderMappings(normalized.proxyHeaders);
    }
  },
};

export default plugin;
