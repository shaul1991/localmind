# Spec: Index Durability & Performance

상위: [goal](goal.md)

## Scope

`brain.ts`의 인덱스 IO 계층만 수정한다: (1) mtime 기반 인메모리 캐시, (2) temp+rename
원자적 쓰기, (3) `ensureIndexed()` 인프로세스 직렬화. 인덱스 포맷·외부 API는 불변.

## Context

현재 `brain.ts`:
- `loadIndex()`: 호출마다 `readFileSync(INDEX_PATH)` + `JSON.parse` (76MB 실측 vault 존재).
- `saveIndex()`: `writeFileSync(INDEX_PATH, ...)` 직접 덮어쓰기 — 중단 시 파일 손상.
- `ensureIndexed()`: `searchNotes`/`capture`/`noteLinks`/`reindex`/watcher가 모두 호출.
  동시 호출 시 각자 `loadIndex()`한 사본을 각자 `saveIndex()` — 마지막 쓰기 승리.
- `capture()`의 `checkIndexed()`와 `removeFromIndex()`도 `loadIndex()`를 직접 호출.

## Functional Requirements

- **FR-1 (인메모리 캐시)**: `loadIndex()`가 인덱스 파일의 mtime+size가 마지막 로드 시점과
  같으면 파싱된 인메모리 객체를 재사용한다. 다르면(외부 변경) 다시 읽는다.
  → goal: Objective, Risks (외부 변경 감지)

- **FR-2 (쓰기 후 캐시 갱신)**: `saveIndex()`가 저장한 객체와 저장 후 파일 stat을 캐시에
  반영해, 자기 저장 직후 조회가 디스크를 다시 읽지 않게 한다.
  → goal: Success metrics

- **FR-3 (원자적 쓰기)**: `saveIndex()`는 같은 디렉토리의 temp 파일에 먼저 쓰고
  `fs.renameSync`로 교체한다. 쓰기 도중 중단돼도 기존 인덱스 파일은 온전하다.
  → goal: Objective, Risks (동일 파일시스템 제약)

- **FR-4 (ensureIndexed 직렬화)**: `ensureIndexed()`가 이미 실행 중이면 새 호출은 새 실행을
  시작하지 않고 진행 중인 실행의 완료를 기다려 그 결과를 공유한다(single-flight).
  → goal: Objective, Success metrics (실행 횟수 = 1)

- **FR-5 (removeFromIndex 정합)**: `removeFromIndex()`도 캐시를 경유해 동작하고 저장 시
  캐시를 갱신한다(캐시와 파일의 불일치 금지).
  → goal: Expected outcome

## Acceptance Criteria

- **AC-1 (캐시 적중)**: Given 인덱스가 한 번 로드된 후 파일이 변경되지 않았을 때,
  When `loadIndex()`를 다시 호출하면,
  Then 파일 내용을 다시 읽지 않고 같은 객체를 반환한다.

- **AC-2 (외부 변경 감지)**: Given 캐시가 있는 상태에서 외부 프로세스가 인덱스 파일을
  수정(mtime/size 변화)했을 때,
  When `loadIndex()`를 호출하면,
  Then 파일을 다시 읽어 새 내용을 반환한다.

- **AC-3 (원자적 쓰기)**: Given `saveIndex()` 실행 시,
  When 저장이 완료되면,
  Then temp 파일은 남지 않고 인덱스 파일이 교체돼 있다. (쓰기 중단 시나리오: temp 단계에서
  중단돼도 원본 인덱스는 파싱 가능해야 한다.)

- **AC-4 (single-flight)**: Given `ensureIndexed()`를 동시에 3회 호출하면,
  Then 파일 스캔·인덱싱 파이프라인은 1회만 실행되고 3개 호출 모두 같은 결과를 받는다.

- **AC-5 (회귀 없음)**: Given 기존 001~007 테스트 스위트,
  When 이번 변경 후 실행하면,
  Then 전부 통과한다(외부 API·포맷 불변).

- **AC-6 (엣지 — 캐시 후 삭제)**: Given 캐시가 있는 상태에서 인덱스 파일이 삭제됐을 때,
  When `loadIndex()`를 호출하면,
  Then 빈 인덱스(신규)를 반환한다(낡은 캐시 반환 금지).

## Open questions

- ~~다중 프로세스 동시 쓰기(MCP 서버 + `make reindex` 동시 실행)는 이번 범위 밖 — rename
  원자성 덕에 파일 손상은 없지만 마지막 쓰기 승리는 여전함. 실사용에서 문제가 되면
  파일 락(lockfile) 도입을 별도 spec으로.~~
- ~~mtime 해상도(일부 파일시스템 1초 단위)로 인해 같은 초 내 외부 변경을 놓칠 가능성 —
  size 병행 확인으로 대부분 커버되나, 완벽하지 않음을 코드 주석에 명시.~~
