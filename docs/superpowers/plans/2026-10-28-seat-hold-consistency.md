# 좌석 선점 정합성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redis 선점과 DB 상태의 어긋남을 없애고, 예약·결제 흐름의 권한·트랜잭션·멱등성을 보강한 뒤 실제 MySQL·Redis 테스트로 검증한다.

**Architecture:** 선점 여부의 기준은 Redis 키 `seat:hold:{seatId}`(값=userId, TTL)이다. DB `Seat.status`는 `AVAILABLE`/`SOLD`만 확정 상태로 쓰고, 좌석 조회 시 Redis 키가 살아 있는 `AVAILABLE` 좌석만 `HOLDING`으로 응답한다. 확정·취소는 Prisma `$transaction`으로 묶는다.

**Tech Stack:** NestJS 10, Prisma 5(MySQL), ioredis 6, Jest + ts-jest + supertest (e2e)

**Spec:** `docs/superpowers/specs/2026-10-28-seat-hold-consistency-design.md`

## Global Constraints

- 개발용 DB/Redis를 건드리지 않는다: 테스트는 DB명이 `_test`로 끝나는 `ticketing_test`, Redis DB 번호 `15`만 사용한다. 이 조건이 아니면 테스트 시작 시 즉시 실패시킨다.
- 기존 API 경로와 응답 필드는 유지한다. (`POST /seats/:id/hold`, `DELETE /seats/:id/hold`, `GET /concerts/:id/seats`, `POST /reservations`, `POST /reservations/:id/confirm|cancel`, `POST /payments`)
- 선점 TTL 기본값 300초. 환경변수 `SEAT_HOLD_TTL_SECONDS`로 덮어쓸 수 있고 호출 시점에 읽는다.
- Redis 접속은 `REDIS_HOST`(기본 localhost), `REDIS_PORT`(기본 6379), `REDIS_DB`(기본 0)로 설정한다.
- 대기열·정산·부하·프런트엔드는 범위 밖이다.

## Review Focus

- 존재하지 않는 `seatId`로 선점 → 500이 아니라 404. (Task 2)
- 숫자가 아닌 id(`/seats/abc/hold`, `/reservations/abc/confirm`) → 500이 아니라 400. (Task 2, 3)
- 선점 TTL 만료 후 같은 사용자가 확정 → 409, 다른 사용자가 선점 → 성공. (Task 3)
- 같은 사용자가 같은 좌석에 예약을 두 번 요청 → 중복 생성이 아니라 기존 PENDING 예약 반환. (Task 3)
- `dto.concertId`와 좌석의 실제 `concertId`가 다른 예약 요청 → 400. (Task 3)

---

## File Structure

- `backend/src/redis/redis.module.ts` — 환경변수 기반 접속 설정
- `backend/src/seats/seats.service.ts` — 선점/해제/조회. Redis 기준 상태 계산
- `backend/src/seats/seats.controller.ts` — id 파라미터 `ParseIntPipe`
- `backend/src/reservations/reservations.service.ts`, `reservations.controller.ts` — 소유자 검사, 트랜잭션, 멱등성
- `backend/src/payments/payments.service.ts`, `payments.controller.ts` — 소유자·금액 검사, 멱등성
- `backend/test/` — e2e 설정(`jest-e2e.json`, `setup.ts`, `helpers.ts`)과 `seats.e2e-spec.ts`, `reservations.e2e-spec.ts`, `payments.e2e-spec.ts`, `concurrency.e2e-spec.ts`
- `backend/.env.test` — 테스트 전용 설정 (git 제외 확인 후 `.env.test.example`만 커밋)
- `docs/verification/2026-10-28-seat-hold-verification.md` — 실행 결과 기록

---

### Task 1: 테스트 인프라와 Redis 설정

**Files:**
- Modify: `backend/package.json`, `backend/src/redis/redis.module.ts`
- Create: `backend/test/jest-e2e.json`, `backend/test/setup.ts`, `backend/test/helpers.ts`, `backend/.env.test.example`

**Interfaces:**
- Produces (`test/helpers.ts`):
  - `createTestApp(): Promise<INestApplication>` — `AppModule`로 앱을 만들고 `init()`
  - `resetState(app: INestApplication): Promise<void>` — 테스트 DB 5개 테이블 비우기(자식 테이블부터)와 `redis.flushdb()`
  - `seedConcert(app, seatCount?: number): Promise<{ concertId: number; seatIds: number[] }>` — 기본 5석, `ON_SALE`
  - `signupAndLogin(app, n: number): Promise<{ userId: number; token: string }>` — `user{n}@test.com`
  - `closeApp(app): Promise<void>` — redis `quit()`, prisma 연결 해제, `app.close()`
- 모든 e2e 스펙이 위 함수를 사용한다.

- [ ] **Step 1: 개발 의존성 설치** — `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `@nestjs/testing`, `dotenv`를 devDependencies로 추가하고 scripts에 `"test:e2e": "jest --config test/jest-e2e.json --runInBand"`를 넣는다.
- [ ] **Step 2: `RedisModule`이 `REDIS_HOST`/`REDIS_PORT`/`REDIS_DB`를 읽도록 수정**
- [ ] **Step 3: `test/setup.ts`** — `.env.test`를 로드하고, `DATABASE_URL`의 DB명이 `_test`로 끝나지 않거나 `REDIS_DB`가 `15`가 아니면 `throw`한다. jest `setupFiles`로 등록.
- [ ] **Step 4: `.env.test.example` 작성** (`DATABASE_URL`은 개발용 계정 형식에서 DB명만 `ticketing_test`, JWT 시크릿 두 개, `REDIS_DB=15`, `SEAT_HOLD_TTL_SECONDS=300`). 실제 `.env.test`를 만들고 `.gitignore`에 포함됐는지 확인한다.
- [ ] **Step 5: 테스트 DB 생성** — Run: `cd backend; $env:DATABASE_URL=<.env.test 값>; npx prisma db push --skip-generate` / Expected: `ticketing_test`에 스키마 생성 성공
- [ ] **Step 6: 스모크 테스트 `test/smoke.e2e-spec.ts` 작성** — 가드가 개발 DB 설정에서 던지는지는 수동 확인하고, 스펙은 `createTestApp` → `GET /concerts/1/seats`가 200 `[]` 임을 단언한다.
- [ ] **Step 7: 실행** — Run: `npm run test:e2e` / Expected: smoke PASS
- [ ] **Step 8: Commit** — `git add backend/package.json backend/package-lock.json backend/src/redis backend/test backend/.env.test.example` → `chore: add e2e test infrastructure with isolated DB and Redis`

---

### Task 2: 좌석 선점·해제·조회

**Files:**
- Modify: `backend/src/seats/seats.service.ts`, `backend/src/seats/seats.controller.ts`
- Test: `backend/test/seats.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 helpers
- Produces (`SeatsService`):
  - `hold(seatId: number, userId: number): Promise<SeatView>`
  - `cancelHold(seatId: number, userId: number): Promise<SeatView>`
  - `findByConcert(concertId: number): Promise<SeatView[]>`
  - `getHolder(seatId: number): Promise<number | null>` — Task 3, 4가 사용하는 Redis 선점자 조회
  - `releaseHold(seatId: number, userId: number): Promise<void>` — 값이 `userId`일 때만 삭제(원자적)
  - `SeatView` = Prisma `Seat` + `status`가 계산된 값, `heldBy`는 선점자 id 또는 null
- Redis 키: `seat:hold:${seatId}`, 값 `String(userId)`, TTL=`Number(process.env.SEAT_HOLD_TTL_SECONDS ?? 300)`

테스트 (이름과 단언):
- [ ] **Step 1: 실패하는 테스트 작성** `seats.e2e-spec.ts`
  - `hold: 첫 요청 200/201, 조회 시 해당 좌석 status=HOLDING, heldBy=userId`
  - `hold: 다른 사용자가 같은 좌석 → 409`
  - `hold: 같은 사용자 재요청 → 성공(멱등), 조회 결과 동일`
  - `hold: DB가 SOLD인 좌석 → 409`
  - `hold: 없는 seatId → 404`, `hold: /seats/abc/hold → 400`
  - `TTL 만료 후 조회 → status=AVAILABLE` (`SEAT_HOLD_TTL_SECONDS=1`, 1.5초 대기)
  - `TTL 만료 후 다른 사용자 hold 성공`
  - `cancelHold: 선점자 → 성공 후 AVAILABLE`, `타인 → 409`, `선점 없음 → 409`
  - 선점 해제의 멱등성(두 번째 `DELETE`)은 설계 8항에 없으므로 테스트하지 않는다. 두 번째 호출은 기존처럼 409.
- [ ] **Step 2: 실행해서 실패 확인** — Run: `npm run test:e2e -- seats` / Expected: 신규 케이스 FAIL
- [ ] **Step 3: 구현** — `hold`는 DB 좌석 조회(없으면 `NotFoundException`, `SOLD`면 `ConflictException`) 후 `SET NX EX`. 실패 시 현재 값이 본인이면 성공 반환, 아니면 `ConflictException`. DB에 `HOLDING`을 쓰지 않는다. `cancelHold`와 `releaseHold`는 Lua 스크립트(`if redis.call('get',k)==ARGV[1] then return redis.call('del',k) else return 0 end`)로 비교·삭제를 원자적으로 처리한다. `findByConcert`는 좌석 목록과 `MGET` 한 번으로 상태를 계산한다. 컨트롤러의 `:id`는 모두 `ParseIntPipe`.
- [ ] **Step 4: 실행해서 통과 확인** — Run: `npm run test:e2e -- seats` / Expected: PASS
- [ ] **Step 5: Commit** — `fix: derive seat hold state from Redis and make hold idempotent`

---

### Task 3: 예약 생성·확정·취소

**Files:**
- Modify: `backend/src/reservations/reservations.service.ts`, `backend/src/reservations/reservations.controller.ts`
- Test: `backend/test/reservations.e2e-spec.ts`

**Interfaces:**
- Consumes: `SeatsService.getHolder`, `SeatsService.releaseHold` (Task 2) — `SeatsModule`이 export 하도록 수정
- Produces:
  - `create(userId: number, dto: CreateReservationDto): Promise<Reservation>`
  - `confirm(id: number, userId: number): Promise<Reservation>`
  - `cancel(id: number, userId: number): Promise<Reservation>`
  - 컨트롤러는 `req.user.userId`를 넘기고 `:id`는 `ParseIntPipe`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `create: 선점자 본인 → 201, PENDING`
  - `create: 선점하지 않은 좌석 → 403`, `타인이 선점한 좌석 → 403`
  - `create: 같은 사용자가 두 번 → 같은 reservation id 반환, DB 행 1개`
  - `create: dto.concertId가 좌석의 concertId와 다름 → 400`
  - `confirm: 소유자 → CONFIRMED, 좌석 DB status=SOLD, Redis 키 삭제`
  - `confirm: 두 번 호출 → 둘 다 성공, 결과 동일, 좌석 SOLD 유지`
  - `confirm: 타인 → 403`, `없는 id → 404`, `/reservations/abc/confirm → 400`
  - `confirm: 선점 TTL 만료 후 → 409` (`SEAT_HOLD_TTL_SECONDS=1`)
  - `confirm 후 TTL보다 오래 기다려도 다른 사용자의 hold → 409` (SOLD 좌석 재선점 방지)
  - `cancel: 소유자 → CANCELLED, 좌석 AVAILABLE, 선점 키 삭제`, `두 번 호출 → 동일 결과`, `타인 → 403`
  - `cancel 후 다른 사용자 hold 성공, 이전 소유자의 confirm → 409`
  - `confirm 트랜잭션 실패 시 롤백`: `prisma.seat.update`를 한 번 실패하도록 `jest.spyOn`한 뒤 reservation이 PENDING 그대로, 좌석이 SOLD가 아님을 확인
- [ ] **Step 2: 실행해서 실패 확인** — Run: `npm run test:e2e -- reservations` / Expected: FAIL
- [ ] **Step 3: 구현** — 소유자 불일치 `ForbiddenException`, 없음 `NotFoundException`, 이미 `CANCELLED`인 예약의 confirm은 `ConflictException`. `confirm`은 이미 `CONFIRMED`면 그대로 반환, 아니면 선점자 검사 후 `$transaction`으로 예약·좌석 갱신, 커밋 뒤 `releaseHold`. `cancel`은 이미 `CANCELLED`면 그대로 반환, 아니면 `$transaction`으로 예약 `CANCELLED`·좌석 `AVAILABLE`, 이후 `releaseHold`.
- [ ] **Step 4: 실행해서 통과 확인** — Run: `npm run test:e2e -- reservations` / Expected: PASS
- [ ] **Step 5: Commit** — `fix: enforce reservation ownership, transactions, and idempotent confirm/cancel`

---

### Task 4: 결제

**Files:**
- Modify: `backend/src/payments/payments.service.ts`, `backend/src/payments/payments.controller.ts`, `backend/src/payments/dto/create-payment.dto.ts`(필요 시)
- Test: `backend/test/payments.e2e-spec.ts`

**Interfaces:**
- Produces: `create(dto: CreatePaymentDto, userId: number): Promise<Payment>`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `소유자 결제 → 201, SUCCESS`
  - `같은 예약에 결제 재요청 → 같은 payment id 반환, DB 행 1개`
  - `타인의 예약 → 403`, `없는 예약 → 404`
  - `amount가 0 이하 또는 정수가 아님 → 400`
  - `CANCELLED 예약 → 409`
- [ ] **Step 2: 실행해서 실패 확인** — Run: `npm run test:e2e -- payments` / Expected: FAIL
- [ ] **Step 3: 구현** — 검증 순서: 예약 조회(404) → 소유자(403) → 금액(400) → 취소 여부(409) → 기존 결제 반환 → 생성. 동시 생성으로 유니크 오류(`P2002`)가 나면 기존 결제를 조회해 반환한다. 컨트롤러는 `req.user.userId`를 전달.
- [ ] **Step 4: 실행해서 통과 확인** — Run: `npm run test:e2e -- payments` / Expected: PASS
- [ ] **Step 5: Commit** — `fix: validate payment owner and amount, make payment creation idempotent`

---

### Task 5: 동시성 검증과 결과 기록

**Files:**
- Create: `backend/test/concurrency.e2e-spec.ts`, `docs/verification/2026-10-28-seat-hold-verification.md`

- [ ] **Step 1: 테스트 작성** (모든 요청은 `Promise.all`로 동시 발사)
  - `20명이 같은 좌석 동시 선점 → 성공 1, 409가 19, Redis 값=성공한 사용자 id, 조회 시 HOLDING 1개`
  - `같은 사용자가 같은 좌석을 10번 동시 선점 → 10건 모두 성공`
  - `10명이 서로 다른 좌석 동시 선점 → 전원 성공`
  - `같은 예약 확정 10건 동시 → 모두 성공, 좌석 SOLD, reservation CONFIRMED 1행`
  - `같은 예약 결제 10건 동시 → 모두 같은 payment id, payments 행 1개`
- [ ] **Step 2: 전체 실행** — Run: `npm run test:e2e` / Expected: 모든 스위트 PASS (전체 통과 개수를 기록)
- [ ] **Step 3: 반복 안정성 확인** — Run: 같은 명령 3회 / Expected: 매번 PASS (플레이크 없음)
- [ ] **Step 4: 기록 문서 작성** — 실행일, MySQL·Redis·Node 버전, 격리 방식(DB명, Redis DB 번호), 시나리오별 조건·결과 표, 검증하지 않은 범위(HTTP 부하·성능·다중 서버·실제 PG)를 실제 출력 기준으로 적는다. 숫자는 Step 2 출력에서 옮긴다.
- [ ] **Step 5: 기존 `backend/test-concurrent-hold.sh` 정리** — 자동 테스트로 대체됐음을 기록 문서에 한 줄 적고 스크립트는 삭제하지 않는다.
- [ ] **Step 6: Commit** — `test: add concurrency verification and record results`

---

### Task 6: 문서 반영과 외부 검토

**Files:**
- Modify: `README.md`, `티켓팅시스템_설계문서.md`(진행 상황·트러블슈팅 섹션)
- 이력서·포트폴리오는 검증 기록이 확정된 뒤 별도 단계에서 갱신한다.

- [ ] **Step 1: 설계문서 섹션 7~8 갱신** — 해결한 문제를 "문제 → 원인 → 최종 수정 → 결과" 템플릿으로 3건 이상 기록(TTL 만료 불일치, SOLD 재선점, 확정 비원자성). 결과 수치는 Task 5 기록에서 가져온다.
- [ ] **Step 2: README** — 테스트 실행법(`.env.test` 준비, `npx prisma db push`, `npm run test:e2e`)과 멱등성 동작을 추가.
- [ ] **Step 3: Codex 검토** — 브랜치 전체 변경을 Codex에 읽기 전용으로 검토시키고, 지적 사항 중 타당한 것만 테스트를 먼저 추가한 뒤 반영한다. 반영하지 않은 지적은 사유와 함께 기록 문서에 남긴다.
- [ ] **Step 4: 최종 확인** — Run: `npm run build` 및 `npm run test:e2e` / Expected: 빌드 성공, 전체 PASS
- [ ] **Step 5: Commit** — `docs: record seat hold fixes, verification, and test instructions`
