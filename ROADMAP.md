# ROADMAP

> ⚠️ **great-reduction(2026-07-21) 이전에 작성된 로드맵입니다.** 게이트웨이·메모리 서비스·페르소나/스킬(메타) 관련 항목은 제거·분리(sdd-toolkit)로 무효화됐을 수 있습니다 — 유효성은 [product-vision](docs/product-vision.md)·[rebuild-plan](docs/rebuild-plan.md) 기준으로 재판정하세요.

localmind의 진화 방향을 기록한다. 핵심 비전:

> **개인 전용 로컬 AI 스택.** repo 하나로 **내 머신에서, 나 혼자** 쓰는 완결형 스택을
> 만든다. 전부 로컬·localhost, 메터드 API 0원, 단일 사용자. **중앙 서버·공유 계정·
> 원격 접속은 두지 않는다**(단일 장애점·ToS·데이터 유출 회피).
>
> **일관된 작업 흐름을 어디서든.** 누구든 어느 기기·어느 AI 도구(Claude Code·Codex 등)를
> 쓰든 localmind를 통해 같은 SDD 작업 흐름(goal→spec→plan→구현→self-review)과 규율을
> 설정할 수 있어야 한다 — 이 일관성은 개인이 흩어진 곳에서 따로 관리하는 것이 아니라
> localmind 자체가 매개체가 되어 제공한다.

> 📋 라이브 스택에서 **검증이 필요한 항목**과 **미진행 작업**은 [BACKLOG.md](BACKLOG.md)에 모아 둔다.

---

## 현재 (Phase 0 — 개인 MVP) ✅

repo 하나로 도는 완결형 로컬 AI 스택. 전부 로컬, 메터드 API 0원, 단일 사용자.

- **LLM API** — OpenAI(`/v1/chat/completions`)·Anthropic(`/v1/messages`) 호환, claude/codex CLI 라우팅
- 세션 영속화, 함수 호출(tool_calls / tool_use)
- **임베딩 게이트웨이** — LiteLLM + ollama(bge-m3)
- **메모리** — OpenMemory(mem0) + Postgres/pgvector (소스 빌드 + 패치)
- **second-brain** — `.md` 노트 RAG (capture_note/search_notes/ask_brain). **다중 노트 폴더**(쉼표 `NOTES_DIR`+라벨) + `folder` 스코프 검색
- **MCP 서버(stdio)** — ask · remember/recall · 노트 · whoami 도구 (로컬 서브프로세스)
- **시크릿 헬퍼** — `make init-env` / `token` / `secrets`
- **백업/복구** — `make backup`/`backup-cron`(자동 백업) + `make recover`/`restore`(새 기기 원커맨드 복구) + `make reindex`, git 기반
- Docker(profiles: gateway/memory), CI

---

## 설계 원칙 (개인 전용)

- **localhost(루프백)에만 노출** — 발행 포트(8787/4000/8767)는 `127.0.0.1`에 바인딩. LAN 노출 없음.
- **내 계정·내 데이터** — 추론은 내 CLI 로그인으로, 메모리·노트는 내 머신 로컬에만.
- **파일이 정본, DB/인덱스는 파생** — 노트(.md)·메모리 export가 정본, pgvector·`.brain-index.json`은 재생성 가능.
- **시크릿은 로컬·gitignore** — `.env`는 백업/커밋에서 제외. 키는 내 머신에만.

---

## 다음 단계 (개인 경험 강화)

### 백업·복구
- ✅ `make backup`(메모리 export + 노트 repo 커밋·푸시) + `make backup-cron`(스케줄 cron 한 줄).
- ✅ `make recover RESTORE_REPO=<url>`(새 기기 원커맨드: 설치→기동→헬스대기→노트 clone+`memory-import`+재인덱싱). 데이터만 되돌릴 땐 `make restore`.

### 시크릿 보관 강화
- `make token`의 `.env` 직접 기록(`--write`) 옵션.
- **OS 키체인**(macOS Keychain / libsecret) 연동 — 평문 `.env` 탈피(선택).

### second-brain
- ✅ **다중 노트 폴더** 인덱싱(쉼표 `NOTES_DIR`+라벨) + 폴더 스코프(`folder`) 검색·RAG.
- 인덱싱 성능: GPU/전용 임베딩 서버(TEI/Infinity)로 `EMBEDDINGS_URL` 교체 가이드.

### 운영 편의
- `make secrets`에 엔드포인트/모델 상태까지 통합 점검.
- 메모리/노트 용량·통계 한눈에 보기.

---

## 백업 (git 기반)

"파일이 정본, DB/인덱스는 파생" 철학 → **개인 git repo(GitHub Private 등)** 백업이 자연스럽다.

- **노트(.md)** → 개인 git repo, `git push` = 백업. `.brain-index.json`은 `.gitignore`(파생).
- **메모리(mem0)** → `make memory-export`로 마크다운 덤프 → git 커밋. 복원은 `memory-import`(멱등). ✅
- **시크릿** → `.env`는 **백업/커밋 금지**(gitignore 유지). 토큰은 `make token`으로 재발급 가능.
- 복원: 노트/메모리 파일 → import → 인덱스/DB 재생성.

---

## 알려진 제약

- **CLI 구독은 내 계정**: 추론은 내 `claude`/`codex` 로그인으로 수행. 약관상 회색지대이므로
  **개인 용도·합리적 사용량** 권장(공유·재판매·대량 자동화 금지). 가장 보수적으로는 **백엔드만 정식 API로 교체** 가능.
- **임베딩 throughput**: bge-m3 CPU가 바닥. 대량 인덱싱은 가벼운 모델/GPU/TEI로 `EMBEDDINGS_URL` 교체 권장.
- **자동 카테고리화**: OpenAI 구조화 출력 의존이라 CLI 경로에선 비활성(메모리 기능엔 무관).
