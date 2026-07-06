# localmind

[![CI](https://github.com/shaul1991/localmind/actions/workflows/ci.yml/badge.svg)](https://github.com/shaul1991/localmind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

로컬 **Claude Code / Codex CLI 구독**을 토대로, **메터드 API 0원의 완결형 로컬 AI 스택**을 repo 하나로 제공합니다.
모든 것이 **로컬·독립 실행**(중앙 서버·공유 계정 의존 0)이며, OpenAI·Anthropic 호환 API + 임베딩 + mem0 메모리 + second-brain RAG + MCP를 한 번에 제공합니다.

- **LLM API** — OpenAI(`/v1/chat/completions`)·Anthropic(`/v1/messages`) 호환. 기존 코드의 `base_url`만 바꾸면 됨.
- **임베딩** — 로컬 bge-m3 (OpenAI `/v1/embeddings` 호환)
- **메모리** — mem0 (진화하는 사실 기억)
- **second-brain** — 내 마크다운 노트에 대한 RAG
- **MCP 도구** — Cursor/Claude Desktop/Cline에서 위 기능을 도구로 사용

> 🧩 **처음 보는 용어가 많다면** — 게이트웨이·임베딩·RAG·MCP를 **딱 하나의 비유**(내 컴퓨터 안의 1인 비서실)로 5분 만에 풀어주는 입문서부터: 👉 [비유로 이해하기](docs/concepts.md)
> ❓ **실사용자가 궁금해하는 것**(설치·Cursor 연동·백업·성능·약관 리스크)은 👉 [자주 묻는 질문(FAQ)](docs/faq.md)
> 📖 **설치 후 매일 어떻게 쓰나** — 캡처→활용→보기→정리를 채팅창에서: 👉 [사용법](docs/usage.md)
> 🎭 **페르소나 에이전트** — 역할·모델을 한 번 정의해 Claude Code·Codex 양쪽에 배포·싱크하고, localmind 자신도 위임(사서 합성·크리틱 교차검증·큐레이터 태깅·분석가 리포트). SDD self-review엔 codex 교차 검증(`localmind-review`)까지: 👉 [페르소나 에이전트](docs/agents.md)
> 🛠️ **동작 원리·API·세션·함수호출·환경변수 등 개발자 상세**는 👉 [레퍼런스](docs/reference.md)

> **개인 전용·독립 실행 원칙**: 이 스택은 **내 머신에서 나 혼자** 쓰는 용도입니다.
> 로컬 스택(gateway·임베딩·메모리·brain) + **내 `claude`/`codex` 로그인** + **localhost(루프백)** 로만
> 동작하며, **중앙 서버·공유 계정·원격 접속에 의존하지 않습니다**(단일 장애점·ToS 회피).
>
> 🔒 **공유 머신 주의**: 여러 사람이 쓰는 컴퓨터·회사 노트북 등 신뢰할 수 없는 프로세스가
> 있는 환경이면 `.env`의 `LOCALMIND_API_KEY`를 설정하세요 — 루프백 안쪽이라도 같은 머신의
> 다른 프로세스는 무인증으로 구독을 소비할 수 있습니다. (Host 헤더 검증은 채팅 :8787과
> 메모리 :8767 모두 기본 활성 — DNS rebinding 차단. 게이트웨이 :4000 키는 설치 시 임의 생성.)
>
> 📜 **정책 근거**: 본인 구독으로 내 머신에서 나 혼자 쓰는 건 Anthropic 공식 terms의 *"ordinary, individual usage of Claude Code"* 범주라 허용됩니다 — 금지 대상은 *"타인을 대신해(on behalf of their users)"* 구독 자격증명으로 요청을 라우팅하는 경우입니다. **서비스화하거나 타인 요청을 내 구독으로 처리하면 API 키 인증으로 전환해야 합니다.** ([Claude Code Legal & compliance](https://code.claude.com/docs/en/legal-and-compliance))

```
  HTTP API ┬─ /v1/chat/completions · /v1/messages   → claude/codex CLI
           ├─ /v1/embeddings                         → bge-m3
           └─ OpenMemory REST                        → mem0 + pgvector
  MCP ───── ask · remember/recall · capture_note/search_notes/ask_brain · list/delete(기억·노트)
```

## Quickstart

### 0) 전제
- Node.js ≥ 20, Docker
- **claude 구독 토큰** — 호스트에서 `make claude-token`(= `claude setup-token`, 브라우저 1회) 발급 후
  `.env`(`make init-env`)의 `CLAUDE_CODE_OAUTH_TOKEN=`에 붙여넣기. ~1년 장수명·자동 갱신 불필요.
- codex 백엔드를 쓰면 호스트에 로그인된 `codex` CLI (인증 `~/.codex`를 마운트해 재사용)

> 왜 토큰인가: `~/.claude.json` 파일 마운트는 atomic-rename·macOS Keychain 문제로 컨테이너에서 깨집니다. 헤드리스 정석인 `CLAUDE_CODE_OAUTH_TOKEN`이 둘 다 해결 — 자세히는 [레퍼런스 › Docker 상세](docs/reference.md#docker-상세).

### 1) 설치 & 기동
```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make setup              # 👈 처음이라면 이거 하나 — 준비물·진단·임베딩 켜기·연결 점검을 단계별 안내
#                         (미리보기: make setup DRY_RUN=1 / 인증·MCP는 강제 없이 명령 제안 + 체크리스트)

# ── 또는 직접 단계별로 ──
make install build      # 의존성 + dist 빌드(로컬 MCP용)
make init-env           # .env 생성
make claude-token       # claude 구독 토큰 발급(브라우저 1회) → 출력값을 .env 의 CLAUDE_CODE_OAUTH_TOKEN 에 입력
make embed              # 이 기기에 맞는 임베딩 엔진으로 기동(맥=Metal·NVIDIA=GPU·그 외 CPU). 일상 켜기는 make up
#   chat :8787 · 게이트웨이 :4000 · 메모리 :8767  (최초 빌드/모델 pull은 수 분)
```
> 처음 한 번은 **`make setup`**(디바이스 진단·최적 임베딩 적용·연결 점검까지), 이후 켜고 끄기는 **`make up`/`make down`**. 임베딩 엔진만 바꾸려면 **`make embed`**, 기기 진단은 **`make doctor`**.
> 운영은 전부 **`make`** 로 일관됩니다: `make up`(기동) · `make health`(점검) · `make logs` · `make down`. 전체 목록은 `make help`. (`docker compose --profile ...`는 make가 실행하는 내부 명령 — 세분 제어는 [레퍼런스](docs/reference.md) 참고)

### 2) API로 쓰기 (base_url만 교체)
```bash
curl http://localhost:8787/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"안녕"}]}'
```
OpenAI/Anthropic SDK는 `base_url`만 위 주소로 바꾸면 그대로 동작 → [레퍼런스 › API 사용 예시](docs/reference.md#api-사용-예시).

### 3) MCP로 쓰기 (개인 두뇌)

**Claude Code** — 한 줄로 등록(절대경로·시드 user 자동, `.env`의 `OPENMEMORY_USER` 사용):
```bash
make mcp-install                       # 기본 NOTES_DIR=~/.localmind
make mcp-install NOTES_DIR=/내/노트/폴더  # 내 .md 노트 폴더로 RAG (쉼표로 여러 개 가능)
# 등록 후 Claude Code 재시작 → localmind 도구 사용. 해제는 make mcp-uninstall
```

**Cursor `.cursor/mcp.json` / Claude Desktop / Cline** — `make mcp-config`로 채워진 JSON을 출력해 붙여넣기:
```json
{ "mcpServers": { "localmind": {
    "command": "node",
    "args": ["/절대경로/localmind/dist/mcp.js"],
    "env": { "NOTES_DIR": "/내/노트/폴더", "OPENMEMORY_USER": "localmind" }
}}}
```
→ 호스트가 ask·기억·노트·열람/삭제 도구(아래 [MCP 서버](#mcp-서버-도구로-사용) 표의 13개)를 갖습니다.
`NOTES_DIR`를 기존 `.md` 노트 폴더로 가리키면 **그 지식으로 바로 RAG**.
> `OPENMEMORY_USER`는 스택이 시드한 값(기본 `localmind`, `.env`)과 **반드시 일치**해야 `remember/recall`이 동작합니다(불일치 시 `User not found`).

### 4) 검증
```bash
make smoke              # API + MCP + brain 스모크 한 번에
make health             # 엔드포인트 상태(:8787 / :4000 / :8767)
```

### 5) 모니터링 웹 UI (선택)
```bash
make ui                 # http://127.0.0.1:8788/ui — 브라우저로 상태 보기(읽기 전용)
```
스택 헬스·노트 인덱스·정본 최신성(코드/노트 repo)·설정(시크릿은 가려짐)·에이전트 배포
상태·리포트를 한 화면에서 봅니다. 이 컴퓨터에서만 열리고(127.0.0.1), 접속 키는
`LOCALMIND_API_KEY`(확인: `make secrets`). 무엇도 실행/수정하지 않는 모니터링 전용입니다.

> 더 가볍게: 채팅 API만 쓰려면 `docker compose up -d --build` (게이트웨이/메모리 프로파일 생략 — 이 경우만 raw).

## 온보딩 (개인 전용)

이 스택은 **내 PC에서 나 혼자** 쓰는 용도입니다(중앙 서버·공유 계정·원격 접속 없음). 설치는 위 [Quickstart](#quickstart) 한 번이면 끝 — **메터드 API 0원**, 데이터는 전부 내 머신 로컬에만 둡니다.

- 매일 어떻게 쓰나 → 👉 [사용법](docs/usage.md) ("기억해둬 / 찾아줘 / 다 보여줘 / 지워줘"를 채팅창에서)
- 바로 따라 할 **케이스별 예제** → [examples/](examples/) (API 대체·임베딩·메모리·second-brain·MCP)
- **내 직군에선 어떻게?** → [직군별 유즈케이스(19 페르소나)](examples/use-cases.md) — 개발·데이터/ML·QA·인프라·PM·라이터·보안·연구자·콘텐츠 크리에이터 등

## 🧑‍💻 직군별 워크플로우 — 내 직군, 바로 실행

`make up` 후 **내 직군 스크립트 하나만 돌리면** localmind 활용이 한 번에 체감됩니다. 전부 실행·검증됨.

| 그룹 | 바로 실행할 워크플로우 |
|---|---|
| **개발** | [백엔드](examples/workflow-backend.py) · [프론트](examples/workflow-frontend.mjs) · [앱/모바일](examples/workflow-mobile-i18n.py) · [게임](examples/workflow-game-content.py) |
| **데이터/ML** | [ML 엔지니어](examples/workflow-ml-index.py) · [데이터 분석](examples/workflow-data-analysis.py) |
| **품질·설계·운영** | [QA](examples/workflow-qa-testcases.py) · [아키텍트](examples/workflow-design-review.py) · [인프라/SRE](examples/workflow-infra-runbook.mjs) |
| **비개발** | [PM](examples/workflow-pm-spec.py) · [테크니컬 라이터](examples/workflow-docs-draft.mjs) · [보안](examples/workflow-security-triage.py) · [연구자](examples/workflow-research-synthesis.mjs) |
| **콘텐츠** | [AI 글작성](examples/workflow-ai-writer.py) · [유튜브 대본](examples/workflow-youtube-script.py) · [유튜브 편집](examples/workflow-youtube-edit.py) · [썸네일](examples/workflow-thumbnail-copy.py) · [인플루언서](examples/workflow-influencer-repurpose.py) |
| **1인 개발** | [풀스택 투어](examples/workflow-solo-stack.sh) |

각 직군의 **상황 → 활용 → 워크플로우 단계 → 효과**는 👉 [직군별 유즈케이스(19 페르소나)](examples/use-cases.md). 모든 예제는 [examples/](examples/).

### 실제 플로우 예시 — 어떻게 쓰고, 무엇이 쌓이는지
실행 중인 스택에 그대로 태운 두 직군. 응답·저장 데이터 모두 **실제 출력**입니다.

**백엔드 개발자** — 로그 요약 → 분류(perf) → 대응 결정을 노트로 적재 → `NOTES_DIR`에 **.md 정본이 쌓임**(이후 검색·RAG 대상)

![백엔드 플로우](docs/flow-backend.gif)

**기획자(PM)** — 결정을 `remember`로 mem0에 저장 → PRD 초안 → 2주 뒤 `recall`로 **의미 회상**(결정·이유가 **기억으로 쌓임**)

![PM 플로우](docs/flow-pm.gif)

## 백업 · 복구 (git)

노트(.md)와 기억(mem0 → 마크다운 export)을 **내 private git repo 하나**로 백업하고, 새 기기에서 한 줄로 복구합니다. 인덱스·DB는 파생이라 백업 불필요(노트·메모리에서 재생성). 저수준은 `make memory-export`/`memory-import`.

### 자동 백업 (한 명령 + 스케줄)
`make backup` 하나로 **메모리 export → 노트 백업 repo에 커밋·푸시**.

```bash
# 1) 백업 repo 준비(최초 1회) — gh CLI로 GitHub private repo 생성·연결·첫 백업까지 한 번에
make backup-init
#   repo 이름 바꾸려면:   make backup-init BACKUP_REPO=내이름/brain
#   (gh 필요: brew install gh && gh auth login)

# 2) 이후엔 한 번에 백업 (BACKUP_DIR 기본값 ~/.localmind)
make backup
#   BACKUP_DIR을 바꾸려면:  make backup BACKUP_DIR=~/brain
```
- `make backup-init`은 **GitHub private repo를 자동 생성**(`gh repo create --private`)하고 origin 연결 후 첫 백업까지 수행 — 멱등(이미 연결돼 있으면 생성 생략).
- ⚠️ **백업 위치**: 백업은 **내 노트·메모리 전체를 내 GitHub 개인 계정의 비공개 저장소**에 올립니다(회사 계정이 아님). **업무·회사·고객 데이터**를 담았다면 개인 계정 백업이 조직 데이터 정책에 어긋나지 않는지 먼저 확인하세요 — 회사 데이터는 조직이 지정한 저장소에 두는 것을 권장합니다. (`make backup-init` 실행 시에도 동일 고지 후 진행 여부를 확인합니다.)
- 변경 없으면 커밋 생략, remote 없으면 로컬 커밋만 — **여러 번 돌려도 안전**.
- **스택이 꺼져 있어도 노트는 백업됩니다** — 메모리 export만 건너뛰고 "부분 완료" 요약과
  비0 종료 코드로 알립니다(cron 로그에서 식별 가능). 스택을 켜고 다시 실행하면 메모리까지 백업.
- ⚠️ 백업 repo는 **Private로 생성**됩니다. `.env`(시크릿)는 이 repo가 아닌 프로젝트 폴더에 있고 `.brain-index.json`(파생물)은 `.gitignore` 처리됩니다.

> gh CLI 없이 수동으로 하려면: `git -C ~/.localmind init && git -C ~/.localmind remote add origin <private repo url>` 후 `make backup`.

**주기 자동 실행** — `make backup-cron`이 매일 자동 백업을 **crontab 에 바로 등록**합니다(시간을 물어보고, 멱등).
```bash
make backup-cron                 # 시각을 입력받아 등록 (기본 03:00)
make backup-cron HOUR=21 MIN=30  # 시간 지정해서 등록
DRY_RUN=1 make backup-cron       # 등록 없이 추가될 줄만 미리보기
```
- cron 의 최소 PATH에서도 동작하도록 `npm`/`node`/`docker` 경로를 자동으로 넣어 줍니다.
- 자동 백업은 localmind가 **켜져 있을 때**만 동작하고, 사전에 `make backup-init`이 되어 있어야 합니다.
- 해제: `crontab -l | grep -v '# localmind-backup' | crontab -` · 기록: `tail -f ~/localmind-backup.log`
- macOS는 cron 에 **전체 디스크 접근 권한**이 필요할 수 있습니다(시스템 설정 → 개인정보 보호).

### 새 기기 복구 (원커맨드)
컴퓨터를 바꾸거나 고장 후, **백업 repo 하나로 통째 복구**합니다.

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make recover
#   gh 로그인 상태면 내 백업 저장소를 자동으로 찾아요. 아니면:
make recover RESTORE_REPO=<내 백업 repo url>
```
- `make recover`는 **6단계를 한국어로 한 단계씩 안내**합니다 — 준비물 점검(Docker·.env) → 백업 내려받기 → 설치·빌드 → 스택 기동·대기 → 메모리 복원 → 노트 재인덱싱. (gh 로그인 시 백업 저장소 자동 탐색)
- 이미 스택이 떠 있고 데이터만 되돌릴 땐 `make restore RESTORE_REPO=<url>` (또는 BACKUP_DIR이 이미 그 repo면 인자 없이 `make restore`).
- 복원 순서: **노트 repo pull/clone → `memory-import`(멱등) → 노트 재인덱싱**. 인덱스·DB는 파생이라 자동 재생성됩니다.
- 다중 노트 폴더를 쓴다면 폴더별 repo를 각각 복원하고 `NOTES_DIR`를 그에 맞게 지정하세요.

### 노트를 git 저장소로 쓸 때 — `make notes-connect`
노트를 GitHub 등 git 저장소로 관리한다면, 저장소 목록만 선언하면 새 기기 연결이 한 번에 끝납니다.

```bash
# .env 에 저장소 목록 선언(형식: "라벨=URL,...")
#   NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"
make notes-connect        # 각 저장소 clone(있으면 pull) → NOTES_DIR 조립 → Claude Code 등록
```
- **새 기기 흐름**: `git clone localmind` → `.env` 복원(또는 `NOTES_REPOS` 한 줄 입력) → `make notes-connect`. `make setup`도 `NOTES_REPOS`가 있으면 이 연결을 함께 제안합니다.
- 저장소는 `NOTES_REPOS_DIR`(기본 `~/localmind-notes`) 아래 `<라벨>/`에 clone됩니다.
- ⚠️ **등록 덮어쓰기**: `notes-connect`는 MCP 등록을 통째로 재작성합니다 — 수동으로만 추가했던 폴더는 사라지니 `NOTES_REPOS`로 옮기세요.
- ⚠️ **자격증명**: 비공개 저장소는 SSH 키나 git credential helper를 쓰세요(토큰을 URL에 박지 말 것). 인증이 없으면 해당 저장소만 실패로 건너뛰고 나머지는 정상 연결됩니다.

## MCP 서버 (도구로 사용)

localmind의 능력을 **MCP 도구**로 노출해, MCP 호스트(Claude Desktop / Cursor / Cline 등)가 자기 모델로 돌면서 끌어 쓰게 합니다. (MCP는 호스트의 *모델을 바꾸는 게 아니라* 도구를 줍니다.)

| 도구 | 설명 |
|---|---|
| `whoami` | 이 두뇌 식별 — 어떤 메모리/노트를 쓰는지 |
| `ask` | claude/codex CLI에 교차 질의(다른 모델 상담) → localmind 경유 |
| `remember` | 진화하는 기억에 사실 저장 (mem0: claude 추출 + bge-m3) |
| `recall` | 의미 기반 회상 (mem0 벡터 검색) |
| `capture_note` | second-brain: 마크다운 노트 저장 + 인덱싱 (정본은 `.md`) |
| `search_notes` | second-brain: 내 노트 의미검색(원문·경로) |
| `ask_brain` | second-brain: 내 노트만 근거로 RAG 답변(출처 인용) |
| `note_links` | second-brain: 노트의 위키링크(`[[...]]`) 연결 관계 조회(나가는/들어오는 1-hop) |
| `list_memories` | 쌓인 기억 **전체 열람**(id·내용·날짜) — 둘러보기·삭제 전 id 확인 |
| `delete_memory` | 기억 한 개 **삭제**(id로) |
| `list_notes` | 노트 파일 **목록**(`label/파일`) |
| `delete_note` | 노트 한 개 **삭제**(휴지통 이동 + 재인덱싱) |
| `scaffold_sdd` | SDD 작업 흐름(AGENTS.md 규약 + goal/spec/plan 템플릿)을 다른 프로젝트에 설치 |

> **두 종류의 기억**: `remember/recall`은 mem0의 *진화하는 사실 메모리*, `capture_note/search_notes/ask_brain`은 *내 마크다운 노트(정본) RAG* 입니다.
> **보기·정리(대화로)**: `list_memories`·`delete_memory`·`list_notes`·`delete_note` — "내 기억 다 보여줘", "이거 지워줘"를 채팅창에서 바로. 별도 화면·CLI 불필요.

```
MCP 호스트(Claude Desktop/Cursor/Cline)
   │ stdio
   ▼
localmind MCP 서버 (dist/mcp.js)
   ├─ ask              → localmind :8787 (claude/codex)
   └─ remember/recall  → OpenMemory :8767 (pgvector)
```

### 호스트 설정 (stdio)
Claude Desktop `claude_desktop_config.json` (Cursor `.cursor/mcp.json`, Cline MCP 설정도 동일 구조):
```json
{
  "mcpServers": {
    "localmind": {
      "command": "node",
      "args": ["/절대경로/localmind/dist/mcp.js"],
      "env": { "OPENMEMORY_USER": "내이름" }
    }
  }
}
```
> `NOTES_DIR`(쉼표로 다중 폴더 가능)·`OPENMEMORY_USER` 등 **MCP 환경변수**와 인덱싱 튜닝은 👉 [레퍼런스 › MCP 환경변수](docs/reference.md#mcp-서버--환경변수).

## 문제 해결 (Troubleshooting)

| 증상 | 원인 / 해결 |
|---|---|
| 채팅 호출이 실패/빈 응답(claude `Not logged in`/`config not found`) | `.env`의 `CLAUDE_CODE_OAUTH_TOKEN` 미설정/만료 → `make claude-token`으로 재발급해 `.env`에 넣고 **`make up`**(컨테이너 recreate; `make restart`는 env 재주입 안 됨). `make secrets`로 설정 여부 확인. (codex는 호스트 `~/.codex` 로그인 필요) |
| `make health`에서 일부 `000`/비정상 | 첫 기동은 모델 pull(bge-m3 ~1.2GB) + OpenMemory 소스 빌드로 **수 분** 걸림 → `make logs`로 진행 확인. 부하 중 임베딩이 멈추면 `make restart`. |
| 포트 충돌(8787/4000/8767) | 이미 쓰는 포트면 `.env`/compose에서 변경하거나 충돌 프로세스 정지. |
| 메모리 `User not found` | `user_id`는 **시드된 사용자**여야 함(기본 `localmind`). MCP 설정의 `OPENMEMORY_USER`를 시드값과 일치시킬 것 — 미설정 시 호스트명으로 떨어져 미시드 상태가 됨. |
| 노트 첫 인덱싱이 느림 | bge-m3 CPU 임베딩이 바닥(이후 증분이라 빠름). 급하면 GPU/TEI로 `EMBEDDINGS_URL` 교체. 한국어면 **다국어 모델만**(nomic 등 영어 전용 금지). |
| 임베딩 모델 변경 후 차원 오류 | `EMBEDDING_DIMS` 맞추고 `make clean`(볼륨 초기화) 후 재기동. |

## 데모

실제 실행 중인 스택의 세션입니다 — `make health` → OpenAI 호환 chat(claude) → 로컬 임베딩(bge-m3). 전부 **메터드 API 0원**, 완전 로컬. (응답·임베딩 값 모두 실제 출력)

![localmind 데모](docs/demo.png)

> 직접 보려면 `make up` 후 위 명령들을 그대로 실행하면 됩니다.

## 라이선스

[MIT](LICENSE)
