# Spec: Failure Query Analysis

상위: [goal](goal.md)

## Scope

`search_notes` / `ask_brain` 호출 시 쿼리와 결과를 로컬 JSONL 로그 파일에 기록하고,
`make query-report` 스크립트로 실패 패턴 분석 리포트를 생성한다.

## Context

001 `capture_note` 검증, 002 `ask_brain` 출처 추적이 구현된 후 착수.
해당 구현들이 이미 "출처 있음/없음", "인덱싱 확인/미확인" 정보를 생성하므로
이를 로그에 함께 담아 통합 분석한다.

현재 `brain.ts` 에 쿼리 로깅 구조 없음. `search_notes`, `askBrain` 함수에 side-effect로 추가.

## Functional Requirements

- **FR-1 (쿼리 로그 기록)**: `searchNotes()` / `askBrain()` 호출 시마다 아래 필드를 담은 JSONL 레코드를 로그 파일에 append한다.
  ```json
  { "ts": "ISO8601", "tool": "search_notes|ask_brain", "query": "...", "hitCount": 0, "success": false, "captureValidation": "confirmed|unconfirmed|skipped|null", "sources": ["..."] }
  ```
  → goal: Objective (쿼리 기록)

- **FR-2 (fire-and-forget 로깅)**: 로그 파일 쓰기 실패가 검색 응답을 블로킹하지 않는다.
  → goal: Constraints

- **FR-3 (로그 파일 위치)**: 기본 경로 `~/.localmind/query-log.jsonl`. `QUERY_LOG` 환경변수로 재설정 가능.
  → goal: Constraints

- **FR-4 (query-report 스크립트)**: `make query-report` 가 로그를 읽어 아래 분석을 출력한다:
  1. 최근 30일 총 쿼리 수·성공률
  2. 실패 쿼리 빈도 Top 10 키워드
  3. 인덱싱 미확인(`captureValidation: unconfirmed`) 빈도
  4. 출처 없음(`sources: []`) 빈도 — "노트 갭" 주제 목록
  5. 개선 제안 (키워드 기반 휴리스틱)
  → goal: Expected outcome

- **FR-5 (최소 샘플 경고)**: 로그 항목이 20건 미만이면 리포트 상단에 "데이터 부족 (N건) — 더 사용 후 재분석 권장" 경고.
  → goal: Risks (적은 데이터 품질)

- **FR-6 (로그 로테이션)**: 30일 이전 항목을 자동 삭제하는 `make query-log-clean` 명령 제공.
  → goal: Risks (무한 증가 방지)

## Acceptance Criteria

- **AC-1**: Given `search_notes("미팅 결론")` 호출 시,
  When 히트가 없으면,
  Then 로그 파일에 `{ "tool": "search_notes", "query": "미팅 결론", "hitCount": 0, "success": false, ... }` 레코드가 append된다.

- **AC-2**: Given `ask_brain("지난달 결정?")` 호출 시,
  When 출처 있는 답변이 생성되면,
  Then 로그에 `{ "tool": "ask_brain", "success": true, "sources": ["work/note.md"] }` 가 기록된다.

- **AC-3**: Given 로그 파일 기록 중 디스크 쓰기 오류가 발생해도,
  Then `search_notes` / `ask_brain` 의 응답은 정상 반환된다(블로킹 없음).

- **AC-4**: Given `make query-report` 실행 시,
  When 로그에 20건 이상의 데이터가 있으면,
  Then 성공률·실패 키워드 Top 10·개선 제안을 포함한 리포트가 출력된다.

- **AC-5 (엣지 — 로그 없음)**: Given 로그 파일이 존재하지 않을 때,
  When `make query-report` 실행 시,
  Then "로그 없음 — 먼저 search_notes/ask_brain을 사용하세요" 를 출력하고 exit 0.

- **AC-6 (엣지 — 20건 미만)**: Given 로그에 5건만 있을 때,
  When `make query-report` 실행 시,
  Then "데이터 부족 (5건)" 경고를 포함한 부분 리포트를 출력한다.

## Open questions

- 분석 스크립트 언어: Node.js (`scripts/query-report.mjs`) vs Python? 기존 `scripts/` 가 bash/Python 혼용이라 확인 필요.
- 키워드 추출: 한국어 형태소 분석이 필요한가? 일단 공백 분리 + stop word 제거 휴리스틱으로 시작.
- `captureValidation` 필드: 001 구현 후 `capture_note` 응답에서 값이 오는지 아니면 별도 로그에서 참조하는지 설계 결정 필요.
