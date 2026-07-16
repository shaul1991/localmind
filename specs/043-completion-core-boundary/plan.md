# 043 — Completion Core 경계 통합 구현 계획

## Architectural boundary

```text
OpenAI HTTP request                 Anthropic HTTP request
        |                                    |
        v                                    v
chat route adapter                  messages route adapter
validate + normalize                validate + normalize
        |                                    |
        +------------ CompletionInput -------+
                             |
                             v
                    protocol-neutral core
       resolve backend/effective model -> prepare session
       -> tool prompt -> execute/abort/timeout -> parse result
       -> exactly-once commit
                             |
        started(effectiveModel), text-delta / CompletionResult
                             |
        +--------------------+--------------------+
        v                                         v
OpenAI JSON/SSE renderer                 Anthropic JSON/SSE renderer
```

의존 방향은 route adapter → completion core → 기존 Router/backend·SessionStore·공통 tool helper다. core는
route 또는 wire type을 역으로 import하지 않는다. 서버 composition root가 동일한 core instance를 두
handler에 주입한다. 각 adapter는 core가 성공 결과 뒤 호출할 generic materializer를 넘기며, callback은
공개 ID를 포함한 normalized assistant history와 opaque presentation을 돌려준다. core가 이를 commit한 뒤
presentation을 adapter에 반환하므로 wire type 의존 방향은 역전되지 않는다.

## Impacted modules

- 신규 `src/completion/types.ts`, `signature.ts`, `prompt.ts`, `core.ts`: ordered history 계약,
  canonical signature/continuity, 현행 prompt 조립, terminal-state/abort 조율과 use case.
- 기존 OpenAI/Anthropic routes: validation·normalization·wire rendering만 남기고 공통 orchestration을 제거.
- 기존 session store: compatibility metadata를 완전한 signature로 보관하고 `set`의 delete+set recency를 보장.
- `src/transform.ts`: 기존 public transform을 보존하면서 ordered history 정규화와 protocol-neutral prompt
  helper에 위임하는 최소 변경. 기존 transform 테스트는 그대로 유지한다.
- 직접 테스트: core unit tests, 두 route characterization/integration tests, session tests.

`brain`, MCP, UI, backend adapter 내부 알고리즘, tool parser/prompt 문구는 수정하지 않는다. 기존 helper가
필요하면 core에서 호출하되 동작을 복제하지 않는다.

## Dependency gate

1. 041의 테스트·self-review·문서 체크가 clean인지 확인한다.
2. 042가 그 위에서 clean인지 확인하고 최신 기준선으로 rebase한다.
3. `git status --short`를 기록하고 사용자 소유 변경을 식별한다. 현재 범위 밖 변경은 건드리지 않는다.
4. 두 선행 SDD의 공개/내부 계약과 충돌하면 구현을 멈추고 spec의 Open questions에 기록한다.

## Implementation phases

### Phase 1 — 현행 wire 동작 고정

- [ ] AC-01~AC-12 각각에 대응하는 protocol integration/characterization test를 만든다.
- [ ] AC-18의 backend invocation fixture를 리팩터링 전에 만들고 fake backend가 받은
  `model/system/prompt/resumeId`를 고정한다. 현재 route로 만들 수 없는 slice 밖 call-result 사례는 기존
  `flattenMessages(sendMessages)` 직접 결과를 기준값으로 고정한다. AC-20의 첫 tool-call 다음 resume
  개선 사례는 parity fixture에서 제외한다.
- [ ] AC-21/AC-22의 protocol별 auth/validation/pre-header error/non-stream timeout fixture를 기존 코드에서
  고정한다.
- [ ] deterministic fake backend로 text delta, tool result, usage, normal/tools-on delta 후 오류, pending
  request를 제어한다.
- [ ] 응답 body만 아니라 status, content type, 중요한 header, JSON null/누락, SSE event/data 순서와 종료를
  검증한다.
- [ ] AC-01~12, AC-18, AC-21~22 characterization만 기존 코드에서 green인지 확인한다. core 호출,
  listener cleanup, materialized resume 요구를 이 기준선에 섞지 않는다.
- [ ] 공식 문서 세 링크를 구현 당일 재확인하고 retrieval date를 self-review 기록에 남긴다.

### Phase 2 — 실패 테스트와 내부 계약 도입

- [ ] 존재하지 않는 공통 core 진입점과 internal contracts를 대상으로 AC-17 compile/unit test를 먼저 작성해
  red를 확인한다.
- [ ] signature 필수 입력, instruction 상대 위치, continuity tool metadata의 동일/불일치에 대한
  AC-13·AC-14 parameterized tests를 작성해 red를 확인한다.
- [ ] 성공/오류/timeout/cancel 경합의 commit count를 검사하는 AC-15 tests를 작성해 red를 확인한다.
- [ ] A, B, A, C 제거 순서의 AC-16 test를 추가해 red를 확인한다.
- [ ] 모든 terminal path의 listener/timer AC-19와 두 protocol tool-call→tool-result resume AC-20을 red로
  만든다.

### Phase 3 — SessionStore와 core 최소 구현

- [ ] 기존 key를 `delete` 후 `set`하도록 SessionStore recency를 최소 변경하고 기존 TTL behavior를 보존한다.
- [ ] wire type을 참조하지 않는 `NormalizedHistoryItem`, `CompletionInput`, `CompletionEvent`,
  `CompletionResult`, generic materialization 계약과 normalized value types를 도입한다.
- [ ] stable serializer와 schema version을 구현하고 signature에는 backend/effective model/source-indexed
  instructions/tools/tool choice, continuity에는 ordered history와 tool metadata를 빠짐없이 넣는다.
- [ ] Router/backend/session/tool dependencies를 주입받는 core를 만들고, 기존 공통 helper를 재사용한다.
- [ ] core가 sendHistory를 선택한 뒤 그 slice 안의 explicit tool calls로 현행 prompt를 조립하게 한다.
  adapter가 full-history prompt를 미리 만들지 않는다.
- [ ] core가 backend 실행 전에 `started.effectiveModel`을 1회 내고, normal mode에서만 backend delta를
  `text-delta`로 전달하도록 만든다.
- [ ] client abort + timeout signal 결합과 cleanup을 core에 모은다.
- [ ] 두 route는 완료·실패 시 `Response` close listener를 제거하고, tools-on 실행은 raw backend delta를
  외부 event로 전달하지 않는지 검증한다.
- [ ] 성공 결과마다 adapter materializer를 1회 호출하고 반환된 assistant history로 core 한 지점에서만
  commit한다. materializer throw는 commit 0회다.
- [ ] core 단위의 AC-13~17과 AC-19 core cleanup 부분을 green으로 만든다.

### Phase 4 — Protocol adapter 전환

- [ ] OpenAI route를 validation/normalization 및 JSON/SSE rendering adapter로 축소하고 공통 core를 호출한다.
- [ ] OpenAI materializer가 현행 `call_` ID와 같은 ID를 assistant history/presentation에 넣게 한다.
- [ ] AC-01, 03, 05, 07, 09, 11을 즉시 실행해 OpenAI wire parity를 확인한다.
- [ ] Anthropic route를 같은 core에 연결하고 protocol별 stop/tool/event 변환만 남긴다.
- [ ] Anthropic materializer가 현행 `toolu_` ID와 같은 ID를 assistant history/presentation에 넣게 한다.
- [ ] AC-02, 04, 06, 08, 10, 12를 즉시 실행해 Anthropic wire parity를 확인한다.
- [ ] 서버 composition에서 같은 core dependency가 두 handler에 주입되는지 AC-17로 검증한다.
- [ ] 두 route 전환 뒤 AC-18 backend invocation fixture가 바이트 단위로 같은지 검증한다.
- [ ] AC-20의 첫 tool-call부터 다음 tool-result까지 실제 resume를 양 protocol에서 검증한다.
- [ ] route close listener까지 포함한 AC-19 전체를 green으로 만든다.
- [ ] AC-21/22 오류 fixture가 그대로이고 실패 materializer/commit이 0회인지 검증한다.

### Phase 5 — 회귀·문서·self-review

- [ ] targeted tests, 타입 검사, 전체 테스트, 빌드를 순서대로 실행한다.
- [ ] `goal.md` Success metrics, `spec.md` FR/AC, 이 문서 단계·테스트 전략에 구현 근거를 붙여 `[x]`로
  갱신한다. 미충족은 체크하지 않고 사유를 적는다.
- [ ] 독립 컨텍스트의 적대적 self-review로 FR→AC→test 1:1, 오류/경합, 보안, 불필요한 복잡도,
  live-verified facts를 점검한다.
- [ ] 결함을 고친 뒤 영향 테스트와 self-review를 반복해 치명·중대 0으로 AC-23을 닫았을 때만
  `/goal 043` 완료 규약에 따라 commit/push/CI watch를 수행한다.

## Test strategy

### Unit

- [ ] canonical signature: 객체 key order에는 불변, 배열 순서·whitespace·null·각 필수 요소 변화에는 민감.
- [ ] session decision: match resume, signature 입력별 mismatch, instruction relative-position mismatch,
  continuity tool-metadata mismatch, version mismatch는 fresh.
- [ ] prompt slice: fresh는 prior call name을 tool result에 연결하고 resume suffix는 slice 밖 call name을
  연결하지 않으며 기존 bytes와 같다.
- [ ] terminal guard: success는 materialize 1/commit 1, materializer throw 포함 비성공은 commit 0,
  resolve/abort/timeout 경합은 terminal state 1개.
- [ ] signal lifecycle: pre-abort는 backend 0회, timeout과 client abort 전달, core와 route listener/timer cleanup.
- [ ] SessionStore: A/B/A/C eviction과 기존 TTL/max behavior.
- [ ] event lifecycle: pre-abort는 event 0회, 나머지 실행의 첫 event는 resolved effective model을 가진
  `started` 1회.

### Protocol integration

- [ ] OpenAI AC-01/03/05/07/09/11을 각각 독립 test case로 둔다.
- [ ] Anthropic AC-02/04/06/08/10/12를 각각 독립 test case로 둔다.
- [ ] fake backend와 fake clock을 사용해 네트워크·실제 모델·wall-clock에 의존하지 않는다.
- [ ] stream fixture는 chunk 경계를 임의로 재분할하지 않고 event 순서와 payload 의미를 검증한다.
- [ ] tools-on fixture는 backend가 여러 raw JSON delta를 내도 protocol tool event 전에는 그 text가 노출되지
  않음을 검증한다.
- [ ] AC-18 fixture는 interleaved instructions, empty/multiline, image placeholder, tool call/result,
  Anthropic system blocks, slice 밖 call을 참조하는 resumed result와 fresh/resume의 backend 입력을 비교한다.
- [ ] AC-20은 양 protocol의 실제 공개 call ID가 다음 요청 normalization과 저장 continuity에서 일치하는지
  end-to-end로 검증하고 pre=fresh/full prompt, post=resume/suffix prompt 차이를 의도된 개선으로 고정한다.
- [ ] AC-21/22는 auth/invalid body/BackendError/generic error/non-stream timeout의 status/body를 각각 고정한다.

### Regression commands

구현자는 `package.json`의 현재 script를 정본으로 다음을 실행한다.

```bash
npm run typecheck
npm test
npm run build
```

script 이름이 기준선과 달라졌다면 같은 목적의 기존 script를 사용하고, 새 임시 검증 명령을 제품 파일에
추가하지 않는다. 샌드박스가 socket bind 등으로 전체 테스트를 막으면 동일 명령을 승인된 환경에서 다시
실행하고 환경 제약과 재실행 결과를 모두 기록한다.

## Rollback and failure handling

- 각 route 전환은 별도 작은 단계로 유지해 한 protocol의 parity가 깨지면 해당 adapter 전환만 되돌려
  core/session tests를 보존한다.
- 공개 wire fixture가 달라지면 기대값을 갱신해 통과시키지 않는다. 의도한 변경인지 사용자 결정을 받은
  별도 SDD가 없으면 구현 결함으로 처리한다.
- 공식 OpenAI 형식과 현행의 `usage:null` 차이는 spec Open question에 기록된 선행 사실이다. 043에서는
  현행 omission을 보존하고 새 expectation으로 고치지 않는다.
- signature mismatch에서 full history가 구성되지 않거나 현재 session 연속성 규칙을 보존할 수 없으면
  추측하지 말고 중단해 Open question으로 올린다.
- abort 후 backend가 늦게 resolve하는 사례에서 commit이 발생하면 완료 불가 결함이다.

## Completion evidence

최종 보고에는 다음을 포함한다.

- AC-01~AC-22 각각의 자동 test 이름과 결과, AC-23 완료 게이트 근거
- 타입 검사·전체 테스트·빌드 결과
- 리팩터링 전후 public fixture parity 결과
- live verification URL과 실제 확인일
- self-review 라운드, 발견·수정 결함, 최종 치명·중대 건수
- 사용자 소유 변경을 보존했다는 `git diff --stat`/`git status` 근거
