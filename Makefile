# localmind 운영 커맨드. `make` 또는 `make help`로 목록 확인.
# 설정값(LITELLM_MASTER_KEY, OPENMEMORY_USER 등)은 .env 에서 읽힌다(.env.example 참고).

COMPOSE := docker compose
STACK   := --profile gateway --profile memory          # 로컬 스택(임베딩+메모리)
ALL     := $(STACK)                                     # 전체 = 로컬 스택(원격 없음)
FILE    ?= memory-backup.md                             # 메모리 백업 파일
SERVICE ?=                                              # logs 대상(비우면 전체)
# 백업 repo(노트+메모리 덤프) — git repo여야 함. 인용 사용처라 trailing space 금지(주석은 윗줄에).
BACKUP_DIR ?= $(HOME)/.localmind

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
.PHONY: up
up: ## 스택 기동(게이트웨이+메모리, 빌드 포함)
	$(COMPOSE) $(STACK) up -d --build

.PHONY: down
down: ## 스택 정지(볼륨/데이터 유지)
	$(COMPOSE) $(ALL) down

.PHONY: clean
clean: ## 스택 정지 + 볼륨 삭제(메모리·인덱스 초기화 — 주의)
	$(COMPOSE) $(ALL) down -v

.PHONY: restart
restart: ## 스택 재기동
	$(COMPOSE) $(ALL) restart $(SERVICE)

.PHONY: ps
ps: ## 컨테이너 상태
	$(COMPOSE) $(ALL) ps

.PHONY: logs
logs: ## 로그 follow (한 서비스만: make logs SERVICE=openmemory)
	$(COMPOSE) $(ALL) logs -f $(SERVICE)

##@ 검증
.PHONY: health
health: ## 엔드포인트 헬스체크
	@curl -s -o /dev/null -w "gateway     :8787  → %{http_code}\n" http://127.0.0.1:8787/v1/models || true
	@curl -s -o /dev/null -w "embeddings  :4000  → %{http_code}\n" http://127.0.0.1:4000/health/liveliness || true
	@curl -s -o /dev/null -w "memory      :8767  → %{http_code}\n" http://127.0.0.1:8767/docs || true

.PHONY: smoke
smoke: ## 스모크 테스트(API + MCP + brain)
	npm run smoke && npm run smoke:mcp && npm run smoke:brain

##@ 백업/복구(git)
.PHONY: memory-export
memory-export: ## 메모리 → 마크다운 (make memory-export FILE=~/brain/memory.md)
	npm run memory:export -- $(FILE)

.PHONY: memory-import
memory-import: ## 마크다운 → 메모리 복원(멱등) (make memory-import FILE=...)
	npm run memory:import -- $(FILE)

.PHONY: backup
backup: ## 메모리 export + 노트 백업 repo 커밋·푸시 (BACKUP_DIR; 스케줄은 make backup-cron)
	@npm run memory:export -- "$(BACKUP_DIR)/memory.md"
	@git -C "$(BACKUP_DIR)" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
		{ echo "✗ $(BACKUP_DIR) 는 git repo가 아닙니다 — git -C $(BACKUP_DIR) init && remote add origin <url> 후 다시"; exit 1; }
	@grep -qxF '.brain-index.json' "$(BACKUP_DIR)/.gitignore" 2>/dev/null || echo '.brain-index.json' >> "$(BACKUP_DIR)/.gitignore"
	@git -C "$(BACKUP_DIR)" add -A; \
	if git -C "$(BACKUP_DIR)" diff --cached --quiet; then echo "변경 없음 — 커밋 생략"; \
	else git -C "$(BACKUP_DIR)" commit -q -m "localmind backup $$(date +%Y-%m-%dT%H:%M)" && echo "✓ 커밋"; fi; \
	if git -C "$(BACKUP_DIR)" remote | grep -q .; then git -C "$(BACKUP_DIR)" push -q && echo "✓ push → $(BACKUP_DIR)"; \
	else echo "ℹ remote 없음 — 로컬 커밋만(push 생략)"; fi

.PHONY: backup-cron
backup-cron: ## 매일 03:00 자동 백업 cron 한 줄 출력(crontab -e 에 붙여넣기)
	@echo "0 3 * * * cd $(CURDIR) && make backup >> $$HOME/localmind-backup.log 2>&1"

.PHONY: reindex
reindex: ## second-brain 노트 (재)인덱싱 (임베딩 :4000 필요)
	npm run reindex

.PHONY: restore
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
	@echo "→ 노트 재인덱싱"; NOTES_DIR="$${NOTES_DIR:-$(BACKUP_DIR)}" npm run reindex \
		|| echo "ℹ 재인덱싱 실패(임베딩 :4000 미기동?) — 'make up' 후 'make reindex', 또는 첫 검색 때 자동 인덱싱"

.PHONY: recover
recover: ## 새 기기 원커맨드: 설치·빌드 → 기동 → 헬스 대기 → 복원 (RESTORE_REPO 권장)
	@$(MAKE) install build
	@$(MAKE) up
	@echo "→ 스택 헬스 대기 (첫 기동은 모델 pull/빌드로 수 분 걸림)..."; \
	ready=0; for i in $$(seq 1 120); do \
		m=$$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8767/docs 2>/dev/null); \
		g=$$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health/liveliness 2>/dev/null); \
		if [ "$$m" = "200" ] && [ "$$g" = "200" ]; then ready=1; echo "  ✓ ready (memory=$$m gateway=$$g)"; break; fi; \
		echo "  대기 $$i/120 (memory=$$m gateway=$$g)"; sleep 5; \
	done; \
	if [ "$$ready" != "1" ]; then echo "✗ 스택 미준비 — 'make logs'로 확인 후 'make restore' 수동 실행"; exit 1; fi
	@$(MAKE) restore

##@ 시크릿/키(.env)
.PHONY: init-env
init-env: ## .env 없으면 .env.example에서 생성
	@if [ -f .env ]; then echo ".env 이미 존재 — 건너뜀"; \
	else cp .env.example .env && echo ".env 생성 완료 — 값을 채우세요(API키 'make token', claude 인증 'make claude-token')"; fi

.PHONY: claude-token
claude-token: ## claude 구독 OAuth 토큰 발급(브라우저 1회) → .env 의 CLAUDE_CODE_OAUTH_TOKEN 에 붙여넣기
	@command -v claude >/dev/null 2>&1 || { echo "✗ claude CLI 없음 — 호스트에 설치/로그인 후 다시"; exit 1; }
	@echo "→ 브라우저로 1회 인증합니다. 출력된 토큰을 .env 에 넣으세요:"
	@echo "    CLAUDE_CODE_OAUTH_TOKEN=<출력된 토큰>"
	@echo "  이후 'make up' 으로 반영(컨테이너 recreate — restart는 env 재주입 안 됨). (~1년 장수명)"
	@echo
	@claude setup-token

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
	@echo "── 구독 인증 ──"
	@val=$$(grep -E "^CLAUDE_CODE_OAUTH_TOKEN=" .env | head -1 | cut -d= -f2-); \
		test -n "$$val" && echo "  claude  ✓ 토큰 설정됨 (.env)" || echo "  claude  ✗ 토큰 없음 — 'make claude-token' 후 .env 에 입력"
	@test -e "$$HOME/.codex" && echo "  codex   ✓ ~/.codex 있음(마운트)" || echo "  codex   ✗ ~/.codex 없음 (codex 로그인 필요)"

##@ MCP (Claude Code 연동)
# RAG 노트 폴더. 덮어쓰기: make mcp-install NOTES_DIR=/my/notes (쉼표로 여러 개 가능)
NOTES_DIR ?= $(HOME)/.localmind

.PHONY: mcp-install
mcp-install: ## localmind MCP를 Claude Code(user 스코프)에 등록 — 절대경로·시드 user 자동
	@command -v claude >/dev/null 2>&1 || { echo "✗ claude CLI 없음 — 호스트에 설치 후 다시"; exit 1; }
	@test -f "$(CURDIR)/dist/mcp.js" || { echo "✗ dist/mcp.js 없음 — 'make build' 먼저"; exit 1; }
	@u=$$(grep -E "^OPENMEMORY_USER=" .env 2>/dev/null | head -1 | cut -d= -f2-); u=$${u:-localmind}; \
	claude mcp remove localmind -s user >/dev/null 2>&1 || true; \
	claude mcp add localmind -s user -e OPENMEMORY_USER=$$u -e NOTES_DIR=$(NOTES_DIR) -- node $(CURDIR)/dist/mcp.js >/dev/null \
		&& echo "✓ Claude Code 등록 (user=$$u, NOTES_DIR=$(NOTES_DIR)) — Claude Code 재시작 후 localmind 도구 사용" \
		|| { echo "✗ 등록 실패"; exit 1; }

.PHONY: mcp-uninstall
mcp-uninstall: ## Claude Code에서 localmind MCP 등록 해제
	@claude mcp remove localmind -s user 2>/dev/null && echo "✓ 해제됨" || echo "ℹ 등록돼 있지 않음"

.PHONY: mcp-config
mcp-config: ## 다른 MCP 클라이언트(Cursor/Claude Desktop)용 설정 JSON 출력
	@u=$$(grep -E "^OPENMEMORY_USER=" .env 2>/dev/null | head -1 | cut -d= -f2-); u=$${u:-localmind}; \
	printf '{\n  "mcpServers": {\n    "localmind": {\n      "command": "node",\n      "args": ["%s/dist/mcp.js"],\n      "env": { "NOTES_DIR": "%s", "OPENMEMORY_USER": "%s" }\n    }\n  }\n}\n' \
		"$(CURDIR)" "$(NOTES_DIR)" "$$u"

##@ 도움말
.PHONY: help
help: ## 이 목록 표시
	@awk 'BEGIN{FS=":.*## "} \
		/^##@/{printf "\n\033[1m%s\033[0m\n", substr($$0,4)} \
		/^[a-zA-Z_-]+:.*## /{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
