# 043 — Completion Core 경계 통합 구현 위임서

아래 프롬프트 전문을 구현 에이전트에게 그대로 전달한다. 구현자는 이 문서보다 `goal.md`·`spec.md`의
의도와 계약을 우선하며, 충돌을 발견하면 코드를 임의로 맞추지 말고 중단 조건을 따른다.

---

## Execution prompt

당신은 localmind의 **backend application architecture 구현자**다. 목표는 OpenAI와 Anthropic route에
중복된 completion orchestration을 protocol-neutral core로 추출하는 것이다. 외부 동작 변경이나 새 기능
추가가 아니라, wire 호환성을 보존하는 고위험 동작 보존 리팩터다. 결함 파장이 크므로 충분한 추론 성능의
모델을 사용하고, 최종 review는 구현 컨텍스트와 분리된 적대적 reviewer에게 맡겨라.

### 1. 시작 전 필수 읽기

1. 저장소 root `AGENTS.md`
2. 사용자/프로젝트 `AGENTS.md`가 세션 시작 시 지정한 second-brain context profile build 파일
   (`contexts/build/<profile>.md`; 기기별 profile을 그대로 따른다)
3. `specs/043-completion-core-boundary/goal.md`
4. `specs/043-completion-core-boundary/spec.md`
5. `specs/043-completion-core-boundary/plan.md`
6. 완료된 041과 042의 goal/spec/plan 및 검증 체크
7. 현재 `src/routes/chat.ts`, `src/routes/messages.ts`, `src/session.ts`, backend Router/type, 공통 tool helper,
   server composition과 관련 tests

second-brain에서 이 주제의 기존 결정·교훈을 `recall`하고 관련 hit만 `get_note`로 읽어라. 구현 중 받는
사용자 결정은 즉시 `tags: ["decision"]`으로 capture하되, 스펙을 정본으로 갱신하라.

### 2. Dependency and worktree gate

- 041 → 042가 각각 테스트 green, self-review clean, 문서 체크 완료 상태가 아니면 043을 시작하지 마라.
- 먼저 `git status --short`로 사용자 소유 변경을 기록하라. 특히 범위 밖 `Makefile` 변경을 수정·포맷·
  되돌리거나 commit에 섞지 마라.
- 042 병합 후 파일 위치가 달라도 symbol과 책임을 따라가되, 043의 core/adapter 경계와 public compatibility
  계약은 축소하지 마라.
- UI 작업이 아니므로 `design.md`를 만들지 마라.

### 3. 허용 범위

수정 허용:

- 새 `src/completion/` 내부의 protocol-neutral types, signature, core와 단위 tests
- `src/routes/chat.ts` 및 직접 OpenAI route tests
- `src/routes/messages.ts` 및 직접 Anthropic route tests
- `src/transform.ts`와 직접 tests의 ordered-history 정규화 및 기존 prompt 동작을 보존하는 최소 변경
- `src/session.ts`, `src/session.test.ts`
- 두 handler에 같은 core dependency를 주입하기 위한 최소 server/composition 변경
- 구현 완료 근거를 체크하는 043의 goal/spec/plan 문서

수정 금지:

- backend adapter의 실행/선택 정책
- tool parser와 prompt의 문구·동작
- brain, MCP, UI, 설치·운영 파일, `Makefile`
- 공개 endpoint, 인증, request validation, HTTP/JSON/SSE/error wire contract
- 무관한 refactor, rename, formatting, dependency 추가

허용 범위를 넘어야만 AC를 충족할 수 있으면 먼저 중단해 근거와 최소 확장안을 보고하라.

### 4. 고정할 내부 계약

다음 계약을 wire type과 분리해 구현하라.

```ts
type NormalizedHistoryItem =
  | { kind: "instruction"; role: "system" | "developer"; text: string }
  | {
      kind: "message";
      role: "user" | "assistant" | "tool";
      contentText: string;
      explicitToolCalls: Array<{ id: string; name: string; argumentsText: string }>;
      toolCallId: string | null;
      toolMetadata: Array<
        | { kind: "tool_call"; id: string; name: string; argumentsText: string }
        | { kind: "tool_result"; toolCallId: string; contentText: string }
      >;
    };

type CompletionInput = {
  requestId: string;
  sessionId?: string;
  requestedModel: string;
  history: NormalizedHistoryItem[];
  tools: NormalizedTool[];
  toolChoice: NormalizedToolChoice | null;
  clientSignal?: AbortSignal;
};

type CompletionEvent =
  | { type: "started"; effectiveModel: string }
  | { type: "text-delta"; text: string };

type CompletionResult = {
  text: string;
  toolCalls: ParsedToolCall[] | null;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  finishReason: string;
};

type NormalizedMessageItem = Extract<NormalizedHistoryItem, { kind: "message" }>;
type NormalizedAssistantItem = Omit<NormalizedMessageItem, "role"> & { role: "assistant" };

type CompletionMaterialization<TPresentation> = {
  assistantHistory: NormalizedAssistantItem;
  presentation: TPresentation;
};

type CompletedExecution<TPresentation> = {
  result: CompletionResult;
  presentation: TPresentation;
};
```

- core는 backend/effective model 해석, session 판정, tool prompt, backend 실행, abort/timeout, parse,
  terminal state와 exactly-once commit을 소유한다.
- routes는 validation/normalization, response metadata, protocol별 JSON/SSE/error rendering과 disconnect 감지만
  소유한다.
- core는 Express/OpenAI/Anthropic wire type을 import하면 안 된다.
- OpenAI message 배열은 위치를 바꾸지 않고 instruction/message history item으로 변환하라. Anthropic은
  top-level system item 뒤에 message들을 둔다. 이 ordered history가 prompt와 continuity의 정본이다.
- `contentText`는 현행 `contentToText` 결과다. OpenAI explicit call/id 필드와 양 protocol의 ordered
  `toolMetadata`를 보존하라. core가 fresh/resume sendHistory를 선택한 **뒤**, 그 slice 안의 explicit
  calls로 id-to-name map과 현행 prompt를 조립하라. adapter가 full history prompt를 미리 만들지 마라.
- signature에는 schema version, backend, effective model, source-indexed instruction context, tools,
  tool choice가 들어간다. continuity payload에는 ordered history의 kind/role/trimmed content,
  explicitToolCalls/toolCallId/toolMetadata 전체를 넣는다. 객체 key만 정렬하고 배열 순서·whitespace·null은
  보존하라.
- signature 또는 continuity 조건이 다르면 backend session을 넘기지 말고 요청 전체 ordered history로
  fresh 실행하라.
- pre-aborted input은 event 없이 실패하고, 그 외에는 core가 backend 실행 전에
  `started.effectiveModel`을 정확히 1회 내보낸다. normal streaming adapter는
  이 값으로 첫 OpenAI role chunk/Anthropic message_start를 만들고, tools-on adapter는 최종 result까지
  시작 event 렌더를 보류해 현행 timing과 outModel을 보존한다.
- core execute는 adapter의 동기 `materialize(result)` callback을 성공마다 1회 호출한다. adapter는 현행
  공개 tool ID/response presentation과 정확히 같은 ID의 normalized assistant history를 함께 반환한다.
  core는 callback 성공 뒤 그 history로 한 지점에서 commit하고 opaque presentation을 adapter에 돌려준다.
- OpenAI ID는 `call_` + lowercase hex 24자, Anthropic ID는 `toolu_` + lowercase hex 36자인 현행 형식을
  유지한다. core는 ID를 opaque string으로만 비교한다.
- 성공 text/tool completion은 materialize 1회/commit 1회, materializer error를 포함한
  error/parse failure/timeout/cancel은 commit 0회다.
- tools가 활성화되면 backend delta를 전부 버퍼링하고 raw JSON text delta를 adapter로 보내지 마라. parse
  뒤 `CompletionResult.toolCalls` 또는 전체 일반 text만 전달해 현행 wire를 보존하라.
- core의 signal listener/timer와 route의 `Response` close listener를 모든 terminal path에서 제거하라.
- `SessionStore.set()`은 기존 key를 `delete`한 뒤 `set`해 A/B/A/C에서 B가 제거되게 하라. TTL 의미와
  `get()` 의미는 바꾸지 마라.

### 5. TDD 실행 순서

1. `spec.md` AC-01~AC-12 각각에 현재 route wire output을 고정하는 독립 characterization test를 작성하고
   기존 코드에서 green을 확인하라. status/header/null-vs-omitted/SSE event 순서/종료까지 포함한다.
   AC-18 fake-backend invocation과 AC-21/22 validation/error fixture도 이 단계에서 먼저 고정한다.
   route로 도달하지 않는 slice 밖 call-result는 기존 `flattenMessages(sendMessages)` 직접 결과를 고정한다.
   첫 tool-call 다음 tool-result resume는 AC-20의 의도적 개선이므로 AC-18 parity에 넣지 않는다.
2. 공통 core module/type이 없어 실패하는 AC-17 test를 작성해 red를 확인하라.
3. signature match, source-indexed instruction mismatch, continuity tool metadata mismatch의 AC-13·14
   tests를 작성해 red를 확인하라.
4. success/error/normal-and-tools-on delta-error/parser-error/materializer-error/timeout/abort race의
   materialize/commit count AC-15 tests를 red로 만들어라.
5. A/B/A/C eviction AC-16을 red로 만들어라.
6. resource cleanup AC-19와 양 protocol tool-call→tool-result resume AC-20을 red로 만들어라.
7. SessionStore의 최소 변경과 core의 최소 구현으로 AC-13~17 및 AC-19 core 부분을 green으로 만들어라.
8. OpenAI route/materializer를 core로 전환하고 AC-01/03/05/07/09/11/21을 green으로 유지하라.
9. Anthropic route/materializer를 전환하고 AC-02/04/06/08/10/12/22를 green으로 유지하라.
10. 두 route가 same core entrypoint를 1회 호출하고 public fixture, AC-18 backend invocation, AC-19 cleanup,
    AC-20 end-to-end resume가 전부 동일한지 다시 검증하라.
11. 타입 검사, 전체 테스트, 빌드를 실행해 AC-23 완료 게이트를 닫고 043 문서에 실제 근거를 체크하라.

테스트는 실제 provider나 network에 연결하지 말고 deterministic fake backend, fake clock과 controllable
abort signal을 사용하라. characterization fixture가 바뀌면 expectation을 새 결과로 덮어써 통과시키지
마라.

### 6. Live-Verify Facts gate

작업 당일 다음 T1 공식 문서를 직접 열어 확인하라.

- OpenAI Chat Completions create:
  <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- Anthropic Streaming Messages:
  <https://platform.claude.com/docs/en/build-with-claude/streaming>
- Anthropic Tool Use:
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works>

OpenAI streaming chunk/usage/tool_calls/finish reason, Anthropic event sequence/error/tool_use/stop reason만 이
작업에 필요한 범위로 검증하고 날짜와 URL을 review 근거에 남겨라. 공식 문서와 현행 fixture가 다르면
043에서 wire 동작을 고치지 말고 Open question과 별도 후속 compatibility SDD 후보로 보고하라.
`spec.md`에 이미 기록된 OpenAI 중간 chunk의 `usage:null` 생략은 알려진 예외이므로 043 중단 사유가
아니다. 그 외 새 충돌은 중단 조건으로 취급한다.

### 7. 필수 검증

```bash
npm run typecheck
npm test
npm run build
```

기준선의 `package.json` script가 달라졌다면 같은 목적의 기존 script를 사용하라. 샌드박스 socket 권한 등
환경 문제로 실패하면 테스트 결함과 구분해 기록하고, 승인된 환경에서 같은 명령을 재실행하라. 테스트를
실행하지 못한 상태를 green으로 보고하지 마라.

`spec.md`의 AC-01~AC-22와 자동 test 이름을 1:1 표로 만들고, AC-23에는 전체 명령과 self-review 근거를
연결하라. `/goal` 규약에 따라 검증된 FR/AC, plan 단계·테스트, Success metrics에 `[x]`와 근거를 남기고
미충족은 체크하지 마라.

### 8. Mandatory adversarial self-review

구현 컨텍스트와 분리된 reviewer에게 “결함을 찾으러 간다”는 프롬프트로 다음을 검토시켜라.

1. 모든 O/FR, AC-01~22가 구현과 자동 test로 1:1 추적되고 AC-23에 전체 검증 근거가 있는가
2. normal/stream/tool/usage/mid-stream error/cancel/validation/pre-header error가 현행 wire와 같은가
3. signature 필수 입력, instruction 상대 위치, slice 후 prompt, materialized public tool ID continuity,
   fresh full-history, started model, tool buffering, terminal race, core/route cleanup, LRU/TTL에 경계 버그가 없는가
4. core가 protocol/framework에 오염되거나 중복 abstraction·보안 문제가 생기지 않았는가
5. 외부 protocol 주장을 작업 당일 최신 공식 문서로 검증했는가

명백한 결함은 모아서 수정하고 영향 테스트를 다시 실행한 뒤 clean할 때까지 review하라. 최종 보고에는
review 라운드별 발견/수정, 남은 치명·중대 건수, 전체 명령 결과, wire parity, 문서 체크 상태를 포함하라.

### 9. Stop conditions

다음 중 하나면 추측하거나 범위를 넓히지 말고 구현을 중단해 사용자에게 보고하라.

- 041 또는 042가 clean 완료되지 않음
- 현재 wire behavior를 deterministic test로 고정할 수 없음
- 알려진 `usage:null` 예외 외에 공식 문서와 현재 wire fixture의 새 충돌이 발견됨
- normalized full history 없이 session mismatch를 처리해야 함
- public response 변경 없이는 AC를 충족할 수 없음
- 허용 범위 밖 backend/tool/brain/MCP/UI/operation 변경이 필요함
- 사용자 기존 변경과 안전하게 분리할 수 없음

모든 검증과 self-review가 clean일 때만 root `AGENTS.md`의 `/goal` 완료 규약에 따라 관련 파일만 commit,
push하고 전체 SHA로 CI를 watch하라.
