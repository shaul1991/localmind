# CHANGELOG

localmind의 주요 변경 이력. 최신이 위.

## 2026-07-03 — 정확성·공급망·신뢰성 하드닝 (specs 013~015, 전수 리뷰 후속)

2026-07-03 전수 리뷰(코드·인프라·문서)에서 발견된 결함을 스펙 3개로 수정했다.

### 세션·색인 정확성 (specs/013)
- **대화 혼입 차단** — explicit 세션(OpenAI `user` 등)에 prefix 내용 검증 추가: 같은 id의 다른 대화가 이전 CLI 세션에 접합되지 않음. 빈 CLI 세션 id·tools 변경(함수호출 침묵 실패)도 방어.
- **색인 유실 0** — 2,000자 초과 문단을 잘라 버리던 청크 분할을 경계 우선 분할로 교체. ⚠️ 인덱스 v4 — 첫 실행 시 1회 전체 재색인(사유 안내됨).
- **임베딩 메타 기록** — 모델·차원을 인덱스에 기록, 모델 교체 시 조용한 오검색 대신 자동 재색인.
- **다중 MCP 프로세스 안전** — Claude Desktop+Code+Cursor 동시 사용 시 인덱스 마지막-쓰기-승리 유실 제거(파일 락 + reload-merge).
- `delete_note` 대상 제한(.md·비숨김·실경로 폴더 내부) · `capture_note` 같은 초 덮어쓰기 방지.

### 공급망·노출면 완결 (specs/014 — 010·011의 사각지대)
- **openmemory 이미지 고정** — mem0 소스를 커밋 sha로, 베이스를 `python:3.12.13-slim`으로 고정. pinning 가드·CI 빌드 편입(negative 자기검증 포함).
- **:8767 Host 헤더 검증** — OpenMemory에 DNS rebinding 차단 주입(:8787과 동일 의미론, `OPENMEMORY_ALLOWED_HOSTS`).
- **게이트웨이 키 랜덤화** — `LITELLM_MASTER_KEY`를 설치 시 임의 생성(`make init-env`), `sk-local` 기본값 제거. ⚠️ 기존 `.env`의 sk-local은 계속 동작하되 `make secrets`가 갱신을 안내.

### 백업·복구 신뢰성 (specs/015)
- **백업 인질 구조 제거** — 스택이 꺼져 있어도 노트·개인설정은 백업(메모리만 건너뜀). ⚠️ **동작 변경**: 부분 실패 시 `make backup`이 비0 종료 코드를 반환(cron 로그 식별용) — backup을 `&&`로 체이닝하는 스크립트가 있다면 주의.
- **`make recover`가 개인 설정(extras)까지 복원** — "통째 복구" 약속 충족.
- **purge 가드 강화** — 실경로(심링크 해소) 기준 홈 밖 기본 거부(`PURGE_OUTSIDE_HOME=1`로만 허용) + Docker 꺼짐 시 "완전 제거 완료" 허위 출력 제거(부분 완료 정직 보고).
- MCP 재등록 원자성(add 사전 검증 — 실패 시 기존 등록 보존) · cron에 커스텀 백업 변수 반영 · non-ff push 원인·해결 안내 · `make up`이 채팅(:8787)까지 확인 후 "준비 완료" · `.env` 소유자 전용 권한(600).

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
