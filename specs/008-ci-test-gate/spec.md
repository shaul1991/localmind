# Spec: CI Test Gate

상위: [goal](goal.md)

## Scope

CI 워크플로우에 단위 테스트(TS + 셸) 실행 단계를 추가하고, 테스트 공백이던 순수 로직
모듈 3개(transform.ts, tools.ts, session.ts)에 단위 테스트를 신규 작성한다.

## Context

- `.github/workflows/ci.yml`: build job(Node 20/22/24 매트릭스, typecheck+build) + docker job.
- `npm test` = `node --import tsx/esm --test src/**/*.test.ts` — 임베딩 불필요 테스트는
  기본 실행되고, 통합 테스트는 `LOCALMIND_INTEGRATION=1`일 때만 skip이 풀린다.
- 셸 테스트: `scripts/backup-extras.test.sh`, `scripts/restore-extras.test.sh` (임시 디렉토리
  기반, 외부 의존 없음).
- 미테스트 순수 로직: `transform.ts`(contentToText/flattenMessages/flattenAnthropic),
  `tools.ts`(normalize*/buildToolSystemPrompt/parseToolCalls), `session.ts`(SessionStore/
  extractExplicitId/prepareSession).

## Functional Requirements

- **FR-1 (CI에 npm test)**: build job의 typecheck 이후 단계로 `npm test`를 추가한다.
  매트릭스 전 버전(Node 20/22/24)에서 실행된다.
  → goal: Objective

- **FR-2 (CI에 셸 테스트)**: `scripts/*.test.sh`를 실행하는 단계를 추가한다(모든 `*.test.sh`를
  찾아 실행 — 개별 파일명 하드코딩으로 인한 누락 방지).
  → goal: Objective

- **FR-3 (transform 테스트)**: `contentToText`(문자열/파트배열/이미지/tool_use/tool_result),
  `flattenMessages`(단일 user/멀티턴 라벨링/system 추출/tool 결과 이름 매핑)의 단위 테스트를
  작성한다.
  → goal: Objective (테스트 공백 해소)

- **FR-4 (tools 테스트)**: `parseToolCalls`(정상 JSON/코드펜스 감싼 JSON/비JSON 텍스트/부분
  JSON), `normalizeOpenAITools`/`normalizeAnthropicTools`(정상/빈 배열/형식 오류),
  `normalize*Choice`의 단위 테스트를 작성한다.
  → goal: Objective

- **FR-5 (session 테스트)**: `SessionStore`(TTL 만료/max 초과 시 오래된 항목 제거),
  `extractExplicitId`(헤더 우선/필드 폴백), `prepareSession`(off 모드 무동작/explicit resume/
  auto prefix 매칭·consume-once)의 단위 테스트를 작성한다.
  → goal: Objective

- **FR-6 (통합 테스트 제외 문서화)**: ci.yml 주석에 "통합 테스트(LOCALMIND_INTEGRATION=1)는
  인증 CLI·임베딩 서버가 필요해 CI 제외"를 명시한다(기존 스모크 주석 관례 확장).
  → goal: Expected outcome

## Acceptance Criteria

- **AC-1**: Given 테스트를 깨뜨리는 코드 변경이 있을 때,
  When push/PR CI가 실행되면,
  Then build job이 실패한다(red).

- **AC-2**: Given 현재 코드베이스 그대로,
  When CI가 실행되면,
  Then Node 20/22/24 전 매트릭스에서 `npm test`와 셸 테스트가 통과한다(green).

- **AC-3**: Given `parseToolCalls`에 모델이 코드펜스로 감싼 tool_calls JSON을 출력한 경우,
  When 파싱하면,
  Then tool call이 정상 추출된다(기존 동작의 회귀 방지 고정).

- **AC-4**: Given `SessionStore`에 maxEntries를 초과해 항목을 넣으면,
  Then 가장 오래된 항목부터 제거된다.

- **AC-5**: Given auto 모드에서 같은 prefix로 두 번 resume을 시도하면,
  Then 두 번째는 fresh로 동작한다(consume-once 회귀 고정).

- **AC-6 (엣지)**: Given ubuntu 러너(비macOS)에서 셸 테스트를 실행하면,
  Then 임시 디렉토리·date 포맷 등 플랫폼 차이 없이 통과한다.

## Open questions

- `node --test`의 glob(`src/**/*.test.ts`)이 Node 20에서 셸 glob 확장에 의존하는지 확인
  필요 — CI의 기본 셸(bash)에서는 동작하나, 확실히 하려면 `--test src/` 디렉토리 지정 방식
  검토(plan에서 확정).
