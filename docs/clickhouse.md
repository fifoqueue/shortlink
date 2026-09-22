# ClickHouse 연동

PostgreSQL이 원본이고 ClickHouse는 독립 분석 미러다. 사용자 통계·CSV는 PostgreSQL을 조회한다.

## 전송과 재시도

`click_events.clickhouse_synced_at`이 비어 있는 행을 독립 worker가 읽는다. 짧은 Sequelize 트랜잭션에서 `FOR UPDATE SKIP LOCKED`로 배치를 예약하고 `clickhouse_next_attempt_at`을 설정한 뒤 커밋한다. ClickHouse HTTP 요청은 트랜잭션 밖에서 실행한다. 성공 응답을 끝까지 확인한 경우에만 완료 시각을 기록한다.

실패하면 원본을 보존하고 최대 60초 간격으로 재시도한다. 비정상 종료로 처리 예약이 남아도 만료 후 재시도한다. 처리 예약은 HTTP 제한 시간의 5배 + 30초다. 기본값에서는 80초 후 다른 worker가 가져갈 수 있다. 재시작 후에도 미전송 상태가 남는다.

전송은 at-least-once다. ClickHouse 커밋 직후 PostgreSQL 완료 표시 전에 프로세스가 중단되면 같은 이벤트가 다시 전송될 수 있다. `ReplacingMergeTree`의 정렬 키는 `(link_id, event_id, created_at)`이며 `FINAL` 조회가 논리적 중복을 제거한다. 물리적으로 정확히 한 번 쓰거나 두 DB를 원자적으로 커밋한다고 보장하지 않는다.

HTTP 요청은 완료 후 응답, 동기 INSERT, 엄격한 입력 파싱을 강제한다. HTTP 200이어도 ClickHouse 예외 헤더·본문 또는 예상하지 못한 쓰기 응답이 있으면 실패로 처리한다. UInt64 이벤트 ID는 문자열로 전송해 JavaScript 정수 정밀도 손실을 막는다.

## 운영 설정

`.env.example`의 `ANALYTICS_CLICKHOUSE_*`를 사용한다. 사용자·비밀번호, database, table을 지원한다. 기본 배치는 1,000건, HTTP 제한 시간은 10초다. `AUTO_CREATE=false`에서는 기존 테이블을 사용하되 엔진·정렬 키·파티션·열 형식을 검증한다. 불일치하는 기존 테이블은 자동 변환하지 않는다.

대상 URL·database·table을 바꾸거나 ClickHouse를 외부에서 비우면 `yarn backfill:clickhouse`로 전체 이력을 보충한다. 완료 표시는 현재 대상에 대한 기록이며, 대상 변경을 자동 감지해 모든 과거 행을 재설정하지 않는다. 전체 TRUNCATE 재구축은 worker를 중단하고 명시적 환경 변수로 실행한다.

PostgreSQL에서 삭제한 링크·계정의 미러 데이터는 자동 삭제하지 않는다. ClickHouse의 보존·삭제 정책은 별도 관리 대상이다. 원본 행이 삭제되거나 저장소 자체가 손상되면 미전송 데이터를 이 방식으로 복구할 수 없다.

## 격리 환경 검증

테스트 전용 PostgreSQL과 ClickHouse를 준비한다. ClickHouse에는 `shortlink_test` database와 `shortlink` 사용자, `shortlink-test` 비밀번호를 사용한다. 테스트 테이블 이름은 `shortlink_click_events`이며 비어 있어야 한다. 운영 환경을 지정하지 않는다.

```bash
TEST_DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/shortlink_test TEST_CLICKHOUSE_URL=http://127.0.0.1:8123 yarn node scripts/check-invariants.mjs --clickhouse
```

검증은 인증·database 선택, 큐에서 미러까지 전송, HTTP 오류·시간 제한, 완료 표시 실패 후 재전송, 처리 예약 만료, HTTP 대기 중 DB 잠금 해제, 동시 worker, 큰 ID의 정확한 왕복, 잘못된 기존 엔진 거부를 다룬다. 생성한 테스트 테이블만 정리한다.

관련 동작: [ClickHouse HTTP](https://clickhouse.com/docs/concepts/features/interfaces/http), [ReplacingMergeTree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/replacingmergetree).
