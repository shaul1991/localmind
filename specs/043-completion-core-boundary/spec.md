# 043 — Completion Core 경계 통합 명세

## Status

Draft — 구현 전 문서. 체크 표시는 `/goal 043` 구현·검증 후에만 갱신한다.

## Live-verified protocol baseline

확인일: **2026-07-10**. 아래는 wire contract를 새로 도입하기 위한 근거가 아니라, 현재 공개 형식을
보존하는 테스트의 T1 정본이다. 구현자는 작업 당일 다시 열어 변경 여부를 확인한다.

- OpenAI Chat Completions `create`: streaming 응답의 chunk, `stream_options.include_usage`, assistant
  `tool_calls`와 `finish_reason` 계약.
  <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- Anthropic Streaming Messages: `message_start` → content block events → `message_delta` → `message_stop`
  이벤트 흐름과 streaming 오류 이벤트.
  <https://platform.claude.com/docs/en/build-with-claude/streaming>
- Anthropic Tool Use: assistant `tool_use` content block과 `stop_reason: "tool_use"` 계약.
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works>

프로젝트의 실제 호환 기준은 리팩터링 직전 현재 라우트가 내보내는 응답이다. 공식 문서와 현재 동작이
충돌하면 임의로 고치지 않고 Open question으로 남겨 별도 호환성 변경 SDD에서 다룬다.

## Terms

- **Protocol adapter:** OpenAI 또는 Anthropic 요청을 검증·정규화하고, core 결과/이벤트/실패를 해당
  HTTP·JSON·SSE 형식으로 렌더링하는 얇은 route 계층.
- **Completion core:** backend 해석부터 실행과 session commit까지 한 completion의 공통 use case를
  조율하는 protocol-neutral application 계층.
- **Effective model:** provider prefix 제거, alias 처리 등 현재 Router 규칙을 적용해 실제 backend에
  넘기는 모델 식별자.
- **Compatibility signature:** 기존 backend session을 안전하게 resume할 수 있는 의미적 입력 계약의
  결정적 fingerprint.
- **Commit:** 성공한 completion 결과와 backend session 정보를 `SessionStore`에 한 번 반영하는 행위.
- **Fresh full-history:** 저장된 backend session을 사용하지 않고, 이번 요청이 제공한 정규화된 전체
  대화 history로 backend를 시작하는 것.

## Internal interfaces

아래 shape는 내부 TypeScript 계약이다. 이름과 필수 필드는 구현의 정본이며, wire protocol type을
재사용하지 않는다. 기존 프로젝트 type과 겹치는 원시 type은 import하거나 alias할 수 있지만 의미는
동일해야 한다.

```ts
type NormalizedHistoryItem =
  | {
      kind: "instruction";
      role: "system" | "developer";
      text: string;
    }
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

class CompletionInterruptedError extends Error {
  constructor(
    readonly kind: "client_aborted" | "timed_out",
    message: string,
  ) {
    super(message);
    this.name = "CompletionInterruptedError";
  }
}
```

- `NormalizedHistoryItem`, `NormalizedTool`, `NormalizedToolChoice`는 OpenAI/Anthropic field명을 포함하지 않는
  공통 값 객체다. route adapter가 validation과 정규화를 끝낸 뒤 만든다. 기존 `ToolDef`와
  `NormalizedChoice`가 같은 의미를 충족하면 새 중복 type을 만들지 않고 alias/import한다.
- OpenAI adapter는 원래 message 배열의 각 항목을 같은 위치의 history item으로 바꾼다. system/developer는
  `kind:"instruction"`, 나머지는 `kind:"message"`다. Anthropic adapter는 top-level `system`을 첫
  instruction item으로 둔 뒤 message들을 원래 순서대로 붙인다. 따라서 instruction 역할·문자열뿐 아니라
  conversation turn과의 **상대 위치**도 signature, continuity, prompt 조립에서 보존된다.
- `contentText`는 기존 `contentToText`의 정확한 문자열이다. OpenAI top-level `tool_calls`와
  `tool_call_id`는 별도 필드로 보존하고 Anthropic content block을 포함한 call/result metadata는
  `toolMetadata`에도 정규화한다. core는 session의 fresh/resume `sendHistory`를 먼저 고른 뒤 **그 slice
  안의** `explicitToolCalls`로 id-to-name map을 만들고, 기존 `renderTurn`의 content/tool-call/tool-result,
  empty filtering, role label, `\n\n` join 규칙을 적용한다. adapter가 full history에서 prompt 문자열을
  미리 계산하지 않는다.
- 이미 aborted인 client signal은 event와 backend 호출 없이 실패한다. 그 외에는 core가 backend/effective
  model을 해석한 뒤 backend generator를 소비하기 전에 `started`를 정확히 1회 내보낸다. 이후
  `text-delta`를 0회 이상 내보내고 하나의
  `CompletionResult`로 종료한다. route가 이벤트를 즉시 SSE로 쓸지 무시하고 최종 JSON만 쓸지 결정한다.
- tools가 활성화된 실행은 호출 여부를 전체 출력 뒤에만 판정할 수 있으므로 backend delta를 버퍼링하고
  `text-delta`를 내보내지 않는다. parse 결과는 `CompletionResult.toolCalls`에만 담고 adapter가 protocol별
  tool event를 만든다. tool call이 아니면 현재처럼 전체 text를 한 번 렌더하고 `finishReason:"stop"`으로
  정규화한다.
- normal stream adapter는 `started.effectiveModel`로 즉시 첫 event를 렌더한다. tools-on stream adapter는
  `started` 값을 보관만 하고 최종 result까지 공개 stream 시작을 미룬 뒤 `result.model`을 사용한다. 이로써
  현행 tools-on buffering 시점과 backend-reported model 우선 규칙을 보존한다.
- 빈 text delta는 내보내지 않는다. `toolCalls`가 없으면 `null`이며 빈 배열과 혼용하지 않는다.
- `model`은 실제 backend가 보고한 모델을 우선하고, 없으면 해석된 effective model을 사용한다.
- `finishReason`은 현재 backend layer가 사용하는 내부 canonical 값이다. Anthropic stop reason으로의
  역매핑은 Anthropic adapter에서만 한다.
- core의 실행 API는 input, event observer와 동기 `materialize(result)` callback을 받아
  `Promise<CompletedExecution<TPresentation>>`을 반환한다. materializer는 protocol별 공개 ID/shape와 정확히
  대응하는 `assistantHistory` 및 adapter가 렌더할 opaque `presentation`을 만든다. core는 wire type을
  해석하지 않고 presentation을 그대로 돌려준다. timeout과 backend/router/session dependencies는 생성자
  또는 composition root에서 주입하며 wire request에 노출하지 않는다.
- client abort와 timeout은 `CompletionInterruptedError.kind`로 구분한다. 기존 `BackendError`와 그 밖의
  예외는 원래 객체를 그대로 전파해 adapter의 현재 status/code/message 매핑을 보존한다.

## Functional requirements

- [ ] **FR-1. Protocol-neutral completion core (O1)**

- core의 generic execute는 `CompletionInput`과 materializer를 받아 `CompletionEvent`를 전달하고
  `CompletedExecution<TPresentation>`을 반환한다.
- core 및 그 public internal contract는 Express, OpenAI, Anthropic wire type을 import하지 않는다.
- OpenAI와 Anthropic 라우트는 validation/normalization 후 같은 core 진입점을 호출한다.
- `started.effectiveModel`은 Router가 해석해 backend에 전달할 모델이며 pre-abort를 제외한 실행의 첫 event다.

- [ ] **FR-2. Ownership boundary (O1, O4)**

core가 단독으로 소유한다:

1. requested model을 현재 Router 규칙으로 backend와 effective model로 해석
2. compatibility signature 계산과 session resume/fresh 판정
3. 도구가 있을 때 현재 공통 tool prompt 생성·적용
4. backend 실행, request timeout timer, client abort와 timeout을 하나의 실행 signal로 결합
5. `started` 및 backend text delta 전달, 도구 호출 parse, 최종 내부 결과 조립
6. adapter materialization callback 1회와 그 성공 뒤 exactly-once session commit

route adapter가 단독으로 소유한다:

1. 인증 이후 HTTP body validation과 protocol별 오류 상태/메시지 선택
2. OpenAI/Anthropic message·system·tools·tool choice를 공통 type으로 정규화
3. protocol별 completion id, timestamp와 response metadata 생성
4. `CompletionEvent`/`CompletionResult`/typed failure의 JSON 또는 SSE 렌더링
5. 클라이언트 연결 종료를 감지해 core에 abort 신호 전달
6. parsed tool call에 현행 prefix/길이의 공개 ID를 부여하고, 같은 ID를 담은 normalized assistant
   history와 렌더용 presentation을 materialization callback에서 반환

OpenAI tool ID는 `^call_[0-9a-f]{24}$`, Anthropic tool-use ID는 `^toolu_[0-9a-f]{36}$`인 현행 형식을
유지한다. ID 문자열은 protocol-neutral history에서 opaque 값으로만 비교하며 core가 prefix를 해석하지
않는다.

- [ ] **FR-3. Complete session compatibility signature (O2)**

signature payload는 다음 입력을 모두 포함한다.

1. 해석된 backend id
2. effective model
3. `history`에서 뽑은 `{ sourceIndex, role, text }` instruction context 전체
4. 정규화된 tools 전체 선언
5. 정규화된 tool choice

- payload에는 schema version을 둔다. stable JSON serializer는 객체 key를 재귀적으로 정렬하고 배열 순서,
  문자열 whitespace, `null`과 값의 차이를 보존한다. 해시 사용 여부와 무관하게 충돌 없는 원문 비교가
  가능해야 한다.
- 동일 signature와 기존 대화 연속성 조건을 모두 만족할 때만 저장된 backend session을 resume한다.
- backend/model, system instruction, developer instruction, instruction 역할·상대 위치, tools, tool choice 중
  하나라도 다르거나 signature version이 다르면 저장된 backend session id/token을 넘기지 않고 이번
  요청의 정규화된 전체 `history`로 fresh 실행한다.
- mismatch 요청이 성공하면 새 signature와 새 backend session 정보로 해당 session entry를 교체한다.

대화 연속성 prefix는 별도의 canonical payload로 계산한다. prefix에 속한 instruction은
`{kind,role,text:text.trim()}`, message는 `{kind,role,contentText:contentText.trim(),explicitToolCalls,
toolCallId,toolMetadata}`로 순서대로 넣는다. 객체 key만 정렬하고 history/metadata 배열 순서는 보존한다.
explicit/auto session 모두 같은 payload 규칙을 쓰며, tool metadata가 달라지면 prefix 불일치로 fresh
실행한다.

- [ ] **FR-4. Exactly-once terminal state and commit (O3)**

- core는 `running`, `materializing`, `succeeded`, `failed`, `aborted`, `timed_out` 상태를 가지며 terminal은
  마지막 네 개 중 하나다.
- backend가 정상 결과를 반환하고 tool-call parsing까지 끝나면 `materializing`으로 전이해 adapter callback을
  정확히 1회 호출한다. callback이 유효한 assistant history/presentation을 반환한 뒤 `succeeded`로
  전이할 때만 그 assistant history를 포함해 commit한다.
- 일반 텍스트와 tool call 성공 모두 commit 1회다.
- backend throw/reject, stream 중 오류, parsing 예외, materializer 예외, request timeout, client abort는
  commit 0회다.
- client abort와 timeout 또는 backend resolve가 경합해도 최초 terminal transition만 효력이 있다.
- route가 응답 쓰기에 실패해도 이미 성공한 backend 결과의 commit을 다시 호출하지 않는다.
- adapter는 materializer가 반환한 presentation만 렌더한다. tool-call ID를 materialization 뒤 다시 만들거나
  assistant history와 다른 ID로 바꾸지 않는다.

- [ ] **FR-5. Cancellation and timeout (O3)**

- core는 route에서 전달된 client signal과 `config.requestTimeoutMs` 기반 timeout을 하나의 backend signal로
  결합한다.
- client signal이 이미 aborted이면 backend를 시작하지 않는다.
- 요청 종료 시 timer와 abort listener를 항상 정리한다.
- abort 원인을 typed internal failure로 구분해 adapter가 현재 protocol별 오류/종료 표면을 보존하게 한다.
- route adapter도 `Response`에 등록한 close listener를 `finally`에서 제거해 완료된 요청이 listener를
  보유하지 않게 한다.

- [ ] **FR-6. Session recency eviction (O5)**

- `SessionStore.set(key, value)`는 기존 key가 있으면 먼저 `delete(key)`한 뒤 `set(key, value)`한다.
- 용량 초과 제거는 이 commit 순서에서 가장 오래된 key를 제거한다. 성공 commit이 recency touch 지점이다.
- TTL 계산과 `get()`의 기존 의미는 바꾸지 않는다.

- [ ] **FR-7. Public compatibility (O4)**

- 두 엔드포인트의 URL, 인증, 요청 validation, HTTP status, content type, header, JSON field, null/누락 구분,
  SSE event/data 순서, 종료 marker를 변경하지 않는다.
- OpenAI 일반/stream 응답의 id/object/created/model/choices/finish_reason/tool_calls/usage와 `[DONE]` 동작을
  리팩터링 전과 같게 유지한다.
- Anthropic 일반/stream 응답의 message/content block/stop_reason/usage와 event 순서를 리팩터링 전과 같게
  유지한다.
- 중간 오류와 client cancel처럼 공식 wire 계약만으로 현재 동작을 단정할 수 없는 경우, 구현 전
  characterization test가 기록한 현행 동작을 정본으로 삼는다.

- [ ] **FR-8. Dependency sequencing and scope (O1-O5)**

- `/goal 043`은 041과 042가 테스트 green, self-review clean, 문서 체크 완료 상태인 기준선에서 시작한다.
- 041의 query-event 계약과 042의 brain facade는 변경하지 않는다.
- 이 작업은 completion core, 두 protocol adapter, session store와 직접 관련 테스트로 제한한다.

## Acceptance Criteria

`AC-01`~`AC-22`는 아래 같은 번호의 자동 테스트 시나리오와 **1:1**로 매핑한다. 공개 wire/backend
invocation인 AC-01~12, AC-18, AC-21~22는 리팩터링 전 코드에서 먼저 green으로 만들고 리팩터링 뒤 같은
assertion을 통과시킨다. core/session 및 강화된 cleanup/materialization인 AC-13~17, AC-19~20은 현재
구조에서 red로 시작한다. AC-23은 자동 근거와 build·self-review를 묶는 수동 완료 게이트다.

- [ ] **AC-01 - OpenAI 일반 응답**

**Given** 고정 backend가 일반 텍스트와 사용량을 반환하고 `stream`이 false인 유효한 OpenAI 요청이 있을 때
**When** `/v1/chat/completions`를 호출하면
**Then** status/header/JSON 전체 의미와 누락·null 구분이 리팩터링 전 fixture와 같다.

- [ ] **AC-02 - Anthropic 일반 응답**

**Given** 같은 고정 backend 결과와 유효한 non-stream Anthropic 요청이 있을 때
**When** `/v1/messages`를 호출하면
**Then** status/header/message content/stop reason/usage가 리팩터링 전 fixture와 같다.

- [ ] **AC-03 - OpenAI streaming**

**Given** backend가 둘 이상의 text delta 뒤 정상 종료하는 OpenAI streaming 요청일 때
**When** SSE body를 끝까지 읽으면
**Then** `started.effectiveModel`로 만든 첫 role chunk의 model을 포함해 모든 chunk의 순서·필드·finish
chunk·`[DONE]`가 리팩터링 전 fixture와 같다.

- [ ] **AC-04 - Anthropic streaming**

**Given** backend가 둘 이상의 text delta 뒤 정상 종료하는 Anthropic streaming 요청일 때
**When** SSE event를 끝까지 읽으면
**Then** `started.effectiveModel`로 만든 `message_start.model`을 포함해 message/content block/delta/stop
이벤트 순서와 payload가 리팩터링 전 fixture와 같다.

- [ ] **AC-05 - OpenAI tool call**

**Given** tools와 tool choice가 있는 요청에서 backend text가 현재 parser가 인식하는 호출을 반환할 때
**When** OpenAI 일반 및 stream adapter가 결과를 렌더링하면
**Then** raw tool JSON text delta를 먼저 내보내지 않고 assistant `tool_calls`, arguments 직렬화,
finish reason이 현행 fixture와 같으며 session commit은 1회다.

- [ ] **AC-06 - Anthropic tool use**

**Given** 같은 normalized tool result를 Anthropic adapter가 렌더링할 때
**When** 일반 및 stream 응답을 읽으면
**Then** raw tool JSON text delta를 먼저 내보내지 않고 `tool_use` block의 id/name/input, stop reason과
event 순서가 현행 fixture와 같으며 commit은 1회다.

- [ ] **AC-07 - OpenAI usage**

**Given** 고정 input/output token 수와 usage 포함/미포함 OpenAI 요청 조합이 있을 때
**When** 일반 및 stream 응답을 읽으면
**Then** usage 필드의 존재 시점·값·total과 빈 choices 처리까지 현행 fixture와 같다.

- [ ] **AC-08 - Anthropic usage**

**Given** 고정 input/output token 수의 Anthropic 일반 및 stream 요청이 있을 때
**When** 응답을 읽으면
**Then** usage가 나타나는 event/field와 값이 현행 fixture와 같다.

- [ ] **AC-09 - OpenAI stream 중간 오류**

**Given** backend가 text delta 하나를 보낸 뒤 오류를 내는 OpenAI normal-mode stream과 tools-on stream
요청이 각각 있을 때
**When** 응답을 끝까지 관찰하면
**Then** normal mode의 이미 보낸 chunk 이후 오류·종료와 tools-on의 아직 시작하지 않은 응답 오류 표면이
각각 현행 fixture와 같고 raw tool text 노출과 session commit은 0회다.

- [ ] **AC-10 - Anthropic stream 중간 오류**

**Given** backend가 text delta 하나를 보낸 뒤 오류를 내는 Anthropic normal-mode stream과 tools-on stream
요청이 각각 있을 때
**When** 응답을 끝까지 관찰하면
**Then** normal mode의 이미 보낸 event 이후 오류·종료와 tools-on의 아직 시작하지 않은 응답 오류 표면이
각각 현행 fixture와 같고 raw tool text 노출과 session commit은 0회다.

- [ ] **AC-11 - OpenAI client cancel**

**Given** 실행 중인 OpenAI 일반/stream 요청의 클라이언트 연결이 종료될 때
**When** route가 client signal을 abort하면
**Then** backend signal이 abort되고 추가 chunk와 session commit이 없으며 공개 종료 표면이 현행 fixture와
같다.

- [ ] **AC-12 - Anthropic client cancel**

**Given** 실행 중인 Anthropic 일반/stream 요청의 클라이언트 연결이 종료될 때
**When** route가 client signal을 abort하면
**Then** backend signal이 abort되고 추가 event와 session commit이 없으며 공개 종료 표면이 현행 fixture와
같다.

- [ ] **AC-13 - 호환 signature resume**

**Given** backend, effective model, history 안의 역할·상대 위치가 보존된 system/developer instructions, tools,
tool choice와 대화 연속성이 모두 같은 저장 세션이 있을 때
**When** 다음 completion을 실행하면
**Then** 저장된 backend session을 resume하고 성공 결과를 정확히 1회 commit한다.

- [ ] **AC-14 - signature mismatch fresh 실행**

**Given** 저장 세션 signature에서 backend, effective model, system text, developer text, instruction 역할,
instruction의 conversation 대비 상대 위치, tools, tool choice를 한 번에 하나씩 바꾸거나 continuity
prefix의 tool-call id/name/arguments/result id를 하나씩 바꾸는 parameterized 사례가 있을 때
**When** completion을 실행하면
**Then** 모든 사례가 기존 backend session을 넘기지 않고 요청의 전체 normalized history로 fresh 실행한다.

- [ ] **AC-15 - terminal state와 exactly-once**

**Given** 정상 text, 정상 tool call, backend reject, delta 후 reject, parser throw, materializer throw,
timeout, abort/resolve 경합 사례가 있을 때
**When** core 실행이 종료되면
**Then** 앞의 성공 2개는 materializer 1회 뒤 commit 1회이고 나머지는 commit 0회이며 각 실행은 terminal
state 하나만 가진다.

- [ ] **AC-16 - LRU 재삽입**

**Given** 최대 2개를 보관하는 store에 A와 B를 넣은 뒤 A를 다시 `set`했을 때
**When** C를 넣으면
**Then** B가 제거되고 A와 C가 남으며 기존 TTL 테스트는 계속 통과한다.

- [ ] **AC-17 - core 경계**

**Given** 정적 import 검사와 두 route 통합 테스트가 있을 때
**When** 소스 의존성과 실행 경로를 검사하면
**Then** core가 Express/OpenAI/Anthropic wire type을 import하지 않고 두 route 모두 같은 core 진입점을 정확히
한 번 호출한다.

- [ ] **AC-18 - backend invocation parity**

**Given** 리팩터링 전후 resume/fresh 판정이 동일한 범위에서 OpenAI의 interleaved system/developer,
빈·multiline content, image placeholder, tool call/result와 Anthropic system block/tool use/result를 포함한
fresh/resume fixture가 있을 때
**When** 기존 route로 도달 가능한 fixture는 리팩터링 전후 fake backend 입력을 비교하고, slice 밖 call
fixture는 기존 `flattenMessages(sendMessages)` 결과와 새 prompt builder를 비교하면
**Then** `model`, `system`, `prompt`, `resumeId`가 fixture별로 바이트 단위로 같고, tool system prompt는
fresh tools-on 실행에만 같은 위치와 구분자로 한 번 붙으며 slice 밖 call name은 result에 붙지 않는다.
첫 tool-call 직후 tool-result의 resume 판정 변화는 이 AC에서 제외하고 AC-20만 정본으로 삼는다.

- [ ] **AC-19 - resource cleanup**

**Given** pre-abort, 정상 완료, backend 오류, timeout, client cancel, materializer throw fixture와 listener/timer
계측이 있을 때
**When** 각 core/route 실행을 끝내면
**Then** pre-abort는 event/backend 0회이고 모든 경로에서 core abort listener·timer와 route Response close
listener 수가 기준값으로 돌아가며 늦은 callback이나 commit이 없다.

- [ ] **AC-20 - materialized tool-call continuation**

**Given** OpenAI와 Anthropic 각각 tools-on 첫 응답이 backend session id와 parsed call을 반환하고, 다음
요청이 그 공개 call ID의 assistant call/use와 대응 tool result를 포함할 때
**When** 두 요청을 같은 localmind session으로 순서대로 실행하면
**Then** adapter가 첫 응답에 렌더한 ID와 core에 materialize한 assistant history ID가 같고, 다음 요청의
normalized continuity가 일치해 저장된 backend session을 resume하며 slice 밖 call name을 prompt에
덧붙이지 않는다. 리팩터링 전 기준은 `resumeId` 없음 + full-history prompt, 리팩터링 후 기대는 저장된
`resumeId` + suffix prompt인 의도적 내부 개선이며 공개 HTTP/JSON/SSE 응답 shape는 그대로다. 각 요청의
materializer와 commit은 1회다.

- [ ] **AC-21 - OpenAI validation/error parity**

**Given** 인증 실패, messages 누락/빈 배열, 응답 header 전 `BackendError`, 일반 예외, non-stream timeout인
OpenAI 요청 fixture가 있을 때
**When** `/v1/chat/completions`를 호출하면
**Then** status, content type, error envelope의 field/value/null-vs-omitted가 리팩터링 전 fixture와 같고
실패 요청의 materializer와 session commit은 0회다.

- [ ] **AC-22 - Anthropic validation/error parity**

**Given** 인증 실패, messages 누락/빈 배열, 응답 header 전 `BackendError`, 일반 예외, non-stream timeout인
Anthropic 요청 fixture가 있을 때
**When** `/v1/messages`를 호출하면
**Then** status, content type, error envelope의 field/value/null-vs-omitted가 리팩터링 전 fixture와 같고
실패 요청의 materializer와 session commit은 0회다.

- [ ] **AC-23 - 전체 회귀와 완료 게이트**

**Given** 041·042 완료 기준선과 사용자 기존 변경을 보존한 worktree에서
**When** 타입 검사, 전체 테스트, 빌드와 self-review를 수행하면
**Then** AC-01~AC-22 자동 테스트가 모두 green이고 041/042 계약과 공개 API에 새로운 회귀가 없으며
독립 self-review의 치명·중대 결함이 0건이다.

## Requirement traceability

| Requirement | Acceptance criteria |
|---|---|
| FR-1 | AC-01, AC-02, AC-03, AC-04, AC-17, AC-20 |
| FR-2 | AC-03, AC-04, AC-13, AC-17, AC-18, AC-20 |
| FR-3 | AC-13, AC-14, AC-20 |
| FR-4 | AC-05, AC-06, AC-09, AC-10, AC-15, AC-20 |
| FR-5 | AC-11, AC-12, AC-15, AC-19, AC-21, AC-22 |
| FR-6 | AC-16 |
| FR-7 | AC-01~AC-12, AC-18, AC-21, AC-22, AC-23 |
| FR-8 | AC-23 |

## Open questions

- OpenAI 공식 문서는 `stream_options.include_usage:true`일 때 마지막 empty-choices usage chunk 외의
  모든 chunk에도 `usage:null`이 포함된다고 설명한다. 현재 localmind는 중간 chunk에서 이 필드를
  생략한다. 043은 현행 wire를 보존하며, 공식 형식으로 맞출지는 별도 compatibility SDD와 사용자 결정이
  필요하다. 구현 당일 이 알려진 차이 외 추가 충돌이 발견되면 새 항목을 추가하고 wire를 바꾸지 않는다.
