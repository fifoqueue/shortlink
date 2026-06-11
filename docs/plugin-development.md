# Plugin Development Guide

이 문서는 이 저장소에 들어갈 `src/plugins/{pluginId}` 플러그인을 작성하는 개발자를 위한 문서다. 사이트 운영자가 관리자 화면에서 어떤 값을 넣어야 하는지 설명하지 않는다. 플러그인이 코어와 어떤 파일명, 타입, 훅, 폼 규칙, i18n 규칙으로 연결되는지만 다룬다.

현재 플러그인 시스템은 빌드 시점 자동 발견 방식이다. `src/plugins/*`의 직접 하위 디렉터리에 있는 정해진 파일명을 `import.meta.glob`으로 찾는다. 프로덕션에서 파일을 복사해 넣는다고 런타임에 새 플러그인이 로드되지 않는다. 플러그인을 추가, 삭제, 이름 변경하면 새 빌드가 필요하다.

## 기준 API

플러그인 개발자가 안정적으로 의존할 수 있는 계약은 다음 파일이다.

- `$lib/plugin-contracts`
- `$lib/i18n/plugin`
- `src/plugins/utils.ts`
- 이 문서에 명시된 파일명과 route

그 외 `src/routes/*`, `src/lib/server/models/*`, 특정 플러그인의 내부 helper는 코어 구현 상세다. 참고 구현을 읽을 수는 있지만, 새 플러그인이 그 내부 파일에 직접 기대면 코어 리팩터링 때 쉽게 깨진다. 서버 DB 모델이나 라우트 내부 helper가 꼭 필요하면 플러그인 API를 먼저 확장한다.

## 파일 구조

최소 플러그인은 `plugin.ts` 하나만 있으면 된다.

```text
src/plugins/example/
  plugin.ts
```

필요한 확장 표면만 추가한다.

```text
src/plugins/example/
  plugin.ts             # 필수. 메타데이터, 기본 설정, 브라우저 안전 설정 처리
  server.ts             # 선택. 서버 전용 훅과 관리자/계정 action
  auth.ts               # 선택. 로그인, 세션, redirect 인증, 계정 연결
  Admin.svelte          # 선택. /admin/plugins/example 설정 UI
  AdminSubpage.svelte   # 선택. /admin/plugins/example/{item} 하위 UI
  slots/
    top.svelte          # 공개 홈 페이지 상단
    form-extra.svelte   # 링크 생성 폼 내부 추가 필드
    form-footer.svelte  # 링크 생성 폼 하단
    login-extra.svelte  # 로그인 폼 내부
    signup-extra.svelte # 회원 가입 폼 내부
    footer.svelte       # 공개 홈 페이지 footer 내부
  config.ts             # 선택. 플러그인 내부 정규화/검증 helper
```

`config.ts` 같은 보조 파일명은 자동 로드되지 않는다. 직접 import한 파일만 번들에 들어간다.

반드시 지킬 규칙:

- 폴더명과 `plugin.ts`의 `meta.id`는 같아야 한다.
- `auth.ts`를 제공하면 `auth.ts`의 `id`도 폴더명과 같아야 한다.
- 플러그인 ID는 URL, form field, DB key에 쓰인다. 소문자, 숫자, 하이픈만 쓰는 짧은 이름을 권장한다.
- 플러그인 설정은 `app_settings.key = plugins:{pluginId}`에 저장된다. `key` 컬럼이 `STRING(64)`라서 `pluginId`는 `plugins:` 접두사를 포함해 64자를 넘기면 안 된다.
- `plugin.ts`, `Admin.svelte`, `slots/*.svelte`에는 서버 전용 import를 넣지 않는다.
- DB, 파일 시스템, 환경 변수, secret, private key 접근은 `server.ts`나 `auth.ts`에 둔다.

## 자동 로딩 구조

현재 레지스트리는 네 개다.

| 파일 | 자동 로드 대상 | 용도 |
| --- | --- | --- |
| `src/plugins/server.ts` | `./*/plugin.ts`, `./*/server.ts` | 서버 훅, 설정 정규화, 요청 훅, 클릭 메타데이터 |
| `src/plugins/admin-registry.ts` | `./*/plugin.ts`, `./*/Admin.svelte`, `./*/AdminSubpage.svelte` | 관리자 페이지 컴포넌트 |
| `src/plugins/public-registry.ts` | `./*/plugin.ts`, `./*/slots/*.svelte` | 공개 슬롯 컴포넌트 |
| `src/plugins/auth-registry.ts` | `./*/auth.ts`, `./*/plugin.ts` | 로그인/세션/계정 연결 |

`server.ts`는 `plugin.ts`의 `PluginDefinition` 위에 서버 전용 훅을 병합한다. 같은 훅 이름을 양쪽에 두면 `server.ts`가 이긴다. 그래도 원칙은 단순하다. 브라우저에 들어갈 수 있는 코드는 `plugin.ts`, 서버 전용 코드는 `server.ts`다.

서버, 관리자, 공개 슬롯 레지스트리는 `meta.order` 오름차순, 그 다음 `meta.name` 순으로 정렬된다. URL 변환, 요청 훅, 클릭 메타데이터, 공개 슬롯처럼 여러 플러그인이 같은 흐름에 참여하는 경우 이 정렬을 따른다.

인증 레지스트리는 현재 `auth.ts` 발견 결과를 별도 정렬하지 않는다. 여러 인증 플러그인이 동시에 `getUser()`나 `authenticatePassword()`를 제공할 때 어느 플러그인이 먼저 성공할지에 의존하지 않는다.

## 설정 저장

설정은 `app_settings` 테이블에 저장된다.

| key | value |
| --- | --- |
| `site` | 사이트 전역 설정 |
| `plugins:{pluginId}` | 해당 플러그인의 `PluginState` |

플러그인 row의 형태:

```json
{
  "enabled": true,
  "config": {
    "message": "Hello"
  }
}
```

런타임에서는 현재 로드된 플러그인 정의를 기준으로 `settings.plugins`를 만든다.

- 저장된 값이 없으면 `defaultConfig`를 사용한다.
- 저장된 `config`는 `defaultConfig`와 1단계 shallow merge된다.
- 중첩 객체는 자동 deep merge되지 않는다. 직접 normalize 함수에서 보정한다.
- `meta.required === true`인 플러그인은 항상 `enabled: true`다.
- 현재 코드에 없는 플러그인 ID는 런타임 상태에서 제외된다. 설정 저장 시 현재 플러그인 목록에 없는 `plugins:*` row는 정리될 수 있다.

플러그인 전용 DB migration 인터페이스는 현재 없다. 새 테이블이나 컬럼이 필요한 플러그인은 코어 모델과 migration 설계를 먼저 확장해야 한다. 플러그인 내부에서 임의로 schema를 변경하는 코드는 작성하지 않는다.

## `plugin.ts`

`plugin.ts`는 `PluginDefinition`을 default export한다.

```ts
import type { PluginDefinition } from '$lib/plugin-contracts';
import { pluginChecked, pluginString } from '../utils';

const plugin: PluginDefinition = {
  meta: {
    id: 'example',
    name: 'Example',
    description: 'Shows a small public message.',
    version: '1.0.0',
    category: 'display',
    order: 100,
  },
  translations: {
    ko: {
      meta: {
        name: '예제',
        description: '공개 메시지를 표시합니다.',
      },
      strings: {
        'admin.enabled': '사용',
        'admin.message': '메시지',
      },
    },
    en: {
      meta: {
        name: 'Example',
        description: 'Shows a small public message.',
      },
      strings: {
        'admin.enabled': 'Enabled',
        'admin.message': 'Message',
      },
    },
  },
  defaultConfig: {
    enabled: false,
    message: '',
  },
  parseConfig(form, current) {
    return {
      enabled: pluginChecked(form, 'example', 'enabled'),
      message: pluginString(
        form,
        'example',
        'message',
        String(current.message ?? ''),
      ).slice(0, 500),
    };
  },
  publicConfig(config) {
    return {
      enabled: config.enabled === true,
      message: typeof config.message === 'string' ? config.message : '',
    };
  },
};

export default plugin;
```

### `meta`

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `id` | 예 | 폴더명과 같아야 한다. |
| `name` | 예 | 기본 표시 이름. 실제 UI에서는 `translations[locale].meta.name`이 우선된다. |
| `description` | 예 | 기본 설명. |
| `version` | 예 | 관리자 플러그인 페이지 상태 표시. |
| `category` | 예 | 표시/분류용 문자열. |
| `required` | 아니오 | true면 비활성화할 수 없다. |
| `order` | 아니오 | 낮을수록 먼저 표시/실행된다. 기본 취급값은 100이다. |

`required`는 로드된 플러그인을 비활성화하지 못하게 하는 설정이다. 폴더가 없으면 플러그인은 발견되지 않는다.

### `translations`

플러그인은 자체 UI 문자열을 `translations`로 제공한다.

```ts
translations: {
  ko: {
    meta: { name: '예제' },
    strings: { 'admin.message': '메시지' },
  },
  en: {
    meta: { name: 'Example' },
    strings: { 'admin.message': 'Message' },
  },
}
```

코어는 현재 locale의 문자열을 먼저 사용하고, 없으면 사이트 기본 locale을 fallback으로 사용한다. 그래도 없으면 빈 객체가 전달된다.

Svelte 컴포넌트에서는 하드코딩 문장을 직접 렌더링하지 말고 `strings` prop과 `pluginText()`를 사용한다.

```svelte
<script lang="ts">
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';

  let { strings = {} }: PluginComponentProps = $props();

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<label>{t('admin.message')}</label>
```

지원 언어가 늘어날 수 있으므로 UI에서 `ko`/`en`을 고정하지 않는다. 언어별 설정값을 편집해야 하면 `siteLocaleKeys`, `siteLocaleLabel`, `LocaleFieldSelector`를 사용한다.

```svelte
<script lang="ts">
  import LocaleFieldSelector from '$lib/components/LocaleFieldSelector.svelte';
  import {
    defaultSiteLocale,
    siteLocaleKeys,
    siteLocaleLabel,
    type SiteLocale,
  } from '$lib/config';

  let activeLocale = $state<SiteLocale>(defaultSiteLocale);
  const localeTabs = siteLocaleKeys.map((id) => ({
    id,
    label: siteLocaleLabel(id),
  }));
</script>

<LocaleFieldSelector
  bind:activeLocale
  label={t('admin.stringLanguage')}
  options={localeTabs}
/>
```

### `defaultConfig`

`defaultConfig`는 JSON으로 직렬화 가능한 값만 사용한다.

좋은 값:

```ts
defaultConfig: {
  enabled: false,
  timeoutMs: 3000,
  headers: [],
  messages: {},
}
```

피해야 할 값:

```ts
defaultConfig: {
  createdAt: new Date(),
  matcher: /x/,
  callback: () => {},
  map: new Map(),
}
```

날짜는 문자열로 저장하고, 정규식/Map/함수는 저장하지 않는다.

### `parseConfig(form, current, input)`

관리자가 일반 저장 버튼을 누르면 코어가 `parseConfig()`를 호출한다.

```ts
parseConfig(
  form: FormData,
  current: PluginConfig,
  input?: { defaultLocale: SiteLocale },
): PluginConfig
```

역할:

- form 값을 읽는다.
- 빈 값, 숫자 범위, 체크박스, 배열, JSON, 줄 단위 DSL을 정규화한다.
- 기존 값을 유지해야 하는 secret은 `current`를 fallback으로 사용한다.
- 사이트 기본 언어가 필요하면 `input?.defaultLocale`을 사용한다.

필드 이름은 직접 만들지 말고 `fieldName()`, `pluginString()`, `pluginChecked()`를 사용한다.

```ts
import { fieldName, pluginChecked, pluginString } from '../utils';

parseConfig(form, current) {
  return {
    enabled: pluginChecked(form, 'example', 'enabled'),
    title: pluginString(form, 'example', 'title', String(current.title ?? '')),
    count: Number(form.get(fieldName('example', 'count')) ?? 0),
  };
}
```

체크박스는 unchecked 상태일 때 form에 값이 없다. 반드시 명시적으로 boolean을 만든다.

### `validateConfig(config)`

저장 직전에 호출되는 검증 훅이다. 브라우저 안전 코드만 필요하면 `plugin.ts`에 둘 수 있고, 서버 전용 import가 필요하면 `server.ts`에 둔다.

```ts
validateConfig(config) {
  if (typeof config.endpoint !== 'string') {
    throw new Error('Endpoint is required.');
  }
  new URL(config.endpoint);
}
```

검증 실패는 `Error`를 throw한다. 관리자에게 표시되는 메시지이므로 사용자가 고칠 수 있는 내용을 담는다.

### `prepareAdminConfig(config)`

관리자 UI에 넘길 설정만 가공한다. 저장된 설정 자체는 바꾸지 않는다.

```ts
prepareAdminConfig(config) {
  return {
    ...config,
    clientSecret: '',
    hasClientSecret: typeof config.clientSecret === 'string' && config.clientSecret !== '',
  };
}
```

secret 값을 `<input value>`로 그대로 보내지 않는다.

### `publicConfig(config)`

공개 페이지와 공개 슬롯에 넘길 설정을 제한한다.

```ts
publicConfig(config) {
  return {
    enabled: config.enabled === true,
    label: typeof config.label === 'string' ? config.label : '',
  };
}
```

`publicConfig()`가 없으면 config 전체가 공개 상태에 들어갈 수 있다. secret, 내부 경로, 관리자 전용 flag가 조금이라도 있으면 반드시 구현한다.

### `transformCreateUrl(url, form, config)`

링크 생성 시 대상 URL을 변환한다. enabled 플러그인만 실행된다.

```ts
transformCreateUrl(url, form, config) {
  if (config.addSource !== true) return url;
  url.searchParams.set('source', 'shortlink');
  return url;
}
```

여러 플러그인이 구현하면 `order` 순으로 실행된다. 문자열 결합 대신 `URL` API를 사용한다.

## `server.ts`

`server.ts`는 서버 전용 훅을 default export한다. 타입은 `Partial<PluginDefinition>`이다.

```ts
import type { PluginDefinition } from '$lib/plugin-contracts';

const server: Partial<PluginDefinition> = {
  async loadAdminData({ state }) {
    return { enabled: state.enabled };
  },
};

export default server;
```

현재 `server.ts`에서 병합되는 훅:

- `canEnable`
- `canDisable`
- `validateConfig`
- `loadAdminData`
- `handleAdminAction`
- `loadAdminSubpage`
- `handleAdminSubpageAction`
- `loadUserAdminData`
- `handleUserAdminAction`
- `loadAccountData`
- `handleAccountAction`
- `verifyFormSubmission`
- `handleRequest`
- `collectClickMetadata`
- `formatClickMetadata`
- `getClickMetadataSearchFields`

enabled 상태가 아닌 플러그인은 대부분의 서버 훅이 실행되지 않는다. 예외적으로 활성화 가능 여부를 판단하는 `canEnable`/`canDisable`과 설정 저장 검증 흐름은 플러그인 상태 변경 시 호출될 수 있다.

### 활성화 제어

```ts
canEnable({ state, url }) {
  return { allowed: true };
}

canDisable({ state, url }) {
  return {
    allowed: false,
    reason: 'This plugin is required by the current policy.',
  };
}
```

`reason`은 관리자 UI에 그대로 표시된다. 현재 `canEnable()`/`canDisable()`은 `locale`이나 `strings`를 받지 않는다. 다국어 reason이 필요하면 이 훅의 계약을 먼저 확장해야 한다. UI에서 막는 것과 별개로 저장 액션에서도 다시 검사된다.

### 관리자 데이터와 action

`/admin/plugins/{pluginId}`에서 호출된다.

아래 예제는 `pluginText`를 import했다고 가정한다.

```ts
async loadAdminData({ state, url }) {
  return { lastCheckedAt: null };
}

async handleAdminAction({
  action,
  form,
  state,
  user,
  isAdmin,
  locale,
  fallbackLocale,
  strings,
}) {
  const t = (key) => pluginText(strings, key);
  if (action !== 'save') {
    throw new Error(t('server.unsupportedAction'));
  }

  return {
    ok: true,
    message: t('server.saved'),
    config: {
      ...state.config,
      endpoint: String(form.get('endpoint') ?? '').trim(),
    },
  };
}
```

`handleAdminAction()`의 반환값:

```ts
{
  enabled?: boolean;
  config?: PluginConfig;
  ok?: boolean;
  message?: string;
}
```

코어는 반환된 `enabled`/`config`에 대해 다시 `canEnable`, `canDisable`, `validateConfig`를 적용한 뒤 저장한다.

### 관리자 UI form 규칙

`Admin.svelte`가 코어 저장 form 안에 들어가는지 여부는 `handleAdminAction` 존재 여부로 결정된다.

- `handleAdminAction`이 없으면 `Admin.svelte`는 코어의 `?/save` form 안에 렌더링된다. 이 경우 `Admin.svelte` 안에 `<form>`을 만들지 않는다.
- `handleAdminAction`이 있으면 `Admin.svelte`는 코어 저장 form 밖에 렌더링된다. 이 경우 플러그인이 직접 `<form method="POST" action="?/pluginAction">`을 만든다.

플러그인 action 이름은 `pluginAction` 또는 submit button의 `pluginActionSubmit` 값으로 보낸다.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<form method="POST" action="?/pluginAction" use:enhance>
  <input type="hidden" name="pluginAction" value="test" />
  <button type="submit">Test</button>
</form>
```

submit button으로 action을 구분할 수도 있다.

```svelte
<button name="pluginActionSubmit" value="save">Save</button>
<button name="pluginActionSubmit" value="test">Test</button>
```

### 관리자 하위 페이지

`loadAdminSubpage`가 있으면 `/admin/plugins/{pluginId}/{item}` route를 사용할 수 있다. 플러그인이 비활성화되어 있으면 하위 페이지로 들어갈 수 없다.

```ts
async loadAdminSubpage({ item, state, url, strings }) {
  return { item };
}

async handleAdminSubpageAction({ item, action, form, state, strings }) {
  return {
    ok: true,
    message: pluginText(strings, 'server.handled'),
    redirectTo: `/admin/plugins/example/${item}`,
  };
}
```

`AdminSubpage.svelte`는 다음 prop을 받는다.

- `config`
- `adminData`
- `item`
- `integrations`
- `locale`
- `fallbackLocale`
- `strings`

하위 페이지 action form은 `action="?/pluginAction"`을 사용한다.

```svelte
<form method="POST" action="?/pluginAction" use:enhance>
  <input type="hidden" name="pluginAction" value="delete" />
  <button type="submit">Delete</button>
</form>
```

### 사용자/계정 integration 훅

`loadAccountData`와 `handleAccountAction`은 `/account`에서 사용되는 계정 integration 데이터와 action을 제공한다.

```ts
async loadAccountData({ user, state, strings }) {
  return { connected: true };
}

async handleAccountAction({ user, action, form, state, strings }) {
  return { ok: true, message: pluginText(strings, 'server.handled') };
}
```

현재 일반 플러그인용 `Account.svelte` 자동 렌더링 표면은 없다. 계정 페이지가 특정 integration을 표시하도록 코어 UI가 연결되어 있어야 사용자가 볼 수 있다.

`loadUserAdminData`와 `handleUserAdminAction`은 관리자 하위 페이지가 특정 사용자 관련 integration을 표시/조작할 때 쓰인다. 하위 페이지는 safe integer user id를 해석할 수 있는 `item`에 대해 모든 enabled 플러그인의 `loadUserAdminData`를 모아 `integrations` prop으로 넘긴다.

integration action form은 하위 페이지에서 `action="?/integrationAction"`을 사용하고 다음 값을 보낸다.

```svelte
<input type="hidden" name="integrationPlugin" value="example" />
<input type="hidden" name="integrationAction" value="unlink" />
```

### 폼 제출 보호

`verifyFormSubmission()`은 공개 form 제출을 서버에서 차단할 수 있는 훅이다.

```ts
async verifyFormSubmission({
  action,
  form,
  request,
  url,
  state,
  user,
  isAdmin,
  ip,
  locale,
  fallbackLocale,
  strings,
}) {
  if (action !== 'link-create') return { allowed: true };
  return { allowed: true };
}
```

현재 core action:

- `login`
- `signup`
- `link-create`

관리자는 이 훅을 코어 레벨에서 우회한다. 관리자가 아닌 요청에서 enabled 플러그인의 guard가 순서대로 실행되고, 하나라도 `{ allowed: false }`를 반환하면 제출이 차단된다.

```ts
return {
  allowed: false,
  message: pluginText(strings, 'public.required'),
};
```

### 전역 요청 훅

`handleRequest()`는 `hooks.server.ts`에서 `resolve()` 전에 호출된다.

```ts
handleRequest({ event, state, user, isAdmin, ip }) {
  if (event.url.pathname.startsWith('/blocked')) {
    return new Response('Blocked', { status: 403 });
  }
  return null;
}
```

요청마다 실행되므로 느린 DB 작업이나 외부 API 호출을 넣지 않는다. 이 훅에서 body를 읽으면 route handler가 body를 다시 읽지 못할 수 있다.

### 클릭 메타데이터

단축 링크 클릭 시 추가 메타데이터를 저장하려면 `collectClickMetadata()`를 구현한다.

```ts
async collectClickMetadata({ request, ip, state }) {
  return {
    country: request.headers.get('x-country') ?? null,
  };
}
```

반환값은 `click_events.metadata[pluginId]`에 저장된다. 빈 객체, `null`, `undefined`는 저장하지 않는다.

통계 화면과 링크 API 응답에 표시하려면 `formatClickMetadata()`를 구현한다.

```ts
async formatClickMetadata({ metadata, state, isAdmin, isOwner }) {
  if (!isAdmin && !isOwner) return [];
  const record = metadata as { country?: string } | null;
  return record?.country
    ? [{ label: 'Country', value: record.country }]
    : [];
}
```

검색 가능한 메타데이터 필드를 추가하려면 `getClickMetadataSearchFields()`를 구현한다.

```ts
getClickMetadataSearchFields({ isAdmin, isOwner }) {
  if (!isAdmin && !isOwner) return [];
  return [
    {
      id: 'country',
      label: 'Country',
      paths: [['country']],
    },
  ];
}
```

현재 `formatClickMetadata()`와 `getClickMetadataSearchFields()`는 `locale`/`strings`를 받지 않는다. 다국어 label이 필요하면 설정값에 표시 label을 저장하거나, 훅 계약을 확장해야 한다.

저장값은 작고 JSON-safe해야 한다. request header 전체를 저장하지 말고 필요한 값만 allowlist로 추출한다.

## `Admin.svelte`

`Admin.svelte`는 `PluginComponentProps`를 받는다.

```svelte
<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';
  import { configString, fieldName } from '../utils';

  let { config, adminData, strings = {} }: PluginComponentProps = $props();

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<ToggleField
  name={fieldName('example', 'enabled')}
  label={t('admin.enabled')}
  checked={config.enabled === true}
/>

<label>
  {t('admin.message')}
  <input
    name={fieldName('example', 'message')}
    value={configString(config, 'message')}
  />
</label>
```

관리자 컴포넌트 규칙:

- 표시 문장은 `strings`와 `pluginText()`를 사용한다.
- 필드 이름은 `fieldName(pluginId, field)`를 사용한다.
- 체크박스는 `ToggleField`와 `pluginChecked()` 조합을 사용한다.
- 비밀번호/secret은 `prepareAdminConfig()`로 빈 값 처리하고, 저장 파서에서 빈 입력의 의미를 명확히 한다.
- `use:enhance`가 필요한 자체 form에는 직접 적용한다.
- nested form을 만들지 않는다.

## 공개 슬롯

공개 슬롯 컴포넌트도 `PluginComponentProps`를 받는다.

```svelte
<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import { pluginText } from '$lib/i18n/plugin';

  let { config, user, strings = {} }: PluginComponentProps = $props();
</script>

{#if config.enabled}
  <aside>{pluginText(strings, 'public.message')}</aside>
{/if}
```

현재 렌더링되는 slot:

| slot | 렌더링 위치 |
| --- | --- |
| `top` | 공개 홈 페이지 최상단 |
| `form-extra` | 공개 링크 생성 form 내부 |
| `form-footer` | 공개 링크 생성 form 하단 |
| `footer` | 공개 홈 페이지 footer 내부 |
| `login-extra` | 로그인 form 내부 |
| `signup-extra` | 회원 가입 form 내부 |

타입상 임의 slot 이름을 만들 수 있지만, 코어에 `PluginSlotOutlet`이 없으면 렌더링되지 않는다.

공개 슬롯에는 `getPublicPluginStates()` 결과가 들어간다. 즉 `publicConfig()`가 반환한 값만 믿어야 한다. 서버 전용 값이나 secret이 필요하면 설계가 잘못된 것이다.

## `auth.ts`

인증 플러그인은 `AuthPluginModule`을 default export한다.

```ts
import type { AuthPluginModule } from '$lib/plugin-contracts';
import { pluginText } from '$lib/i18n/plugin';

const auth: AuthPluginModule = {
  id: 'example',

  async getUser(cookies, config) {
    return null;
  },

  getLoginMethods(config, context) {
    return [
      {
        id: 'example',
        label: pluginText(context?.strings, 'auth.exampleLogin'),
        type: 'redirect',
      },
    ];
  },

  async startLogin(cookies, origin, config, methodId, returnTo, context) {
    return new URL('/auth/example/callback', origin);
  },

  async finishLogin(cookies, currentUrl, config, context) {
    return '/';
  },
};

export default auth;
```

현재 route:

- `/auth/{pluginId}/{methodId}/login`
- `/auth/{pluginId}/callback`
- `/account/connections/{pluginId}/{methodId}/start`
- `/account/connections/{pluginId}/callback`

인증 모듈 훅:

| 훅 | 설명 |
| --- | --- |
| `getUser(cookies, config)` | 현재 요청의 사용자 조회 |
| `clearSession(cookies)` | 로그아웃/계정 삭제 시 세션 제거 |
| `getLoginMethods(config, context)` | 로그인 화면에 표시할 method |
| `authenticatePassword(cookies, config, email, password, context)` | 비밀번호 로그인 처리 |
| `startLogin(...)` | redirect 로그인 시작 URL 생성 |
| `finishLogin(...)` | redirect callback 처리 후 returnTo 반환 |
| `getAccountLinkMethods(config, context)` | 계정 연결 method. 없으면 redirect login method를 재사용 |
| `startAccountLink(...)` | 계정 연결 시작 URL 생성 |
| `finishAccountLink(...)` | 계정 연결 callback 처리 후 returnTo 반환 |

`getLoginMethods()`와 `getAccountLinkMethods()`는 enabled 상태인 인증 플러그인에 대해서만 사용된다. redirect 시작 route는 method 목록에 있는 method만 허용한다.

`AuthenticatedUser`는 다음 형태다.

```ts
{
  id: number;
  provider: string;
  subject: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
}
```

`provider`와 `subject`는 안정적인 식별자여야 한다. OIDC 같은 외부 인증에서는 callback state에 nonce, returnTo, account-link 대상 user id를 넣고 callback에서 반드시 검증한다.

## 유틸

`src/plugins/utils.ts`에서 제공하는 유틸:

```ts
fieldName(pluginId, field)       // plugin.example.field
pluginString(form, id, field)    // trim된 문자열
pluginChecked(form, id, field)   // 체크박스 boolean
configString(config, field)      // 문자열 config 읽기
configStringArray(config, field) // string[] config 읽기
parseDelimitedLines(...)         // 줄 단위 DSL 파서
isHttpHeaderName(value)          // HTTP 헤더명 검증
```

관리자 form field는 항상 `fieldName()`을 기준으로 만든다.

```svelte
<input name={fieldName('example', 'title')} />
```

```ts
const title = pluginString(form, 'example', 'title');
```

## 서버 메시지와 에러

플러그인 자체 메시지는 플러그인의 `translations`에 넣고, 서버 훅에서 전달된 `strings`로 꺼낸다.

```ts
import { pluginText } from '$lib/i18n/plugin';

function t(strings, key) {
  return pluginText(strings, key);
}

throw new Error(t(strings, 'server.providerRequired'));
```

코어 공용 메시지를 써야 하는 경우에만 `$lib/i18n/ui-text`의 `serverMessage()`를 사용한다. 플러그인 전용 메시지를 `ui-text.ts`에 추가하는 방식은 플러그인의 독립성을 낮춘다.

치환이 필요한 문장은 플러그인 안에서 작은 formatter를 두고 `{name}` 형태를 치환한다.

```ts
function formatText(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
```

## 보안 규칙

플러그인은 코어 요청 흐름에 직접 들어간다. 다음 기준은 필수다.

- UI에서 숨긴 버튼도 서버 action에서 다시 권한 검증한다.
- `handleAdminAction`, `handleAdminSubpageAction`, `handleAccountAction`, `handleUserAdminAction`은 action 이름을 allowlist로 처리한다.
- 비활성화 상태에서 server hook이 실행되지 않는다는 점에만 의존하지 말고, 위험 action은 `state.enabled` 전제를 코드로도 분명히 한다.
- secret은 `publicConfig()`에 절대 넣지 않는다.
- secret은 `prepareAdminConfig()`에서 비워 보내고, 빈 입력이 기존 값 유지인지 삭제인지 명확히 구현한다.
- 관리자 입력 HTML을 `{@html}`로 렌더링할 수는 있지만, 비관리자 입력값에는 절대 쓰지 않는다.
- URL은 문자열 결합 대신 `new URL()`과 `URLSearchParams`를 사용한다.
- `handleRequest()`와 클릭 추적 경로에서 외부 API를 느리게 호출하지 않는다.
- request header나 IP 기반 정보를 저장할 때는 필요한 값만 allowlist로 보관한다.
- 계정 연결 callback은 현재 로그인 사용자와 flow state의 사용자 id를 반드시 비교한다.

## 성능 규칙

자주 실행되는 훅:

- `auth.ts`의 `getUser()`
- `handleRequest()`
- `verifyFormSubmission()`
- `collectClickMetadata()`
- `formatClickMetadata()`
- `transformCreateUrl()`

권장 사항:

- 매 요청마다 외부 API를 호출하지 않는다.
- 클릭 저장 경로에서는 파일 IO와 네트워크 IO를 최소화한다.
- MaxMind reader 같은 객체는 모듈 전역 캐시로 재사용한다.
- 통계 포맷에서 클릭 N개마다 외부 요청 N번을 보내지 않는다.
- config normalize는 hook 초기에 한 번만 수행한다.

## 개발 체크리스트

플러그인을 추가하거나 수정한 뒤 확인한다.

- 폴더명, `meta.id`, `auth.ts id`가 일치한다.
- `plugin.ts`, `Admin.svelte`, `slots/*.svelte`에 서버 전용 import가 없다.
- `defaultConfig`가 JSON-safe다.
- `publicConfig()`가 secret과 내부 설정을 제거한다.
- 관리자 UI 문장이 `translations`와 `pluginText()`를 통해 렌더링된다.
- 언어별 설정 UI가 `siteLocaleKeys`를 사용하고 `ko`/`en`을 고정하지 않는다.
- `handleAdminAction`이 있으면 `Admin.svelte`가 자체 form을 가진다.
- `handleAdminAction`이 없으면 `Admin.svelte`에 nested form이 없다.
- 체크박스 저장은 `pluginChecked()`로 처리한다.
- 서버 action은 action 이름과 권한을 allowlist로 검증한다.
- 비관리자가 직접 POST해도 서버 정책이 유지된다.
- 클릭 메타데이터는 JSON-safe이고 크기가 작다.
- 인증 redirect/account-link method는 노출된 method만 시작된다.
- 모바일 viewport에서 슬롯 UI가 form을 깨뜨리지 않는다.
- `npm run check`가 통과한다.

## 참고 구현

기존 플러그인은 참고용이다. 복사보다 필요한 훅만 최소 구현하는 편이 안전하다.

| 플러그인 | 참고할 부분 |
| --- | --- |
| `builtin` | 공개 슬롯, 언어별 관리자 편집값, 줄 단위 소셜 링크 DSL |
| `captcha` | `verifyFormSubmission`, 공개 form 슬롯, secret masking, provider none 처리 |
| `oidc-sso` | `auth.ts`, redirect login, account link, secret masking, 관리자 action |
| `permission-management` | 관리자 하위 페이지, bulk action, 사용자 integration action |
| `enhanced-tracking` | 클릭 메타데이터 수집/표시, header DSL 검증 |
| `rate-limit` | `handleRequest`, 언어별 응답 메시지, JSON 규칙 검증 |

문서와 코드가 다르면 코드가 기준이다. 단, 새 플러그인에서 문서에 없는 내부 API를 직접 쓰기 전에 플러그인 계약을 확장하는 쪽을 우선한다.
