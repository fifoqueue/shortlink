# JSON API

Shortlink JSON API는 링크 생성, 목록 조회, 통계 조회, 수정, 삭제를 제공합니다. 링크 API는 `Authorization: Bearer <token>` 헤더가 필요합니다. 토큰은 로그인 후 `/account/api-tokens`에서 발급할 수 있습니다.

## 인증과 권한

Bearer 토큰은 다음 형식을 사용합니다.

```http
Authorization: Bearer slk_replace_with_issued_token
```

일반 사용자 토큰은 다음 조건을 모두 만족해야 합니다.

- 관리자 패널의 `링크 및 API`에서 API 전체가 활성화되어 있어야 합니다.
- 권한 그룹이 적용되는 경우 해당 그룹의 API 권한과 기능별 허용 조건을 만족해야 합니다.
- 권한 그룹으로 재정의되지 않은 기능은 관리자 패널의 `링크 및 API` 전역 API 설정을 따릅니다.
- 목록, 통계, 수정, 삭제는 기본적으로 토큰 소유자가 만든 링크 범위에서만 동작합니다.

관리자 토큰은 관리자 권한으로 동작합니다. API 기능 토글과 소유자 범위 제한을 우회하며, 목록과 통계 조회도 전체 링크를 대상으로 합니다.

API 링크 생성은 CAPTCHA를 요구하지 않습니다. 다만 링크 생성 URL 변환 플러그인은 실행됩니다. `속도 제한` 플러그인이 활성화되어 있고 요청이 규칙을 초과하면 API도 `429 Too Many Requests`를 반환할 수 있습니다.

링크 생성, 수정, 삭제 요청 본문은 웹 폼과 같은 필드명으로 해석됩니다. API 인증과 CAPTCHA 여부만 다르고, URL 정규화, 커스텀 코드 제한, 미리보기/옵션 정규화, 소유자 권한, 삭제 정책은 웹 폼과 같은 서버 로직을 사용합니다.

속도 제한 규칙에서 `requireApiToken: true`는 Bearer 토큰 헤더가 있는 요청을 뜻하고, `requireAdminApiToken: true`는 유효한 관리자 API 토큰인 요청을 뜻합니다. 기본 API 속도 제한 규칙은 `requireAdminApiToken: null`이므로 관리자 API 토큰도 일반 API 토큰과 마찬가지로 제한 대상에 포함됩니다.

## 링크 객체

공유 미리보기 값은 항상 `preview` 객체로 제공됩니다.

```json
{
  "id": 1,
  "code": "hello",
  "domain": "go.example.com",
  "url": "https://example.com/path",
  "preview": {
    "title": "공유 제목",
    "description": "공유 설명",
    "imageUrl": "https://example.com/preview.png",
    "themeColor": "#22c55e"
  },
  "tags": ["ads", "blog"],
  "smart": {
    "expiresAt": null,
    "maxClicks": 0,
    "passwordProtected": false
  },
  "routing": {
    "redirectRules": []
  },
  "health": {
    "status": "unchecked",
    "statusCode": null,
    "checkedAt": null,
    "error": "",
    "latencyMs": null
  },
  "created_at": "2026-06-10T00:00:00.000Z",
  "clicks": 0,
  "last_clicked_at": null,
  "short_url": "https://go.example.com/hello"
}
```

`preview` 필드는 모두 선택값입니다. 빈 값은 빈 문자열로 저장됩니다. `code`는 도메인별로 유니크합니다. 즉, 같은 `hello` slug라도 `domain`이 다르면 서로 다른 링크로 존재할 수 있습니다.

| 필드          | 설명                                        |
| ------------- | ------------------------------------------- |
| `title`       | 공유 제목. 최대 160자                       |
| `description` | 공유 설명. 최대 500자                       |
| `imageUrl`    | 공유 이미지 URL. `http` 또는 `https`만 허용 |
| `themeColor`  | 브라우저/theme 색상. `#RRGGBB` 형식         |

## 링크 목록

```http
GET /api/links
```

최근 링크를 최대 30개 반환합니다. 일반 사용자 토큰은 토큰 소유자가 만든 링크만 볼 수 있고, 관리자 토큰은 전체 링크를 볼 수 있습니다.

```bash
curl http://localhost:5173/api/links \
  -H "Authorization: Bearer $TOKEN"
```

응답:

```json
{
  "links": [
    {
      "id": 1,
      "code": "hello",
      "domain": "go.example.com",
      "url": "https://example.com/path",
      "preview": {
        "title": "",
        "description": "",
        "imageUrl": "",
        "themeColor": ""
      },
      "created_at": "2026-06-10T00:00:00.000Z",
      "clicks": 0,
      "last_clicked_at": null,
      "short_url": "https://go.example.com/hello"
    }
  ]
}
```

## 링크 생성

```http
POST /api/links
Content-Type: application/json
```

요청 본문:

```json
{
  "url": "https://example.com/path",
  "code": "hello",
  "domain": "go.example.com",
  "tags": "ads, blog",
  "utmSource": "newsletter",
  "utmMedium": "email",
  "utmCampaign": "launch",
  "utmTerm": "keyword",
  "utmContent": "hero-button",
  "preview": {
    "title": "공유 제목",
    "description": "공유 설명",
    "imageUrl": "https://example.com/preview.png",
    "themeColor": "#22c55e"
  }
}
```

`url`은 필수입니다. scheme이 없으면 `https://`가 붙습니다. `code`는 선택값이며 비우면 자동 생성됩니다. `domain`은 사이트 설정에 등록되어 있고 토큰 권한으로 허용된 단축 링크 도메인 host 중 하나여야 합니다. scheme, 경로, 쿼리, 해시는 저장하지 않습니다. 생략하면 사이트 기본 도메인을 우선 사용하고, 기본 도메인을 사용할 권한이 없으면 허용된 첫 번째 도메인을 사용합니다. 등록된 도메인이 없으면 링크를 생성할 수 없습니다. 관리자 패널에서 커스텀 코드가 비활성화된 경우 일반 사용자 토큰은 `code`를 지정할 수 없고, 관리자 토큰만 이 제한을 우회합니다.

미리보기 값은 중첩 `preview` 객체 또는 웹 폼과 같은 top-level 필드로 보낼 수 있습니다. 서버는 목적지 URL의 OpenGraph 데이터를 자동으로 가져와 채우지 않습니다.

링크 만들기/수정 폼의 옵션 탭과 같은 필드를 사용할 수 있습니다.

| 필드            | 동작                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `tags`          | 쉼표 또는 줄바꿈으로 분리해 태그로 저장                                                                  |
| `utmSource`     | 목적지 URL의 `utm_source` query parameter로 합쳐짐                                                       |
| `utmMedium`     | 목적지 URL의 `utm_medium` query parameter로 합쳐짐                                                       |
| `utmCampaign`   | 목적지 URL의 `utm_campaign` query parameter로 합쳐짐                                                     |
| `utmTerm`       | 목적지 URL의 `utm_term` query parameter로 합쳐짐                                                         |
| `utmContent`    | 목적지 URL의 `utm_content` query parameter로 합쳐짐                                                      |
| `expiresAt`     | 만료일. `datetime-local` 값 또는 날짜로 파싱 가능한 문자열                                               |
| `maxClicks`     | 최대 클릭 수. `0` 또는 빈 값은 무제한                                                                    |
| `password`      | 링크 접근 비밀번호                                                                                       |
| `redirectRules` | 조건 기반 리다이렉트 규칙 JSON 배열. 자세한 조건 형식은 [규칙 기반 리다이렉트](./redirect-rules.md) 참고 |

UTM 값은 링크 생성과 수정 시 URL에 합쳐집니다.

```json
{
  "url": "example.com",
  "utmSource": "newsletter",
  "utmMedium": "email",
  "utmCampaign": "launch",
  "previewTitle": "공유 제목",
  "previewDescription": "공유 설명",
  "previewImageUrl": "https://example.com/preview.png",
  "themeColor": "#22c55e"
}
```

예시:

```bash
curl -X POST http://localhost:5173/api/links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/path",
    "code": "hello",
    "domain": "go.example.com",
    "utmSource": "newsletter",
    "utmMedium": "email",
    "utmCampaign": "launch",
    "preview": {
      "title": "Example",
      "description": "Example link",
      "imageUrl": "https://example.com/preview.png",
      "themeColor": "#22c55e"
    }
  }'
```

성공 시 `201`과 생성된 링크를 반환합니다.

```json
{
  "link": {
    "id": 1,
    "code": "hello",
    "domain": "go.example.com",
    "url": "https://example.com/path?utm_source=newsletter&utm_medium=email&utm_campaign=launch",
    "preview": {
      "title": "Example",
      "description": "Example link",
      "imageUrl": "https://example.com/preview.png",
      "themeColor": "#22c55e"
    },
    "created_at": "2026-06-10T00:00:00.000Z",
    "clicks": 0,
    "last_clicked_at": null,
    "short_url": "https://go.example.com/hello"
  }
}
```

## 링크 수정

```http
PATCH /api/links/{code}
PUT /api/links/{code}
Content-Type: application/json
```

일반 사용자 토큰은 본인이 만든 링크만 수정할 수 있습니다. 일반 사용자 토큰은 전역 API 설정 또는 적용된 권한 그룹의 API 수정 권한을 만족해야 합니다.

같은 `code`가 여러 도메인에 존재할 수 있으므로, 필요하면 `?domain=go.example.com` 쿼리 또는 JSON body의 `domain` 필드로 수정할 링크의 도메인을 지정하세요. 생략하면 현재 요청 도메인 또는 사이트 기본 도메인 기준으로 조회합니다.

`PUT`은 웹 편집 폼과 같은 전체 수정 요청입니다. `url`은 필수이고, 기존 미리보기, 태그, 만료일, 클릭 제한, 라우팅 값을 유지하려면 유지할 필드도 함께 보내야 합니다. 생략된 필드는 빈 폼 입력처럼 처리되어 해당 값을 비웁니다. UTM 필드는 값이 있을 때만 `url`에 합쳐집니다.

`PATCH`는 이미 존재하는 링크만 부분 수정합니다. `{code}`에 해당하는 링크가 없으면 `404`를 반환합니다. 요청 본문에 지정하지 않은 필드는 기존값을 유지하고, 지정한 필드만 기존 링크에 merge됩니다. 값을 지우려면 해당 필드를 명시적으로 빈 문자열, `0`, 빈 배열 등으로 보내세요. 비밀번호는 `password`가 비어 있으면 기존 값을 유지하고, 제거하려면 `clearPassword`를 `true`로 보내야 합니다.

요청 본문:

```json
{
  "url": "https://example.com/updated",
  "previewTitle": "수정된 제목",
  "previewDescription": "수정된 설명",
  "previewImageUrl": "",
  "themeColor": "#111827",
  "tags": "ads, update",
  "utmSource": "newsletter",
  "utmMedium": "email",
  "utmCampaign": "launch",
  "utmTerm": "",
  "utmContent": "",
  "expiresAt": "",
  "maxClicks": "0",
  "redirectRules": []
}
```

PUT 예시:

```bash
curl -X PUT http://localhost:5173/api/links/hello \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/updated",
    "previewTitle": "Updated",
    "previewDescription": "",
    "previewImageUrl": "",
    "themeColor": "#111827",
    "tags": "",
    "utmSource": "newsletter",
    "utmMedium": "email",
    "utmCampaign": "launch",
    "expiresAt": "",
    "maxClicks": "0",
    "redirectRules": []
  }'
```

PATCH 예시:

```bash
curl -X PATCH http://localhost:5173/api/links/hello \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "previewTitle": "Updated",
    "tags": "ads, update",
    "redirectRules": [
      {
        "longUrl": "https://example.com/mobile",
        "conditions": [{ "type": "device", "matchValue": "mobile" }]
      },
      {
        "longUrl": "https://example.com/variant",
        "conditions": [{ "type": "percentage", "matchValue": "25" }]
      }
    ]
  }'
```

성공 시 수정된 링크를 반환합니다.

## 링크 통계

```http
GET /api/links/{code}
```

단축 코드의 클릭 통계를 반환합니다. 일반 사용자 토큰은 본인이 만든 링크의 통계만 볼 수 있고, 관리자 토큰은 전체 링크를 볼 수 있습니다.

도메인별로 같은 `code`가 있을 수 있으므로 `GET /api/links/{code}?domain=go.example.com` 형식으로 조회할 도메인을 지정할 수 있습니다. 생략하면 현재 요청 도메인 또는 사이트 기본 도메인 기준으로 조회합니다.

```bash
curl http://localhost:5173/api/links/hello \
  -H "Authorization: Bearer $TOKEN"
```

응답:

```json
{
  "link": {
    "id": 1,
    "code": "hello",
    "domain": "go.example.com",
    "url": "https://example.com/path",
    "preview": {
      "title": "",
      "description": "",
      "imageUrl": "",
      "themeColor": ""
    },
    "created_at": "2026-06-10T00:00:00.000Z",
    "clicks": 2,
    "last_clicked_at": "2026-06-10T00:10:00.000Z",
    "click_events": [
      {
        "created_at": "2026-06-10T00:10:00.000Z",
        "ip": "203.0.113.10",
        "browser": "Chrome",
        "user_agent": "Mozilla/5.0",
        "referer": "https://example.org",
        "details": []
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "totalItems": 2,
      "totalPages": 1
    },
    "short_url": "https://go.example.com/hello"
  }
}
```

비관리자 응답에서는 IP가 해시 처리될 수 있습니다. `details`는 활성화된 클릭 메타데이터 플러그인의 표시 결과입니다.

## 링크 삭제

단일 링크 삭제:

```http
DELETE /api/links/{code}
```

```bash
curl -X DELETE http://localhost:5173/api/links/hello \
  -H "Authorization: Bearer $TOKEN"
```

도메인별 slug를 구분해야 하면 `DELETE /api/links/hello?domain=go.example.com`처럼 `domain` query를 지정하세요.

여러 링크 삭제:

```http
DELETE /api/links
Content-Type: application/json
```

```bash
curl -X DELETE http://localhost:5173/api/links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"codes":["hello","docs"]}'
```

bulk 삭제 본문은 다음 형태를 지원합니다.

```json
{ "codes": ["hello", "docs"] }
```

```json
{ "singleCode": "hello" }
```

bulk 삭제에서 모든 `codes`에 같은 도메인을 적용하려면 body 또는 query에 `domain`을 함께 보낼 수 있습니다. 웹 폼과 같은 `links`/`singleLink` 값도 지원하며, 이 값은 `"{domain}\t{code}"` 형식입니다.

일반 사용자 토큰은 전역 API 설정 또는 적용된 권한 그룹에서 API 삭제가 허용되어 있어야 하며, 링크 삭제 정책도 통과해야 합니다. 즉, 사용자 본인 링크 삭제가 허용되어 있고 클릭 수 제한을 넘지 않은 본인 링크만 삭제할 수 있습니다. 관리자 토큰은 이 제한을 우회합니다.

성공 응답:

```json
{
  "ok": true,
  "message": "1개 링크를 삭제했습니다.",
  "result": {
    "requested": 1,
    "deleted": 1,
    "notFound": 0,
    "denied": 0,
    "disabled": 0,
    "tooManyClicks": 0
  }
}
```

삭제 가능한 링크가 없으면 `403`과 처리 결과를 반환합니다. 존재하지 않는 코드도 삭제 API에서는 `result.notFound`에 포함됩니다.

## 토큰 관리 API

토큰 관리 엔드포인트는 Bearer 토큰이 아니라 로그인 세션을 사용합니다. 일반 API 클라이언트에서는 `/account/api-tokens` 화면에서 토큰을 발급하는 방식이 가장 단순합니다.

현재 로그인 사용자의 토큰 목록:

```http
GET /api/tokens
```

토큰 발급:

```http
POST /api/tokens
Content-Type: application/json
```

```json
{ "name": "CI deploy token" }
```

응답의 `token` 값은 발급 시 한 번만 표시됩니다.

```json
{
  "token": "slk_replace_with_issued_token",
  "record": {
    "id": 1,
    "name": "CI deploy token",
    "prefix": "slk_abc12345",
    "created_at": "2026-06-10T00:00:00.000Z",
    "last_used_at": null
  }
}
```

토큰 폐기:

```http
DELETE /api/tokens
Content-Type: application/json
```

```json
{ "id": 1 }
```

응답:

```json
{ "ok": true }
```

## 에러 응답

일반적인 에러 응답은 `message` 필드를 포함합니다.

```json
{
  "message": "유효한 API 토큰이 필요합니다."
}
```

자주 쓰이는 상태 코드는 다음과 같습니다.

| 상태  | 의미                                                                |
| ----- | ------------------------------------------------------------------- |
| `400` | JSON 본문, URL, 코드, 미리보기 또는 링크 옵션 값이 올바르지 않음    |
| `401` | Bearer 토큰이 없거나 유효하지 않음                                  |
| `403` | API 기능 비활성화, 권한 그룹 규칙 차단, 소유자 아님, 삭제 정책 차단 |
| `404` | 조회 또는 수정 대상 링크를 찾을 수 없음                             |
| `429` | 속도 제한 플러그인 규칙 초과                                        |
