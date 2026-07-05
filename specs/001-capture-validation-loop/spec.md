# Spec: Capture Validation Loop

상위: [goal](goal.md)

## Scope

`capture_note` MCP 도구가 파일 저장 + 임베딩 인덱싱을 완료한 직후,
저장된 내용이 `search_notes` 로 검색 가능한지 자동으로 검증한다.
실패 시 reindex를 1회 재시도하고 결과를 응답에 포함한다.

## Context

현재 `capture_note` 흐름:
1. `brain.ts` → `capture()` → 파일 쓰기 → `reindexFile()` (단일 파일 임베딩)
2. mcp-server.ts → `capture_note` 핸들러 → 결과 텍스트 반환

검증 레이어가 없어 인덱싱 실패가 묵살된다. `searchNotes()` 함수는 이미 `brain.ts` 에 존재하며
재사용 가능하다.

## Functional Requirements

- **FR-1 (재검색 자동 수행)**: `capture_note` 가 파일 저장 + 초기 인덱싱을 완료하면,
  저장된 텍스트에서 핵심 키워드(첫 50자 또는 제목 줄)를 추출해 즉시 `searchNotes()` 를 호출한다.
  → goal: Objective (저장 = 검색 가능 보장)

- **FR-2 (검증 성공 응답)**: 재검색 결과에 방금 저장한 파일이 1개 이상 포함되면
  응답 텍스트에 "✅ 인덱싱 확인됨" 을 추가한다.
  → goal: Expected outcome

- **FR-3 (검증 실패 → reindex 재시도)**: 재검색 히트가 없으면 `reindexFile()` 을 1회 재시도하고
  재검색을 다시 수행한다.
  → goal: Objective (실패 시 자동 재시도)

- **FR-4 (경고 응답)**: 재시도 후에도 히트 없으면 응답에 "⚠️ 인덱싱 미확인 — 수동 `make reindex` 권장" 을 포함한다.
  → goal: Expected outcome / Constraints (graceful fallback)

- **FR-5 (성능 보호)**: 재검색 + 재시도 전체가 타임아웃(기본 3초)을 초과하면 경고만 출력하고
  정상 흐름을 계속한다(캡처 자체를 실패 처리하지 않는다).
  → goal: Constraints (지연 증가 허용 범위)

## Acceptance Criteria

- **AC-1**: Given 유효한 텍스트로 `capture_note` 호출 시,
  When 파일 저장 + 임베딩이 정상 완료되면,
  Then 응답에 "✅ 인덱싱 확인됨" 이 포함된다.

- **AC-2**: Given `capture_note` 호출 시,
  When 초기 임베딩은 성공했으나 재검색에서 히트가 없으면,
  Then `reindexFile()` 재시도 후 재검색 수행 → 히트 시 "✅" 반환.

- **AC-3 (엣지 — 영구 실패)**: Given 임베딩 서버 다운 상태에서 `capture_note` 호출 시,
  When 초기 인덱싱 + 재시도 모두 실패하면,
  Then 파일은 저장되고 응답에 "⚠️ 인덱싱 미확인" 경고가 포함된다(캡처 자체는 성공).

- **AC-4 (엣지 — 타임아웃)**: Given 재검색이 3초를 초과하면,
  Then 검증을 건너뛰고 기존 캡처 성공 응답을 반환한다(블로킹 없음).

- **AC-5 (엣지 — 짧은 텍스트)**: Given 텍스트가 10자 미만이면,
  Then 재검색을 수행하지 않고 "저장 완료 (텍스트 너무 짧아 검증 생략)" 을 반환한다.

## Open questions

- ~~재검색 키워드 추출 전략: 첫 N자 vs 제목 줄(`# 제목`) vs 형태소 분석? 일단 첫 50자로 시작.~~
- ~~검증 성공 기준: "방금 저장한 파일이 결과에 있음" vs "코사인 유사도 > 임계값"?
  파일 경로 일치 비교가 더 정확하고 구현이 단순해 이걸 우선.~~
