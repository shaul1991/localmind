# Spec: Gemini CLI 백엔드 (OAuth, stream-json)

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `/goal` 규약 5. -->

> **검증 상태**: gemini CLI 헤드리스·stream-json·OAuth·`-m`은 공식(T1) 확인. **이벤트 스키마·
> `-p`/stdin·resume·인증 파일 경로는 Phase 0 실측**(gemini CLI 설치+로그인 후) 확정. 결과에 따라
> FR/AC 개정 가능.

## Scope
<!-- 이번에 만드는 범위. goal의 Objective에 대응. -->

`gemini` 바이너리를 `--output-format stream-json`으로 구동하는 **CLI 어댑터**(OAuth) + `GEMINI_MODE`
(cli|api) 토글 라우팅. 스트리밍·usage·모델 선택·우아한 부재까지. cli·api 동시활성·멀티모달·함수호출·
컨테이너 로그인은 범위 밖(goal Non-goals).

## Context
<!-- 현재 상태·관련 시스템. 변경의 출발점. -->

- `src/backends/{claude,codex}.ts` — `spawnNdjson`으로 CLI 구동, NDJSON에서 델타·usage·resumeId 추출.
  gemini CLI 어댑터는 이 패턴을 그대로 따른다(codex와 가장 유사).
- `src/backends/gemini.ts` — 035 API(HTTP) 어댑터. 037은 이를 대체하지 않고 **토글의 다른 한쪽**.
- `src/backends/router.ts` — `gemini` 백엔드를 구성. 037은 `GEMINI_MODE`로 cli/api 어댑터를 선택.
- `src/config.ts` — `GEMINI_*`. 037은 `GEMINI_MODE`·`GEMINI_BIN` 추가.
- **외부(T1)**: `gemini -p "…" -m <model> --output-format stream-json`(NDJSON 이벤트), OAuth 무료
  60/분·1,000/일, 세션 checkpointing. (호스트 gemini CLI 설치+로그인 전제, codex 동형.)

## Functional Requirements
<!-- 각 FR 끝에 (goal의 어느 목표/제약을 지지하는지) 표기. 연결 없으면 scope creep. -->
- [ ] **FR-1 (CLI 어댑터)**: `Backend`를 구현하는 gemini CLI 백엔드를 추가한다. `gemini`를
      `--output-format stream-json`으로 `spawnNdjson` 구동하고 NDJSON에서 텍스트 델타를 yield한다.
      → goal: Objective / Expected outcome(스트리밍)
- [ ] **FR-2 (모드 토글 라우팅)**: `GEMINI_MODE`(cli|api)로 `gemini` 라우팅이 CLI(037) 또는
      API(035) 어댑터 **하나**를 쓴다. claude/codex 판별 불변. → goal: Objective / Success(토글)
- [ ] **FR-3 (요청 구성)**: `system`은 CLI에 system 플래그가 없으면 프롬프트 앞에 붙여 전달
      (codex 패턴). 모델은 `-m`으로 전달. → goal: Objective
- [ ] **FR-4 (usage 집계)**: stream-json 이벤트의 토큰 usage를 `BackendResult` 입력·출력 토큰으로
      매핑한다(없으면 0 + 미제공 명시). → goal: Success(usage)
- [ ] **FR-5 (설정)**: `GEMINI_MODE`(기본은 Open q)·`GEMINI_BIN`(기본 `gemini`)을 `.env`로 읽어
      composition 주입. `.env.example`·compose에 OAuth 마운트(추정 `~/.gemini`) 안내.
      → goal: Constraints(OAuth 호스트 전제)
- [ ] **FR-6 (우아한 부재)**: gemini CLI 미설치/미로그인 시 스택 기동·claude/codex 정상, gemini
      요청에만 평이한 한국어 오류(`BackendError`). → goal: Success(회귀 0)
- [ ] **FR-7 (오류 매핑)**: CLI 비정상 종료·인증 실패·한도(429/rate)를 `BackendError`로 분류.
      → goal: Constraints(평이한 오류)

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. -->
- [ ] **AC-1 (cli 라우팅)**: Given `GEMINI_MODE=cli` + 로그인된 gemini CLI, When
      `model: "gemini-2.5-flash"` 요청, Then CLI 어댑터가 선택되고 스트리밍 응답이 온다.
- [ ] **AC-2 (토글)**: Given `GEMINI_MODE=api`, When gemini 요청, Then 035 API 어댑터가 쓰인다
      (cli 어댑터 미사용). `GEMINI_MODE=cli`면 반대.
- [ ] **AC-3 (claude/codex 불변)**: Given 기존 요청, When `claude*`/`gpt*`, Then 라우팅 불변
      (회귀 0 — 기존 테스트 green).
- [ ] **AC-4 (스트리밍)**: Given cli 요청, When 응답, Then 텍스트가 조각 단위로 스트리밍된다
      (fake stream-json → 델타 2+).
- [ ] **AC-5 (usage)**: Given cli 응답 완료, When `BackendResult` 확인, Then usage가 매핑된다
      (stream-json이 usage를 주면 >0; 안 주면 0 + 문서에 미제공 명시).
- [ ] **AC-6 (요청 구성)**: Given system+prompt, When CLI 인자 구성, Then `-m <model>`·
      `--output-format stream-json`이 붙고 system이 프롬프트에 반영된다(단위: 인자 검증).
- [ ] **AC-7 (미설치/미로그인 — 엣지)**: Given gemini CLI 미설치 또는 미로그인, When cli 모드
      gemini 요청, Then 스택 정상 + 평이한 한국어 오류(`BackendError`).
- [ ] **AC-8 (오류 — 엣지)**: Given CLI가 비정상 종료(비0)/인증오류, When 요청, Then
      `BackendError`로 분류되어 이해 가능한 오류가 전달된다.

## Open questions
<!-- 미결정 사항. 숨기지 말 것. Phase 0 스파이크가 해소한다. -->
- **[Phase 0]** `--output-format stream-json` **이벤트 스키마** — 텍스트 델타·usage·세션 id 필드명.
  claude(stream_event/message_delta)와 다를 것. 실측 후 파서 확정.
- **[Phase 0]** 프롬프트 전달: `-p "…"`(인자) vs stdin. 긴 프롬프트/개행 안전성.
- **[Phase 0]** OAuth 인증 파일 경로·형식(`~/.gemini`?)과 컨테이너 마운트 방식(codex 동형 여부).
- **[Phase 0]** resume: 세션 checkpointing이 재사용 가능한 id로 노출되는지(best-effort/미지원).
- **[Phase 0]** stream-json이 **usage를 실제로 주는지**(안 주면 FR-4는 미제공 명시).
- **GEMINI_MODE 기본값**: `api`(035 무변경·키 있으면) vs `cli`(0원 우선) vs auto(키 있으면 api,
  없고 gemini 로그인 있으면 cli). 제안: **auto**(비개발자 마찰 최소). plan에서 확정.
