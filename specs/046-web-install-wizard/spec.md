# Spec: 웹 설치 위저드

<!-- 무엇을(what). 정확한 스키마·경로·매핑은 plan, 화면·상태·토큰은 design.md. 상위: [goal](goal.md) -->

## Status

Implemented (self-review clean, 2026-07-13). AC-3·4·7 자동 green, AC-1·2·5·8 구현+단위/스모크, AC-6(E2E)만 수동 미실행.

## Scope

기존 무의존 부트스트랩 서버(`scripts/bootstrap-guide.mjs`, `make guide`)를 **능동 웹 설치 위저드**로
확장한다: (1) 준비물 실시간 점검 + 조치 안내, (2) 사용자 확인을 거친 **화이트리스트 설치 단계 실행**과
진행 스트리밍, (3) 토큰·설정 서버측 기록, (4) MCP 등록·확인. macOS 우선. 기존 `make setup` CLI와 병존.
실행 로직은 기존 스크립트(`setup.sh`/`up.sh`/`mcp-install.sh`/`doctor.sh`)를 호출해 재사용한다.

## Context

- 진입: `make guide` → `bootstrap-guide.mjs`가 `127.0.0.1`에 뜬다. **Node 내장 모듈만** 사용(설치 전이라
  node_modules 없음). 현재는 준비물 배지 + 복사용 명령만 제공(수동).
- 기존 실행 원시(재사용 대상): `make up`(`scripts/up.sh` — docker compose 기동 + 헬스 폴링),
  `make mcp-install`(`scripts/mcp-install.sh` — Claude Code에 등록), `make doctor`(`scripts/doctor.sh` — 읽기
  전용 진단), `make claude-token`(브라우저 1회 토큰 발급), `scripts/embed.sh`(임베딩 엔진).
- 보안 관례(계승): `:8788` 웹 UI(specs/034)는 루프백 전용·Host 검증을 한다(`ui-server.ts`의
  `hostGuardMiddleware`로 실증). 시크릿을 화면·응답에 원문 노출하지 않는 구체 관례의 소재·형태는
  plan 단계 3에서 확인해 위저드에 맞게 적용한다(단정하지 않음). 설치 위저드는 그보다 강한 **실행
  권한**을 가지므로 화이트리스트가 핵심이다.
- 첫 docker 기동은 이미지·모델(bge-m3 ~1.2GB) pull로 5~15분 소요될 수 있다.

## Functional Requirements

<!-- 각 FR 끝에 goal의 어느 목표/제약을 지지하는지 표기. -->

- [x] **FR-1 (준비물 점검 + 조치 안내)**: 위저드는 Docker(설치/실행 여부), Node, 임베딩 엔진(호스트
  Ollama 또는 컨테이너) 상태를 실시간 배지로 보여주고, 결핍마다 **조치**(예: "Docker Desktop 받기" 링크 +
  "설치 후 **앱을 한 번 여세요**" 명시)를 제시한다. Docker "설치됨"과 "실행 중"을 구분해 표시한다.
  → goal: Objective, Problem(1)

- [x] **FR-2 (화이트리스트 단계 실행 + 진행 스트리밍)**: 위저드는 각 단계를 **사용자 확인 후** 대신
  실행한다. 최소 실행 단계: **스택 기동**(`up.sh`)과 **MCP 등록**(`mcp-install.sh`). 실행 중 표준 출력을
  브라우저로 **스트리밍**하고, docker 기동은 진행 상태(예: 헬스 폴링 `준비 중 N/120`, 모델 내려받기 진척)를
  가시화한다. 실행 대상은 **고정 목록**이며 임의 명령을 받지 않는다. → goal: Objective, Problem(3), Constraint(보안)

- [x] **FR-3 (토큰·설정 서버측 기록)**: 백엔드 인증 단계에서 위저드는 (a) claude 토큰은 발급 흐름을
  안내(브라우저 열기 + 절차 표시)하고, (b) Gemini 등 키는 입력창으로 받는다. 받은 값은 **서버측에서만**
  `.env`에 기록하며 클라이언트로 되돌려 보내지 않는다. 화면에는 마스킹/설정됨 여부만 표시한다.
  선택 항목(부 백엔드 등)은 건너뛸 수 있다. → goal: Objective, Problem(2), Constraint(보안)

- [x] **FR-4 (MCP 등록·확인)**: 위저드는 `mcp-install.sh`를 실행해 Claude Code에 등록하고, "Claude Code를
  다시 켜라"는 안내와 함께 **등록 여부를 자동 폴링**해 "✓ 등록됨/아직"으로 표시한다. 실패 시 기존 등록을
  보존하고 재시도를 제시한다(비파괴). → goal: Objective, Problem(4)

- [x] **FR-5 (보안 경계)**: 위저드 서버는 `127.0.0.1`에만 바인딩하고 Host 헤더를 검증한다(DNS rebinding
  차단). 실행은 **고정 화이트리스트**(예: `up`·`mcp-install`·`doctor`·토큰 발급)로만 가능하고 임의
  문자열·파괴적 명령(clean/purge/trash-empty 등)은 거부한다. 비밀값은 서버측에만 두고 응답에 원문을 싣지
  않는다. → goal: Constraint(보안)

- [x] **FR-6 (기존 스크립트 재사용)**: 위저드는 설치 로직을 재구현하지 않고 기존
  `up.sh`/`mcp-install.sh`/`doctor.sh`/토큰 발급을 실행 원시로 호출한다. 진입 서버는 부트스트랩
  무의존(Node 내장 모듈) 제약을 지킨다. → goal: Constraint(기존 자산 재사용·무의존)

- [x] **FR-7 (평이한 상태·용어·비파괴)**: 모든 화면 문구·진행·에러는 평이한 한국어이며 용어(Docker·MCP·
  토큰·임베딩)는 짧은 설명을 병기한다. 각 단계는 로딩/성공/실패 상태를 명시적으로 표면화하고, 실패해도
  기존 설정·데이터를 손상하지 않고 재시도 가능하다. → goal: Constraint(비개발자 언어·비파괴), Problem(5)

## Acceptance Criteria

<!-- 각 AC는 검증가능·테스트와 1:1 매핑(Given-When-Then). 화면 세부는 design.md. -->

- [x] **AC-1 (준비물 배지·조치)**: Given Docker 미설치/미실행 각 상태, When 위저드 준비물 화면을 열면,
  Then Docker "설치됨/실행중"을 구분한 배지와 각 결핍의 조치 안내(받기 링크·"앱 열기")가 표시되고, Node·
  임베딩 엔진 상태도 함께 나온다.

- [x] **AC-2 (확인 후 실행 + 스트리밍)**: Given 준비물이 충족된 상태, When 사용자가 "스택 기동"을 확인하면,
  Then 위저드가 `up`을 실행하고 표준 출력/진행 상태를 실시간 스트리밍하며, 완료 시 3개 엔드포인트(채팅/메모리/
  임베딩) 준비를 표시한다. 확인 전에는 실행하지 않는다.

- [x] **AC-3 (임의·파괴 명령 거부)**: Given 위저드 실행 API, When 화이트리스트 밖 명령(임의 문자열,
  `clean`/`purge` 등)을 요청하면, Then 거부하고 실행하지 않는다(고정 목록만 허용).

- [x] **AC-4 (토큰 서버측 기록·미노출)**: Given 백엔드 인증 단계, When 사용자가 키를 입력/발급하면, Then
  값은 서버측에서 `.env`에 기록되고 응답·화면에는 원문이 실리지 않으며(마스킹/설정됨만), 선택 항목은 건너뛸
  수 있다.

- [x] **AC-5 (MCP 등록·폴링 확인)**: Given 빌드·스택이 준비된 상태, When 사용자가 "Claude Code 연결"을
  실행하면, Then `mcp-install`이 수행되고 "다시 켜기" 안내 후 등록 여부를 폴링해 "✓ 등록됨"으로 바뀐다.
  등록 실패 시 기존 상태를 보존하고 재시도를 제시한다.

- [ ] **AC-6 (엔드투엔드 무편집 설치)**: Given 새 macOS 환경(준비물 설치됨), When 사용자가 `make guide`로
  위저드를 열어 화면 안내만 따르면, Then 파일 직접 편집·에러 로그 해석 없이 스택 기동→(토큰)→MCP 등록까지
  마치고 "사용 시작" 안내에 도달한다(수동/통합 검증).

- [x] **AC-7 (보안 바인딩)**: Given 위저드 서버, When 외부 인터페이스나 위조 Host 헤더로 접근하면, Then
  거부되고 `127.0.0.1` + 허용 Host에서만 동작한다.

- [x] **AC-8 (비파괴 재시도)**: Given 어느 단계가 실패한 상태, When 사용자가 재시도하면, Then 기존 설정·
  데이터가 손상되지 않은 채 그 단계부터 다시 진행할 수 있고, 실패 원인이 평이한 문구로 표시된다.

## Requirement Traceability

| Requirement | Acceptance criteria |
|---|---|
| FR-1 | AC-1 |
| FR-2 | AC-2, AC-6 |
| FR-3 | AC-4 |
| FR-4 | AC-5 |
| FR-5 | AC-3, AC-7 |
| FR-6 | AC-2, AC-5 |
| FR-7 | AC-1, AC-8 |

## Open questions

- ~~진행 스트리밍 전송 방식(SSE vs 청크 폴링)~~ **해소(단계 0)**: EventSource는 GET 전용(요청 바디
  불가)이라 POST `/api/run`({id})에 부적합 → **`fetch()` + `response.body.getReader()` + `TextDecoder`**로
  청크 스트림 수신(Node `res.write()` 무의존 송신, 브라우저 최광 호환). [T1: MDN Streams API, web.dev]
- ~~claude 토큰 발급의 브라우저 핸드오프 정확한 흐름~~ **해소(단계 0)**: `claude setup-token`은 TTY를
  요구(`claude-token.sh:34` `[ -t 0 ]`)해 비TTY 위저드에서 직접 spawn 불가 → 위저드는 **브라우저 발급을
  안내 + 사용자가 결과 토큰을 입력창에 붙여넣기 → 서버측 `.env` 기록**(FR-3 입력 경로). [T1: `claude
  setup-token --help` 설치본]
- 위저드가 `make setup`의 백엔드 선택/부 백엔드까지 다룰지 vs 최소 경로(스택+MCP)만 다룰지 — design.md에서
  화면 흐름으로 스코프 확정(최소 경로 우선, 백엔드 인증은 FR-3 범위). **해소: design.md §1·§5 — 6스텝
  최소 경로(환영→준비물→스택→백엔드(선택)→MCP→완료).**

## 검증 상태 (self-review clean · 2026-07-13)

격리 critic 2라운드(초기 + 수정 재검) 통과. 중대 2건(.env 개행 인젝션·큰 바디 핸들러 행)·경미 4건 수정·CLOSED. 회귀 없음(전체 721 테스트 green).

| AC | 검증 방법 | 근거 |
|---|---|---|
| AC-1 | 구현 + 수동 | `renderPrereq`/`loadChecks` — Docker 설치/실행 구분·Node·ollama 배지 + 조치. 렌더는 수동(design상) |
| AC-2 | 단위 + 스모크 | fake-spawn 스트리밍 단위 + 실서버 `doctor` 스트림·센티넬 왕복 실증. 실 docker 진행은 AC-6 |
| AC-3 | **자동 green** | `resolveCommand`/`runCommand` 단위(proto 오염·비문자열·파괴 id null·spawn 미호출 spy) + 통합 400 |
| AC-4 | **자동 green** | maskSecret/buildSecretResponse/writeEnvVar 단위 + 통합(원문 미노출·격리 .env·chmod 600) + 개행 인젝션 거부 |
| AC-5 | 자동(파싱) + 수동 | `parseMcpList`(localmind-remote 오탐 방지) 자동 + 폴링/재시도 구현. 실등록은 수동 |
| AC-6 | **수동 미실행** | 새 macOS E2E — 실환경 필요라 이번 세션 미검증(체크 안 함). 코드 경로는 도달 가능 |
| AC-7 | **자동 green** | `hostAllowed` 18엣지 단위 + 위조 Host 403 통합 + 127.0.0.1 바인딩 |
| AC-8 | 구현 + 수동 | 재시도 경로·로그 보존 + 스크립트 비파괴 위임(up.sh·mcp-install probe). 실패-재시도 실측은 수동 |
