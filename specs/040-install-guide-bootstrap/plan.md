# Plan: 설치 전 부트스트랩 가이드 서버

<!-- 어떻게(how). 상위: [goal](goal.md) · 무엇을: [spec](spec.md) · 화면: [design](design.md) -->

## 도메인 경계 (DDD)
설치 전 실행이라 **일반 아키텍처(레이어드 TS)와 분리된 독립 산출물**이다 — 빌드·deps에 기댈 수
없으므로 본체 코드를 import하지 않는다. 단일 파일 안에서 얇게 나눈다:
- **점검 로직(순수)**: 명령 실행 결과(문자열/코드)를 받아 `ok|missing|unknown`으로 판정하는 순수
  함수 — IO(spawn)와 분리해 픽스처로 테스트.
- **점검 어댑터**: `child_process`로 읽기 전용 명령을 spawn(타임아웃·실패 흡수).
- **HTTP(구동)**: `http` 내장으로 `GET /`(HTML)·`GET /api/checks`(JSON)·정적(style.css) 서빙. GET only.
- **콘텐츠**: 상세 가이드 HTML(자기완결 또는 034 style.css 재사용).

용어: **준비물(prerequisite)** · **점검 상태(check status)** `ok|missing|unknown` · **선택 준비물**
(ollama 등 — 없어도 진행 가능).

## 영향 모듈
- **신규** `scripts/bootstrap-guide.mjs` — 무의존 서버 진입점(Node 내장만). 점검·라우팅·HTML.
  - 상세 HTML이 커지면 `scripts/guide/` 아래 `index.html`·`guide.css`로 분리하고 서버가 파일 서빙
    (여전히 무의존 — 정적 파일 읽기). 300줄 가이드 준수.
- **신규 테스트** `scripts/bootstrap-guide.test.mjs`(또는 `.test.sh`) — 점검 판정 순수 함수(픽스처),
  무의존 실행(node_modules 은닉), GET-only, Node 부재 폴백.
- **수정** `Makefile` — `guide` 타깃: `node scripts/bootstrap-guide.mjs`(사전 `command -v node` 확인 →
  없으면 안내 메시지 + 링크 후 exit).
- **수정** `README.md` — 시작하기에 "설치가 막막하면 `make guide`로 브라우저 가이드" 한 줄(선택 진입점).
- **재사용** `public/ui/style.css` — 서버가 `GET /style.css`로 서빙해 034 토큰 일관성(빌드 불필요).

## 단계 (task 분해 가능)
1. **점검 순수 함수 + 테스트** → 검증: `classifyCheck(name, {code, stdout, err})`가 docker/node/env/…를
   ok/missing/unknown으로 정확 판정(AC-2,3,4,5). *실패 테스트 먼저.*
2. **점검 어댑터(spawn, 타임아웃, 실패 흡수)** → 검증: 없는 명령·타임아웃이 예외로 새지 않고 unknown(AC-5,7).
3. **HTTP 서버(GET / · /api/checks · /style.css)** → 검증: 200·스키마·127.0.0.1 바인딩(AC-10),
   라우트 열거 GET-only·실행 엔드포인트 없음(AC-7).
4. **상세 가이드 HTML(콘텐츠)** → 검증(수동 dogfood): design.md의 섹션·단계·문제 해결·복사 버튼(AC-6,11).
5. **make guide 타깃 + Node 부재 폴백 + 브라우저 자동 오픈** → 검증: node 은닉 시 안내·비크래시 종료(AC-8),
   자동 오픈 실패 시 URL 폴백(OQ-1).
6. **무의존 실행 회귀** → 검증: node_modules/dist 임시 은닉 상태에서 서버 기동·응답(AC-1).

## 테스트 전략 (AC → 레벨)
| AC | 레벨 | 방법 |
|---|---|---|
| AC-2,3,4,5 (판정) | 단위 | `classifyCheck` 픽스처(가짜 spawn 결과) |
| AC-1 (무의존) | 통합 | node_modules·dist를 임시 이동 후 서버 기동·`/api/checks` 200 |
| AC-7 (GET-only·실행 없음) | 단위 | 라우트/핸들러 열거, 소스에 설치-spawn 부재 |
| AC-8 (Node 폴백) | 셸 | `make guide`를 PATH에서 node 숨기고 실행 → 메시지·exit 코드 |
| AC-9 (preflight 일치) | 수동/통합 | 같은 머신에서 setup 점검 결과와 대조 |
| AC-6,11 (복사·상세 콘텐츠) | 수동 | dogfood |
| AC-10 (로컬 바인딩) | 통합 | 서버 주소가 127.0.0.1 |

- 점검 순수 함수는 spawn 결과를 주입받아 검증(실명령 비의존, CI 안전).
- `.mjs` 테스트는 `node --test`로 실행 가능(내장). 무의존 회귀는 셸로 node_modules 은닉.
- 구현은 TDD. self-review는 독립 크리틱 + **무의존 불변·GET-only·읽기전용** 중점 + Live-Verify
  (브라우저 오픈 명령·Node 버전 판정 등 OS/버전 사실 확인).

## 위험 완화
- **무의존 회귀 방지**: import/require가 외부 패키지를 끌어오지 않는지 테스트로 고정(AC-1).
- **오탐**: 판정 불가 전부 `unknown`(AC-5,7).
- **보안**: GET-only·읽기전용 spawn·127.0.0.1을 회귀 테스트로 고정(AC-7,10).
- **과설계 억제**: 서버는 단일 파일 최소 구현, 상세함은 HTML 콘텐츠로(복잡도는 콘텐츠에, 코드에 아님).

## 구현 검증 (2026-07-07, self-review clean)
- [x] scripts/bootstrap-guide.mjs — 순수 판정(classifyExit/classifyNode) + 점검 어댑터 + handle 라우팅 + 가이드 HTML + 서버.
- [x] scripts/bootstrap-guide.test.mjs — 19종(판정·라우팅 GET-only·스키마·무의존 import·**심링크 서브프로세스 기동**).
- [x] Makefile `guide` 타깃(node 부재 폴백), package.json test 글롭에 scripts/*.test.mjs 추가.
- 테스트: bootstrap 19 + 전체 **440** green. 브라우저 dogfood(전 섹션 렌더) + 무의존 격리 기동 + AC-8 실증.
- **self-review(독립 크리틱)**: 중대-1(심링크 경로 isMain 미기동) — realpathSync로 수정 + 서브프로세스 회귀
  테스트 추가. 경미: AC-9(node 더 엄격)·AC-11(단계별 요소) 스펙 정정, data-cmd 이스케이프. 재검 clean.
