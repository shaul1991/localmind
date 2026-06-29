# CHANGELOG

localmind의 주요 변경 이력. 최신이 위.

## 2026-06 — 개인 전용 정착 + 백업/복구 + 대화형 관리

이 사이클의 핵심: **"개인 1인 전용"으로 방향을 굳히고**, 비개발자도 쓸 수 있게
설치·백업·복구·데이터 관리를 다듬었다.

### 방향 — 개인 전용
- **원격/팀 MCP 접근 제거** — `mcp-http`(HTTP/SSE) 서버·`make up-mcp`·`mcp` 프로파일 삭제. localmind는 **내 머신·나 혼자** 전용. (`46d0f1a`)
- **localhost 루프백 바인딩** — 발행 포트(8787/4000/8767)를 `127.0.0.1`에만 노출 → **LAN 노출 차단**. (`46d0f1a`)
- **기본 폴더 `~/.localmind`** — 노트·인덱스·백업의 기본 위치를 통일(이전 `~/localmind-brain`). (`6521d1c`)

### second-brain — 다중 노트 폴더
- **`NOTES_DIR` 다중 폴더** — 쉼표로 여러 폴더, `label=경로` 라벨. 인덱스 v2(`label/경로` 네임스페이싱 + folder 태그). (`be19bd0`)
- **folder 스코프 검색** — `search_notes`/`ask_brain`/`capture_note`에 `folder` 파라미터(기본 전체). (`be19bd0`)
- 인박스→폴더 **승격 UX는 보류**(단일 폴더로 먼저 운영, 필요시 도입 — [BACKLOG](BACKLOG.md) C). (`4dfa657`)

### 백업 / 복구
- **`make backup`** — 메모리 export + 노트 repo 커밋·푸시(멱등, 파생 인덱스 제외). **`make backup-cron`** — crontab 자동 등록. (`be19bd0`, `3124e98`)
- **`make recover` / `restore` / `reindex`** — 새 기기 원커맨드 복구(설치→기동→노트 clone→`memory-import`→재인덱싱). (`41fcbf2`)

### 인증 / 시크릿
- **claude 인증을 OAuth 토큰 방식으로** — `CLAUDE_CODE_OAUTH_TOKEN`(`make claude-token`). 컨테이너·macOS Keychain 문제 해소. (`1ffd71e`)
- **시크릿 헬퍼** — `make init-env` / `token` / `secrets`. (`8f99187`)

### 비개발자 온보딩
- **`make mcp-install`** — Claude Code에 MCP 원클릭 등록(절대경로·시드 user 자동). (`4011475`)
- **가이드형 `make` 명령** — 터미널에서 한 단계씩 안내, 비대화 환경은 기본값 자동(`up`/`recover`/`clean` 안전가드 등). (`2e12c40`)

### 대화형 관리 도구 (NEW)
- **`list_memories` / `delete_memory` / `list_notes` / `delete_note`** — 쌓인 기억·노트를 **채팅창에서 보고 정리**. 비개발자의 "보기·처리" 갭 해소. (`8ecb984`)

### 안정성 / 보안 (CodeRabbit 리뷰 후속)
- `set -euo pipefail` 함정 수정(grep/명령치환 `|| true`) — 토큰 교체·MCP 등록 최초 경로. (`93aaf3c`)
- backup-init **git identity 가드**를 `git var`로 — config·환경변수·strict까지 실제 commit과 일치. (`63feccd`, `107b9f2`)
- `memory.md` 색인 제외를 **폴더 루트로 한정**(하위 노트 보존). (`93aaf3c`)
- recover: `RESTORE_REPO` 불일치 시 중단(엉뚱한 백업 방지) + **에러에 raw URL 대신 owner/repo만**(자격증명 노출 방지). (`c7c598f`, `884d379`)

### 문서
- **입문서**(`docs/concepts.md`, 비유) · **FAQ**(`docs/faq.md`) · **사용법**(`docs/usage.md`) · **BACKLOG**(검증·보류) · **ROADMAP**(개인 전용).
- 라이브 스택 검증 완료(다중폴더·백업·복구·reindex·시크릿·루프백 — [BACKLOG](BACKLOG.md) A).

---

## 그 이전 (기반)

repo 하나로 도는 완결형 로컬 AI 스택의 토대 — OpenAI/Anthropic 호환 API(claude/codex CLI),
임베딩 게이트웨이(LiteLLM+bge-m3), 메모리(OpenMemory/mem0+pgvector), second-brain RAG, MCP(stdio).
자세한 구조는 [README](README.md) · [ROADMAP](ROADMAP.md).
