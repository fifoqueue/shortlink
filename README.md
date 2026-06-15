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

| 이름                  | 필수   | 설명                                                                                                                                     |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | 예     | PostgreSQL 연결 문자열입니다.                                                                                                            |
| `AUTH_SESSION_SECRET` | 예     | 로그인 세션 쿠키 서명에 사용합니다. 충분히 긴 임의 문자열을 사용하세요.                                                                  |
| `DATABASE_SSL`        | 아니오 | `true`이면 PostgreSQL TLS 연결을 사용합니다.                                                                                             |
| `DATABASE_LOGGING`    | 아니오 | `true`이면 Sequelize SQL 로그를 출력합니다.                                                                                              |
| `PRIVATE_BASE_URL`    | 아니오 | 생성되는 단축 URL의 공개 base URL입니다. 리버스 프록시 뒤 운영 시 실제 공개 주소를 넣으세요.                                             |
| `HOST`                | 아니오 | 빌드된 adapter-node 서버의 bind host입니다. 기본 예시는 `127.0.0.1`입니다.                                                               |
| `PORT`                | 아니오 | 빌드된 adapter-node 서버 포트입니다. 설정하지 않으면 adapter 기본값을 사용합니다.                                                        |
| `ORIGIN`              | 아니오 | SvelteKit adapter-node가 요청 origin을 판단할 때 쓰는 공개 origin입니다. 운영에서는 `https://go.example.com`처럼 실제 주소를 권장합니다. |

## 관리자 패널

관리자는 `/admin`에서 다음 영역을 설정합니다.

- 사이트: 공개 범위, 브랜드 문구, SEO, 회원 가입, 이메일 인증, 비밀번호 정책
- 링크 및 API: 커스텀 코드 길이, 자동 코드 길이, 클릭 추적, 리다이렉트 상태, URL 해시 제거, 허용 scheme, 차단 도메인, API 기능, 리버스 프록시 IP 헤더
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

PostgreSQL까지 포함한 예시는 [docs/docker-compose.yaml](docs/docker-compose.yaml)을 참고하세요. 처음 실행하기 전에 `AUTH_SESSION_SECRET`, `POSTGRES_PASSWORD`, `PRIVATE_BASE_URL`은 운영 환경에 맞게 바꾸세요.
샘플 compose 파일은 기본적으로 GHCR 이미지와 `/app/user-plugins` 런타임 플러그인 volume을 사용합니다. 빌드 시점 유저 플러그인을 포함한 커스텀 이미지를 쓰려면 compose 파일의 `build` 예시 주석을 참고해 로컬에서 빌드하세요.

## 데이터베이스

앱은 Sequelize 모델 기준으로 다음 테이블을 사용합니다.

- `app_settings`: 사이트 설정과 플러그인 설정
- `users`: 로컬 사용자와 관리자 여부
- `user_identities`: 인증 플러그인별 사용자 연결
- `api_tokens`: 사용자 API 토큰
- `short_links`: 단축 코드, 목적지, 소유자, 공유 메타데이터
- `click_events`: 클릭 시각, IP, user-agent, referer, 플러그인 메타데이터

앱 시작 후 첫 DB 접근 시 마이그레이션과 `sequelize.sync({ alter: true })`가 한 번 실행됩니다.
`pg_trgm` 확장이 설치되어 있으면 링크와 클릭 통계 부분 검색용 GIN trigram 인덱스를 자동 생성하려고 시도합니다. 확장이 없거나 권한이 부족하면 해당 인덱스 생성만 조용히 건너뜁니다.

## API

JSON API 사용법과 현재 엔드포인트 스펙은 [docs/api.md](docs/api.md)를 참고하세요.

## 확인 명령

코드 변경 후에는 아래 순서로 확인합니다.

```bash
yarn lint
yarn build
```

`yarn lint`는 ESLint 자동 수정과 Prettier 포맷을 함께 실행하므로 작업 트리에 추가 변경이 생길 수 있습니다.
