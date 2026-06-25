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
        'admin.flow': '흐름',
        'admin.flowOidc': 'OIDC discovery',
        'admin.flowOauth': 'Generic OAuth2 authorization code',
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
        'admin.oauthMetadataSource': 'OAuth metadata source',
        'admin.oauthMetadataManual': '수동 endpoint',
        'admin.oauthMetadataUrlSource': 'Metadata URL',
        'admin.oauthMetadataProfileLink': 'Profile link discovery',
        'admin.oauthMetadataUrl': 'OAuth metadata URL',
        'admin.oauthMetadataUrlPlaceholder':
          'https://example.com/.well-known/oauth-authorization-server',
        'admin.authorizationEndpoint': 'Authorization endpoint',
        'admin.tokenEndpoint': 'Token endpoint',
        'admin.tokenEndpointHint':
          'Scopes가 비어 있으면 IndieAuth 로그인 전용 흐름으로 authorization endpoint에 code exchange를 보냅니다.',
        'admin.userInfoEndpoint': 'UserInfo endpoint',
        'admin.metadataLinkRel': 'Metadata link rel',
        'admin.metadataLinkRelPlaceholder': 'metadata-rel',
        'admin.authorizationEndpointRel': 'Authorization endpoint link rel',
        'admin.tokenEndpointRel': 'Token endpoint link rel',
        'admin.clientId': 'Client ID',
        'admin.clientIdHint': 'OAuth/OIDC client_id입니다.',
        'admin.clientSecret': 'Client Secret',
        'admin.clientSecretChangeOnly': 'Secret 방식에서 변경할 때만 입력',
        'admin.authMethod': '인증 방식',
        'admin.authMethodClientSecretBasic': 'client_secret_basic',
        'admin.authMethodClientSecretPost': 'client_secret_post',
        'admin.authMethodNone': 'none',
        'admin.noneRemovesSecretHint':
          'none으로 저장하면 기존 Client Secret은 삭제됩니다.',
        'admin.scopes': 'Scopes',
        'admin.scopesHint':
          'Generic OAuth2/IndieAuth에서 access token이 필요 없으면 비워두세요.',
        'admin.allowedEmailDomains': '허용 이메일 도메인',
        'admin.authorizationHintParameter': 'Authorization hint parameter',
        'admin.authorizationHintParameterPlaceholder': 'me',
        'admin.authorizationRequestQuery': '추가 authorization 쿼리스트링',
        'admin.authorizationRequestQueryHelp':
          '브라우저를 authorization endpoint로 보낼 때 추가할 query parameter입니다. key=value 형식으로 줄마다 하나씩 입력하거나 &로 구분하세요.',
        'admin.tokenRequestBody': '추가 token 요청 body',
        'admin.tokenRequestBodyHelp':
          'Generic OAuth2 token exchange POST body에 추가할 form parameter입니다. key=value 형식으로 줄마다 하나씩 입력하거나 &로 구분하세요.',
        'admin.extraRequestQuery': '추가 요청 쿼리스트링',
        'admin.extraRequestQueryHelp':
          '서버가 discovery, token, UserInfo 요청을 보낼 때 URL에 추가할 query parameter입니다. key=value 형식으로 줄마다 하나씩 입력하거나 &로 구분하세요.',
        'admin.extraRequestHeaders': '추가 요청 헤더',
        'admin.extraRequestHeadersHelp':
          '서버가 discovery, token, UserInfo 요청을 보낼 때 추가할 HTTP 헤더입니다. Header | Value 형식으로 줄마다 하나씩 입력하세요.',
        'admin.loginInputName': '로그인 입력 필드 이름',
        'admin.loginInputNamePlaceholder': 'me',
        'admin.loginInputLabel': '로그인 입력 라벨',
        'admin.loginInputPlaceholder': '로그인 입력 placeholder',
        'admin.loginInputDefault': '로그인 입력 기본값',
        'admin.loginInputHelp': '로그인 입력 도움말',
        'admin.loginInputRequired': '로그인 입력 필수',
        'admin.loginInputUrlCanonicalization': '입력값을 http(s) URL로 정규화',
        'admin.subjectPath': 'Subject JSON path',
        'admin.emailPath': 'Email JSON path',
        'admin.emailVerifiedPath': 'Email verified JSON path',
        'admin.namePath': 'Name JSON path',
        'admin.emailTrustMode': '이메일 신뢰 정책',
        'admin.emailTrustModeHelp':
          '새 외부 로그인 계정을 만들거나 기존 이메일 계정에 연결할 때 이메일 소유권을 어떻게 신뢰할지 정합니다.',
        'admin.emailTrustVerifiedClaim':
          'email_verified claim이 true일 때만 신뢰',
        'admin.emailTrustLocalVerification':
          '사이트 이메일 인증을 완료한 뒤 허용',
        'admin.emailTrustExistingOnly': '이미 연결된 계정만 허용',
        'admin.emailTrustDisabled': '항상 신뢰',
        'admin.emailTrustDisabledTitle':
          '이메일 검증 없이 외부 이메일을 신뢰할까요?',
        'admin.emailTrustDisabledMessage':
          '이 설정은 프로바이더가 반환한 이메일 주소를 검증 없이 신뢰합니다. 해당 프로바이더가 이메일 소유권을 확실히 보장하는 경우에만 사용하세요.',
        'admin.emailTrustDisabledConfirm': '검증 없이 저장',
        'admin.emailTrustDisabledConsent':
          '이 프로바이더의 이메일 주소를 사이트가 항상 신뢰한다는 점을 이해했습니다.',
        'admin.subjectVerification': 'Subject 검증',
        'admin.subjectVerificationNone': '검증 안 함',
        'admin.subjectVerificationAuthorizationEndpoint':
          'Subject URL이 같은 authorization endpoint를 선언해야 함',
        'admin.validateAndSave': '검증 후 저장',
        'admin.delete': '삭제',
        'admin.deleteProviderTitle': '{name} 프로바이더를 삭제할까요?',
        'admin.deleteProviderMessage':
          '이 프로바이더 설정과 로그인 버튼이 삭제됩니다. 기존 SSO 연결 기록은 남지만, 같은 ID로 프로바이더를 다시 추가하기 전까지 이 프로바이더로 로그인하거나 재인증할 수 없습니다.',
        'admin.deleteProviderConnectionImpact':
          '현재 활성 사용자 {count}명이 이 프로바이더에 연결되어 있습니다.',
        'admin.deleteProviderSoleLoginImpact':
          '그중 {count}명은 이 프로바이더가 유일하게 확인된 로그인 수단입니다. 삭제하면 해당 사용자는 로그인할 수 없습니다.',
        'admin.deleteProviderNoSoleLoginImpact':
          '현재 이 프로바이더만 유일한 로그인 수단으로 가진 활성 사용자는 없습니다.',
        'admin.deleteProviderIdentityRetention':
          '사용자 연결 데이터는 삭제되지 않으므로, 같은 ID로 프로바이더를 다시 추가하면 기존 연결을 다시 사용할 수 있습니다.',
        'admin.deleteProviderSoleLoginConsent':
          '일부 사용자가 로그인할 수 없게 될 수 있음을 이해했습니다.',
        'admin.deleteProviderConfirm': '프로바이더 삭제',
        'admin.addProvider': '새 프로바이더 추가',
        'admin.providerIdPlaceholder': 'zitadel',
        'admin.providerNamePlaceholder': 'Company SSO',
        'admin.noneSecretPlaceholder': 'none 방식에서는 비워두세요',
        'admin.nonePublicClientHint':
          'none 방식은 PKCE public client용이며 secret을 저장하지 않습니다.',
        'admin.validateIssuerAndAdd': '검증 후 추가',
        'admin.callbackUrls': 'Callback URLs',
        'admin.loginCallback': '통합 Callback',
        'admin.oidcConnections': 'SSO 연결',
        'admin.forceUnlink': '강제 해제',
        'admin.forceUnlinkTitle': 'OIDC 연결을 강제로 해제할까요?',
        'admin.forceUnlinkMessage':
          '이 사용자는 다시 연결하기 전까지 해당 OIDC 계정으로 로그인할 수 없습니다.',
        'admin.emptyOidcConnections': '연결된 OIDC 계정이 없습니다.',
        'account.oidcConnections': 'SSO 연결',
        'account.connected': '연결됨',
        'account.disconnected': '연결되지 않음',
        'account.unlink': '연결 해제',
        'account.unlinkTitle': '{provider} 연결을 해제할까요?',
        'account.unlinkMessage':
          '이 SSO 연결을 제거하면 다시 연결하기 전까지 해당 프로바이더로 계정에 접근할 수 없습니다.',
        'account.connect': '연결',
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
        'auth.providerNotAllowed': '이 SSO 프로바이더를 사용할 수 없습니다.',
        'auth.loginRequestExpired':
          '로그인 요청이 만료되었습니다. 다시 시도해주세요.',
        'auth.providerRemoved': 'SSO 프로바이더가 삭제되었습니다.',
        'auth.userInfoFailed':
          'OIDC UserInfo 요청을 처리하지 못했습니다: {message}',
        'auth.subjectMissing': 'SSO 사용자 식별자를 확인할 수 없습니다.',
        'auth.emailDomainNotAllowed': '허용되지 않은 이메일 도메인입니다.',
        'auth.manualEmailTitle': '이메일 입력',
        'auth.manualEmailDescription':
          '{provider}에서 이메일 주소를 제공하지 않았습니다. 계속하려면 이메일 주소를 입력하세요.',
        'auth.manualEmailSubmit': '계속',
        'auth.manualEmailRequired': '올바른 이메일 주소가 필요합니다.',
        'auth.manualEmailVerificationRequired':
          '입력한 이메일 주소로 인증 메일을 보냅니다. 인증을 완료해야 로그인할 수 있습니다.',
        'auth.manualEmailExistingAccount':
          '입력한 이메일은 이미 기존 계정에서 사용 중입니다. 먼저 기존 계정으로 로그인한 뒤 계정 연결에서 추가해주세요.',
        'auth.emailVerificationClaimRequired':
          '프로바이더가 이메일 인증 여부를 확인해주지 않았습니다.',
        'auth.existingAccountRequired':
          '이 프로바이더는 이미 연결된 계정으로만 로그인할 수 있습니다. 먼저 기존 계정으로 로그인한 뒤 계정 연결에서 추가해주세요.',
        'auth.notLoginRequest': '로그인 요청이 아닙니다. 다시 시도해주세요.',
        'auth.userDisabled': '비활성화된 사용자입니다.',
        'auth.notAccountLinkRequest':
          '계정 연결 요청이 아닙니다. 다시 시도해주세요.',
        'auth.notSecurityUnlockRequest':
          '보안 잠금 해제 요청이 아닙니다. 다시 시도해주세요.',
        'auth.connectedAccountRequired':
          '현재 계정에 연결된 SSO 계정으로 인증해야 합니다.',
        'auth.securityUnlockAccountMismatch':
          '인증된 SSO 계정이 현재 연결된 계정과 다릅니다.',
        'auth.passwordLogin': '비밀번호로 로그인',
        'auth.providerLogin': '{nameWithJosa} 로그인',
        'auth.providerReauthentication': '{nameWithJosa} 인증',
        'auth.identifierDefaultLabel': '{name}',
        'auth.loginInputRequired': '로그인 입력값이 필요합니다.',
        'auth.loginInputUrlInvalid':
          '로그인 입력값은 올바른 http(s) URL이어야 합니다.',
        'auth.oauthMetadataInvalid': 'OAuth metadata 응답이 올바르지 않습니다.',
        'auth.oauthDiscoveryFailed': 'OAuth metadata discovery에 실패했습니다.',
        'auth.oauthAuthorizationEndpointMissing':
          'OAuth authorization endpoint를 찾을 수 없습니다.',
        'auth.oauthCodeMissing':
          'OAuth callback에 authorization code가 없습니다.',
        'auth.stateMismatch': 'state 값이 일치하지 않습니다.',
        'auth.oauthFlowMissing': 'OAuth 로그인 상태가 올바르지 않습니다.',
        'auth.oauthTokenResponseInvalid':
          'OAuth token 응답이 올바르지 않습니다.',
        'auth.subjectVerificationFailed':
          '반환된 subject가 같은 authorization endpoint를 선언하지 않습니다.',
        'server.hexColorFormat': '{label}은 #RRGGBB 형식이어야 합니다.',
        'server.loginButtonColorLabel': '로그인 버튼 색상',
        'server.loginButtonTextColorLabel': '로그인 버튼 텍스트 색상',
        'server.loginIconUrlInvalid':
          '로그인 아이콘 URL은 /로 시작하는 경로 또는 http(s) URL이어야 합니다.',
        'server.providerIdRequired': '프로바이더 ID가 필요합니다.',
        'server.providerNameRequired': '프로바이더 표시 이름이 필요합니다.',
        'server.issuerUrlRequired': 'Issuer URL이 필요합니다.',
        'server.issuerUrlInvalid': 'Issuer URL은 http(s) URL이어야 합니다.',
        'server.clientIdRequired': 'Client ID가 필요합니다.',
        'server.oauthMetadataUrlInvalid':
          'OAuth metadata URL은 http(s) URL이어야 합니다.',
        'server.oauthMetadataUrlRequired': 'OAuth metadata URL이 필요합니다.',
        'server.authorizationEndpointInvalid':
          'Authorization endpoint는 http(s) URL이어야 합니다.',
        'server.authorizationEndpointRequired':
          'Authorization endpoint가 필요합니다.',
        'server.tokenEndpointInvalid':
          'Token endpoint는 http(s) URL이어야 합니다.',
        'server.userInfoEndpointInvalid':
          'UserInfo endpoint는 http(s) URL이어야 합니다.',
        'server.loginInputRequiredForProfileLink':
          'Profile link discovery에는 로그인 입력 필드 이름 또는 기본값이 필요합니다.',
        'server.subjectPathRequired': 'Subject JSON path가 필요합니다.',
        'server.subjectPathInvalid':
          'Subject JSON path가 올바르지 않습니다. dot/bracket 표기만 사용할 수 있으며 prototype, constructor, __proto__는 사용할 수 없습니다.',
        'server.emailPathInvalid':
          'Email JSON path가 올바르지 않습니다. dot/bracket 표기만 사용할 수 있으며 prototype, constructor, __proto__는 사용할 수 없습니다.',
        'server.emailVerifiedPathInvalid':
          'Email verified JSON path가 올바르지 않습니다. dot/bracket 표기만 사용할 수 있으며 prototype, constructor, __proto__는 사용할 수 없습니다.',
        'server.namePathInvalid':
          'Name JSON path가 올바르지 않습니다. dot/bracket 표기만 사용할 수 있으며 prototype, constructor, __proto__는 사용할 수 없습니다.',
        'server.authorizationRequestQueryInvalid':
          '추가 authorization 쿼리스트링 {line}번째 항목이 올바르지 않습니다.',
        'server.authorizationRequestQueryKeyRequired':
          '추가 authorization 쿼리스트링 {line}번째 항목의 key가 비어 있습니다.',
        'server.tokenRequestBodyInvalid':
          '추가 token 요청 body {line}번째 항목이 올바르지 않습니다.',
        'server.tokenRequestBodyKeyRequired':
          '추가 token 요청 body {line}번째 항목의 key가 비어 있습니다.',
        'server.extraRequestQueryInvalid':
          '추가 요청 쿼리스트링 {line}번째 항목이 올바르지 않습니다.',
        'server.extraRequestQueryKeyRequired':
          '추가 요청 쿼리스트링 {line}번째 항목의 key가 비어 있습니다.',
        'server.extraRequestHeadersDescription': 'OIDC 추가 요청 헤더',
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
        'server.unsupportedUserAction': '지원하지 않는 OIDC 사용자 작업입니다.',
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
        'admin.flow': 'Flow',
        'admin.flowOidc': 'OIDC discovery',
        'admin.flowOauth': 'Generic OAuth2 authorization code',
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
        'admin.oauthMetadataSource': 'OAuth metadata source',
        'admin.oauthMetadataManual': 'Manual endpoints',
        'admin.oauthMetadataUrlSource': 'Metadata URL',
        'admin.oauthMetadataProfileLink': 'Profile link discovery',
        'admin.oauthMetadataUrl': 'OAuth metadata URL',
        'admin.oauthMetadataUrlPlaceholder':
          'https://example.com/.well-known/oauth-authorization-server',
        'admin.authorizationEndpoint': 'Authorization endpoint',
        'admin.tokenEndpoint': 'Token endpoint',
        'admin.tokenEndpointHint':
          'When scopes are empty, code exchange is sent to the authorization endpoint for IndieAuth login-only flows.',
        'admin.userInfoEndpoint': 'UserInfo endpoint',
        'admin.metadataLinkRel': 'Metadata link rel',
        'admin.metadataLinkRelPlaceholder': 'metadata-rel',
        'admin.authorizationEndpointRel': 'Authorization endpoint link rel',
        'admin.tokenEndpointRel': 'Token endpoint link rel',
        'admin.clientId': 'Client ID',
        'admin.clientIdHint': 'OAuth/OIDC client_id.',
        'admin.clientSecret': 'Client Secret',
        'admin.clientSecretChangeOnly': 'Enter only when changing secret auth',
        'admin.authMethod': 'Authentication method',
        'admin.authMethodClientSecretBasic': 'client_secret_basic',
        'admin.authMethodClientSecretPost': 'client_secret_post',
        'admin.authMethodNone': 'none',
        'admin.noneRemovesSecretHint':
          'Saving as none removes the current Client Secret.',
        'admin.scopes': 'Scopes',
        'admin.scopesHint':
          'Leave empty for Generic OAuth2/IndieAuth login-only flows that do not need an access token.',
        'admin.allowedEmailDomains': 'Allowed email domains',
        'admin.authorizationHintParameter': 'Authorization hint parameter',
        'admin.authorizationHintParameterPlaceholder': 'me',
        'admin.authorizationRequestQuery': 'Extra authorization query string',
        'admin.authorizationRequestQueryHelp':
          'Query parameters appended when redirecting the browser to the authorization endpoint. Enter one key=value per line or separate items with &.',
        'admin.tokenRequestBody': 'Extra token request body',
        'admin.tokenRequestBodyHelp':
          'Form parameters added to the Generic OAuth2 token exchange POST body. Enter one key=value per line or separate items with &.',
        'admin.extraRequestQuery': 'Extra request query string',
        'admin.extraRequestQueryHelp':
          'Query parameters appended when the server sends discovery, token, and UserInfo requests. Enter one key=value per line or separate items with &.',
        'admin.extraRequestHeaders': 'Extra request headers',
        'admin.extraRequestHeadersHelp':
          'HTTP headers added when the server sends discovery, token, and UserInfo requests. Enter one Header | Value pair per line.',
        'admin.loginInputName': 'Login input field name',
        'admin.loginInputNamePlaceholder': 'me',
        'admin.loginInputLabel': 'Login input label',
        'admin.loginInputPlaceholder': 'Login input placeholder',
        'admin.loginInputDefault': 'Login input default value',
        'admin.loginInputHelp': 'Login input help',
        'admin.loginInputRequired': 'Require login input',
        'admin.loginInputUrlCanonicalization':
          'Canonicalize input as an http(s) URL',
        'admin.subjectPath': 'Subject JSON path',
        'admin.emailPath': 'Email JSON path',
        'admin.emailVerifiedPath': 'Email verified JSON path',
        'admin.namePath': 'Name JSON path',
        'admin.emailTrustMode': 'Email trust policy',
        'admin.emailTrustModeHelp':
          'Controls how email ownership is trusted when creating a new external-login account or attaching to an existing email account.',
        'admin.emailTrustVerifiedClaim':
          'Trust only when the email_verified claim is true',
        'admin.emailTrustLocalVerification':
          'Require this site to verify the email first',
        'admin.emailTrustExistingOnly': 'Allow only already linked accounts',
        'admin.emailTrustDisabled': 'Always trust',
        'admin.emailTrustDisabledTitle':
          'Trust external emails without verification?',
        'admin.emailTrustDisabledMessage':
          'This setting trusts the email address returned by the provider without checking an email verification claim. Use it only when the provider reliably guarantees email ownership.',
        'admin.emailTrustDisabledConfirm': 'Save without verification',
        'admin.emailTrustDisabledConsent':
          'I understand that this site will always trust email addresses from this provider.',
        'admin.subjectVerification': 'Subject verification',
        'admin.subjectVerificationNone': 'No verification',
        'admin.subjectVerificationAuthorizationEndpoint':
          'Subject URL must declare the same authorization endpoint',
        'admin.validateAndSave': 'Validate and save',
        'admin.delete': 'Delete',
        'admin.deleteProviderTitle': 'Delete {name} provider?',
        'admin.deleteProviderMessage':
          'This provider configuration and login button will be deleted. Existing SSO links are retained, but users cannot log in or reauthenticate through this provider until a provider with the same ID is added again.',
        'admin.deleteProviderConnectionImpact':
          '{count} active users are currently linked to this provider.',
        'admin.deleteProviderSoleLoginImpact':
          'For {count} of them, this provider is the only confirmed login method. Deleting it will prevent those users from signing in.',
        'admin.deleteProviderNoSoleLoginImpact':
          'No active users currently have only this provider as their login method.',
        'admin.deleteProviderIdentityRetention':
          'User link records are not deleted, so adding this provider again with the same ID restores those links.',
        'admin.deleteProviderSoleLoginConsent':
          'I understand that some users may lose sign-in access.',
        'admin.deleteProviderConfirm': 'Delete provider',
        'admin.addProvider': 'Add new provider',
        'admin.providerIdPlaceholder': 'zitadel',
        'admin.providerNamePlaceholder': 'Company SSO',
        'admin.noneSecretPlaceholder': 'Leave blank for the none method',
        'admin.nonePublicClientHint':
          'The none method is for PKCE public clients and does not store a secret.',
        'admin.validateIssuerAndAdd': 'Validate and add',
        'admin.callbackUrls': 'Callback URLs',
        'admin.loginCallback': 'Unified callback',
        'admin.oidcConnections': 'SSO connections',
        'admin.forceUnlink': 'Force unlink',
        'admin.forceUnlinkTitle': 'Force unlink OIDC connection?',
        'admin.forceUnlinkMessage':
          'This user cannot log in with that OIDC account until it is linked again.',
        'admin.emptyOidcConnections': 'No OIDC accounts are linked.',
        'account.oidcConnections': 'SSO connections',
        'account.connected': 'Connected',
        'account.disconnected': 'Disconnected',
        'account.unlink': 'Unlink',
        'account.unlinkTitle': 'Unlink {provider}?',
        'account.unlinkMessage':
          'Removing this SSO connection prevents account access through that provider until it is linked again.',
        'account.connect': 'Connect',
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
        'auth.providerNotAllowed': 'This SSO provider cannot be used.',
        'auth.loginRequestExpired': 'The login request expired. Try again.',
        'auth.providerRemoved': 'The SSO provider was removed.',
        'auth.userInfoFailed':
          'Could not process the OIDC UserInfo request: {message}',
        'auth.subjectMissing': 'Could not resolve the SSO user identifier.',
        'auth.emailDomainNotAllowed': 'Email domain is not allowed.',
        'auth.manualEmailTitle': 'Enter Email',
        'auth.manualEmailDescription':
          '{provider} did not provide an email address. Enter one to continue.',
        'auth.manualEmailSubmit': 'Continue',
        'auth.manualEmailRequired': 'A valid email address is required.',
        'auth.manualEmailVerificationRequired':
          'A verification email will be sent to this address. You must verify it before signing in.',
        'auth.manualEmailExistingAccount':
          'The entered email address is already used by an existing account. Log in with that account first, then connect this provider from account settings.',
        'auth.emailVerificationClaimRequired':
          'The provider did not confirm that the email address is verified.',
        'auth.existingAccountRequired':
          'This provider can be used only by already linked accounts. Log in with an existing account first, then connect it from account settings.',
        'auth.notLoginRequest': 'This is not a login request. Try again.',
        'auth.userDisabled': 'User is disabled.',
        'auth.notAccountLinkRequest':
          'This is not an account linking request. Try again.',
        'auth.notSecurityUnlockRequest':
          'This is not a security unlock request. Try again.',
        'auth.connectedAccountRequired':
          'Authenticate with an SSO account linked to the current account.',
        'auth.securityUnlockAccountMismatch':
          'The authenticated SSO account does not match the linked account.',
        'auth.passwordLogin': 'Log in with password',
        'auth.providerLogin': 'Log in with {name}',
        'auth.providerReauthentication': 'Authenticate with {name}',
        'auth.identifierDefaultLabel': '{name}',
        'auth.loginInputRequired': 'Login input is required.',
        'auth.loginInputUrlInvalid': 'Login input must be a valid http(s) URL.',
        'auth.oauthMetadataInvalid': 'OAuth metadata response is invalid.',
        'auth.oauthDiscoveryFailed': 'OAuth metadata discovery failed.',
        'auth.oauthAuthorizationEndpointMissing':
          'OAuth authorization endpoint could not be found.',
        'auth.oauthCodeMissing':
          'The OAuth callback does not include an authorization code.',
        'auth.stateMismatch': 'The state value does not match.',
        'auth.oauthFlowMissing': 'OAuth login state is invalid.',
        'auth.oauthTokenResponseInvalid': 'OAuth token response is invalid.',
        'auth.subjectVerificationFailed':
          'The returned subject does not declare the same authorization endpoint.',
        'server.hexColorFormat': '{label} must use #RRGGBB format.',
        'server.loginButtonColorLabel': 'login button color',
        'server.loginButtonTextColorLabel': 'login button text color',
        'server.loginIconUrlInvalid':
          'Login icon URL must be a path starting with / or an http(s) URL.',
        'server.providerIdRequired': 'Provider ID is required.',
        'server.providerNameRequired': 'Provider display name is required.',
        'server.issuerUrlRequired': 'Issuer URL is required.',
        'server.issuerUrlInvalid': 'Issuer URL must be an http(s) URL.',
        'server.clientIdRequired': 'Client ID is required.',
        'server.oauthMetadataUrlInvalid':
          'OAuth metadata URL must be an http(s) URL.',
        'server.oauthMetadataUrlRequired': 'OAuth metadata URL is required.',
        'server.authorizationEndpointInvalid':
          'Authorization endpoint must be an http(s) URL.',
        'server.authorizationEndpointRequired':
          'Authorization endpoint is required.',
        'server.tokenEndpointInvalid': 'Token endpoint must be an http(s) URL.',
        'server.userInfoEndpointInvalid':
          'UserInfo endpoint must be an http(s) URL.',
        'server.loginInputRequiredForProfileLink':
          'Profile link discovery requires a login input field name or default value.',
        'server.subjectPathRequired': 'Subject JSON path is required.',
        'server.subjectPathInvalid':
          'Subject JSON path is invalid. Use dot/bracket notation only. prototype, constructor, and __proto__ are blocked.',
        'server.emailPathInvalid':
          'Email JSON path is invalid. Use dot/bracket notation only. prototype, constructor, and __proto__ are blocked.',
        'server.emailVerifiedPathInvalid':
          'Email verified JSON path is invalid. Use dot/bracket notation only. prototype, constructor, and __proto__ are blocked.',
        'server.namePathInvalid':
          'Name JSON path is invalid. Use dot/bracket notation only. prototype, constructor, and __proto__ are blocked.',
        'server.authorizationRequestQueryInvalid':
          'Extra authorization query item on line {line} is invalid.',
        'server.authorizationRequestQueryKeyRequired':
          'Extra authorization query item on line {line} has an empty key.',
        'server.tokenRequestBodyInvalid':
          'Extra token request body item on line {line} is invalid.',
        'server.tokenRequestBodyKeyRequired':
          'Extra token request body item on line {line} has an empty key.',
        'server.extraRequestQueryInvalid':
          'Extra request query item on line {line} is invalid.',
        'server.extraRequestQueryKeyRequired':
          'Extra request query item on line {line} has an empty key.',
        'server.extraRequestHeadersDescription': 'OIDC extra request headers',
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
};

export default plugin;
