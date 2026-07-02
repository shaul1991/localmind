# CHANGELOG

localmind의 주요 변경 이력. 최신이 위.

## 2026-07 — SDD 스펙 사이클 (specs 001~012): second-brain 품질 + 공급망·보안 하드닝

이 사이클의 핵심: 작업 흐름을 **SDD(goal→spec→plan→/goal→self-review)로 명문화**하고,
그 흐름으로 second-brain 품질(loop engineering)·CI·공급망·로컬 보안을 스펙 단위로 다졌다.

### SDD 작업 흐름
- **SDD 규약 명문화** — `AGENTS.md`/`CLAUDE.md`에 specs 폴더 규약·`/goal {NNN}` 처리·self-review 필수화. (`76c1908`, `6f180e4`)
- **`scaffold_sdd`** — SDD 작업 흐름(AGENTS.md 규약 + goal/spec/plan 템플릿)을 어느 프로젝트·AI 도구에든 심는 MCP 도구 + `make init-sdd`. (specs/007, `eec63f9`)
- **모델 역할 배치 규약** — 실패 파장×난이도 기준 모델 티어 배치를 AGENTS.md에 추가. (`a0be9c6`)

### second-brain 품질 (loop engineering)
- **캡처 검증 루프** — `capture_note` 저장 직후 색인·검색 가능 여부를 자체 검증. (specs/001, `e770062`)
- **`ask_brain` 출처 추적** — 답변에 사용된 노트 출처(sources)를 구조적으로 반환. (specs/002, `e770062`)
- **자동 재색인 파일 워처** — 노트 폴더 변경 감지 → 색인 자동 갱신. (specs/003, `e770062`)
- **노트 링크 그래프** — 위키링크(`[[...]]`) 기반 1-hop 연결 조회 `note_links` 도구. (specs/005, `0a830d5`)

### 백업 / 노트 연결
- **개인 설정 파일 선택 백업/복원** — `BACKUP_EXTRA_FILES`로 `$HOME` 하위 파일을 백업 repo `extras/`에 포함(충돌 시 `.bak-*` 보존). (specs/006, `b409f8b`)
- **노트 git 저장소 연결** — `.env`에 `NOTES_REPOS` 선언 → `make notes-connect`가 clone/pull·`NOTES_DIR` 조립·MCP 등록까지, `make setup` 통합. (specs/012, `14712bb`)

### 품질 / 성능 / 보안
- **CI 테스트 게이트** — Node 20/22/24 매트릭스에서 typecheck + 단위 테스트 + 셸 테스트 + 빌드 + Docker 빌드. (specs/008, `d0054f4`)
- **인덱스 내구성·성능** — 인덱스 캐싱(mtime+size)·원자적 쓰기(temp+rename)·single-flight. (specs/009, `f26689d`)
- **공급망 아티팩트 버전 고정** — node·claude·codex·ollama·litellm 고정 + 가변 태그 회귀 가드(`pinning.test.sh`). 라이브 재빌드 검증 완료. (specs/010, `507feeb`)
- **로컬 보안 하드닝** — Host 헤더 검증(DNS rebinding 차단, `/health` 예외) + 노트 soft-delete 휴지통(`.trash/`, `make trash-list`/`trash-empty`). (specs/011, `e150103`)

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
