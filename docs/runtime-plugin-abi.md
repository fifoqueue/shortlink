# Runtime Plugin ABI Design

이 문서는 빌드 결과물에 포함되지 않은 유저 플러그인을 운영 중인 서버에 복사해 넣고, 앱 재빌드 없이 로드하기 위한 런타임 플러그인 ABI 설계다.

기존 `src/plugins/*`와 `src/user-plugins/*`는 SvelteKit 빌드 시점 플러그인이다. 이 문서의 런타임 플러그인은 원본 `.ts`/`.svelte` 소스가 아니라, 플러그인 개발자가 미리 빌드한 패키지 또는 정적 manifest/UI 패키지를 서버가 런타임에 읽는 방식이다.

## 목표

- Docker 이미지 재빌드 없이 플러그인 추가, 제거, 업데이트를 가능하게 한다.
- 코어가 특정 플러그인 ID나 내부 구조에 의존하지 않게 한다.
- 런타임 플러그인이 서버 훅, 인증 훅, 클릭 메타데이터, 아웃바운드 프록시, 관리자 UI를 확장할 수 있게 한다.
- ABI 버전을 명시해 코어와 플러그인의 호환성을 검사한다.
- 단순 설정 UI는 코어가 선언형 schema로 렌더링하고, 복잡한 UI는 iframe 기반 micro frontend로 격리한다.
- 비신뢰 플러그인은 서버 프로세스에서 플러그인 JavaScript를 실행하지 않고, manifest/schema/iframe assets만 사용하게 한다.

## 비목표

- 원본 `.svelte` 파일을 서버에서 즉석 컴파일하지 않는다.
- 런타임 플러그인이 `$lib/*`, `src/routes/*`, 코어 모델 내부 파일을 직접 import하는 것을 보장하지 않는다.
- `trust: "trusted"` 플러그인의 Node 서버 코드를 샌드박싱하지 않는다. 서버 훅이 필요한 플러그인은 여전히 서버 관리자에게 신뢰된 코드로 취급한다.

## 디렉터리 구조

기본 런타임 플러그인 디렉터리는 `/app/user-plugins`다. 환경 변수로 바꿀 수 있다.

```dotenv
USER_PLUGIN_DIR=/app/user-plugins
USER_PLUGIN_WATCH=true
```

플러그인 하나는 다음 구조를 가진다.

```text
/app/user-plugins/example/
  manifest.json
  server.mjs
  migrations/
    001-create-example-table.mjs
  public/
    admin.html
    admin.js
    slots/
      footer.html
```

Docker에서는 이 경로를 volume으로 마운트한다.

```yaml
services:
  app:
    image: ghcr.io/fifoqueue/shortlink:latest
    volumes:
      - ./user-plugins:/app/user-plugins:ro
    environment:
      USER_PLUGIN_DIR: /app/user-plugins
      USER_PLUGIN_WATCH: 'true'
```

## manifest.json

`manifest.json`은 플러그인의 정적 계약이다. 서버는 이 파일을 먼저 읽고, 검증이 통과한 뒤에만 `server.mjs`를 import한다.

```json
{
  "abi": "shortlink.runtime-plugin.v1",
  "id": "example",
  "name": "Example",
  "description": "Runtime plugin example.",
  "version": "1.0.0",
  "category": "display",
  "order": 100,
  "required": false,
  "trust": "trusted",
  "entry": "./server.mjs",
  "assets": "./public",
  "admin": {
    "mode": "schema"
  },
  "slots": {
    "footer": {
      "mode": "iframe",
      "entry": "./public/slots/footer.html"
    }
  }
}
```

검증 규칙:

- `abi`는 코어가 지원하는 값이어야 한다.
- `id`는 폴더명과 같아야 한다.
- `id`는 빌드 시점 플러그인과 런타임 플러그인 전체에서 유일해야 한다.
- `entry`, `assets`, slot entry는 플러그인 폴더 밖을 가리킬 수 없다.
- `trust`는 `trusted` 또는 `untrusted`다. 생략하면 `trusted`다.
- `trust: "untrusted"`는 `entry`와 `migrations/*.mjs`를 가질 수 없다. 코어는 비신뢰 플러그인의 서버 코드를 import하지 않는다.
- `version`은 플러그인 버전이다. ABI 호환성 판단에는 `abi`를 사용한다.

비신뢰 플러그인은 manifest만으로 설정, 번역, schema UI, iframe UI를 선언한다.

```json
{
  "abi": "shortlink.runtime-plugin.v1",
  "id": "notice-banner",
  "name": "Notice Banner",
  "description": "Adds a footer notice without server code.",
  "version": "1.0.0",
  "category": "display",
  "trust": "untrusted",
  "assets": "./public",
  "defaultConfig": {
    "enabled": true,
    "message": ""
  },
  "translations": {
    "ko": {
      "meta": { "name": "공지 배너" },
      "strings": {
        "admin.message": "공지 문구"
      }
    },
    "en": {
      "strings": {
        "admin.message": "Notice message"
      }
    }
  },
  "admin": {
    "mode": "schema",
    "schema": {
      "fields": [
        {
          "type": "text",
          "name": "message",
          "label": "Notice message"
        }
      ]
    }
  },
  "slots": {
    "footer": {
      "mode": "iframe",
      "entry": "./public/footer.html"
    }
  }
}
```

## server.mjs

서버 엔트리는 default factory를 export한다. 플러그인은 코어 내부 파일을 import하지 않고, factory 인자로 전달되는 SDK만 사용한다.

```js
export default function createPlugin(api) {
  return {
    meta: {
      id: 'example',
      name: 'Example',
      description: 'Runtime plugin example.',
      version: '1.0.0',
      category: 'display',
      order: 100,
    },
    translations: {
      ko: {
        meta: { name: '예제' },
        strings: {
          'admin.message': '메시지',
        },
      },
    },
    defaultConfig: {
      message: '',
    },
    parseConfig(form, current) {
      return {
        message: api.form.string(form, 'message', current.message ?? ''),
      };
    },
    adminSchema({ state, strings }) {
      return {
        fields: [
          {
            type: 'text',
            name: 'message',
            label: strings['admin.message'] ?? 'message',
            value: state.config.message ?? '',
          },
        ],
      };
    },
  };
}
```

factory는 한 번 호출되고, 반환된 객체가 런타임 `PluginDefinition`으로 변환된다.

## SDK

코어는 factory에 안정적인 SDK 객체를 전달한다.

```ts
interface RuntimePluginSdkV1 {
  abi: 'shortlink.runtime-plugin.v1';
  form: {
    string(form: FormData, name: string, fallback?: string): string;
    boolean(form: FormData, name: string): boolean;
    stringArray(form: FormData, name: string): string[];
  };
  text: {
    interpolate(
      template: string,
      values: Record<string, string | number>,
    ): string;
  };
  http: {
    outboundFetch(input: RuntimeOutboundFetchInput): Promise<Response>;
  };
  log: {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
  };
}
```

플러그인은 `$lib/server/outbound-http`를 직접 import하지 않고 `api.http`를 사용한다. 그래야 아웃바운드 프록시 정책이 항상 적용된다.

## 서버 훅

런타임 플러그인은 기존 빌드 시점 플러그인과 같은 의미의 훅을 제공하되, SvelteKit 내부 타입에 직접 의존하지 않는다.

지원 훅:

- `validateConfig`
- `canEnable`
- `canDisable`
- `canAccessAdminAction`
- `canAccessAdminSubpage`
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
- `outboundProxyProtocols`
- `resolveOutboundProxy`
- `handleOutboundProxyRequest`
- `handleOutboundProxyConnect`
- `publicConfig`
- `transformCreateUrl`

`handleRequest`는 SvelteKit `RequestEvent` 대신 다음 형태를 받는다.

```ts
interface RuntimeRequestContext {
  request: Request;
  url: URL;
  routeId: string | null;
  cookies: RuntimeCookieJar;
  user: RuntimeAuthenticatedUser | null;
  isAdmin: boolean;
  ip: string;
}
```

반환값은 `Response | null`이다. Web Standard 타입만 ABI로 노출한다.

## 인증 훅

인증 플러그인도 같은 `server.mjs`에서 제공한다.

```js
export default function createPlugin(api) {
  return {
    meta,
    defaultConfig,
    parseConfig,
    auth: {
      async getUser({ cookies, config }) {
        return null;
      },
      getLoginMethods({ config, strings }) {
        return [];
      },
      async startLogin({ cookies, origin, config, methodId, returnTo }) {
        return new URL('/auth/example/callback', origin);
      },
      async finishLogin({ cookies, currentUrl, config }) {
        return '/';
      },
    },
  };
}
```

기존 `auth.ts`와 달리 별도 파일을 요구하지 않는다. 런타임 로더가 `auth` 객체를 기존 인증 레지스트리에 adapter로 붙인다.

## 관리자 UI

런타임 UI는 두 모드를 지원한다.

### schema 모드

단순 설정 UI는 플러그인이 JSON schema를 반환하고, 코어가 기존 관리자 스타일로 렌더링한다.

```ts
interface RuntimeAdminSchema {
  fields: RuntimeAdminField[];
}

type RuntimeAdminField =
  | {
      type: 'text';
      name: string;
      label: string;
      value?: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      type: 'textarea';
      name: string;
      label: string;
      value?: string;
      rows?: number;
    }
  | {
      type: 'number';
      name: string;
      label: string;
      value?: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | { type: 'checkbox'; name: string; label: string; checked?: boolean }
  | {
      type: 'select';
      name: string;
      label: string;
      value?: string;
      options: Array<{ value: string; label: string }>;
    };
```

schema 모드는 host form에 직접 들어가므로 설정 저장, i18n, 접근성, 모바일 스타일을 코어가 보장한다.

### iframe 모드

복잡한 UI는 플러그인 assets의 HTML을 iframe으로 렌더링한다.

```json
{
  "admin": {
    "mode": "iframe",
    "entry": "./public/admin.html"
  }
}
```

host는 iframe에 `postMessage`로 초기 상태를 보낸다.

```ts
interface RuntimePluginFrameInit {
  type: 'shortlink:init';
  pluginId: string;
  locale: string;
  fallbackLocale: string;
  strings: Record<string, string>;
  config: Record<string, unknown>;
  adminData: unknown;
}
```

iframe은 다음 메시지를 보낼 수 있다.

```ts
type RuntimePluginFrameMessage =
  | { type: 'shortlink:resize'; height: number }
  | {
      type: 'shortlink:set-fields';
      fields: Record<string, string | string[] | boolean>;
    }
  | {
      type: 'shortlink:submit-action';
      action: string;
      fields?: Record<string, unknown>;
    }
  | { type: 'shortlink:toast'; ok?: boolean; message: string };
```

host는 `set-fields`를 hidden input으로 반영한다. 따라서 iframe UI도 기존 `parseConfig()`와 `handleAdminAction()` 흐름을 사용할 수 있다.

## 공개 슬롯 UI

공개 슬롯 descriptor는 manifest에서 선언하고, host는 정적 Svelte 슬롯과 같은 위치에 runtime schema/iframe을 렌더링한다.

```json
{
  "slots": {
    "form-extra": {
      "mode": "schema"
    },
    "footer": {
      "mode": "iframe",
      "entry": "./public/slots/footer.html"
    }
  }
}
```

`form-extra`, `form-footer`, `login-extra`, `signup-extra`처럼 host form에 값을 넣어야 하는 slot은 schema 모드를 우선한다. iframe 모드는 bridge가 hidden input을 만들어 host form에 값을 연결하는 방식으로 확장한다.

## 계정 및 사용자 관리자 UI

runtime 플러그인은 계정 페이지와 사용자 관리자 화면에도 schema/iframe UI를 붙일 수 있다.

```json
{
  "account": {
    "mode": "iframe",
    "entry": "./public/account.html"
  },
  "userAdmin": {
    "mode": "schema",
    "schema": {
      "fields": [
        {
          "type": "checkbox",
          "name": "flagged",
          "label": "Flag this user"
        }
      ]
    }
  }
}
```

account schema의 기본 submit action은 `save`이고, host는 `pluginId`와 `pluginAction`을 함께 전송한다. 사용자 관리자 schema의 기본 submit action도 `save`이고, host는 `integrationPlugin`과 `integrationAction`을 함께 전송한다. iframe UI는 `shortlink:submit-action` 메시지로 action을 지정할 수 있다.

## 마이그레이션

런타임 플러그인 마이그레이션은 `migrations/*.mjs`를 동적 import한다.

```js
export default {
  id: 'example:001-create-table',
  async shouldRun({ sequelize }) {
    return true;
  },
  async up({ sequelize }) {
    await sequelize.query('SELECT 1');
  },
};
```

규칙:

- `id`는 전체 프로젝트에서 유일해야 한다.
- 코어 마이그레이션 이후, `sequelize.sync({ alter: true })` 이전에 실행한다.
- 플러그인이 제거되어도 이미 실행된 마이그레이션 기록은 유지한다.

## 로더 동작

서버 시작 시:

1. `USER_PLUGIN_DIR`을 읽는다.
2. 각 직접 하위 디렉터리의 `manifest.json`을 읽는다.
3. manifest를 검증한다.
4. `trust: "untrusted"`이면 서버 entry와 migration 없이 manifest만으로 `PluginDefinition` adapter를 만든다.
5. `trust: "trusted"`이면 `server.mjs`를 `import(fileUrl + '?v=' + contentHash)`로 로드한다.
6. trusted factory에 SDK를 주입한다.
7. 반환 객체를 기존 `PluginDefinition` adapter로 변환한다.
8. 빌드 시점 플러그인과 합쳐 정렬한다.

`USER_PLUGIN_WATCH=true`이면 파일 변경을 감지해 registry를 다시 만든다. 기존 ESM 모듈은 Node에서 완전히 unload되지 않으므로 업데이트 빈도가 높으면 재시작을 권장한다. `dispose()` lifecycle이 있는 플러그인은 registry 교체 전에 호출한다.

```ts
interface RuntimePluginLifecycle {
  dispose?: () => void | Promise<void>;
}
```

로드 실패는 앱 전체 500으로 만들지 않는다. 실패한 플러그인은 `unavailable` 상태로 관리자 플러그인 목록에 표시하고, 서버 로그에 원인을 남긴다.

## 기존 레지스트리와 통합

정적 레지스트리는 그대로 유지한다.

- `src/plugins/*`: 코어 플러그인
- `src/user-plugins/*`: 빌드 시점 유저 플러그인
- `USER_PLUGIN_DIR`: 런타임 ABI 플러그인

서버 측 `pluginDefinitions`는 정적 정의와 런타임 정의를 합친다. 공개 route는 클라이언트에 플러그인 목록이나 전체 state를 내려보내지 않고, 서버에서 `loadRuntimePluginSlots()` 결과를 `publicSlots.runtimeSlots`에 담아 전달한다.

관리자/계정/사용자 관리자 UI는 각 registry가 정적 Svelte 컴포넌트를 직접 로드하거나 런타임 schema/iframe descriptor를 렌더링한다. 공개 slot은 runtime schema/iframe descriptor만 클라이언트 렌더러로 전달한다.

## 보안 모델

ABI v1은 두 신뢰 모드를 지원한다.

- `untrusted`: 코어가 플러그인의 서버 JavaScript를 import하지 않는다. 플러그인은 manifest, 선언형 schema, iframe assets만 제공한다. 서버 훅, 인증 훅, DB migration, 아웃바운드 프록시 구현은 사용할 수 없다.
- `trusted`: 플러그인의 `server.mjs`를 같은 Node 프로세스에서 실행한다. 서버 훅과 migration이 가능하지만, 서버 관리자에게 신뢰된 코드여야 한다.

trusted 런타임 플러그인은 같은 Node 프로세스에서 실행되므로 다음 권한을 갖는다.

- 파일 시스템 접근
- 네트워크 접근
- 환경 변수 접근
- DB 접근을 우회할 수 있는 Node API 접근

따라서 서버 훅이 필요한 trusted 플러그인은 “관리자가 신뢰하는 플러그인만 설치”한다. 비신뢰 플러그인을 지원해야 할 때는 `trust: "untrusted"`를 사용하고, 필요한 UI는 schema 또는 iframe assets로 제공한다.

## 구현 상태

- 구현됨: `src/lib/runtime-plugin-abi.ts` ABI 타입, `src/lib/server/runtime-plugins.ts` manifest scanner/dynamic importer/cache/watch scan.
- 구현됨: `src/plugins/server.ts`의 정적 플러그인 + 런타임 플러그인 병합.
- 구현됨: `src/plugins/auth-registry.ts`의 런타임 `auth` adapter.
- 구현됨: DB 초기화 단계의 런타임 플러그인 마이그레이션 포함.
- 구현됨: 관리자 플러그인 목록과 `/admin/plugins/{plugin}` schema/iframe 렌더링.
- 구현됨: `/runtime-plugins/[plugin]/assets/[...path]` asset route.
- 구현됨: Docker compose의 `/app/user-plugins` volume 예시.
- 구현됨: 비신뢰 런타임 플러그인 manifest/schema/iframe 로드. 비신뢰 플러그인의 server entry와 migration은 거부한다.
- 구현됨: 공개 슬롯 host renderer.
- 구현됨: 계정/사용자 관리자 UI의 런타임 schema/iframe adapter.

## 호환성 정책

- ABI v1은 `shortlink.runtime-plugin.v1` 문자열로 고정한다.
- 코어는 같은 major ABI 안에서 하위 호환을 유지한다.
- 새 optional hook이나 field는 minor 기능으로 추가할 수 있다.
- 기존 field 의미 변경, 필수 field 추가, hook 입력 제거는 ABI v2에서만 한다.
