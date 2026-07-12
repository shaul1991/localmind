# localmind 운영 커맨드. `make` 또는 `make help`로 목록 확인.
# 설정값(LITELLM_MASTER_KEY, OPENMEMORY_USER 등)은 .env 에서 읽힌다(.env.example 참고).

COMPOSE := docker compose
STACK   := --profile gateway --profile memory          # 로컬 스택(임베딩+메모리)
ALL     := $(STACK)                                     # 전체 = 로컬 스택(원격 없음)
FILE    ?= memory-backup.md                             # 메모리 백업 파일
SERVICE ?=                                              # logs 대상(비우면 전체)
BACKEND ?= auto                                        # make embed 임베딩 백엔드(auto|host|gpu|cpu)
# 백업 repo(노트+메모리 덤프) — git repo여야 함. 인용 사용처라 trailing space 금지(주석은 윗줄에).
BACKUP_DIR ?= $(HOME)/.localmind
# `make backup-init`이 만들 GitHub private repo 이름. owner/name 도 가능: make backup-init BACKUP_REPO=me/brain
BACKUP_REPO ?= localmind-backup
# make backup 시 함께 백업할 개인 설정 파일(선택, 콤마 구분, ~ 표기 가능, $HOME 하위만).
# 예: BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md,~/.codex/config.toml"
# 주의: 백업 저장소가 비공개여도 파일 내용이 그대로 커밋되니 민감정보 포함 여부를 직접 확인할 것.
BACKUP_EXTRA_FILES ?=

.DEFAULT_GOAL := help

##@ 빌드/개발
.PHONY: install
install: ## 의존성 설치
	npm install

.PHONY: build
build: ## TypeScript 빌드(dist/)
	npm run build

.PHONY: check
check: ## 타입체크
	npm run typecheck

.PHONY: dev
dev: ## API 서버 개발 모드(watch)
	npm run dev

##@ 스택 운영(Docker)
.PHONY: setup
setup: ## 처음 설정(최초 1회): 점검→진단→임베딩 켜기→연결 점검을 단계별 안내. 미리보기 DRY_RUN=1
	@DRY_RUN="$(DRY_RUN)" bash "$(CURDIR)/scripts/setup.sh"

.PHONY: up
up: ## localmind 켜기(일상). 처음이라면 'make setup' 먼저. 조용히 켜려면 make up-quiet
	@bash "$(CURDIR)/scripts/up.sh"

.PHONY: up-quiet
up-quiet: ## 안내 없이 스택만 기동(개발/스크립트용)
	$(COMPOSE) $(STACK) up -d --build

.PHONY: embed
embed: ## 이 기기에 맞는 임베딩 엔진으로 (재)기동(make doctor 진단 기반). BACKEND=auto|host|gpu|cpu, 미리보기 DRY_RUN=1
	@BACKEND="$(BACKEND)" DRY_RUN="$(DRY_RUN)" bash "$(CURDIR)/scripts/embed.sh"

.PHONY: down
down: ## localmind 끄기(메모리·노트 데이터는 그대로 유지)
	@echo "→ localmind를 끕니다 — 메모리·노트 데이터는 그대로 보관돼요."
	$(COMPOSE) $(ALL) down
	@echo "✓ 꺼졌어요. 다시 켜려면 'make up'."

.PHONY: clean
clean: ## 완전 초기화: 정지 + 데이터 볼륨 삭제(메모리·모델·인덱스). 노트·.env는 보존. 확인을 받고 진행
	@BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/clean.sh"

.PHONY: purge
purge: ## 완전 제거(로컬만·GitHub 백업 보존): 컨테이너·볼륨·이미지·MCP등록. 노트까지: NOTES=1 make purge
	@NOTES="$(NOTES)" FORCE="$(FORCE)" BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/purge.sh"

.PHONY: restart
restart: ## localmind 다시 시작
	@echo "→ 다시 시작하는 중..."
	$(COMPOSE) $(ALL) restart $(SERVICE)
	@echo "✓ 다시 시작됐어요. 상태 확인은 'make health'."

.PHONY: ps
ps: ## 컨테이너 상태
	$(COMPOSE) $(ALL) ps

.PHONY: logs
logs: ## 로그 follow (한 서비스만: make logs SERVICE=openmemory)
	$(COMPOSE) $(ALL) logs -f $(SERVICE)

##@ 검증
.PHONY: doctor
doctor: ## 이 기기 진단: OS/GPU/임베딩 경로 점검 + 더 빠른 구성 안내(읽기 전용)
	@bash "$(CURDIR)/scripts/doctor.sh"

.PHONY: ui
ui: ## 모니터링 웹 UI 켜기(호스트 127.0.0.1:8788/ui — 읽기 전용, specs/034). 포트: UI_PORT=
	@NOTES_DIR="$(NOTES_DIR)" UI_PORT="$(UI_PORT)" bash "$(CURDIR)/scripts/ui.sh"

.PHONY: ui-bg
ui-bg: ## 모니터링 웹 UI를 백그라운드로 켜기(터미널을 계속 쓸 수 있어요). 끄기: make ui-stop
	@NOTES_DIR="$(NOTES_DIR)" UI_PORT="$(UI_PORT)" LOCALMIND_UI_BG=1 bash "$(CURDIR)/scripts/ui.sh"

.PHONY: ui-stop
ui-stop: ## 백그라운드로 켠 모니터링 UI(make ui-bg) 끄기
	@bash "$(CURDIR)/scripts/ui-stop.sh"

.PHONY: guide
guide: ## 설치 전 시각적 설치 가이드 열기(무의존 — Node만 필요, 브라우저 자동 오픈, specs/040)
	@command -v node >/dev/null 2>&1 || { echo "✗ Node가 필요해요 — https://nodejs.org 에서 LTS를 설치한 뒤 다시 'make guide'."; echo "  (또는 README의 '시작하기'를 따라 하세요.)"; exit 1; }
	@node "$(CURDIR)/scripts/bootstrap-guide.mjs"

.PHONY: health
health: ## 엔드포인트 헬스체크
	@curl -s -o /dev/null -w "gateway     :8787  → %{http_code}\n" http://127.0.0.1:8787/v1/models || true
	@curl -s -o /dev/null -w "embeddings  :4000  → %{http_code}\n" http://127.0.0.1:4000/health/liveliness || true
	@curl -s -o /dev/null -w "memory      :8767  → %{http_code}\n" http://127.0.0.1:8767/docs || true

.PHONY: smoke
smoke: ## 스모크 테스트(API + MCP + brain)
	@k=$$(grep -E '^LITELLM_MASTER_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2-); \
	LITELLM_MASTER_KEY="$$k" npm run smoke && \
	LITELLM_MASTER_KEY="$$k" npm run smoke:mcp && \
	LITELLM_MASTER_KEY="$$k" npm run smoke:brain

##@ 백업/복구(git)
.PHONY: memory-export
memory-export: ## 메모리 → 마크다운 (make memory-export FILE=~/brain/memory.md)
	npm run memory:export -- $(FILE)

.PHONY: memory-import
memory-import: ## 마크다운 → 메모리 복원(멱등) (make memory-import FILE=...)
	npm run memory:import -- $(FILE)

.PHONY: backup-init
backup-init: ## GitHub 비공개 백업 저장소를 단계별로 세팅(gh 필요) → 이후 make backup. 이름: BACKUP_REPO=
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_REPO="$(BACKUP_REPO)" bash "$(CURDIR)/scripts/backup-init.sh"

.PHONY: backup
backup: ## 메모리 export + 노트·자산(페르소나·스킬) 백업 repo 커밋·푸시 (BACKUP_DIR; 최초 1회는 make backup-init; 개인 설정 파일: BACKUP_EXTRA_FILES=)
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_EXTRA_FILES="$(BACKUP_EXTRA_FILES)" \
	BACKUP_CONFIRM_EMPTY_ASSETS="$(BACKUP_CONFIRM_EMPTY_ASSETS)" \
	BACKUP_QUERY_LOG="$(BACKUP_QUERY_LOG)" QUERY_LOG="$(QUERY_LOG)" bash "$(CURDIR)/scripts/backup.sh"

.PHONY: backup-cron
backup-cron: ## 매일 자동 백업을 단계별로 crontab 에 등록(시간: HOUR=3 MIN=0, 미리보기: DRY_RUN=1)
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_EXTRA_FILES="$(BACKUP_EXTRA_FILES)" bash "$(CURDIR)/scripts/backup-cron.sh"

.PHONY: reindex
reindex: ## second-brain 노트 (재)인덱싱 (임베딩 :4000 필요; NOTES_DIR는 환경변수 → .env 순으로 해석; 고아 정리: REINDEX_PRUNE_LABELS= · 위치 이동 수락: REINDEX_ADOPT_REBIND=)
	@REINDEX_PRUNE_LABELS="$(REINDEX_PRUNE_LABELS)" REINDEX_ADOPT_REBIND="$(REINDEX_ADOPT_REBIND)" bash "$(CURDIR)/scripts/reindex.sh"

.PHONY: query-report
query-report: ## second-brain 검색 품질 리포트(실패 쿼리 분석 — 로그는 로컬 전용)
	@npm run --silent query-report

.PHONY: query-log-clean
query-log-clean: ## 쿼리 로그에서 30일 이전 항목 정리
	@npm run --silent query-report -- --clean

.PHONY: report
report: ## 검색 품질 리포트 노트 생성(최근 7일 + 분석가 해석 → 노트 폴더 reports/)
	@a=$$(grep -E '^LOCALMIND_API_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2-); \
	LOCALMIND_API_KEY="$$a" npm run --silent brain-report

.PHONY: report-cron
report-cron: ## 주 1회 자동 리포트를 단계별로 crontab 에 등록(요일/시간: DOW=1 HOUR=9 MIN=0, 미리보기: DRY_RUN=1)
	@NOTES_DIR="$(NOTES_DIR)" QUERY_LOG="$(QUERY_LOG)" bash "$(CURDIR)/scripts/report-cron.sh"

.PHONY: retro
retro: ## 워크플로우 회고 노트 생성(작업 패턴·OQ 대시보드·결정 로그 — RETRO_REPO=대상, RETRO_DAYS=구간) — specs/032
	@RETRO_REPO="$(RETRO_REPO)" RETRO_DAYS="$(RETRO_DAYS)" npm run --silent retro-report

.PHONY: retro-cron
retro-cron: ## 회고 주기 등록(crontab — DOW=1 HOUR=9 미리보기 DRY_RUN=1) — specs/032
	@bash scripts/retro-cron.sh

.PHONY: trash-list
trash-list: ## 휴지통(.trash/) 확인 — soft-delete된 노트 목록 (NOTES_DIR)
	@NOTES_DIR="$(NOTES_DIR)" bash "$(CURDIR)/scripts/trash.sh" list

.PHONY: trash-empty
trash-empty: ## 휴지통 완전 비우기(비가역) — 실행 전 확인. 비대화 시 FORCE=1 (NOTES_DIR)
	@NOTES_DIR="$(NOTES_DIR)" FORCE="$(FORCE)" bash "$(CURDIR)/scripts/trash.sh" empty

.PHONY: agents-deploy
agents-deploy: ## 페르소나 레지스트리(~/.localmind/agents)를 Claude Code·Codex 설정으로 배포(멱등; 직접 만든 파일은 보호)
	@npm run --silent agents:deploy

.PHONY: skills-deploy
skills-deploy: ## 오케스트레이션 스킬 정본을 시드하고 Claude Code로 복사 배포(멱등; 직접 만든 스킬은 보호)
	@npm run --silent skills:deploy

.PHONY: init-sdd
init-sdd: ## SDD 작업 흐름(AGENTS.md+specs/)을 지정한 프로젝트에 심기 (DIR=<경로>; 기존 파일은 덮어쓰지 않음)
	@if [ -z "$(DIR)" ]; then echo "✗ DIR을 지정하세요: make init-sdd DIR=<경로>"; exit 1; fi
	@npm run --silent init-sdd -- "$(DIR)"

.PHONY: update
update: ## 이 기기 최신화 한 방: 정본 pull(코드·NOTES_DIR 노트 repo) → 파생물 재생성(빌드·재인덱싱·페르소나/스킬 배포) (specs/033; 원격 기기는 make device-sync). 미리보기 DRY_RUN=1
	@DRY_RUN="$(DRY_RUN)" NOTES_DIR="$(NOTES_DIR)" bash "$(CURDIR)/scripts/update.sh"

.PHONY: restore
.PHONY: device-sync
device-sync: ## 원격 기기 최신화 한 방(HOST=<라벨|user@host> [REMOTE_DIR=..]) — CI 확인→백업→원격 pull→검증·배포 (specs/031; 새 기기는 make recover)
	@HOST="$(HOST)" REMOTE_DIR="$(REMOTE_DIR)" SYNC_SKIP_CI="$(SYNC_SKIP_CI)" SYNC_TEST_CMD="$(SYNC_TEST_CMD)" SYNC_ENV_PREP="$(SYNC_ENV_PREP)" bash scripts/device-sync.sh

restore: ## 백업에서 복원: 노트 repo pull/clone → memory-import → 재인덱싱 (스택 떠 있어야 함)
	@if git -C "$(BACKUP_DIR)" rev-parse --is-inside-work-tree >/dev/null 2>&1; then \
		if git -C "$(BACKUP_DIR)" remote | grep -q .; then \
			echo "→ 백업 repo pull: $(BACKUP_DIR)"; git -C "$(BACKUP_DIR)" pull --ff-only || echo "ℹ pull 생략/실패 — 로컬 상태로 진행"; \
		else echo "ℹ $(BACKUP_DIR) remote 없음 — 로컬 노트로 진행"; fi; \
	elif [ -n "$(RESTORE_REPO)" ]; then \
		echo "→ 백업 repo clone: $(RESTORE_REPO) → $(BACKUP_DIR)"; git clone "$(RESTORE_REPO)" "$(BACKUP_DIR)"; \
	else \
		echo "✗ $(BACKUP_DIR) 가 git repo가 아닙니다 — 백업 repo url을 주세요: make restore RESTORE_REPO=<url>"; exit 1; \
	fi
	@if [ -f "$(BACKUP_DIR)/memory.md" ]; then \
		echo "→ 메모리 복원"; npm run memory:import -- "$(BACKUP_DIR)/memory.md"; \
	else echo "ℹ $(BACKUP_DIR)/memory.md 없음 — 메모리 복원 생략"; fi
	@echo "→ 개인 설정 파일 복원 확인"; BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/restore-extras.sh"
	@echo "→ 노트 재인덱싱"; REINDEX_FALLBACK_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/reindex.sh" \
		|| echo "ℹ 재인덱싱 실패(임베딩 :4000 미기동?) — 'make up' 후 'make reindex', 또는 첫 검색 때 자동 인덱싱"
	@echo "→ 자산(페르소나·스킬) 복원 + 쿼리 로그 병합"; BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/restore-assets.sh"

.PHONY: recover
recover: ## 새 컴퓨터에서 통째 복구를 단계별로 안내: 백업 받기→설치·기동→메모리·노트 복원 (RESTORE_REPO 권장)
	@RESTORE_REPO="$(RESTORE_REPO)" BACKUP_DIR="$(BACKUP_DIR)" BACKUP_REPO="$(BACKUP_REPO)" bash "$(CURDIR)/scripts/recover.sh"

##@ 시크릿/키(.env)
.PHONY: init-env
init-env: ## .env 없으면 .env.example에서 생성(게이트웨이 키 자동 생성 포함)
	@if [ -f .env ]; then echo ".env 이미 존재 — 건너뜀"; \
	else cp .env.example .env && echo ".env 생성 완료 — 값을 채우세요(API키 'make token', claude 인증 'make claude-token')"; fi
	@bash "$(CURDIR)/scripts/ensure-master-key.sh" .env
	@chmod 600 .env # OAuth 토큰·키가 담기므로 소유자 전용(specs/015 FR-9)

.PHONY: claude-token
claude-token: ## claude 구독 토큰을 단계별로 발급하고 .env 에 자동 저장(브라우저 1회)
	@bash "$(CURDIR)/scripts/claude-token.sh"

.PHONY: token
token: ## 강한 랜덤 토큰 발급(LOCALMIND_API_KEY용)
	@t=$$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'); \
	echo "생성된 토큰:"; echo "  $$t"; echo; \
	echo ".env 에 붙여넣기:"; \
	echo "  LOCALMIND_API_KEY=$$t"

.PHONY: secrets
secrets: ## 시크릿 현황(마스킹) + 구독 인증 상태 점검
	@test -f .env || { echo ".env 없음 — 'make init-env' 먼저 실행"; exit 1; }
	@echo "── .env 시크릿 ──"
	@for v in LOCALMIND_API_KEY LITELLM_MASTER_KEY CLAUDE_CODE_OAUTH_TOKEN; do \
		val=$$(grep -E "^$$v=" .env | head -1 | cut -d= -f2-); \
		if [ -z "$$val" ]; then printf "  %-24s %s\n" "$$v" "✗ 미설정"; \
		else printf "  %-24s %s\n" "$$v" "✓ 설정됨 (앞4: $$(printf %s "$$val" | cut -c1-4)…, 길이 $$(printf %s "$$val" | wc -c | tr -d ' '))"; fi; \
	done
	@val=$$(grep -E "^LITELLM_MASTER_KEY=" .env | head -1 | cut -d= -f2-); \
		if [ "$$val" = "sk-local" ]; then echo "  ⚠ 게이트웨이 키가 예전 기본값(sk-local)이에요 — 추측 가능한 값이라 갱신을 권장해요:"; \
		echo "    .env에서 LITELLM_MASTER_KEY 값을 비운 뒤 'make init-env' 실행(임의 키 자동 생성, specs/014)"; fi
	@echo "── 구독 인증 ──"
	@val=$$(grep -E "^CLAUDE_CODE_OAUTH_TOKEN=" .env | head -1 | cut -d= -f2-); \
		test -n "$$val" && echo "  claude  ✓ 토큰 설정됨 (.env)" || echo "  claude  ✗ 토큰 없음 — 'make claude-token' 후 .env 에 입력"
	@test -e "$$HOME/.codex" && echo "  codex   ✓ ~/.codex 있음(마운트)" || echo "  codex   ✗ ~/.codex 없음 (codex 로그인 필요)"

##@ MCP (Claude Code 연동)
# RAG 노트 폴더(NOTES_DIR)의 정본은 .env — 여기서 기본값을 주입하면 셸 폴백이 가려져
# "조용한 부분 색인"이 재발하므로 주입하지 않는다(specs/019 FR-6). 스크립트가
# 환경변수 → .env → 기본(~/.localmind) 순으로 해석한다.
# 덮어쓰기: make mcp-install NOTES_DIR=/my/notes (쉼표로 여러 개 가능)

.PHONY: mcp-install
mcp-install: ## localmind를 Claude Code에 단계별로 연결(준비물 점검→설정 확인→등록). 노트 폴더: NOTES_DIR=
	@NOTES_DIR="$(NOTES_DIR)" bash "$(CURDIR)/scripts/mcp-install.sh"

.PHONY: notes-connect
notes-connect: ## 노트 git 저장소를 받아와 Claude Code에 연결. 목록: NOTES_REPOS="라벨=URL,...", 위치: NOTES_REPOS_DIR=
	@NOTES_REPOS="$(NOTES_REPOS)" NOTES_REPOS_DIR="$(NOTES_REPOS_DIR)" bash "$(CURDIR)/scripts/notes-connect.sh"

.PHONY: mcp-uninstall
mcp-uninstall: ## Claude Code에서 localmind MCP 등록 해제
	@claude mcp remove localmind -s user 2>/dev/null && echo "✓ 해제됨" || echo "ℹ 등록돼 있지 않음"

.PHONY: mcp-config
mcp-config: ## 다른 MCP 클라이언트(Cursor/Claude Desktop)용 설정 JSON 출력
	@u=$$(grep -E "^OPENMEMORY_USER=" .env 2>/dev/null | head -1 | cut -d= -f2-); u=$${u:-localmind}; \
	k=$$(grep -E "^LITELLM_MASTER_KEY=" .env 2>/dev/null | head -1 | cut -d= -f2-); \
	. "$(CURDIR)/scripts/lib/read-env.sh"; \
	n="$${NOTES_DIR:-}"; [ -z "$$n" ] && n=$$(read_env_val NOTES_DIR "$(CURDIR)/.env"); n=$${n:-$$HOME/.localmind}; \
	printf '{\n  "mcpServers": {\n    "localmind": {\n      "command": "node",\n      "args": ["%s/dist/mcp.js"],\n      "env": { "NOTES_DIR": "%s", "OPENMEMORY_USER": "%s", "LITELLM_MASTER_KEY": "%s" }\n    }\n  }\n}\n' \
		"$(CURDIR)" "$$n" "$$u" "$$k"

.PHONY: mcp-desktop
mcp-desktop: ## localmind를 Claude Desktop 설정에 자동 연결(기존 서버 보존 병합·백업, 미리보기 DRY_RUN=1)
	@NOTES_DIR="$(NOTES_DIR)" DRY_RUN="$(DRY_RUN)" bash "$(CURDIR)/scripts/mcp-desktop.sh"

.PHONY: mcp-serve-http
mcp-serve-http: ## 원격(HTTP) MCP 서버 기동 — 홈서버에서 실행, 다른 기기가 Tailscale로 접속(specs/045). 토큰 없으면 생성
	@bash "$(CURDIR)/scripts/mcp-serve-http.sh"

##@ 도움말
.PHONY: help
help: ## 이 목록 표시
	@awk 'BEGIN{FS=":.*## "} \
		/^##@/{printf "\n\033[1m%s\033[0m\n", substr($$0,4)} \
		/^[a-zA-Z_-]+:.*## /{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
