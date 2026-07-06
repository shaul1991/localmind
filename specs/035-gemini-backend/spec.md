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
- [x] **FR-1 (Gemini 어댑터 — OpenAI 호환)**: `Backend` 인터페이스를 구현하는 Gemini 백엔드를
      추가한다. Google OpenAI 호환 `chat/completions`에 `stream:true`로 요청하고 SSE 청크의
      텍스트를 순차 yield한다. → goal: Objective / Expected outcome(스트리밍)
      *검증: `src/backends/gemini.ts`; `gemini.test.ts` AC-4(델타 2+ 스트리밍).*
- [x] **FR-2 (모델 라우팅)**: 요청 model이 `gemini*` 패턴이거나 `gemini:<model>` 프리픽스이면
      Gemini 백엔드로 라우팅한다. claude/codex 판별은 불변. → goal: Objective
      *검증: `router.ts` detectBackend/resolve; `router.test.ts`.*
- [x] **FR-3 (요청 구성 — 매핑 최소)**: localmind가 백엔드에 넘기는 입력(system·prompt/messages)을
      OpenAI 호환 `messages` 배열로 구성해 전달한다. localmind가 이미 OpenAI 포맷이므로 네이티브
      `contents` 변환은 하지 않는다. → goal: Objective / Constraints(매핑 최소)
      *검증: `gemini.ts:106-117`; `gemini.test.ts`(URL·Bearer·messages 본문, system 유무 2케이스).*
- [x] **FR-4 (usage 집계)**: `stream_options.include_usage`로 받은 최종 usage(prompt/completion
      토큰)를 `BackendResult`의 입력·출력 토큰으로 매핑한다. → goal: Success metrics(usage)
      *검증: `gemini.ts` usage 매핑; `gemini.test.ts` AC-5(단위). **단, beta가 실제로 usage를
      스트림에 싣는지는 라이브 미검증 → AC-5 참조.***
- [x] **FR-5 (설정)**: `GEMINI_API_KEY`·`GEMINI_DEFAULT_MODEL`(기본 `gemini-3.5-flash`)·
      `GEMINI_BASE_URL`(옵션, 기본 T1 base)을 `.env`로 읽어 composition에서 주입.
      `.env.example`에 플레이스홀더+안내(0원은 Flash 계열, 키 발급 위치). → goal: Constraints
      *검증: `config.ts` GEMINI_* 파싱; `.env.example` 안내 블록; 라우터 폴백 테스트가 기본값 사용을 간접 검증.*
- [x] **FR-6 (우아한 부재)**: `GEMINI_API_KEY` 미설정 시 스택 기동·claude/codex 정상, Gemini
      요청에만 평이한 한국어 오류(`BackendError`). → goal: Constraints / Success metrics(회귀 0)
      *검증: `gemini.ts:97-103`; `gemini.test.ts` AC-8(키 없으면 네트워크 호출 0 + 오류); 전체 377 green.*
- [x] **FR-7 (오류 매핑)**: 인증 실패(401/403)·**무료 한도 초과(429)**·기타 4xx/5xx를
      `BackendError`로 분류해 사용자가 이해할 오류로 변환한다(재시도는 v1 비목표).
      → goal: Risks(무료 한도·429) / Constraints
      *검증: `classifyError`; `gemini.test.ts` 401·403·429·5xx·네트워크·abort 6케이스.*
- [x] **FR-8 (기본 모델 안전)**: 프리픽스만 주어져 모델이 비면 `GEMINI_DEFAULT_MODEL`
      (무료 안전값 Flash)로 폴백한다. → goal: Constraints(무료는 Flash)
      *검증: `router.ts` fallbackModel; `router.test.ts` AC-7.*

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. -->
- [x] **AC-1 (라우팅)**: Given `GEMINI_API_KEY` 설정 스택, When `model: "gemini-2.5-flash"`로
      호출, Then Gemini 백엔드가 선택되고 200 스트리밍 응답이 온다. *검증: 라우팅 `router.test.ts`
      + **Phase 0 라이브 스파이크(2026-07-06)** — 실 엔드포인트가 스트리밍 응답 반환("하나…열").*
- [x] **AC-2 (프리픽스 라우팅)**: Given 임의 모델명, When `model: "gemini:gemini-3.5-flash"`,
      Then 프리픽스가 벗겨진 모델로 Gemini 백엔드가 호출된다. *검증: `router.test.ts` AC-2.*
- [x] **AC-3 (claude/codex 불변)**: Given 기존 요청, When `model`이 `claude*`/`gpt*`, Then
      라우팅·응답이 이전과 동일하다(회귀 0 — 기존 router 테스트 green).
      *검증: `router.test.ts` AC-3; 전체 377 테스트 green(회귀 0).*
- [x] **AC-4 (스트리밍)**: Given Gemini 요청, When 응답 생성, Then 텍스트가 조각 단위로 순차
      스트리밍된다. *검증: `gemini.test.ts` AC-4(fake SSE 델타 2+) + Phase 0 라이브(SSE 파싱·yield
      정상). 참고: 라이브에서 짧은 응답은 1 델타로 옴 — 청크 수는 응답 길이 의존, 스트리밍 경로는 확인.*
- [x] **AC-5 (usage)**: Given `include_usage`로 완료된 응답, When `BackendResult` 확인, Then
      입력·출력 토큰이 모두 0보다 큰 정수다. *검증: `gemini.test.ts` AC-5 + **Phase 0 라이브 —
      beta 엔드포인트가 실제로 usage를 스트림에 실어 옴**(`{input:17, output:25}`). Open Q 해소.*
- [x] **AC-6 (멀티턴 연속성)**: Given 2턴 대화(앞 턴에 특정 사실 제시), When 뒤 턴에서 되묻기,
      Then 응답이 앞 턴 문맥을 반영한다(full-history 기반). *검증: **Phase 0 라이브 — 앞 턴에서
      제시한 이름을 뒤 턴에서 정확히 되답함("슈얼", input 56토큰=히스토리 반영)**. 메커니즘: gemini가
      sessionId 미반환 → `flattenMessages`가 전체 히스토리를 실어 전송(코드+라이브 확인).*
- [x] **AC-7 (기본 모델 폴백)**: Given `model: "gemini:"`(모델 공백), When 요청, Then
      `GEMINI_DEFAULT_MODEL`(Flash)로 호출된다. *검증: `router.test.ts` AC-7.*
- [x] **AC-8 (키 미설정 — 엣지)**: Given `GEMINI_API_KEY` 미설정, When 스택 기동, Then 기동
      성공 + claude/codex 요청 정상, Gemini 요청 시에만 평이한 한국어 오류.
      *검증: `gemini.test.ts` AC-8(네트워크 호출 0 + 오류); 전체 스위트 green(기동·회귀).*
- [x] **AC-9 (한도/인증 오류 — 엣지)**: Given 호환 엔드포인트가 429/403 반환, When Gemini
      요청, Then `BackendError`로 분류되어 이해 가능한 오류가 전달된다(무료 한도 안내 포함, 재시도 없음).
      *검증: `gemini.test.ts` 429(한도 안내)·403(인증)·401·5xx.*

## Open questions
<!-- 미결정 사항. 숨기지 말 것. 해소분은 취소선. Phase 0 스파이크가 해소했다(2026-07-06). -->
- ~~**[Phase 0]** 호환 레이어(beta)의 스트리밍 응답에 usage가 실제로 실려 오는가~~ →
  **해소: 실려 온다**(라이브 `{input:17, output:25}`).
- ~~**[Phase 0]** localmind 입력이 멀티턴 전체 히스토리를 담는가~~ → **해소: 담는다**
  (`flattenMessages`가 라벨 transcript로 평탄화; 라이브 멀티턴 문맥 유지 확인).
- ~~**[Phase 0]** 호환 vs 네이티브 최종 판정~~ → **해소: 호환 경로 채택**(스트리밍·usage·멀티턴
  라이브 동작 확인 — 네이티브 불요).
- ~~순수 별칭(`flash`/`pro` 단독)도 Gemini로 볼지~~ → **해소: 명시적 `gemini` 토큰/프리픽스만**
  매칭(구현·테스트 완료).
- ~~**[Phase 0]** `GEMINI_DEFAULT_MODEL` 정확한 무료 flash 모델 ID~~ → **해소: `gemini-2.5-flash`**
  (라이브 가용·안정 확인. 최신 `gemini-3.5-flash`는 무료 티어 503 반복이라 안정성 우선 — 사용자 결정).
- Anthropic 호환(`/v1/messages`) 경로 Gemini 매핑을 v1에 넣을지 — 같은 `Backend.run`을 타므로
  어댑터 하나로 커버되나, 라이브 검증은 OpenAI 경로만 함(미해소 — 후속).
