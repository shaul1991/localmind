# Plan: Auto-Reindex File Watcher

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`src/brain.ts` 에 `watchNotes(onEvent)` 함수를 추가한다.
Node.js `fs.watch` 의 `recursive` 옵션(Node 20.12+, macOS/Linux 지원)을 사용해
외부 라이브러리 없이 구현한다. `chokidar` 가 이미 의존성이면 그것을 우선 사용한다.
파일 이벤트는 파일 경로별 `setTimeout` 디바운스(500ms)로 처리한다.
`src/mcp.ts` 의 `main()` 에서 `watchNotes()` 를 호출해 watcher를 기동하고
SIGINT/SIGTERM 핸들러에서 정리한다.

## 도메인 경계 (DDD)

- **second-brain 도메인**: "노트 파일(정본)과 인덱스(파생)의 실시간 동기화"가 책임.
  watcher는 파생물 갱신 트리거이고, 정본(파일)을 직접 수정하지 않는다.
- **유비쿼터스 언어**:
  - *파일 이벤트(file event)*: OS가 보고하는 파일 변경 신호 (추가/수정/삭제)
  - *디바운스(debounce)*: 연속 이벤트를 마지막 것으로 통합해 reindex 중복 방지
  - *증분 reindex(incremental reindex)*: 변경 파일만 재임베딩 (full reindex 대비)

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | `watchNotes()` 함수 추가, `removeFromIndex()` (삭제 처리) 추가, `reindexFile()` export 확인 |
| `src/mcp.ts` | 수정 | `main()` 에서 `watchNotes()` 기동, SIGINT/SIGTERM 핸들러 추가 |
| `package.json` | 확인 | `chokidar` 의존성 여부 확인 (없으면 추가 또는 `fs.watch` 사용) |
| `src/brain.test.ts` | 수정/신규 | `watchNotes()` 디바운스 / 이벤트 처리 테스트 |

## 단계 (task 분해 가능)

1. **의존성 확인**: `package.json` 에 `chokidar` 있으면 사용, 없으면 Node.js `fs.watch` + `recursive` 옵션으로 진행. Node 버전 확인(`.nvmrc` 또는 `package.json` `engines`).

2. **`brain.ts` — `removeFromIndex(filePath)`**: 인덱스 파일에서 해당 파일 키를 삭제하고 저장하는 함수 구현. (기존 `BrainIndex.files` 구조 활용)

3. **`brain.ts` — `reindexFile()` export 확인**: 이미 export 되어 있으면 그대로 사용. 없으면 `export` 추가.

4. **`brain.ts` — `watchNotes()`**:
   ```
   watchNotes(): { close(): void }
   ```
   - `FOLDERS` 의 각 폴더에 `fs.watch(dir, { recursive: true })` 또는 `chokidar.watch(dirs)` 설정
   - 이벤트마다 `.md` 파일인지 확인 (비-.md 무시)
   - 파일 경로별 `debounceMap: Map<string, NodeJS.Timeout>` 관리
   - 디바운스 500ms: 이전 타이머 취소 후 새 타이머 설정
   - 타이머 만료 시: 파일 존재하면 `reindexFile()`, 없으면 `removeFromIndex()`
   - `[localmind-watcher]` 접두로 stderr 로그 출력
   - `close()` 호출 시 watcher + 대기 타이머 모두 정리

5. **`mcp.ts` — watcher 기동 및 정리**:
   - `server.connect()` 이후 `const watcher = watchNotes()` 호출
   - `process.on('SIGINT'/'SIGTERM', () => { watcher.close(); process.exit(0); })`

6. **테스트 작성**: AC-1 ~ AC-6 커버 (파일 IO mock 또는 임시 디렉토리 사용).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (새 파일 → 검색 반영) | 통합 | 임시 폴더에 파일 쓰기 → `reindexFile` 호출 여부 spy |
| AC-2 (수정 → 재인덱싱) | 통합 | 기존 파일 내용 변경 → `reindexFile` 재호출 확인 |
| AC-3 (삭제 → 인덱스 제거) | 단위 | 파일 없음 이벤트 → `removeFromIndex` 호출 확인 |
| AC-4 (디바운스) | 단위 | 동일 파일 이벤트 10회 발생 → `reindexFile` 1회만 호출 확인 |
| AC-5 (비-.md 무시) | 단위 | `.json` 파일 이벤트 → `reindexFile` 미호출 확인 |
| AC-6 (다중 폴더) | 통합 | 두 임시 폴더 모두 watcher 등록 → 각각 이벤트 처리 확인 |

## Open questions

- Node.js 버전: `fs.watch` `recursive` 옵션이 macOS에서 Node 20.12+ 부터 지원. `package.json` `engines` 확인 필요.
- `reindexFile()` 이 비동기(async)라면 동시 호출 직렬화 필요 여부 검토 (같은 파일 빠른 연속 수정 시).
- Docker 컨테이너 내부에서 MCP가 실행될 가능성 여부 확인 (현재 호스트 프로세스로만 사용 → 이슈 없음).
