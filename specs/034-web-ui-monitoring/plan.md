# Plan — 모니터링 웹 UI (specs/034)

## 개정 이력

- **2026-07-06 — 배치 변경: 컨테이너 동거 → 호스트 UI 서버(:8788).** 구현 착수 시 확인:
  도커 `localmind` 컨테이너는 `~/.codex`만 마운트하며 노트 폴더·인덱스·.env·에이전트
  레지스트리에 접근 불가. 동적 NOTES_DIR(사용자별 임의 목록)은 compose로 일반화 마운트가
  안 되고, git ahead/behind 판정은 호스트 git 자격증명이 필요하다. 상태 정본이 전부
  호스트에 있으므로 UI 서버를 호스트 프로세스(`make ui` → `npm run ui`, 127.0.0.1:8788)로
  둔다. 기존 Express 미들웨어(인증·hostGuard)는 그대로 재사용 — "새 빌드·의존 0" 불변.

## 도메인 경계 (DDD)

- **interface(구동 어댑터)**: `src/ui-server.ts`(엔트리) + `src/routes/ui.ts` — HTTP 요청 →
  상태 조회 유스케이스 호출 → JSON 변환. 로직 없음(기존 chat/messages 라우트와 형제).
- **application(유스케이스)**: `src/ui-status.ts` — 상태 수집 조율. **기존 정본을 읽기만 한다**
  (재유도 금지): 인덱스 = `.brain-index.json`(brain.ts의 로더 재사용), 설정 = read-env 규칙,
  에이전트 = 레지스트리 폴더 + agents-deploy의 배포 경로 규칙, repos = git 명령(033 update.sh와
  같은 판정 — show-toplevel·upstream·ahead/behind).
- **정적 UI**: `public/ui/` — vanilla HTML/CSS/JS, 상태 표시만(판정 로직은 전부 서버).
  디자인 정본은 `design.md`(토큰·컴포넌트·상태 전이).
- 유비쿼터스 언어: **정본**(origin 기준 git 소스), **파생물**(인덱스·배포 자산), **마스킹**
  (앞4자+길이 — make secrets와 동일 형식).

## 영향 모듈

- 신규: `src/ui-status.ts`(+`.test.ts`), `src/routes/ui.ts`, `src/ui-server.ts`(+`ui-server.test.ts`),
  `public/ui/`(index.html·style.css·app.js — 페이지 4개는 해시 라우팅 단일 SPA)
- 수정: `src/server.ts`(미들웨어 export만 — 동작 불변), `package.json`(`ui` 스크립트),
  `Makefile`(`ui` 타깃), `README.md`(사용법 1절)
- 재사용: 기존 auth 미들웨어·hostGuard, brain.ts 인덱스 로더, scripts/lib의 판정 규칙

## 단계

- [x] 1. **design.md 확정**(선행 게이트 — specs/026): 디자이너 정의 → 사용자 확인(/goal 034
  착수로 확인됨). 리뷰 반영 개정 2회(토큰 대비 AA·§1 패턴 정정)도 design.md에 기록.
- [x] 2. `src/ui-status.ts` TDD — 수집기별 실패 테스트 → 구현(red 2 → green, 이후 보안 회귀
  2건도 red→green). 최종 13/13.
- [x] 3. `src/routes/ui.ts` + `src/ui-server.ts` 배선 TDD — auth(AC-4)·마스킹 부재(AC-5)·정적
  서빙(AC-1)·경로 탈출 차단까지 서버 테스트로. 최종 12/12.
- [x] 4. `public/ui/` 구현 — design.md 기준, 상태 가시성(FR-8) 포함(카드별 독립 실패 실증).
- [x] 5. 검증: 자동 테스트 + 실기기 도그푸드 → ux-reviewer → security-reviewer → critic 최종
  게이트 **clean** → 문서 검증 표기(이 표기). 상세: spec.md 검증 기록.

## 테스트 전략 (AC → 레벨)

| AC | 레벨 | 방법 | 결과 |
|---|---|---|---|
| AC-1·2·3·4·5·6·7·10·11 | 통합(자동) | 서버 테스트(기존 server.test.ts 패턴) + 픽스처 | [x] 25/25 green (AC-10·11은 revert-to-red 실증) |
| AC-8 | UI 상태(수동+리뷰) | 깨진 인덱스 픽스처 인스턴스로 에러 카드 재현 + ux-reviewer 점검 | [x] 실증(2026-07-06) |
| AC-9 | 수동 | 오프라인 도그푸드 1회 | [ ] 미실시(외부 참조 0은 자동 검증 — 후속) |

## 담당(모델 역할 배치)

- design.md: designer / 상태 수집·라우트: backend-dev / 정적 UI: frontend-dev
- 보안 lane: security-reviewer(시크릿·auth) / 도메인 리뷰: ux-reviewer / 최종: critic
- 잘 명세된 태스크는 worker(Sonnet)로 다운시프트 가능(2·3단계의 픽스처 작성 등)

## 2차 예고(이 plan 범위 밖 — 별도 스펙)

운영 페이지: 안전 화이트리스트(reindex·backup·update·health·report)만 서버가 child_process로
실행 + SSE 로그 스트림. clean/purge/trash-empty 영구 제외. make가 단일 진입점이라는 원칙은
유지(UI는 같은 스크립트를 호출할 뿐 대체하지 않는다 — 헌법 §15).
