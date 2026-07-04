# Spec: Failure Query Analysis

> **025 개정**: 로그 레코드에 `topScore`(최상위 스코어)가 additive로 추가되고 search_notes에도
> `sources`가 기록된다 — [specs/025](../025-search-observability/spec.md) FR-1·2. 백업 고지도
> "노트 경로" 포함으로 확장(FR-5).

상위: [goal](goal.md)

## Scope

`search_notes` / `ask_brain` 호출 시 쿼리와 결과를 로컬 JSONL 로그 파일에 기록하고,
`make query-report` 스크립트로 실패 패턴 분석 리포트를 생성한다.

## Context

> 2026-07-03 재검(013 구현 이후 기준) — 이 스펙은 001~003 직후 작성됐고, 이후 009(인덱스
> 캐싱)·011(soft-delete)·013(청크 분할·임베딩 메타·다중 프로세스 락)이 `brain.ts`를 크게
> 바꿨다. 아래 Context를 현재 코드 기준으로 갱신했다.

- 001~003·013 **구현 완료**: `capture()`가 `CaptureResult.validationStatus`
  ("confirmed"/"unconfirmed"/"skipped")를 반환하고, `askBrain()`이 `sources: string[]`를
  반환한다(`src/brain.ts`). 이 값들을 로그에 담을 준비가 돼 있다.
- `searchNotes(query, limit, folder?)` / `askBrain(question, k, folder?)`는 `folder`
  스코프 파라미터를 받는다(다중 노트 폴더) — 로그 레코드에 스코프도 기록해야 실패
  분석이 왜곡되지 않는다(전체 검색 실패 vs 좁은 폴더 검색 실패는 다른 신호).
- 현재 `brain.ts`에 쿼리 로깅 구조 없음. `searchNotes`/`askBrain`에 side-effect로 추가.
- ⚠️ 기본 노트 폴더(`~/.localmind`)는 **백업 git repo이기도 하다** — 로그 파일을 그 안에
  두면 `make backup`이 개인 쿼리 패턴을 원격에 커밋한다. goal Constraints(".gitignore
  추가")에 더해, 백업 파이프라인(`scripts/backup.sh`)의 .gitignore 시드 목록에도
  `query-log.jsonl`을 추가해야 한다(015에서 신설된 파일).
- 013이 검색 정확성 결함(청크 유실)을 수정했으므로, 이 스펙의 실패 데이터는 "색인 버그"가
  아니라 "실제 노트 갭·질의 품질"을 반영한다 — goal의 착수 전제 충족.

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

## Open questions — 2026-07-03 재검으로 확정

- ~~분석 스크립트 언어~~ → **TypeScript(tsx) `scripts/query-report.ts` + npm 스크립트**로
  확정. 근거: 기존 scripts/의 Node 유틸은 전부 tsx(.ts) 관례(reindex.ts·memory-export.ts),
  Python은 컨테이너 패치 전용.
- ~~키워드 추출~~ → **공백 분리 + 한국어 조사 제거 휴리스틱으로 시작** 확정(형태소 분석
  의존성 도입 금지 — Simplicity First. 데이터가 쌓여 부족이 증명되면 재론).
- ~~`captureValidation` 연동~~ → **capture 이벤트를 별도 레코드(tool:"capture_note")로
  기록**하고, search/ask 레코드에는 포함하지 않는 것으로 확정. `capture()`가
  `validationStatus`를 이미 반환하므로 호출 지점에서 바로 기록 가능(흐름 연결 불필요).
- (신규) 로그 레코드에 `folder` 스코프 포함 — 다중 폴더 도입(013 이전 be19bd0) 반영.
