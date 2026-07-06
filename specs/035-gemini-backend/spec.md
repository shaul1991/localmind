# Spec: Gemini 백엔드 (OpenAI 호환 경로)

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `/goal` 규약 5. -->

> **검증 상태**: 이 스펙의 Gemini 사실은 ai.google.dev 공식(T1, 2026-07-06) 기준이나, 일부는
> **Phase 0 스파이크(plan)로 실측 검증 후 확정**한다. 미검증 항목은 Open questions에 명시했다.
> 스파이크 결과에 따라 FR/AC를 개정할 수 있다(미숙지 영역 — 사양은 조사로 개선된다).

## Scope
<!-- 이번에 만드는 범위. goal의 Objective에 대응. -->

Google **OpenAI 호환 엔드포인트**(`/v1beta/openai/chat/completions`, T1) 위에서 동작하는
**Gemini 백엔드 어댑터** 한 벌 + 라우팅·설정 배선. 스트리밍·usage·멀티턴 연속성까지.
네이티브 `generateContent`·CLI·함수 호출·멀티모달·네이티브 세션은 범위 밖(goal Non-goals).

## Context
<!-- 현재 상태·관련 시스템. 변경의 출발점. -->

- `src/backends/types.ts` — `Backend` 인터페이스(`run()` async generator → `BackendResult`).
- `src/backends/{claude,codex}.ts` — CLI 어댑터(`spawnNdjson`). Gemini는 대신 HTTP 스트리밍.
- `src/backends/router.ts` — `detectBackend(model)`+`byName()`+프리픽스. 반환 유니언이
  `"claude" | "codex"` 하드코딩.
- `src/config.ts` — env 파싱. `src/routes/{chat,messages}.ts` — 호환 입구(요청 messages를
  백엔드 `run()`으로 전달; 현재 system+prompt로 평탄화해 넘김 — Phase 0 확인 대상).
- **외부(T1)**: OpenAI 호환 base `https://generativelanguage.googleapis.com/v1beta/openai/`,
  Bearer 인증(`GEMINI_API_KEY`), `stream:true`+`stream_options.include_usage:true` 지원,
  system 메시지·멀티턴 지원, **beta**(파일 업/다운 미지원·일부 파라미터 무시).

## Functional Requirements
<!-- 각 FR 끝에 (goal의 어느 목표/제약을 지지하는지) 표기. 연결 없으면 scope creep. -->
- [ ] **FR-1 (Gemini 어댑터 — OpenAI 호환)**: `Backend` 인터페이스를 구현하는 Gemini 백엔드를
      추가한다. Google OpenAI 호환 `chat/completions`에 `stream:true`로 요청하고 SSE 청크의
      텍스트를 순차 yield한다. → goal: Objective / Expected outcome(스트리밍)
- [ ] **FR-2 (모델 라우팅)**: 요청 model이 `gemini*` 패턴이거나 `gemini:<model>` 프리픽스이면
      Gemini 백엔드로 라우팅한다. claude/codex 판별은 불변. → goal: Objective
- [ ] **FR-3 (요청 구성 — 매핑 최소)**: localmind가 백엔드에 넘기는 입력(system·prompt/messages)을
      OpenAI 호환 `messages` 배열로 구성해 전달한다. localmind가 이미 OpenAI 포맷이므로 네이티브
      `contents` 변환은 하지 않는다. → goal: Objective / Constraints(매핑 최소)
- [ ] **FR-4 (usage 집계)**: `stream_options.include_usage`로 받은 최종 usage(prompt/completion
      토큰)를 `BackendResult`의 입력·출력 토큰으로 매핑한다. → goal: Success metrics(usage)
- [ ] **FR-5 (설정)**: `GEMINI_API_KEY`·`GEMINI_DEFAULT_MODEL`(기본 `gemini-3.5-flash`)·
      `GEMINI_BASE_URL`(옵션, 기본 T1 base)을 `.env`로 읽어 composition에서 주입.
      `.env.example`에 플레이스홀더+안내(0원은 Flash 계열, 키 발급 위치). → goal: Constraints
- [ ] **FR-6 (우아한 부재)**: `GEMINI_API_KEY` 미설정 시 스택 기동·claude/codex 정상, Gemini
      요청에만 평이한 한국어 오류(`BackendError`). → goal: Constraints / Success metrics(회귀 0)
- [ ] **FR-7 (오류 매핑)**: 인증 실패(401/403)·**무료 한도 초과(429)**·기타 4xx/5xx를
      `BackendError`로 분류해 사용자가 이해할 오류로 변환한다(재시도는 v1 비목표).
      → goal: Risks(무료 한도·429) / Constraints
- [ ] **FR-8 (기본 모델 안전)**: 프리픽스만 주어져 모델이 비면 `GEMINI_DEFAULT_MODEL`
      (무료 안전값 Flash)로 폴백한다. → goal: Constraints(무료는 Flash)

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. -->
- [ ] **AC-1 (라우팅)**: Given `GEMINI_API_KEY` 설정 스택, When `model: "gemini-3.5-flash"`로
      `/v1/chat/completions` 호출, Then Gemini 백엔드가 선택되고 200 스트리밍 응답이 온다.
- [ ] **AC-2 (프리픽스 라우팅)**: Given 임의 모델명, When `model: "gemini:gemini-3.5-flash"`,
      Then 프리픽스가 벗겨진 모델로 Gemini 백엔드가 호출된다.
- [ ] **AC-3 (claude/codex 불변)**: Given 기존 요청, When `model`이 `claude*`/`gpt*`, Then
      라우팅·응답이 이전과 동일하다(회귀 0 — 기존 router 테스트 green).
- [ ] **AC-4 (스트리밍)**: Given Gemini 요청, When 응답 생성, Then 텍스트가 조각 단위로 순차
      스트리밍된다(SSE 청크 2개 이상 관측 — fake 스트림).
- [ ] **AC-5 (usage)**: Given `include_usage`로 완료된 응답, When `BackendResult` 확인, Then
      입력·출력 토큰이 모두 0보다 큰 정수다.
- [ ] **AC-6 (멀티턴 연속성)**: Given 2턴 대화(앞 턴에 특정 사실 제시), When 뒤 턴에서 되묻기,
      Then 응답이 앞 턴 문맥을 반영한다(full-history 기반 — Phase 0에서 흐름 확인).
- [ ] **AC-7 (기본 모델 폴백)**: Given `model: "gemini:"`(모델 공백), When 요청, Then
      `GEMINI_DEFAULT_MODEL`(Flash)로 호출된다.
- [ ] **AC-8 (키 미설정 — 엣지)**: Given `GEMINI_API_KEY` 미설정, When 스택 기동, Then 기동
      성공 + claude/codex 요청 정상, Gemini 요청 시에만 평이한 한국어 오류.
- [ ] **AC-9 (한도/인증 오류 — 엣지)**: Given 호환 엔드포인트가 429/403 반환, When Gemini
      요청, Then `BackendError`로 분류되어 이해 가능한 오류가 전달된다(무료 한도 안내 포함, 재시도 없음).

## Open questions
<!-- 미결정 사항. 숨기지 말 것. plan/구현 전에 해소하거나 명시 진행. Phase 0 스파이크가 해소한다. -->
- **[Phase 0]** 호환 레이어(beta)의 **스트리밍 응답에 usage가 실제로 실려 오는가** — 문서상
  `include_usage` 지원이나 beta라 실측 필요. 안 오면 usage는 별도 처리(비스트리밍 최종 호출 등)
  또는 근사.
- **[Phase 0]** localmind가 백엔드에 넘기는 입력이 **멀티턴 전체 히스토리를 담는가**, 아니면
  resumeId 전제로 마지막 턴만 담는가(`routes/chat.ts` 평탄화 방식 확인) — stateless Gemini는
  전체 히스토리가 필요.
- **[Phase 0]** 호환 vs 네이티브 최종 판정: beta 공백(usage·파라미터)이 v1을 막으면 네이티브
  `generateContent`로 승격할지.
- 순수 별칭(`flash`/`pro` 단독)도 Gemini로 볼지 — v1은 **명시적 `gemini` 토큰/프리픽스만**
  매칭 제안(claude/codex와 충돌 회피).
- Anthropic 호환(`/v1/messages`) 경로 Gemini 매핑을 v1에 넣을지 — 같은 `Backend.run`을 타므로
  어댑터 하나로 커버되나, AC는 OpenAI 경로를 1차 검증 대상으로 둔다.
- **[Phase 0]** `GEMINI_DEFAULT_MODEL` 정확한 무료 flash 모델 ID 확정 — 2026-07 기준 현재
  세대는 Gemini 3.x(`gemini-3.5-flash` 최신 stable, `gemini-3.1-flash-lite`)이나, 무료 티어의
  정확한 flash SKU·ID가 소스마다 미묘히 달라(공식은 AI Studio 동적 표기) **실키로 models 페이지/
  AI Studio에서 확정**. 제안: `gemini-3.5-flash`(단정 아님 — 스파이크로 확인). flash-lite도 후보.
