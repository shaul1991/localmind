# Plan: 웹 설치 위저드

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑한다. 상위: [goal](goal.md) · [spec](spec.md) -->

## 접근 요약

기존 무의존 부트스트랩 서버 `scripts/bootstrap-guide.mjs`(specs/040 — Node 내장 모듈만, 설치 전
`make guide`로 구동, 현재는 GET 전용 읽기 안내판)를 **능동 위저드**로 승격한다. 상위 접근 세 축:

1. **진입 서버는 무의존 유지**: 위저드 서버도 `node:http`·`fs`·`child_process`만 쓴다. `express`
   기반 `:8788` 모니터링 UI(src/ui-server.ts)는 `node_modules`를 전제하므로 **재사용하지 않고**
   그 보안 패턴(Host 검증·루프백 바인딩·시크릿 미노출)만 무의존으로 **이식**한다.
2. **설치 로직은 재구현 금지**: 능동 단계는 기존 `up.sh`·`mcp-install.sh`·`doctor.sh`·
   `claude-token.sh`를 **자식 프로세스로 spawn**해 실행한다(단일 로직원 — goal Constraint·FR-6).
   위저드는 "무엇을 어떤 순서로·확인 게이트를 걸어" 부를지를 오케스트레이션할 뿐이다.
3. **실행은 고정 화이트리스트로만**: 클라이언트는 임의 명령 문자열을 보내지 못한다. 서버 내부에
   `id → {cmd, args, cwd}` 상수 맵을 두고, 요청은 **id만** 받는다. 맵에 없는 id는 거부(FR-5·AC-3).

현재 `bootstrap-guide.mjs`는 GET 전용 + "아무것도 실행 안 함"을 자기정의로 못박고 있다(파일 헤더
주석 line 5, HTML note line 131). 능동 실행은 이 불변식을 깨므로, **기존 파일 확장이 아니라 신규
진입점 `scripts/install-wizard.mjs`를 만들고** `make guide`를 그쪽으로 전환하는 것을 추천한다
(대안·트레이드오프는 "영향 모듈" 참조).

## 도메인 경계 (DDD)

세 개의 bounded context로 나눈다. 핵심은 **위저드 서버**와 **실행 원시**의 분리, 그리고 기존
**:8788 모니터링 UI**와의 성격 차이 명시다.

### 1. 설치 위저드 서버 (신규 context — "설치 전 특권 부트스트랩")
- **책임**: (a) 정적 자산 제공, (b) 준비물 점검 집계(기존 `runChecks` 재사용), (c) **화이트리스트
  실행 오케스트레이션**, (d) 실행 표준출력/진행 **스트리밍**, (e) 토큰·설정 **서버측 `.env` 기록**.
- **불변식**: `127.0.0.1` 전용 바인딩 · Host 헤더 검증 · 실행은 고정 id 화이트리스트 · 비밀값은
  서버 밖으로 나가지 않음(응답에 원문 미포함) · Node 내장 모듈만.
- **유비쿼터스 언어**: `step`(위저드의 한 단계 — 준비물/스택기동/토큰/MCP), `whitelisted command`
  (실행 가능한 고정 id), `progress stream`(실행 중 브라우저로 흘리는 출력·진행), `confirm gate`
  (실행 직전 사용자 확인).

### 2. 실행 원시 (기존 context — 무변경 재사용)
- `up.sh`·`mcp-install.sh`·`doctor.sh`·`claude-token.sh` 및 그 뒤의 docker compose·claude CLI.
- **경계 규칙**: 위저드는 이 스크립트들의 **내부를 알지 못한다** — 종료코드와 표준출력만 소비한다.
  스크립트 로직은 이 스펙에서 수정 대상이 아니다(단, 단계 0에서 up.sh의 stderr 처리 확인 필요 —
  아래 참조).

### 3. 모니터링 UI (기존 context — 별개, 손대지 않음)
- `src/ui-server.ts`(`:8788`, express, specs/034)는 **설치 완료 후** 상태를 보는 읽기 위주 UI다.
- **위저드와의 차이(명시)**: 위저드는 "설치 전에도 도는 **특권** 부트스트랩"이다 — `node_modules`
  이전에 떠야 하고(무의존), docker 실행·`.env` 쓰기·MCP 등록 같은 **부수효과를 일으킨다**.
  `:8788`은 무의존이 아니고(express) 읽기 위주다. 두 서버는 **책임·의존·수명주기·포트가 모두
  다르므로 통합하지 않는다**. 공유하는 것은 보안 패턴(개념)과 `public/ui/style.css` 토큰(정적
  자산)뿐이다.

## 영향 모듈

### 신규
- `scripts/install-wizard.mjs` — 위저드 진입 서버(무의존). 라우팅·Host 가드·화이트리스트 실행기·
  스트리밍·`.env` 기록을 한 파일에 담되, **순수 함수는 export**해 테스트 가능하게 한다(기존
  `classifyExit`/`classifyNode`/`handle` export 관례 계승).
  - 내부 논리 단위(같은 파일 내 export 함수):
    - `COMMANDS` — `id → {script, args, label, streams}` 상수 맵(화이트리스트 정본).
    - `resolveCommand(id)` — 화이트리스트 조회. 미등록/파괴적 id는 `null`(AC-3 테스트 대상).
    - `hostAllowed(hostHeader)` — Host 검증(무의존 이식, AC-7 테스트 대상).
    - `maskSecret(name, value)` / `writeEnvVar(envPath, name, value)` — 서버측 `.env` 기록 +
      응답 마스킹(AC-4 테스트 대상). `claude-token.sh`·up.sh의 기존 `.env` 기록 관례(chmod 600,
      키 라인 교체) 계승.
    - `handle(method, url, body)` — 라우팅(POST 실행 트리거·GET 정적/점검을 분기).
  - 정적 자산 제공: 아래 `public/wizard/`를 읽어 서빙(무의존 `fs.readFileSync`).
- `public/wizard/index.html` · `public/wizard/wizard.js` · (필요 시) `public/wizard/wizard.css`
  — 위저드 화면·클라이언트 스크립트. `public/ui/style.css` 토큰을 재사용(복제 금지 — 링크/inline).
  **이 화면 자산은 design.md 게이트 통과 후에만 착수**(specs/026 — 단계 참조).
- `scripts/install-wizard.test.mjs`(또는 기존 `.test.ts` 관례에 맞춰 배치) — 순수 함수 단위 테스트.

### 수정
- `Makefile` `guide` 타깃(line 104-106) — `bootstrap-guide.mjs` → `install-wizard.mjs`로 전환.
  Node 부재 가드는 그대로 유지. **대안**: 기존 `make guide`는 읽기 가이드로 남기고 `make install`
  (또는 `make wizard`) 신규 타깃을 추가. → **추천은 `guide` 전환**: goal이 "기존 `make guide`
  승격"을 명시했고 진입로를 하나로 유지하는 편이 비개발자에게 단순하다. 읽기 가이드 콘텐츠(준비물
  설명·용어 병기·문제 해결)는 위저드 첫 화면으로 흡수한다.

### 무변경(호출만)
- `scripts/up.sh`·`scripts/mcp-install.sh`·`scripts/doctor.sh`·`scripts/claude-token.sh` —
  위저드가 자식 프로세스로 실행. **단, 단계 0에서 up.sh의 stderr 소각(`>/dev/null 2>&1`, line 49)
  이 스트리밍을 막는지 확인** → 막으면 위저드 측 래핑(별도 env 플래그로 로그 노출)이 필요할 수
  있어 이 경우만 최소 수정 후보(단계 0 결론에 따름).
- `scripts/bootstrap-guide.mjs` — `runChecks`·`classifyExit`·`classifyNode`를 위저드가 import해
  재사용(중복 구현 금지). 파일 자체는 이 값 export만 유지하면 무변경. (진입 전환 후에도 모듈로
  남긴다.)

### 의존성 없음(신규 npm 패키지 도입 금지)
- SSE/스트리밍·정적 서빙 전부 `node:http`로 구현. **어떤 npm 패키지도 추가하지 않는다**(무의존 불변).

## 단계 (task 분해 가능)

의존 순서대로. 각 단계에 구현 페르소나(실행 등급)와 게이트를 명시한다.

- [x] **0. Live-Verify (필수·선행) — `critical-reasoning`**: 낡을 수 있는/미확인 사실을 설치본·
  공식문서로 확인한 뒤에야 아래를 확정한다. 확인 전 결정은 전부 "후보"다.
  - [x] (a) **claude 토큰 발급 실제 거동**: `claude setup-token`이 브라우저를 어떻게 여는지(자체
    핸드오프인지, 사용자가 콜백 URL/코드를 붙여넣는지), 출력 형식(`sk-ant-` 프리픽스 여부), 그리고
    **비대화(non-TTY)에서의 거동**을 설치본으로 확인. `claude-token.sh`는 `[ -t 0 ]`로 TTY를
    요구(line 34)하므로, 위저드(비TTY 자식 프로세스)에서 이 스크립트를 그대로 부르면 실패할 개연
    → **위저드에서 토큰 단계는 "브라우저에서 발급 흐름을 안내 + 사용자가 결과를 위저드 입력창에
    붙여넣기(FR-3의 입력 경로)"로 처리하고 서버측 기록만 재사용**하는 후보를 검증. (T1: `claude
    --help`/`claude setup-token --help` 설치본, Claude Code 공식문서.)
  - [x] (b) **Node 내장 http만으로 진행 스트리밍**: SSE(`text/event-stream` + 무한 응답 스트림)
    vs 청크 전송(`Transfer-Encoding: chunked` + 청크 append) 중 무의존으로 안정적인 방식을 확정.
    **현재 후보: SSE** — `res.writeHead(200, {"content-type":"text/event-stream"})` 후 자식
    프로세스 `stdout.on("data")`를 `res.write("data: ...\n\n")`로 흘리면 브라우저 `EventSource`
    로 무의존 수신 가능. 라이브로 `EventSource` + `node:http` 스트리밍 조합의 표준 거동(재연결·
    버퍼링) 확인 후 확정. (T1: MDN Server-sent events, Node.js `http.ServerResponse.write` 문서.)
  - [x] (c) **up.sh stderr 처리**: `DC up -d --build >/dev/null 2>&1`(line 49)로 빌드/pull 출력이
    버려진다 → docker 진행(모델 pull ~1.2GB)을 스트리밍하려면 위저드가 볼 수 있어야 함. 후보 3:
    (i) 위저드가 `docker compose ... up`을 직접(화이트리스트 id로) 부르지 않고 up.sh를 부르되
    up.sh에 "로그 비소각 모드" 플래그를 추가(무변경 원칙과의 트레이드오프 — 최소 수정), (ii)
    up.sh의 헬스 폴링 라인(`준비 중 N/120`, line 67)만 스트리밍하고 pull 상세는 별도 `docker
    compose ... logs -f`(화이트리스트 id) 병행, (iii) up.sh 무변경 + 위저드가 헬스 폴링을 자체
    수행. **단계 0 결론에 따라 (2)에서 확정** — 무변경 원칙을 최대한 지키되 "무음 대기 해소"(goal
    Problem 3·AC-2)가 우선.
  - 산출물: 위 3개 결론을 이 plan의 해당 절과 spec Open questions에 반영(취소선으로 OQ 해소 표기).

- [x] **1. 위저드 서버 골격 + 보안 경계 — `critical-reasoning` (backend-dev)**: `install-wizard.mjs`
  신설. `127.0.0.1` 바인딩(기존 `start()` 계승), `hostAllowed` Host 가드(모든 요청에 선적용,
  `/health`류 예외 없음 — 위저드는 상태 조회도 특권), GET 라우팅(정적 자산 + `/api/checks`
  `runChecks` 재사용). **아직 실행 엔드포인트는 없다** — 보안 골격부터 테스트로 고정(AC-7).
  포트 충돌 재시도(`start` 20회) 계승.

- [x] **2. 화이트리스트 실행기 + 스트리밍 — `critical-reasoning` (backend-dev)**: `COMMANDS` 맵 +
  `resolveCommand` + POST `/api/run`(body의 `id`만 받음, 미등록·파괴 id 거부). 단계 0(b) 결론의
  스트리밍 전송으로 자식 프로세스 stdout/진행을 흘린다. up.sh·mcp-install.sh·doctor.sh를 id로
  매핑. 단계 0(c) 결론에 따라 docker 진행 가시화. AC-2·AC-3·AC-8(비파괴 재시도 — 스크립트의 기존
  비파괴 관례에 의존, 실패 시 종료코드·평이 문구 표면화) 테스트.

- [x] **3. 토큰·설정 서버측 기록 — `critical-reasoning` (backend-dev / auth-dev)**: FR-3. 단계 0(a)
  결론의 토큰 흐름. `writeEnvVar`로 `.env`에 서버측 기록(`claude-token.sh`·up.sh의 chmod 600·키
  라인 교체 관례 계승), 응답·화면은 `maskSecret`로 설정됨/앞자리만. 선택 항목 건너뛰기. **비밀값이
  응답 body·로그·스트림에 실리지 않음**을 테스트로 고정(AC-4). 인증 값 취급이므로 보안 리뷰 분리
  lane 권장(security-reviewer, 최종 게이트는 크리틱).

- [x] **4. MCP 등록·폴링 확인 — `standard`~`critical-reasoning` (backend-dev)**: FR-4. `mcp-install.sh`
  를 화이트리스트 id로 실행(스트리밍), 완료 후 "다시 켜기" 안내 + 등록 여부 폴링 엔드포인트(예:
  `claude mcp list`를 상태 조회 화이트리스트로 — 상태 비변경). 실패 시 기존 등록 보존(스크립트가
  이미 원자적 — mcp-install.sh line 76-90 probe 로직에 위임). AC-5 테스트.

- [x] **5. 위저드 화면 (design.md 게이트) — designer → frontend-dev**: **선행 게이트**: designer가
  `specs/046-web-install-wizard/design.md`를 완성(디자인 시스템·토큰·컴포넌트·화면 상태 전이:
  준비물/실행중/스트리밍/성공/실패, 용어 병기 카피, 실행 프롬프트 전문)하고 **사용자 확인을 통과한
  뒤에야** frontend-dev가 `public/wizard/*` 구현에 착수한다(specs/026 — 확인 전 UI 착수 금지).
  화면 흐름 스코프(최소 경로: 준비물→스택기동→토큰→MCP vs `make setup` 백엔드 선택까지)는 여기서
  확정(spec OQ). 로딩/성공/실패 상태 명시적 표면화(FR-7). AC-1·AC-2 화면부·AC-6.

- [ ] **6. E2E 무편집 설치 검증 (수동/통합) — `critical-reasoning` (infra + 사용자)**: 새 macOS
  환경(또는 근사 환경)에서 `make guide`→위저드만으로 스택 기동→토큰→MCP까지 도달(AC-6). docker
  실기동·모델 pull 대기 UX 실측. 자동화 불가 부분은 수동, 가능한 부분은 통합.

- [x] **7. self-review + 세 문서 검증 표기 + 커밋/CI — `critical-reasoning`**: 격리 리뷰어로 FR·
  AC 1:1 추적, 화이트리스트 우회·Host 우회·비밀 유출을 적대적으로 탐색, 단계 0 사실 재검증.
  clean이면 세 문서 체크 표기 후 커밋·push·CI 감시.

## 테스트 전략

각 AC를 레벨별로 1:1 매핑. 보안·거부·미노출은 **자동 테스트 필수**, E2E 설치는 수동/통합.

| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 (준비물 배지·조치) | 단위 + 수동 | `runChecks`/`classifyExit` 재사용 로직 단위(기존 커버 계승) + Docker 설치/미설치·실행/미실행 4상태 배지·조치 렌더 수동 확인 | [x] |
| AC-2 (확인 후 실행+스트리밍) | 통합 + 수동 | `resolveCommand("up")` 매핑 단위 + POST `/api/run` 확인 없이는 미실행(가짜 spawn 주입)·확인 후 스트림 청크 수신 통합 + docker 진행 가시화 수동 | [x] |
| **AC-3 (임의·파괴 명령 거부)** | **단위(자동)** | `resolveCommand`에 임의 문자열·`clean`/`purge`/`down`/`trash-empty` 등 파괴 id 주입 → `null`/거부. POST `/api/run` 미등록 id → 실행 안 됨·비200. 화이트리스트 밖은 spawn이 호출되지 않음을 spy로 검증 | [x] |
| **AC-4 (토큰 서버측 기록·미노출)** | **단위(자동)** | `writeEnvVar`가 격리 `.env`(LOCALMIND_ENV_FILE 관례)에 기록·chmod 600 + `maskSecret` 결과에 원문 부재 + 실행 응답 body/스트림에 비밀 문자열 미포함(문자열 부재 assert) + 선택 항목 skip | [x] |
| AC-5 (MCP 등록·폴링) | 통합 + 수동 | `mcp-install` id 매핑 + 폴링 엔드포인트가 `claude mcp list`(상태조회) 파싱해 등록/미등록 반환(가짜 출력 주입) 통합 + 실등록 수동 | [x] |
| AC-6 (E2E 무편집 설치) | **수동/통합** | 새 macOS 환경에서 `make guide`만으로 스택→토큰→MCP→"사용 시작" 도달. 자동화 불가 — 수동 표기 | [ ] (수동 미실행) |
| **AC-7 (보안 바인딩)** | **단위(자동)** | `hostAllowed` 허용/위조 Host 판정 단위 + 서버가 `127.0.0.1`에만 listen(바인딩 인자 assert) + 위조 Host 요청 403 통합 | [x] |
| AC-8 (비파괴 재시도) | 단위 + 수동 | 실패 종료코드→평이 문구 매핑 단위 + 실패 후 같은 단계 재실행 가능(상태 비손상은 스크립트 비파괴 관례에 위임, 재시도 경로 통합) + 수동 재시도 | [x] |

원칙: AC-3·AC-4·AC-7은 spawn·fs·net을 주입/spy로 격리해 **결정론적 자동 테스트**로 만든다(실제
docker·claude·네트워크 없이). E2E(AC-6)만 실환경 수동.

## 구현 페르소나 배치

| 단계 | 페르소나 | 실행 등급 | 게이트 |
|---|---|---|---|
| 0 Live-Verify | architect/backend-dev | critical-reasoning | 확인 전 확정 금지 |
| 1 서버 골격·보안 | backend-dev | critical-reasoning | 보안 불변식 테스트 선행(TDD) |
| 2 화이트리스트 실행·스트리밍 | backend-dev | critical-reasoning | 화이트리스트 거부 테스트 선행 |
| 3 토큰·비밀 기록 | backend-dev + auth-dev / security-reviewer | critical-reasoning | 보안 리뷰 분리 lane |
| 4 MCP 등록·폴링 | backend-dev | standard~critical | 비파괴(기존 스크립트 위임) |
| 5 화면 | **designer → frontend-dev** | critical(정의)→standard(구현) | **design.md 완성+사용자 확인 통과 전 UI 착수 금지(specs/026)** |
| 6 E2E | infra + 사용자 | critical-reasoning | 실환경 수동/통합 |
| 7 self-review·커밋 | 격리 리뷰어 | critical-reasoning | clean 전 커밋 금지·다운시프트 금지 |

design.md 게이트(단계 5): SDD 무대이므로 표준 위치는 `specs/046-web-install-wizard/design.md`,
시작은 `cp templates/sdd/design.template.md`. 이 확인이 통과되기 전 `public/wizard/*` 구현 착수 금지.

## 롤아웃 · 실패 처리

- **롤아웃**: `make guide`를 위저드로 전환하되 위저드는 **각 단계 확인 게이트**로 능동성을 제한
  (goal Non-goal: 무확인 풀오토 금지). 기존 `make setup` CLI는 병존(무변경) — 위저드 실패 시
  사용자는 CLI로 폴백 가능.
- **실패 처리(비파괴 계승)**: 위저드는 실행 로직을 재구현하지 않으므로 각 스크립트의 기존 비파괴
  관례(up.sh: .env 보존·재실행 안전 / mcp-install.sh: probe 후 교체로 기존 등록 보존)를 그대로
  얻는다. 위저드 계층 실패(spawn 오류·스트림 끊김)는 종료코드+평이 문구로 표면화하고 같은 단계
  재시도 경로를 연다(AC-8).
- **보안 실패 시 fail-closed**: Host 검증·화이트리스트 조회 실패는 거부가 기본(허용이 예외).

## Definition of Done

- FR-1~7·AC-1~8이 위 테스트 전략대로 1:1 충족(AC-3·4·7 자동 green, AC-6 수동/통합 실증).
- 위저드 진입 서버가 **무의존**(신규 npm 패키지 0)·**`127.0.0.1` 전용**·**Host 검증**·**고정
  화이트리스트만 실행**·**비밀 서버측 기록·응답 미노출**을 만족.
- 기존 스크립트 로직 **재구현 0건**(호출만) — 단계 0(c)에서 up.sh 로그 처리 최소 수정이 필요하면
  그 수정만 예외로 명시·기록.
- design.md 확인 통과 후 화면 구현, 평이한 한국어·용어 병기·상태 명시적 표면화(FR-7).
- self-review clean(치명·중대 0) + 세 문서 검증 표기 + 커밋 메시지에 self-review 요약 + CI green.

## Open questions

- ~~진행 스트리밍 전송 방식(SSE vs 청크)~~ **확정(단계 0b)**: **fetch() + `response.body.getReader()` +
  TextDecoder로 청크 스트림 수신**(SSE/EventSource 기각 — EventSource는 GET 전용이라 POST `/api/run`
  ({id})에 부적합). 서버는 `res.write()`로 개행 구분 청크 송신(무의존). [T1: MDN Streams API·web.dev
  fetch streaming — getReader가 Safari 포함 최광 호환]
- ~~claude 토큰 브라우저 핸드오프 정확 흐름 + 비TTY 위저드에서의 실행 경로~~ **확정(단계 0a)**:
  `claude setup-token`은 TTY 요구(`claude-token.sh:34`)로 위저드(비TTY)에서 직접 spawn 불가 →
  **브라우저 발급 안내 + 위저드 입력창 붙여넣기 → 서버측 `writeEnvVar`로 `.env` 기록**. [T1: `claude
  setup-token --help` 설치본 — 구독 필요·브라우저 오픈·`sk-ant-` 토큰 출력]
- ~~up.sh stderr 소각을 어떻게 다뤄 docker 진행을 스트리밍할지~~ **확정(단계 0c)**: `up.sh:49`
  `>/dev/null 2>&1` 소각 + line 67 `\r` 진행이 스트리밍을 막음 → **`up.sh`에 `LOCALMIND_STREAM=1`
  최소 수정**(옵션 c-i): 소각 해제 + 비TTY/스트림 모드일 때 개행 진행 출력. 재구현 아님 — 로그 노출
  플래그만 추가하고 그 예외를 DoD에 기록.
  - **정직한 한계(미검증→E2E 게이트)**: `docker compose up -d --build`는 `--build` 단계(이미지 빌드·
    빌드 중 pull)까지는 블로킹하므로 그 출력이 스트리밍되지만, 런타임 컨테이너가 시작 후 백그라운드로
    받는 모델 pull(ollama 엔트리포인트 등)은 `-d` 디태치라 `up -d` 반환 뒤에 일어나 **그 상세 pull
    로그는 스트리밍되지 않을 수 있다.** 이 경우의 진행 가시성은 **헬스 폴링(`준비 중 N/120`)**이
    담보한다(무음은 아님). "빌드 pull vs 런타임 pull 중 무엇이 흐르는지"의 정확한 거동은 **실 docker
    환경 E2E(단계 6, 수동)에서만 확정 가능** — 코드/문서로 단정하지 않고 E2E 검증 항목으로 남긴다.
- ~~위저드가 `make setup`의 백엔드 선택/부 백엔드까지 다룰지 vs 최소 경로만~~ **확정(단계 5 design)**:
  6스텝 최소 경로(환영→준비물→스택→백엔드(선택·스킵 가능)→MCP→완료). 백엔드 인증은 FR-3 범위.

## 검증 상태 (self-review clean · 2026-07-13)

단계 0~5·7 완료. 단계 6(E2E 무편집 설치)만 실 macOS 환경 필요라 수동 미실행(사유 부기). AC-3·4·7 결정론 자동 테스트 green, 전체 721 테스트 green. up.sh `-d` pull 스트리밍 실효는 위 Open questions 0c의 정직한 한계대로 E2E에서만 확정.
