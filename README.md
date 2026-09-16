# 실시간 콘서트 예매 시스템

콘서트 좌석을 실시간으로 선점하고 예매하는 티켓팅 서비스입니다. 100석 규모의 단일 공연장을 기준으로, 회원가입부터 좌석 선점 → 예매 → 결제(Mock) → 확정까지 전체 흐름을 구현했습니다.

자세한 설계 배경은 [티켓팅시스템_설계문서.md](./티켓팅시스템_설계문서.md)를 참고하세요.

## 기술 스택

| 영역 | 스택 |
|---|---|
| 백엔드 | NestJS, Prisma, MySQL, Redis, JWT |
| 프론트엔드 | Next.js (App Router), TypeScript, Tailwind CSS |
| API 문서 | Swagger (`/api`) |

## 프로젝트 구조

```
.
├── backend/     # NestJS API 서버
├── frontend/    # Next.js 프론트엔드
└── 티켓팅시스템_설계문서.md
```

## 주요 기능

- **인증**: 이메일/비밀번호 회원가입·로그인, JWT Access/Refresh Token
- **공연**: 등록(ADMIN)·목록·상세 조회, 상태 변경(예매전/예매중/예매마감)
- **좌석**: 좌석 배치 조회, Redis 기반 좌석 선점(TTL) 및 선점 취소
- **예매**: 예매 생성 → Mock 결제 → 확정, 취소, 내 예매 내역 조회
- **관리자**: 전체 예매 내역 조회, 공연 상태 관리, 좌석 판매 현황 대시보드

## 시작하기

### 1. 사전 준비

- MySQL 서버 실행
- Redis 서버 실행 (좌석 선점 기능에 필요)

### 2. 백엔드

```bash
cd backend
npm install

# .env 파일 생성 후 아래 값 채우기
# DATABASE_URL="mysql://<user>:<password>@localhost:3306/<db_name>"
# JWT_ACCESS_SECRET="..."
# JWT_REFRESH_SECRET="..."

npx prisma migrate dev
npm run start:dev
```

- API 서버: http://localhost:3000
- Swagger 문서: http://localhost:3000/api

### 3. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

터미널에 출력되는 주소로 접속합니다 (백엔드가 3000번 포트를 사용하므로 보통 3001번으로 뜹니다).

### 4. 관리자 계정 만들기

회원가입은 기본적으로 `USER` role로 생성됩니다. 관리자 기능(공연 등록/상태 변경, 전체 예매 조회)을 쓰려면 DB에서 직접 role을 `ADMIN`으로 변경해야 합니다.

```sql
UPDATE user SET role = 'ADMIN' WHERE email = '관리자로_바꿀_이메일';
```

## API 개요

| 분류 | Method | Endpoint | 권한 |
|---|---|---|---|
| 인증 | POST | /auth/signup | - |
| 인증 | POST | /auth/login | - |
| 인증 | POST | /auth/refresh | - |
| 공연 | POST | /concerts | ADMIN |
| 공연 | GET | /concerts, /concerts/:id | - |
| 공연 | PATCH | /concerts/:id/status | ADMIN |
| 좌석 | GET | /concerts/:id/seats | - |
| 좌석 | POST/DELETE | /seats/:id/hold | USER |
| 예매 | POST | /reservations | USER |
| 예매 | POST | /reservations/:id/confirm, /reservations/:id/cancel | USER |
| 예매 | GET | /reservations/my | USER |
| 예매 | GET | /reservations | ADMIN |
| 결제 | POST | /payments | USER |
| 결제 | GET | /payments/:reservationId | USER |

전체 요청/응답 스키마와 예시값은 Swagger 문서(`/api`)에서 확인할 수 있습니다.

## 개발 메모

이 프로젝트는 기본 CRUD를 완성한 뒤, 동시성 처리·대용량 데이터 처리 같은 핵심 기술 챌린지를 의도적으로 단순한 버전으로 먼저 구현하고 직접 문제를 겪으며 개선해나가는 방식으로 진행되고 있습니다. 진행 배경과 트러블슈팅 계획은 설계 문서의 7~8절을 참고하세요.
