# 규칙 기반 리다이렉트

규칙 기반 리다이렉트는 링크의 기본 목적지 URL 대신, 요청 조건에 맞는 다른 목적지 URL로 보내는 기능입니다. 규칙은 링크의 `redirectRules` 값에 JSON 배열로 저장됩니다.

## 기본 구조

```json
[
  {
    "longUrl": "https://example.com/mobile",
    "conditions": [{ "type": "device", "matchValue": "mobile" }]
  },
  {
    "longUrl": "https://example.com/ko",
    "conditions": [{ "type": "language", "matchValue": "ko" }]
  }
]
```

각 규칙은 다음 필드를 사용합니다.

| 필드         | 설명                                                     |
| ------------ | -------------------------------------------------------- |
| `longUrl`    | 조건이 맞을 때 사용할 목적지 URL                         |
| `url`        | `longUrl` 대신 사용할 수 있는 호환 필드                  |
| `conditions` | 조건 배열. 한 규칙 안의 모든 조건이 맞아야 규칙이 적용됨 |

규칙 배열은 위에서 아래로 평가됩니다. 가장 먼저 모든 조건을 만족한 규칙 하나가 적용되고, 어떤 규칙도 맞지 않으면 링크의 기본 URL로 이동합니다.

제한:

- 규칙은 최대 20개까지 저장됩니다.
- 한 규칙의 조건은 최대 12개까지 저장됩니다.
- 한 규칙 안의 조건들은 AND 조건입니다.
- OR 조건이 필요하면 같은 목적지 또는 다른 목적지를 가진 규칙을 여러 개 만드세요.
- `longUrl`은 일반 링크 URL과 같은 정규화 및 허용 scheme 검사를 받습니다.

## API 입력 위치

JSON API에서는 `redirectRules`를 top-level 필드로 보낼 수 있습니다.

```json
{
  "url": "https://example.com/default",
  "redirectRules": [
    {
      "longUrl": "https://example.com/mobile",
      "conditions": [{ "type": "device", "matchValue": "mobile" }]
    }
  ]
}
```

또는 `routing.redirectRules`로 보낼 수도 있습니다.

```json
{
  "url": "https://example.com/default",
  "routing": {
    "redirectRules": [
      {
        "longUrl": "https://example.com/mobile",
        "conditions": [{ "type": "device", "matchValue": "mobile" }]
      }
    ]
  }
}
```

관리자 UI의 링크 옵션에서는 같은 JSON 배열을 textarea에 입력합니다.

## 조건 공통 필드

각 조건은 다음 필드를 사용합니다.

| 필드         | 설명                                        |
| ------------ | ------------------------------------------- |
| `type`       | 조건 타입                                   |
| `matchKey`   | 조건에 따라 필요한 키. 주로 query parameter |
| `matchValue` | 조건에 따라 필요한 값                       |

`type`은 소문자로 정규화됩니다. `matchKey`는 최대 120자, `matchValue`는 최대 300자까지 사용됩니다.

## `device`

요청 기기가 지정한 값과 맞으면 적용됩니다.

```json
{
  "type": "device",
  "matchValue": "mobile"
}
```

사용 가능한 값:

| 값         | 의미               |
| ---------- | ------------------ |
| `android`  | Android            |
| `ios`      | iPhone, iPad, iPod |
| `mobile`   | 모바일 기기        |
| `windows`  | Windows            |
| `linux`    | Linux              |
| `macos`    | macOS              |
| `chromeos` | ChromeOS           |
| `desktop`  | 데스크탑 계열 기기 |

판별에는 `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`, `User-Agent`가 사용됩니다. Client Hints가 없는 경우에도 User-Agent 기반으로 최대한 판별합니다.

## `language`

요청의 `Accept-Language` 헤더가 지정한 언어와 맞으면 적용됩니다.

```json
{
  "type": "language",
  "matchValue": "ko"
}
```

동작:

- `_`는 `-`로 정규화됩니다.
- `ko`처럼 2글자 언어 코드는 `ko`와 `ko-KR` 모두에 매칭됩니다.
- `ko-KR`처럼 전체 locale을 지정하면 정확히 `ko-KR`에만 매칭됩니다.
- `Accept-Language`의 `q` 가중치는 순서 판단에 사용하지 않습니다.
- 와일드카드 `*`는 무시됩니다.

## `query-param`

요청 URL의 query parameter가 지정한 값과 정확히 같으면 적용됩니다.

```json
{
  "type": "query-param",
  "matchKey": "campaign",
  "matchValue": "summer"
}
```

예를 들어 `?campaign=summer` 요청에 매칭됩니다. 같은 key가 여러 번 있는 경우, 그중 하나라도 `matchValue`와 같으면 매칭됩니다.

`matchKey`와 `matchValue`가 모두 필요합니다.

## `any-query-param`

요청 URL에 지정한 query parameter key가 존재하면 적용됩니다. 값은 확인하지 않습니다.

```json
{
  "type": "any-query-param",
  "matchKey": "preview"
}
```

`?preview`, `?preview=1`, `?preview=false` 모두 매칭됩니다.

`matchKey`가 필요합니다. `matchValue`는 사용하지 않습니다.

## `valueless-query-param`

요청 URL에 지정한 query parameter key가 있고, 값이 비어 있으면 적용됩니다.

```json
{
  "type": "valueless-query-param",
  "matchKey": "debug"
}
```

`?debug` 또는 `?debug=`에 매칭됩니다. `?debug=1`에는 매칭되지 않습니다.

`matchKey`가 필요합니다. `matchValue`는 사용하지 않습니다.

## `ip`

요청 IP가 지정한 패턴과 맞으면 적용됩니다.

```json
{
  "type": "ip",
  "matchValue": "203.0.113.0/24"
}
```

지원 형식:

| 형식           | 예시                 |
| -------------- | -------------------- |
| IPv4 정확 매칭 | `203.0.113.10`       |
| IPv6 정확 매칭 | `2001:db8::10`       |
| IPv4 wildcard  | `203.0.113.*`        |
| IPv4 CIDR      | `203.0.113.0/24`     |
| IPv6 CIDR      | `2001:db8:1234::/48` |

요청 IP는 서비스의 클라이언트 IP 판별 설정을 따릅니다. 프록시 환경에서는 관리자 패널의 proxy header 신뢰 설정에 따라 실제 매칭 IP가 달라질 수 있습니다.

## `geo-country`

GeoIP2 국가 코드가 지정한 값과 맞으면 적용됩니다.

```json
{
  "type": "geo-country",
  "matchValue": "jp"
}
```

`matchValue`는 국가 코드 기준입니다. 예를 들어 일본은 `jp`, 한국은 `kr`, 미국은 `us`를 사용합니다. 비교는 대소문자를 구분하지 않습니다.

이 조건을 사용하려면 관리자 패널에서 GeoIP2 사용이 활성화되어 있어야 합니다. GeoIP2가 비활성화되어 있거나 국가 코드를 얻지 못한 요청은 매칭되지 않습니다.

## `geo-city`

GeoIP2 도시명이 지정한 값과 맞으면 적용됩니다.

```json
{
  "type": "geo-city",
  "matchValue": "Tokyo"
}
```

도시명 비교는 대소문자를 구분하지 않지만, 문자열은 정확히 같아야 합니다. GeoIP2가 비활성화되어 있거나 도시명을 얻지 못한 요청은 매칭되지 않습니다.

## `percentage`

요청마다 지정한 확률로 적용됩니다.

```json
{
  "type": "percentage",
  "matchValue": "25"
}
```

`matchValue`는 `0`보다 크고 `100` 이하인 숫자여야 합니다. 저장 시 정수로 반올림됩니다.

주의:

- 이 조건은 사용자나 세션에 고정되지 않습니다.
- 같은 사용자가 여러 번 접근해도 요청마다 다시 확률 계산을 합니다.
- 안정적인 A/B 테스트 그룹 고정이 필요한 경우 별도의 식별자 기반 조건이 필요합니다.

## 여러 조건 조합

한 규칙 안의 조건은 모두 만족해야 합니다.

```json
[
  {
    "longUrl": "https://example.com/jp-mobile",
    "conditions": [
      { "type": "geo-country", "matchValue": "jp" },
      { "type": "device", "matchValue": "mobile" }
    ]
  }
]
```

위 규칙은 일본으로 판별되고 모바일 기기인 요청에만 적용됩니다.

OR 조건은 규칙을 나누어 표현합니다.

```json
[
  {
    "longUrl": "https://example.com/mobile",
    "conditions": [{ "type": "device", "matchValue": "android" }]
  },
  {
    "longUrl": "https://example.com/mobile",
    "conditions": [{ "type": "device", "matchValue": "ios" }]
  }
]
```

## 권한

권한 관리 플러그인이 활성화되어 있으면 규칙 기반 리다이렉트 사용 권한은 다음 항목으로 나뉩니다.

| 권한 항목              | 대상 조건                                                 |
| ---------------------- | --------------------------------------------------------- |
| `규칙 기반 리다이렉트` | `redirectRules` 전체 사용 여부                            |
| `규칙 조건: 기기`      | `device`                                                  |
| `규칙 조건: 언어`      | `language`                                                |
| `규칙 조건: 쿼리`      | `query-param`, `any-query-param`, `valueless-query-param` |
| `규칙 조건: IP`        | `ip`                                                      |
| `규칙 조건: GeoIP`     | `geo-country`, `geo-city`                                 |
| `규칙 조건: 비율`      | `percentage`                                              |

관리자는 이 제한을 우회합니다. 일반 사용자는 링크 생성 옵션과 링크 수정 옵션 양쪽에서 해당 권한을 만족해야 합니다.

## 전체 예시

```json
[
  {
    "longUrl": "https://example.com/app",
    "conditions": [{ "type": "device", "matchValue": "mobile" }]
  },
  {
    "longUrl": "https://example.com/ja",
    "conditions": [{ "type": "language", "matchValue": "ja" }]
  },
  {
    "longUrl": "https://example.com/campaign",
    "conditions": [
      {
        "type": "query-param",
        "matchKey": "utm_campaign",
        "matchValue": "launch"
      },
      { "type": "percentage", "matchValue": "50" }
    ]
  },
  {
    "longUrl": "https://example.com/internal",
    "conditions": [{ "type": "ip", "matchValue": "10.0.0.0/8" }]
  }
]
```

평가 순서:

1. 모바일이면 `/app`으로 이동합니다.
2. 모바일이 아니고 언어가 일본어이면 `/ja`로 이동합니다.
3. 앞 조건이 맞지 않고 `utm_campaign=launch`이며 확률 조건을 통과하면 `/campaign`으로 이동합니다.
4. 앞 조건이 맞지 않고 IP가 `10.0.0.0/8` 범위이면 `/internal`로 이동합니다.
5. 어떤 규칙도 맞지 않으면 링크의 기본 URL로 이동합니다.
