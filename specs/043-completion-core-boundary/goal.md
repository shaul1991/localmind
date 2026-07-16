# 043 — Completion Core 경계 통합

## Background

localmind는 OpenAI 호환 `POST /v1/chat/completions`와 Anthropic 호환
`POST /v1/messages`를 함께 제공한다. 두 엔드포인트는 외부 요청·응답 형식은 다르지만, 내부적으로는
모델에서 backend를 고르고, 대화를 이어 갈 세션을 준비하고, 도구 호출 지침을 붙이고, 실행을 취소하거나
시간 제한을 적용하고, 성공한 결과를 세션에 반영하는 같은 업무 흐름을 수행한다.

현재 이 흐름은 `src/routes/chat.ts`와 `src/routes/messages.ts`에 각각 구현되어 있다. 이 때문에 한쪽에만
수정이 들어가면 세션 재사용 조건, 취소 처리, 도구 호출, 사용량 집계가 프로토콜마다 달라질 수 있다.
라우트가 HTTP 변환과 업무 흐름을 동시에 소유해, 공통 동작을 한 번에 검증하기도 어렵다.

## Problem

1. 동일한 completion 업무 흐름이 두 라우트에 중복되어 변경 누락 위험이 있다.
2. 세션 호환성 판정이 backend·실제 사용 모델·지침·도구 계약 전체를 대표하지 않으면, 이전 실행과
   의미가 다른 요청이 잘못 resume될 수 있다.
3. 성공·실패·취소 분기가 여러 곳에서 세션을 갱신하면 중복 commit 또는 실패 결과 commit을 막기 어렵다.
4. 기존 키를 `Map.set()`만으로 덮어쓰면 삽입 순서가 갱신되지 않아, 최근 완료된 세션이 용량 초과 시
   먼저 제거될 수 있다.
5. 중복 제거 과정에서 OpenAI/Anthropic의 공개 HTTP·JSON·SSE 형식을 바꾸면 기존 클라이언트가 깨진다.

## Objective

- **O1. 단일 업무 경계:** 프로토콜에 독립적인 completion core가 공통 실행 흐름과 상태 전이를 한 번만
  구현하게 한다.
- **O2. 명시적 호환성:** 세션을 이어 갈 수 있는 조건을 완전하고 결정적인 signature로 정의한다.
- **O3. 상태 안전성:** 성공한 completion은 정확히 한 번 commit하고, 실패·시간 초과·클라이언트 취소는
  commit하지 않는다.
- **O4. 외부 호환성:** OpenAI와 Anthropic 엔드포인트의 현재 공개 응답 형식을 그대로 보존한다.
- **O5. 실제 최근성:** 성공적으로 다시 사용된 세션을 가장 최근 항목으로 옮겨 용량 기반 제거가 실제
  최근 완료 순서를 따르게 한다.

## Success metrics

- [ ] `CompletionInput`, `CompletionEvent`, `CompletionResult`와 generic materialization port로 표현되는
  protocol-neutral core 계약이 있고 두 라우트가 모두 같은 core를 호출한다. (O1)
- [ ] backend, effective model, history 내 system/developer 지침의 역할·상대 위치, tools, tool choice 또는
  대화 tool metadata 중 하나라도 달라지면 기존 backend session을 resume하지 않고 정규화된 전체
  history로 새 실행을 시작한다. (O2)
- [ ] 정상·도구 호출 completion은 materializer와 session commit이 요청당 각 1회, backend/materializer
  오류·시간 초과·클라이언트 취소는 commit 0회임을 자동 테스트로 검증한다. (O3)
- [ ] OpenAI/Anthropic 각각 일반 응답, streaming, tool call, usage, 중간 오류, 클라이언트 취소,
  validation/pre-header 오류 테스트가 리팩터링 전후 같은 공개 형식을 검증한다. (O4)
- [ ] 기존 resume/fresh 판정이 동일한 interleaved 지침, multimodal placeholder, tool history fixture에서
  backend가 받은 `model/system/prompt/resumeId`가 리팩터링 전후 바이트 단위로 같다. 첫 tool-call 다음
  tool-result resume 개선은 이 parity 범위에서 제외한다. (O1, O4)
- [ ] 양 protocol에서 첫 tool-call 공개 ID가 materialized history와 일치하고 다음 tool-result 요청이
  해당 backend session을 안전하게 resume한다. (O2, O3)
- [ ] `sessionMax=2`에서 A, B, A 갱신, C 순서로 commit하면 B가 제거되고 A와 C가 남는다. (O5)
- [ ] 타입 검사, 전체 자동 테스트, 빌드가 통과하고 self-review에서 치명·중대 결함이 0건이다.

## Non-goals

- OpenAI Chat Completions 또는 Anthropic Messages 공개 API의 필드·상태 코드·SSE 이벤트를 새로 설계하지
  않는다.
- backend adapter(`codex`, `claude`, `gemini` 등)의 모델 실행 방식이나 선택 정책을 바꾸지 않는다.
- 도구 호출 JSON 추출 알고리즘, 프롬프트 문구, 도구 실행 기능을 새로 추가하지 않는다.
- 세션을 영구 저장하거나 여러 localmind 프로세스 사이에 공유하지 않는다.
- Responses API 등 새 외부 프로토콜을 추가하지 않는다.
- 검색, 캡처, MCP, 웹 UI, 설치 흐름은 변경하지 않는다.
- 성능 최적화를 위해 streaming chunk를 합치거나 순서를 바꾸지 않는다.

## Intended internal behavior changes

- model/instruction/tool signature가 다른 요청은 기존의 잘못된 resume 가능성 대신 fresh full-history로 간다.
- adapter가 만든 tool-call ID를 committed assistant history에도 사용해 바로 다음 tool-result 요청이 기존의
  accidental fresh 대신 같은 backend session을 resume한다.
- 성공적으로 다시 `set`된 session은 eviction 순서의 최신 위치로 이동한다.

이 세 항목은 043의 명시적 business-logic 개선이다. 공개 endpoint와 wire shape 보존은 유지하지만,
잘못된 세션 접합을 막거나 안전한 연속성을 복구하면서 backend invocation과 결과 내용은 달라질 수 있다.

## Constraints

- 외부 HTTP·JSON·SSE wire shape와 오류 표면은 현재 동작을 특성 테스트로 먼저 고정하고 그대로 유지한다.
- core에는 Express의 `Request`/`Response`, OpenAI/Anthropic wire type, SSE writer를 전달하지 않는다.
- 라우트 validation 이후의 정규화된 값만 core에 전달한다. HTTP 응답이 시작된 뒤 오류를 표현하는 방식은
  각 protocol adapter가 현재 동작대로 책임진다.
- 세션 signature는 backend 해석 후의 effective 값으로 만들며, 안정적인 canonical serialization을
  사용한다. 객체 key 순서는 정렬하되 의미 있는 배열 순서는 보존한다.
- 세션 mismatch 시 이전 backend session id/token을 전달하지 않는다. 요청에 포함된 정규화된 전체
  메시지 history를 사용한다.
- 성공 결과의 세션 commit은 core 안 한 지점에서만 수행한다. abort/timeout/error 경로에서는 commit을
  호출하지 않는다.
- 사용자가 이미 수정한 파일과 이 작업 범위 밖 파일은 변경하지 않는다.
- 구현은 `041 → 042 → 043` 순서로 진행하며, 041·042가 clean 상태로 완료된 뒤 시작한다.
- 시간에 따라 바뀔 수 있는 프로토콜 사실은 구현 시점의 최신 공식 문서를 다시 확인한다.

## Stakeholders

- localmind를 설치해 OpenAI 또는 Anthropic 호환 클라이언트를 연결하는 단일 사용자
  (설치한 개인 누구나, 비개발자 포함)
- completion backend와 HTTP adapter를 유지보수하는 프로젝트 기여자
- 이 SDD를 받아 구현·테스트·검토하는 후속 AI 에이전트

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| core 추출 중 wire event 순서·필드가 바뀜 | 기존 SDK/클라이언트 회귀 | 변경 전 protocol별 golden/characterization test 작성, byte/event 순서 비교 |
| session signature가 누락되거나 비결정적임 | 다른 맥락을 잘못 resume | 필수 요소별 mismatch parameterized test, canonical serializer 단위 테스트 |
| 공개 tool ID와 committed history가 다름 | tool-result 다음 턴이 fresh 또는 잘못 접합 | adapter materialization port, 양 protocol 2-turn end-to-end test |
| stream 종료와 backend 완료가 경합함 | 이중 commit 또는 취소 후 commit | core 단일 commit 지점, terminal state guard, 경합 테스트 |
| 오류를 공통화하며 protocol별 오류 형식이 섞임 | 공개 API 호환성 파손 | core는 typed failure만 전달하고 route adapter가 기존 형식 렌더링 |
| LRU 수정이 TTL 의미를 바꿈 | 예상 밖 세션 생존/제거 | delete+set 변경만 적용, TTL 특성 테스트 유지 |
| 041·042 병합 후 파일 구조가 달라짐 | 구현 충돌·누락 | 구현 시작 시 rebase 후 symbol 기준으로 영향 범위 재확인, 이 문서의 경계 계약 우선 |
