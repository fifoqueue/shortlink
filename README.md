# Shortlink

Svelte 5와 SvelteKit으로 만든 자체 호스팅 단축 링크 서비스입니다. 링크, 사용자, 설정, 클릭 통계는 PostgreSQL에 저장하고, 서버는 SvelteKit adapter-node 결과물로 실행합니다.

## 요구 사항

- Node.js 24.0.0 이상
- Yarn 4.16.0. 이 레포지토리는 `packageManager`와 `.yarn/releases`를 포함합니다.
- PostgreSQL. 부분 검색 성능을 위해 `pg_trgm` 확장 설치를 권장합니다.

처음 클론한 환경에서는 Corepack을 켜두는 것이 가장 단순합니다.

```bash
corepack enable
```

## 빠른 시작

1. 레포지토리를 클론하고 의존성을 설치합니다.

```bash
git clone <repo-url>
cd shortlink-sveltekit
yarn install
```

2. PostgreSQL에 데이터베이스와 사용자를 만듭니다.

```sql
CREATE USER shortlink WITH PASSWORD 'replace-this-password';
CREATE DATABASE shortlink OWNER shortlink;
```

3. 환경 파일을 만들고 값을 수정합니다.

```bash
cp .env.example .env
```

최소한 `DATABASE_URL`과 `AUTH_SESSION_SECRET`은 실제 값으로 바꿔야 합니다.

```dotenv
DATABASE_URL=postgres://shortlink:password@localhost:5432/shortlink
DATABASE_SSL=false
DATABASE_LOGGING=false
DATABASE_SYNC_ALTER=false
PRIVATE_BASE_URL=
HOST=127.0.0.1
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
```

4. 개발 서버를 실행합니다.

```bash
yarn dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 아직 사용자가 없으면 `/admin` 접근 시 `/signup`으로 이동하며, 첫 번째 가입 계정이 관리자가 됩니다.

개발 서버 포트나 바인딩 주소는 Vite 옵션으로 지정합니다.

```bash
yarn dev -- --host 0.0.0.0 --port 3000
```

`.env`의 `HOST`와 `PORT`는 빌드된 Node 서버용입니다. Vite 개발 서버 주소를 바꾸려면 위처럼 CLI 옵션을 사용하세요.

## 환경 변수

| 이름                                   | 필수   | 설명                                                                                                                                         |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                         | 예     | PostgreSQL 연결 문자열입니다.                                                                                                                |
| `AUTH_SESSION_SECRET`                  | 예     | 로그인 세션 쿠키 서명에 사용합니다. 충분히 긴 임의 문자열을 사용하세요.                                                                      |
| `DATABASE_SSL`                         | 아니오 | `true`이면 PostgreSQL TLS 인증서를 검증합니다. 사설 CA는 `NODE_EXTRA_CA_CERTS`로 지정합니다.                                                 |
| `DATABASE_LOGGING`                     | 아니오 | `true`이면 Sequelize SQL 로그를 출력합니다.                                                                                                  |
| `DATABASE_POOL_MAX`                    | 아니오 | Sequelize PostgreSQL connection pool 최대 연결 수입니다. 기본값은 `10`입니다.                                                                |
| `DATABASE_POOL_MIN`                    | 아니오 | Sequelize PostgreSQL connection pool 최소 연결 수입니다. 기본값은 `0`입니다.                                                                 |
| `DATABASE_POOL_ACQUIRE_MS`             | 아니오 | pool에서 연결을 얻기 위해 기다리는 최대 시간입니다. 기본값은 `30000`ms입니다.                                                                |
| `DATABASE_POOL_IDLE_MS`                | 아니오 | 유휴 DB 연결을 닫기 전 대기 시간입니다. 기본값은 `10000`ms입니다.                                                                            |
| `DATABASE_PGBOUNCER`                   | 아니오 | `true`이면 별도 `DATABASE_POOL_MAX`가 없을 때 앱 pool 기본 최대값을 PgBouncer 앞단에 맞춰 `2`로 낮춥니다.                                    |
| `DATABASE_APPLICATION_NAME`            | 아니오 | PostgreSQL connection에 표시할 application name입니다.                                                                                       |
| `DATABASE_STATEMENT_TIMEOUT_MS`        | 아니오 | PostgreSQL statement timeout입니다. `0`이면 설정하지 않습니다.                                                                               |
| `DATABASE_IDLE_TRANSACTION_TIMEOUT_MS` | 아니오 | PostgreSQL idle-in-transaction timeout입니다. `0`이면 설정하지 않습니다.                                                                     |
| `DATABASE_SYNC_ALTER`                  | 아니오 | `true`이면 시작 시 Sequelize가 모델 기준으로 기존 테이블 ALTER를 시도합니다. 기본값은 빠른 시작을 위해 `false`입니다.                        |
| `REDIS_URL`                            | 아니오 | Redis 연결 문자열입니다. 이전 Redis 클릭 큐의 잔여 이벤트를 처리할 때 사용합니다.                                                            |
| `REDIS_KEY_PREFIX`                     | 아니오 | Redis key/channel prefix입니다. 기본값은 `shortlink`입니다.                                                                                  |
| `CLICK_QUEUE_BACKEND`                  | 아니오 | 새 클릭은 항상 PostgreSQL에 커밋합니다. 기본값은 `postgres`이며, 이전 버전의 Redis Streams 잔여 이벤트를 처리할 동안만 `redis`를 유지합니다. |
| `CLICK_QUEUE_DB_BATCH_SIZE`            | 아니오 | PostgreSQL 클릭 큐에서 한 번에 조회할 최대 개수입니다. 기본값은 `250`입니다.                                                                 |
| `CLICK_QUEUE_METADATA_CONCURRENCY`     | 아니오 | 클릭 메타데이터의 동시 수집 개수입니다. 기본값은 `16`이며 DB 잠금 전에 수집합니다.                                                           |
| `CLICK_QUEUE_FLUSH_MS`                 | 아니오 | 클릭 접수 후 큐 처리 시작까지의 대기 시간입니다. 기본값은 `10`ms입니다. 접수 자체는 리다이렉트 전에 DB에 커밋합니다.                         |
| `CLICK_QUEUE_HEADER_BYTES`             | 아니오 | 클릭 메타데이터 수집용으로 보관할 요청 헤더의 최대 바이트 수입니다. `cookie`와 `authorization`은 저장하지 않습니다. 기본값은 `4096`입니다.   |
| `CLICK_QUEUE_SHUTDOWN_DRAIN_MS`        | 아니오 | 종료 시 클릭 큐를 비우기 위해 기다리는 시간입니다. 기본값은 `2000`ms입니다.                                                                  |
| `CLICK_QUEUE_REDIS_STREAM`             | 아니오 | 이전 버전 Redis Streams 클릭 큐의 key suffix입니다. 기본값은 `click-events`입니다.                                                           |
| `CLICK_QUEUE_REDIS_GROUP`              | 아니오 | 이전 버전 Redis Streams consumer group 이름입니다. 기본값은 `shortlink-click-writers`입니다.                                                 |
| `CLICK_QUEUE_REDIS_CONSUMER`           | 아니오 | 이전 버전 Redis Streams 잔여 이벤트 처리용 consumer 이름입니다. 비우면 프로세스별 이름을 자동 생성합니다.                                    |
| `ANALYTICS_CLICKHOUSE_URL`             | 아니오 | ClickHouse HTTP endpoint입니다. 설정하면 클릭 이벤트를 ClickHouse에도 배치 적재합니다.                                                       |
| `ANALYTICS_CLICKHOUSE_DATABASE`        | 아니오 | ClickHouse database 이름입니다. 비우면 ClickHouse 기본 database를 사용합니다.                                                                |
| `ANALYTICS_CLICKHOUSE_TABLE`           | 아니오 | ClickHouse 클릭 이벤트 테이블 이름입니다. 기본값은 `shortlink_click_events`입니다.                                                           |
| `ANALYTICS_CLICKHOUSE_USERNAME`        | 아니오 | ClickHouse HTTP basic auth 사용자명입니다.                                                                                                   |
| `ANALYTICS_CLICKHOUSE_PASSWORD`        | 아니오 | ClickHouse HTTP basic auth 비밀번호입니다.                                                                                                   |
| `ANALYTICS_CLICKHOUSE_AUTO_CREATE`     | 아니오 | `false`가 아니면 ClickHouse 테이블을 자동 생성합니다. 기본값은 `true`입니다.                                                                 |
| `ANALYTICS_CLICKHOUSE_BATCH_SIZE`      | 아니오 | 전송 worker가 예약할 이벤트 수입니다. 기본값은 `1000`, 최대 `10000`입니다.                                                                   |
| `ANALYTICS_CLICKHOUSE_TIMEOUT_MS`      | 아니오 | 런타임 전송과 backfill의 HTTP 요청 제한 시간입니다. 기본값은 `10000`ms입니다.                                                                |
| `PRIVATE_BASE_URL`                     | 아니오 | 생성되는 단축 URL의 공개 base URL입니다. 리버스 프록시 뒤 운영 시 실제 공개 주소를 넣으세요.                                                 |
| `HOST`                                 | 아니오 | 빌드된 adapter-node 서버의 bind host입니다. 기본 예시는 `127.0.0.1`입니다.                                                                   |
| `PORT`                                 | 아니오 | 빌드된 adapter-node 서버 포트입니다. 설정하지 않으면 adapter 기본값을 사용합니다.                                                            |
| `ORIGIN`                               | 아니오 | SvelteKit adapter-node가 요청 origin을 판단할 때 쓰는 공개 origin입니다. 운영에서는 `https://go.example.com`처럼 실제 주소를 권장합니다.     |
| `WEB_CONCURRENCY`                      | 아니오 | `yarn start:cluster`에서 띄울 Node worker 수입니다. 비우면 CPU parallelism 기준으로 자동 결정합니다.                                         |

## 관리자 패널

관리자는 `/admin`에서 다음 영역을 설정합니다.

- 사이트: 공개 범위, 브랜드 문구, SEO, 법적 문서
- 링크 및 API: 커스텀 코드 길이, 자동 코드 길이, 클릭 추적, 리다이렉트 상태, API 기능
- 보안: 회원 가입/비밀번호 정책, 이메일 인증, web action guard, CSRF 방지 토큰, 프록시 IP 신뢰, GeoIP, 목적지 URL 안전 설정
- 테마: 프리셋, 라이트/다크/시스템 모드, 색상 토큰, radius, 글꼴, 커스텀 CSS
- 플러그인: CAPTCHA, 속도 제한, OIDC SSO, 사용자 관리, 향상된 추적 등 플러그인 설정
- 링크 관리: 저장된 링크 검색, 수정, 삭제, 통계 확인

이 레포지토리가 제공하는 코어 플러그인은 `src/plugins/<plugin-id>/`에 두고, 서버별 유저 플러그인은 `src/user-plugins/<plugin-id>/`에 둡니다. 유저 플러그인은 기본적으로 git 추적에서 제외됩니다. 빌드 시점 플러그인 개발 계약은 [docs/plugin-development.md](docs/plugin-development.md)를, Docker 이미지 재빌드 없이 로드할 런타임 플러그인 ABI 설계는 [docs/runtime-plugin-abi.md](docs/runtime-plugin-abi.md)를 참고하세요.

## 리버스 프록시와 실제 IP

운영에서 앱을 Nginx, Caddy, Cloudflare 같은 프록시 뒤에 둘 때는 `HOST=127.0.0.1`로 Node 서버를 로컬에만 열고, 프록시가 외부 HTTPS를 받도록 구성하는 방식이 일반적입니다.

Nginx 예시:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Real-IP $remote_addr;
}
```

통계, CAPTCHA, 비로그인 링크 소유자 판별에 실제 클라이언트 IP를 사용하려면 관리자 패널의 `링크 및 API`에서 `리버스 프록시 IP 헤더 신뢰`를 켜고 `신뢰할 IP 헤더` 목록을 확인하세요.

기본 헤더 순서는 다음과 같습니다.

```text
Forwarded
X-Forwarded-For
X-Real-IP
CF-Connecting-IP
True-Client-IP
```

이 설정을 켜면 앱은 저장된 순서대로 헤더를 읽고, 유효한 IP가 없으면 직접 연결 주소로 되돌아갑니다. 앱이 공개 인터넷에서 직접 접근 가능한 구성에서는 클라이언트가 IP 헤더를 위조할 수 있으므로 켜지 마세요.

## 프로덕션 실행

빌드합니다.

```bash
yarn build
```

Node로 직접 실행할 수 있습니다.

```bash
ORIGIN=https://go.example.com node --env-file=.env build
```

`package.json`의 `start` 스크립트를 사용할 수도 있습니다. 이 경우 `.env`를 읽도록 별도 실행 래퍼나 process manager 설정이 필요합니다.

```bash
yarn start
```

단일 서버 안에서 Node worker를 여러 개 띄우려면 빌드 후 cluster 실행 스크립트를 사용할 수 있습니다. 이 모드에서는 `WEB_CONCURRENCY`로 worker 수를 지정하고, 각 worker가 같은 `PORT`를 공유합니다.

```bash
yarn build
WEB_CONCURRENCY=4 yarn start:cluster
```

여러 worker의 계정·권한·설정·리다이렉트 읽기는 PostgreSQL을 기준으로 합니다. 대량 트래픽 운영에서는 PostgreSQL 앞에 PgBouncer를 둘 수 있습니다. PgBouncer를 쓰는 경우 앱 쪽은 `DATABASE_PGBOUNCER=true`와 낮은 `DATABASE_POOL_MAX`를 함께 설정하세요.

이 레포지토리에는 PM2용 [ecosystem.config.cjs](ecosystem.config.cjs)가 포함되어 있습니다. 이 설정은 `build/index.js`를 실행하고, Node의 `--env-file=.env` 옵션으로 `.env`를 읽습니다.
PM2 설정에는 재시작 시 오래 대기하지 않도록 `SHUTDOWN_TIMEOUT=1`과 짧은 `kill_timeout`이 포함되어 있습니다.

```bash
yarn build
pm2 start ecosystem.config.cjs
```

코드를 갱신한 뒤에는 다시 빌드하고 PM2 프로세스를 재시작하거나 reload 하세요.

```bash
yarn build
pm2 restart ecosystem.config.cjs --update-env
```

## Docker 실행

이 레포지토리의 [Dockerfile](Dockerfile)은 SvelteKit adapter-node 산출물을 빌드한 뒤 production 의존성만 포함하는 Alpine 기반 런타임 이미지를 만듭니다. 컨테이너 프로세스는 root가 아닌 UID/GID `10001:10001`로 실행됩니다.

빌드 시점 유저 플러그인을 Docker에서 사용하려면 플러그인 소스를 `src/user-plugins/<plugin-id>/`에 둔 상태로 이미지를 빌드해야 합니다. Svelte 컴포넌트와 플러그인 모듈은 빌드 시점에 번들링되므로, 이미 빌드된 이미지에 런타임 volume으로 `src/user-plugins`만 마운트해도 새 플러그인은 적용되지 않습니다.

Docker 이미지 재빌드 없이 플러그인을 추가하려면 런타임 ABI 형식으로 빌드한 플러그인을 `/app/user-plugins/<plugin-id>/`에 마운트합니다. 이 경우 `manifest.json`과 `server.mjs`가 필요하고, `USER_PLUGIN_WATCH=true`이면 파일 변경을 주기적으로 감지합니다.

이미지를 직접 빌드하려면 다음처럼 실행합니다.

```bash
docker build -t shortlink .
```

유저 플러그인을 갱신한 뒤에는 이미지를 다시 빌드하고 컨테이너를 재생성하세요.

단독 컨테이너로 실행할 때는 PostgreSQL을 별도로 준비하고 환경 변수를 전달합니다.

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://shortlink:password@host.docker.internal:5432/shortlink \
  -e AUTH_SESSION_SECRET=replace-with-a-long-random-secret \
  -e PRIVATE_BASE_URL=https://go.example.com \
  shortlink
```

GitHub Actions workflow는 `main` 또는 `master`에 push될 때마다 `linux/amd64`, `linux/arm64` 이미지를 GHCR에 게시합니다.

```bash
docker pull ghcr.io/fifoqueue/shortlink:latest
```

PostgreSQL, PgBouncer, Redis, ClickHouse까지 포함한 예시는 [docs/docker-compose.yaml](docs/docker-compose.yaml)을 참고하세요. 샘플 compose 파일은 `../.env`를 컨테이너 환경으로 주입하므로, 처음 실행하기 전에 `AUTH_SESSION_SECRET`, `PRIVATE_BASE_URL`, `DATABASE_URL`, `REDIS_URL`, `ANALYTICS_CLICKHOUSE_URL`을 운영 환경에 맞게 바꾸세요. 이 compose 네트워크에서는 앱의 `DATABASE_URL`을 `postgres://shortlink:replace-this-password@pgbouncer:5432/shortlink`처럼 `pgbouncer`로 향하게 두고, PgBouncer의 `DB_HOST`는 실제 PostgreSQL 서비스인 `postgres`로 둡니다. 내장 PostgreSQL/ClickHouse를 쓰면 `POSTGRES_PASSWORD`/`CLICKHOUSE_PASSWORD`와 앱 연결 비밀번호도 같은 값으로 맞춰야 합니다.
샘플 compose 파일은 기본적으로 GHCR 이미지와 `/app/user-plugins` 런타임 플러그인 volume을 사용합니다. 빌드 시점 유저 플러그인을 포함한 커스텀 이미지를 쓰려면 compose 파일의 `build` 예시 주석을 참고해 로컬에서 빌드하세요.

## 데이터베이스

앱은 Sequelize 모델 기준으로 다음 테이블을 사용합니다.

- `app_settings`: 사이트 설정과 플러그인 설정
- `users`: 로컬 사용자와 관리자 여부
- `user_identities`: 인증 플러그인별 사용자 연결
- `api_tokens`: 사용자 API 토큰
- `short_links`: 단축 코드, 목적지, 소유자, 공유 메타데이터, 리다이렉트 접수 사용량
- `click_event_queue`: 커밋된 클릭 접수와 재시도 상태
- `click_events`: 클릭 시각, IP, user-agent, referer, 플러그인 메타데이터

앱 시작 후 첫 DB 접근 시 마이그레이션과 `sequelize.sync()`가 한 번 실행됩니다. 모델 기준으로 기존 테이블 ALTER까지 자동 수행해야 하는 개발 환경에서는 `DATABASE_SYNC_ALTER=true`를 설정하세요.
`pg_trgm` 확장이 설치되어 있으면 링크와 클릭 통계 부분 검색용 GIN trigram 인덱스를 자동 생성하려고 시도합니다. 확장이 없거나 권한이 부족하면 해당 인덱스 생성만 조용히 건너뜁니다.

리다이렉트는 링크의 비밀번호·만료·클릭 한도 변경을 즉시 반영하도록 PostgreSQL에서 조회하며 캐시하지 않습니다.

클릭 접수와 `maxClicks` 사용량은 동일한 PostgreSQL 트랜잭션에서 확정합니다. 여러 worker가 동시에 마지막 클릭을 요청해도 한 요청만 허용합니다. `trackClicks=false`에서도 사용량은 증가하지만 클릭 이벤트와 방문자 정보는 저장하지 않습니다. PostgreSQL 접수에 실패하면 리다이렉트를 반환하지 않습니다. 큐 소비자는 이벤트 생성과 큐 삭제를 함께 커밋하므로 재시작과 동시 처리에서 이중 집계를 방지합니다.

업그레이드 시 `redirect_count`는 기존 클릭 이벤트와 아직 처리하지 않은 PostgreSQL 큐 항목으로 초기화합니다. 이전 Redis 큐를 쓴 배포는 기존 worker를 중단한 뒤 `CLICK_QUEUE_BACKEND=redis`로 잔여 이벤트를 처리하고 트래픽을 전환하세요. 새 버전은 미확인 이벤트를 60초 후 회수하고, stream ID로 중복 처리를 막습니다. 이미 이전 버전에서 PostgreSQL 저장 후 Redis ACK 직전에 중단된 이벤트에는 원본 ID가 없어 완전한 중복 판별이 불가능합니다. 이전 메모리 큐에서 이미 유실된 이벤트와 추적을 꺼 둔 기간의 방문은 복원할 수 없습니다.

사용자 통계와 CSV 내보내기는 PostgreSQL 원본을 조회합니다. ClickHouse는 운영자용 비동기 미러이며 PostgreSQL과 원자적으로 커밋되지 않습니다. 이벤트의 전송 완료 시각과 처리 예약을 PostgreSQL에 보관하고, ClickHouse가 성공을 확인한 뒤에만 완료 처리합니다. 실패하면 자동 재시도하며, worker가 중단되면 예약 만료 후 다른 worker가 이어서 전송합니다.

`ANALYTICS_CLICKHOUSE_URL`을 설정하면 독립 worker가 PostgreSQL의 미전송 이벤트를 배치 전송합니다. HTTP 응답 대기 중에는 DB 행 잠금을 유지하지 않으며, ClickHouse 장애가 클릭 큐 소비를 막지 않습니다. 전송은 at-least-once이므로 운영자 쿼리는 `FINAL`을 사용해 재시도 중복을 제거해야 합니다. 수동으로 기존 이력을 보충하려면 `.env`를 맞춘 뒤 다음 명령을 실행하세요.

```bash
yarn backfill:clickhouse
```

Backfill은 `(event_id, link_id, created_at)`이 같은 이벤트를 건너뜁니다. `CLICKHOUSE_BACKFILL_START_ID`는 제외, `CLICKHOUSE_BACKFILL_END_ID`는 포함하는 정수 범위입니다. 큰 ID도 소수점 없는 문자열 그대로 처리합니다.

전체 재구축이 필요하면 앱 worker를 중단한 상태에서만 `CLICKHOUSE_BACKFILL_TRUNCATE=true`를 사용하세요. `START_ID=0`, `END_ID` 미설정인 전체 범위만 허용하며, PostgreSQL 연결·소스·ClickHouse 스키마 확인 후 전송 완료 표시를 초기화하고 대상 테이블을 비웁니다. 대상 URL·database·table을 변경하거나 ClickHouse 데이터를 별도로 삭제한 경우에도 전체 backfill이 필요합니다.

기존 대상 테이블은 `ReplacingMergeTree`, `ORDER BY (link_id, event_id, created_at)`, `PARTITION BY toYYYYMM(created_at)`와 문서화된 열 형식이 일치해야 합니다. 불일치하면 원본을 미전송 상태로 보존하고 오류를 냅니다. 기존 테이블을 자동 삭제하거나 변환하지 않습니다.

ClickHouse는 독립적으로 보관하는 분석 미러입니다. PostgreSQL 링크·계정 삭제를 ClickHouse에 자동 전파하지 않습니다. 원본이 삭제되기 전까지만 미전송 이벤트의 재시도를 보장하며, 미러의 보존·삭제 정책은 운영자가 별도로 관리해야 합니다. 검증 명령과 보장 범위는 [ClickHouse 연동](docs/clickhouse.md)을 참고하세요.

## API

JSON API 사용법과 현재 엔드포인트 스펙은 [docs/api.md](docs/api.md)를 참고하세요.

## 확인 명령

코드 변경 후에는 아래 순서로 확인합니다.

```bash
yarn lint
yarn build
```

`yarn lint`는 ESLint 자동 수정과 Prettier 포맷을 함께 실행하므로 작업 트리에 추가 변경이 생길 수 있습니다.

## 트랜잭션·동시성 검증

PostgreSQL을 기준으로 한 저장·잠금 경계와 테스트 명령은 [데이터 일관성 문서](docs/data-consistency.md)를 참고하세요.

성능 변경 전후 측정과 재현 명령은 [성능 검증](docs/performance.md)을 참고하세요.
