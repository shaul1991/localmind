# localmind 운영 커맨드. `make` 또는 `make help`로 목록 확인.
# 설정값(LITELLM_MASTER_KEY, OPENMEMORY_USER 등)은 .env 에서 읽힌다(.env.example 참고).

COMPOSE := docker compose
STACK   := --profile gateway --profile memory          # 로컬 스택(임베딩+메모리)
ALL     := $(STACK)                                     # 전체 = 로컬 스택(원격 없음)
FILE    ?= memory-backup.md                             # 메모리 백업 파일
SERVICE ?=                                              # logs 대상(비우면 전체)
# 백업 repo(노트+메모리 덤프) — git repo여야 함. 인용 사용처라 trailing space 금지(주석은 윗줄에).
BACKUP_DIR ?= $(HOME)/localmind-brain

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

##@ 메모리 백업(git)
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
	@git -C "$(BACKUP_DIR)" add -A; \
	if git -C "$(BACKUP_DIR)" diff --cached --quiet; then echo "변경 없음 — 커밋 생략"; \
	else git -C "$(BACKUP_DIR)" commit -q -m "localmind backup $$(date +%Y-%m-%dT%H:%M)" && echo "✓ 커밋"; fi; \
	if git -C "$(BACKUP_DIR)" remote | grep -q .; then git -C "$(BACKUP_DIR)" push -q && echo "✓ push → $(BACKUP_DIR)"; \
	else echo "ℹ remote 없음 — 로컬 커밋만(push 생략)"; fi

.PHONY: backup-cron
backup-cron: ## 매일 03:00 자동 백업 cron 한 줄 출력(crontab -e 에 붙여넣기)
	@echo "0 3 * * * cd $(CURDIR) && make backup >> $$HOME/localmind-backup.log 2>&1"

##@ 시크릿/키(.env)
.PHONY: init-env
init-env: ## .env 없으면 .env.example에서 생성
	@if [ -f .env ]; then echo ".env 이미 존재 — 건너뜀"; \
	else cp .env.example .env && echo ".env 생성 완료 — 값을 채우세요(토큰은 'make token')"; fi

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
	@for v in LOCALMIND_API_KEY LITELLM_MASTER_KEY; do \
		val=$$(grep -E "^$$v=" .env | head -1 | cut -d= -f2-); \
		if [ -z "$$val" ]; then printf "  %-20s %s\n" "$$v" "✗ 미설정"; \
		else printf "  %-20s %s\n" "$$v" "✓ 설정됨 (앞4: $$(printf %s "$$val" | cut -c1-4)…, 길이 $$(printf %s "$$val" | wc -c | tr -d ' '))"; fi; \
	done
	@echo "── 구독 인증(호스트 마운트) ──"
	@test -e "$$HOME/.claude" && echo "  ~/.claude  ✓ 있음" || echo "  ~/.claude  ✗ 없음 (claude 로그인 필요)"
	@test -e "$$HOME/.codex"  && echo "  ~/.codex   ✓ 있음" || echo "  ~/.codex   ✗ 없음 (codex 로그인 필요)"

##@ 도움말
.PHONY: help
help: ## 이 목록 표시
	@awk 'BEGIN{FS=":.*## "} \
		/^##@/{printf "\n\033[1m%s\033[0m\n", substr($$0,4)} \
		/^[a-zA-Z_-]+:.*## /{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
