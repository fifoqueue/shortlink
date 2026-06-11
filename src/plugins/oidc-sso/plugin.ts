import type { PluginDefinition } from '$lib/plugin-contracts';
import { normalizeOidcConfig } from './config';

const plugin: PluginDefinition = {
  meta: {
    id: 'oidc-sso',
    name: 'OAuth2 / OIDC SSO',
    description: 'Provides user login through external identity providers.',
    version: '1.0.0',
    category: 'core',
    required: true,
    order: 20,
  },
  translations: {
    ko: {
      meta: {
        name: 'OAuth2 / OIDC SSO',
        description:
          '외부 Identity Provider를 통한 사용자 로그인을 제공합니다.',
        category: 'core',
      },
      strings: {
        'admin.loginPolicy': '로그인 정책',
        'admin.allowPasswordLogin': '비밀번호 로그인 허용',
        'admin.passwordLoginPolicyHint':
          '비밀번호 로그인을 끄려면 SSO 프로바이더가 하나 이상 필요합니다. 꺼진 동안에는 마지막 프로바이더를 삭제할 수 없습니다.',
        'admin.savePolicy': '정책 저장',
        'admin.ssoProviders': 'SSO 프로바이더',
        'admin.id': 'ID',
        'admin.displayName': '표시 이름',
        'admin.loginButtonColor': '로그인 버튼 색상',
        'admin.loginButtonColorPlaceholder': '#111827',
        'admin.defaultButtonColorHint':
          '비워두면 사이트 기본 버튼 색상을 사용합니다.',
        'admin.loginButtonTextColor': '로그인 버튼 텍스트 색상',
        'admin.loginButtonTextColorPlaceholder': '#ffffff',
        'admin.autoButtonTextColorHint':
          '비워두면 버튼 색상에 맞춰 자동으로 정합니다.',
        'admin.loginIconUrl': '로그인 아이콘 URL',
        'admin.or': '또는',
        'admin.loginIconPlaceholder':
          '/icons/sso.svg 또는 https://example.com/icon.svg',
        'admin.issuerUrl': 'Issuer URL',
        'admin.clientId': 'Client ID',
        'admin.clientSecret': 'Client Secret',
        'admin.clientSecretChangeOnly':
          'Secret 방식에서 변경할 때만 입력',
        'admin.authMethod': '인증 방식',
        'admin.authMethodClientSecretBasic': 'client_secret_basic',
        'admin.authMethodClientSecretPost': 'client_secret_post',
        'admin.authMethodNone': 'none',
        'admin.noneRemovesSecretHint':
          'none으로 저장하면 기존 Client Secret은 삭제됩니다.',
        'admin.scopes': 'Scopes',
        'admin.allowedEmailDomains': '허용 이메일 도메인',
        'admin.validateAndSave': '검증 후 저장',
        'admin.delete': '삭제',
        'admin.deleteProviderTitle': '{name} 프로바이더를 삭제할까요?',
        'admin.deleteProviderMessage':
          '이 프로바이더 설정이 삭제되며, 사용자는 다시 추가하기 전까지 이 경로로 로그인할 수 없습니다.',
        'admin.deleteProviderConfirm': '프로바이더 삭제',
        'admin.addProvider': '새 프로바이더 추가',
        'admin.providerIdPlaceholder': 'zitadel',
        'admin.providerNamePlaceholder': 'Company SSO',
        'admin.noneSecretPlaceholder': 'none 방식에서는 비워두세요',
        'admin.nonePublicClientHint':
          'none 방식은 PKCE public client용이며 secret을 저장하지 않습니다.',
        'admin.validateIssuerAndAdd': 'Issuer 검증 후 추가',
        'admin.callbackUrls': 'Callback URLs',
        'admin.loginCallback': '로그인',
        'admin.accountLinkCallback': '계정 연결',
        'auth.clientSecretRequired': 'OIDC Client Secret이 필요합니다.',
        'auth.issuerAndClientIdRequired':
          'OIDC Issuer URL과 Client ID를 설정해야 합니다.',
        'auth.errorWithDescription': '{error} - {description}',
        'auth.authorizationResponseError':
          'OIDC authorization 응답 오류: {detail}',
        'auth.serverError': 'OIDC 서버 오류 ({status}): {detail}',
        'auth.authorizationRejected':
          'OIDC authorization server가 요청을 거부했습니다.',
        'auth.authorizationRejectedWithMessage':
          'OIDC authorization server가 요청을 거부했습니다. {message}',
        'auth.requestFailed': 'OIDC 요청을 처리하지 못했습니다.',
        'auth.providerNotFound': 'SSO 프로바이더를 찾을 수 없습니다.',
        'auth.loginRequestExpired':
          '로그인 요청이 만료되었습니다. 다시 시도해주세요.',
        'auth.providerRemoved': 'SSO 프로바이더가 삭제되었습니다.',
        'auth.userInfoFailed':
          'OIDC UserInfo 요청을 처리하지 못했습니다: {message}',
        'auth.subjectMissing': 'SSO 사용자 식별자를 확인할 수 없습니다.',
        'auth.emailDomainNotAllowed': '허용되지 않은 이메일 도메인입니다.',
        'auth.notLoginRequest':
          '로그인 요청이 아닙니다. 다시 시도해주세요.',
        'auth.userDisabled': '비활성화된 사용자입니다.',
        'auth.notAccountLinkRequest':
          '계정 연결 요청이 아닙니다. 다시 시도해주세요.',
        'auth.passwordLogin': '비밀번호로 로그인',
        'auth.providerLogin': '{name} 로그인',
        'server.hexColorFormat': '{label}은 #RRGGBB 형식이어야 합니다.',
        'server.loginButtonColorLabel': '로그인 버튼 색상',
        'server.loginButtonTextColorLabel': '로그인 버튼 텍스트 색상',
        'server.loginIconUrlInvalid':
          '로그인 아이콘 URL은 /로 시작하는 경로 또는 http(s) URL이어야 합니다.',
        'server.providerIdRequired': '프로바이더 ID가 필요합니다.',
        'server.providerNameRequired': '프로바이더 표시 이름이 필요합니다.',
        'server.issuerUrlRequired': 'Issuer URL이 필요합니다.',
        'server.clientIdRequired': 'Client ID가 필요합니다.',
        'server.passwordLoginRequiresProvider':
          '비밀번호 로그인을 끄려면 SSO 프로바이더가 하나 이상 필요합니다.',
        'server.loginPolicySaved': '로그인 정책을 저장했습니다.',
        'server.providerIdDuplicate': '이미 사용 중인 프로바이더 ID입니다.',
        'server.providerSaved': 'SSO 프로바이더를 저장했습니다.',
        'server.providerAdded': 'SSO 프로바이더를 추가했습니다.',
        'server.lastProviderDeleteDenied':
          '비밀번호 로그인이 비활성화된 상태에서는 마지막 프로바이더를 삭제할 수 없습니다.',
        'server.providerDeleted': 'SSO 프로바이더를 삭제했습니다.',
        'server.unsupportedPluginAction':
          '지원하지 않는 OIDC 플러그인 작업입니다: {action}',
        'server.connectionNotFound': 'OIDC 연결을 찾을 수 없습니다.',
        'server.connectionUnlinked': 'OIDC 연결을 해제했습니다.',
        'server.unsupportedUserAction':
          '지원하지 않는 OIDC 사용자 작업입니다.',
        'server.unsupportedAccountAction':
          '지원하지 않는 OIDC 계정 작업입니다.',
      },
    },
    en: {
      meta: {
        name: 'OAuth2 / OIDC SSO',
        description: 'Provides user login through external identity providers.',
        category: 'core',
      },
      strings: {
        'admin.loginPolicy': 'Login policy',
        'admin.allowPasswordLogin': 'Allow password login',
        'admin.passwordLoginPolicyHint':
          'At least one SSO provider is required to disable password login. The last provider cannot be deleted while password login is disabled.',
        'admin.savePolicy': 'Save policy',
        'admin.ssoProviders': 'SSO providers',
        'admin.id': 'ID',
        'admin.displayName': 'Display name',
        'admin.loginButtonColor': 'Login button color',
        'admin.loginButtonColorPlaceholder': '#111827',
        'admin.defaultButtonColorHint':
          'Leave blank to use the site default button color.',
        'admin.loginButtonTextColor': 'Login button text color',
        'admin.loginButtonTextColorPlaceholder': '#ffffff',
        'admin.autoButtonTextColorHint':
          'Leave blank to choose automatically based on the button color.',
        'admin.loginIconUrl': 'Login icon URL',
        'admin.or': 'or',
        'admin.loginIconPlaceholder':
          '/icons/sso.svg or https://example.com/icon.svg',
        'admin.issuerUrl': 'Issuer URL',
        'admin.clientId': 'Client ID',
        'admin.clientSecret': 'Client Secret',
        'admin.clientSecretChangeOnly':
          'Enter only when changing secret auth',
        'admin.authMethod': 'Authentication method',
        'admin.authMethodClientSecretBasic': 'client_secret_basic',
        'admin.authMethodClientSecretPost': 'client_secret_post',
        'admin.authMethodNone': 'none',
        'admin.noneRemovesSecretHint':
          'Saving as none removes the current Client Secret.',
        'admin.scopes': 'Scopes',
        'admin.allowedEmailDomains': 'Allowed email domains',
        'admin.validateAndSave': 'Validate and save',
        'admin.delete': 'Delete',
        'admin.deleteProviderTitle': 'Delete {name} provider?',
        'admin.deleteProviderMessage':
          'This provider configuration will be deleted. Users cannot log in through it until it is added again.',
        'admin.deleteProviderConfirm': 'Delete provider',
        'admin.addProvider': 'Add new provider',
        'admin.providerIdPlaceholder': 'zitadel',
        'admin.providerNamePlaceholder': 'Company SSO',
        'admin.noneSecretPlaceholder': 'Leave blank for the none method',
        'admin.nonePublicClientHint':
          'The none method is for PKCE public clients and does not store a secret.',
        'admin.validateIssuerAndAdd': 'Validate issuer and add',
        'admin.callbackUrls': 'Callback URLs',
        'admin.loginCallback': 'Login',
        'admin.accountLinkCallback': 'Account link',
        'auth.clientSecretRequired': 'OIDC client secret is required.',
        'auth.issuerAndClientIdRequired':
          'OIDC issuer URL and client ID must be configured.',
        'auth.errorWithDescription': '{error} - {description}',
        'auth.authorizationResponseError':
          'OIDC authorization response error: {detail}',
        'auth.serverError': 'OIDC server error ({status}): {detail}',
        'auth.authorizationRejected':
          'The OIDC authorization server rejected the request.',
        'auth.authorizationRejectedWithMessage':
          'The OIDC authorization server rejected the request. {message}',
        'auth.requestFailed': 'OIDC request failed.',
        'auth.providerNotFound': 'SSO provider not found.',
        'auth.loginRequestExpired': 'The login request expired. Try again.',
        'auth.providerRemoved': 'The SSO provider was removed.',
        'auth.userInfoFailed':
          'Could not process the OIDC UserInfo request: {message}',
        'auth.subjectMissing': 'Could not resolve the SSO user identifier.',
        'auth.emailDomainNotAllowed': 'Email domain is not allowed.',
        'auth.notLoginRequest': 'This is not a login request. Try again.',
        'auth.userDisabled': 'User is disabled.',
        'auth.notAccountLinkRequest':
          'This is not an account linking request. Try again.',
        'auth.passwordLogin': 'Log in with password',
        'auth.providerLogin': 'Log in with {name}',
        'server.hexColorFormat': '{label} must use #RRGGBB format.',
        'server.loginButtonColorLabel': 'login button color',
        'server.loginButtonTextColorLabel': 'login button text color',
        'server.loginIconUrlInvalid':
          'Login icon URL must be a path starting with / or an http(s) URL.',
        'server.providerIdRequired': 'Provider ID is required.',
        'server.providerNameRequired': 'Provider display name is required.',
        'server.issuerUrlRequired': 'Issuer URL is required.',
        'server.clientIdRequired': 'Client ID is required.',
        'server.passwordLoginRequiresProvider':
          'At least one SSO provider is required to disable password login.',
        'server.loginPolicySaved': 'Login policy saved.',
        'server.providerIdDuplicate': 'Provider ID is already in use.',
        'server.providerSaved': 'SSO provider saved.',
        'server.providerAdded': 'SSO provider added.',
        'server.lastProviderDeleteDenied':
          'The last provider cannot be deleted while password login is disabled.',
        'server.providerDeleted': 'SSO provider deleted.',
        'server.unsupportedPluginAction':
          'Unsupported OIDC plugin action: {action}',
        'server.connectionNotFound': 'OIDC connection not found.',
        'server.connectionUnlinked': 'OIDC connection unlinked.',
        'server.unsupportedUserAction': 'Unsupported OIDC user action.',
        'server.unsupportedAccountAction': 'Unsupported OIDC account action.',
      },
    },
  },
  defaultConfig: {
    passwordLoginEnabled: true,
    providers: [],
  },
  parseConfig(form, current) {
    return normalizeOidcConfig(current);
  },
  prepareAdminConfig(config) {
    const normalized = normalizeOidcConfig(config);
    return {
      ...normalized,
      providers: normalized.providers.map((provider) => ({
        ...provider,
        clientSecret: '',
      })),
    };
  },
  publicConfig(config) {
    const normalized = normalizeOidcConfig(config);
    return {
      passwordLoginEnabled: normalized.passwordLoginEnabled,
      providers: normalized.providers.map(({ id, name }) => ({ id, name })),
    };
  },
};

export default plugin;
