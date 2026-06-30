# Goal: Auto-Reindex File Watcher (노트 변경 자동 인덱싱)

## Background — 배경

localmind의 second-brain 은 `.md` 파일이 정본이고 `.brain-index.json` 이 파생물이다.
지금은 노트 파일을 추가하거나 수정하면 `make reindex` 를 수동으로 실행해야 인덱스에 반영된다.
이 마찰이 작지만 반복될수록 "노트는 많은데 검색에 안 잡힌다"는 불신을 만든다.
Loop 3(이벤트 기반 루프) — 파일 변경 이벤트가 자동으로 reindex를 트리거하게 한다.

## Problem — 문제

- 노트 파일 추가/수정 후 `make reindex` 를 잊으면 변경 사항이 검색에 반영되지 않는다.
- `capture_note` 는 자동 인덱싱이 있지만, 외부 에디터(Obsidian, VS Code 등)로 직접 수정한 파일은 반영 안 된다.
- 현재 인덱스 상태(최신 여부)를 알 방법이 없다.

## Objective — 목표

`NOTES_DIR` 의 `.md` 파일 변경(추가/수정/삭제)을 자동으로 감지하여
변경된 파일만 증분 reindex 한다. 외부 에디터로 노트를 편집해도 즉시 검색에 반영된다.

## Expected outcome — 기대 결과

- 노트 폴더에 `.md` 파일을 저장하면 수 초 내로 `search_notes` / `ask_brain` 에서 검색된다.
- `make reindex` 수동 실행 필요 없음 (초기 풀 인덱싱이나 강제 재구축 시에는 여전히 사용 가능).
- MCP 서버 프로세스 기동 중에 watcher가 함께 동작한다.

## Success metrics — 성공 지표

- 노트 파일 저장 후 검색 반영 시간 ≤ 5초
- watcher 기동 후 CPU 상시 사용 ≤ 1% (idle 상태)
- `make up` / MCP 서버 기동 시 watcher 자동 시작, 종료 시 자동 정리

## Non-goals — 비목표

- `.md` 이외의 파일 형식(`.txt`, `.pdf` 등) 감시는 이번 범위 밖
- 원격/네트워크 드라이브 폴더 감시는 이번 범위 밖
- 실시간 감시 대신 주기적 polling 방식 도입은 이번 범위 밖
- OpenMemory(메모리) 레이어의 자동 동기화는 이번 범위 밖

## Constraints — 제약

- Node.js 내장 `fs.watch` 또는 경량 라이브러리(chokidar)만 사용 — Docker 이미지 크기 최소화
- MCP stdio 서버 프로세스(`src/mcp.ts`) 안에서 watcher를 함께 구동 (별도 데몬 없음)
- watcher는 stdout에 아무것도 쓰지 않음 (MCP 프로토콜 전용)
- 다중 `NOTES_DIR` 폴더 모두 감시
- macOS(FSEvents), Linux(inotify) 양쪽에서 동작

## Stakeholders — 이해관계자

- 단일 사용자(jihoonkim) — 외부 에디터(Obsidian)와 MCP 간 노트 동기화 자동화

## Risks — 리스크

- 대용량 폴더에서 파일 폭발적 증가 시 reindex 큐 적체 (디바운스로 완화)
- Docker 컨테이너 안에서 호스트 파일 변경 감지 불가: MCP는 호스트 프로세스이므로 해당 없음
- 심볼릭 링크, iCloud Drive 등 특수 파일 시스템에서 이벤트 누락 가능성
