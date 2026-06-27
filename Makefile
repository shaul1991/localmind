# localmind 운영 커맨드. `make` 또는 `make help`로 목록 확인.
# 설정값(MCP_HTTP_TOKEN, MCP_INSTANCE, NOTES_DIR 등)은 .env 에서 읽힌다(.env.example 참고).

COMPOSE := docker compose
STACK   := --profile gateway --profile memory          # 기본 스택(임베딩+메모리)
ALL     := --profile gateway --profile memory --profile mcp  # 원격 MCP 포함
FILE    ?= memory-backup.md                             # 메모리 백업 파일
SERVICE ?=                                              # logs 대상(비우면 전체)

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

.PHONY: up-mcp
up-mcp: ## 원격 MCP까지 기동(.env에 MCP_HTTP_TOKEN 필요)
	$(COMPOSE) $(ALL) up -d --build

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
	@curl -s -o /dev/null -w "remote-mcp  :8788  → %{http_code}\n" http://127.0.0.1:8788/health || true

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

##@ 도움말
.PHONY: help
help: ## 이 목록 표시
	@awk 'BEGIN{FS=":.*## "} \
		/^##@/{printf "\n\033[1m%s\033[0m\n", substr($$0,4)} \
		/^[a-zA-Z_-]+:.*## /{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
