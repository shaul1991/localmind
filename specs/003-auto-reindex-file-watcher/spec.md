# Spec: Auto-Reindex File Watcher

상위: [goal](goal.md)

## Scope

MCP 서버 프로세스 기동 시 `NOTES_DIR` 의 모든 `.md` 파일을 감시(watch)하고,
변경(추가/수정/삭제) 감지 시 해당 파일만 증분 reindex 한다.

## Context

현재 구조:
- `src/mcp.ts`: MCP stdio 서버 진입점. `buildServer()` 후 `connect()` → idle.
- `src/brain.ts`: `reindexFile(path)` (단일 파일 임베딩·인덱스 갱신), `FOLDERS` (감시 대상 폴더 목록) 존재.
- `make reindex`: `scripts/reindex.sh` → 전체 폴더 full reindex.

watcher는 `mcp.ts` 의 `main()` 함수 안에서 `server.connect()` 이후 추가로 기동되며,
stdout을 사용하지 않는다(stderr 로그만).

## Functional Requirements

- **FR-1 (watcher 자동 기동)**: `mcp.ts` 가 시작될 때 `NOTES_DIR` 의 모든 폴더에 대해
  파일 변경 watcher를 자동으로 시작한다.
  → goal: Objective, Expected outcome

- **FR-2 (증분 reindex — 추가/수정)**: `.md` 파일이 추가되거나 수정되면
  해당 파일에 대해 `reindexFile()` 을 호출한다.
  → goal: Objective (변경 파일만 증분 반영)

- **FR-3 (증분 reindex — 삭제)**: `.md` 파일이 삭제되면 인덱스에서 해당 파일 항목을 제거한다.
  → goal: Objective

- **FR-4 (디바운스)**: 같은 파일에 대한 이벤트가 짧은 시간 내 여러 번 발생하면(에디터 저장 패턴)
  마지막 이벤트 이후 500ms를 기다린 후 reindex를 1번만 수행한다.
  → goal: Constraints (CPU 상시 사용 ≤ 1%)

- **FR-5 (stderr 로그)**: watcher 이벤트 처리 시작/완료를 stderr에 기록한다(`[localmind-watcher]` 접두).
  stdout에는 아무것도 쓰지 않는다.
  → goal: Constraints (MCP 프로토콜 보호)

- **FR-6 (graceful 종료)**: 프로세스 종료 시(SIGINT/SIGTERM) watcher를 정리한다.
  → goal: Success metrics (기동/종료 자동 관리)

## Acceptance Criteria

- **AC-1**: Given MCP 서버가 기동됐을 때,
  When `NOTES_DIR` 폴더에 새 `.md` 파일을 저장하면,
  Then 5초 이내에 `search_notes` 에서 해당 파일 내용이 검색된다.

- **AC-2**: Given watcher가 동작 중일 때,
  When 기존 `.md` 파일을 수정하면,
  Then 수정된 내용으로 재인덱싱되고 `search_notes` 에 반영된다.

- **AC-3**: Given watcher가 동작 중일 때,
  When `.md` 파일을 삭제하면,
  Then 해당 파일 청크가 인덱스에서 제거된다.

- **AC-4 (엣지 — 디바운스)**: Given 에디터가 1초 동안 같은 파일을 10번 저장 이벤트를 발생시킬 때,
  When 마지막 이벤트 후 500ms 경과하면,
  Then reindex가 1번만 호출된다.

- **AC-5 (엣지 — 비-.md 파일)**: Given `.DS_Store`, `.json` 등 비-.md 파일이 변경될 때,
  Then reindex가 호출되지 않는다.

- **AC-6 (엣지 — 다중 폴더)**: Given `NOTES_DIR="work=/tmp/w,life=/tmp/l"` 설정 시,
  When 두 폴더 모두에서 파일 변경이 발생하면,
  Then 각각 감지·재인덱싱된다.

## Open questions

- `fs.watch` (Node.js 내장) vs `chokidar`: `fs.watch` 는 macOS에서 재귀 감시 미지원(Node 22 이전). `chokidar` 는 이미 `package.json` 에 있는지 확인 필요. 없으면 `node:fs` `recursive` 옵션(Node 20.12+) 사용.
- `reindexFile()` 이 현재 `brain.ts` 에서 export 되는지 확인 필요.
- 삭제된 파일의 인덱스 제거: 현재 `BrainIndex.files` 에서 키 삭제 후 JSON 재저장이면 되는지 확인.
