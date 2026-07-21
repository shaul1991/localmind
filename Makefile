# localmind 운영 커맨드. `make` 또는 `make help`로 목록 확인.
# 설정값(NOTES_DIR, EMBEDDINGS_* 등)은 .env 에서 읽힌다(.env.example 참고).

# 백업 repo(노트 덤프) — git repo여야 함. 인용 사용처라 trailing space 금지(주석은 윗줄에).
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

##@ 설정/진단
.PHONY: setup
setup: ## 처음 설정(최초 1회): 점검→진단→임베딩 안내→연결 점검을 단계별 안내. 미리보기 DRY_RUN=1
	@DRY_RUN="$(DRY_RUN)" bash "$(CURDIR)/scripts/setup.sh"

.PHONY: doctor
doctor: ## 이 기기 진단: OS/GPU/임베딩 경로 점검 + 더 빠른 구성 안내(읽기 전용)
	@bash "$(CURDIR)/scripts/doctor.sh"

.PHONY: guide
guide: ## 브라우저 설치 마법사 열기(무의존 — Node만 필요, 준비물 점검·단계 실행·연결까지 안내, specs/046)
	@command -v node >/dev/null 2>&1 || { echo "✗ Node가 필요해요 — https://nodejs.org 에서 LTS를 설치한 뒤 다시 'make guide'."; echo "  (또는 README의 '시작하기'를 따라 하세요.)"; exit 1; }
	@node "$(CURDIR)/scripts/install-wizard.mjs"

.PHONY: health
health: ## 임베딩 엔드포인트 헬스체크(.env EMBEDDINGS_URL)
	@. "$(CURDIR)/scripts/lib/read-env.sh"; \
	u=$$(read_env_val EMBEDDINGS_URL "$(CURDIR)/.env"); u=$${u:-http://localhost:11434/v1}; \
	curl -s -o /dev/null -w "embeddings  $$u  → %{http_code}\n" "$$u/models" || true

.PHONY: smoke
smoke: ## 스모크 테스트(MCP 도구 표면 + brain)
	@npm run smoke:mcp && npm run smoke:brain

.PHONY: clean
clean: ## 완전 초기화: 데이터 볼륨(ollama 컨테이너 모델)·인덱스 삭제. 노트·.env는 보존. 확인을 받고 진행
	@BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/clean.sh"

.PHONY: purge
purge: ## 완전 제거(로컬만·GitHub 백업 보존): 컨테이너·볼륨·MCP등록. 노트까지: NOTES=1 make purge
	@NOTES="$(NOTES)" FORCE="$(FORCE)" BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/purge.sh"

.PHONY: uninstall
uninstall: purge ## 완전 제거(purge의 별칭 — 직관적 이름). 노트까지: NOTES=1 make uninstall

##@ 백업/복구(git)
.PHONY: backup-init
backup-init: ## GitHub 비공개 백업 저장소를 단계별로 세팅(gh 필요) → 이후 make backup. 이름: BACKUP_REPO=
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_REPO="$(BACKUP_REPO)" bash "$(CURDIR)/scripts/backup-init.sh"

.PHONY: backup
backup: ## 노트·자산 백업 repo 커밋·푸시 (BACKUP_DIR; 최초 1회는 make backup-init; 개인 설정 파일: BACKUP_EXTRA_FILES=)
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_EXTRA_FILES="$(BACKUP_EXTRA_FILES)" \
	BACKUP_CONFIRM_EMPTY_ASSETS="$(BACKUP_CONFIRM_EMPTY_ASSETS)" \
	BACKUP_QUERY_LOG="$(BACKUP_QUERY_LOG)" QUERY_LOG="$(QUERY_LOG)" bash "$(CURDIR)/scripts/backup.sh"

.PHONY: backup-cron
backup-cron: ## 매일 자동 백업을 단계별로 crontab 에 등록(시간: HOUR=3 MIN=0, 미리보기: DRY_RUN=1)
	@BACKUP_DIR="$(BACKUP_DIR)" BACKUP_EXTRA_FILES="$(BACKUP_EXTRA_FILES)" bash "$(CURDIR)/scripts/backup-cron.sh"

.PHONY: reindex
reindex: ## second-brain 노트 (재)인덱싱 (임베딩 엔진 .env EMBEDDINGS_URL 필요; NOTES_DIR는 환경변수 → .env 순으로 해석; 고아 정리: REINDEX_PRUNE_LABELS= · 위치 이동 수락: REINDEX_ADOPT_REBIND=)
	@REINDEX_PRUNE_LABELS="$(REINDEX_PRUNE_LABELS)" REINDEX_ADOPT_REBIND="$(REINDEX_ADOPT_REBIND)" bash "$(CURDIR)/scripts/reindex.sh"

.PHONY: query-report
query-report: ## second-brain 검색 품질 리포트(실패 쿼리 분석 — 로그는 로컬 전용)
	@npm run --silent query-report

.PHONY: query-log-clean
query-log-clean: ## 쿼리 로그에서 30일 이전 항목 정리
	@npm run --silent query-report -- --clean

.PHONY: report
report: ## 검색 품질 리포트 노트 생성(최근 7일 → 노트 폴더 reports/)
	@npm run --silent brain-report

.PHONY: report-cron
report-cron: ## 주 1회 자동 리포트를 단계별로 crontab 에 등록(요일/시간: DOW=1 HOUR=9 MIN=0, 미리보기: DRY_RUN=1)
	@NOTES_DIR="$(NOTES_DIR)" QUERY_LOG="$(QUERY_LOG)" bash "$(CURDIR)/scripts/report-cron.sh"

.PHONY: trash-list
trash-list: ## 휴지통(.trash/) 확인 — soft-delete된 노트 목록 (NOTES_DIR)
	@NOTES_DIR="$(NOTES_DIR)" bash "$(CURDIR)/scripts/trash.sh" list

.PHONY: trash-empty
trash-empty: ## 휴지통 완전 비우기(비가역) — 실행 전 확인. 비대화 시 FORCE=1 (NOTES_DIR)
	@NOTES_DIR="$(NOTES_DIR)" FORCE="$(FORCE)" bash "$(CURDIR)/scripts/trash.sh" empty

.PHONY: update
update: ## 이 기기 최신화 한 방: 정본 pull(코드·NOTES_DIR 노트 repo) → 파생물 재생성(빌드·재인덱싱) (specs/033; 원격 기기는 make device-sync). 미리보기 DRY_RUN=1
	@DRY_RUN="$(DRY_RUN)" NOTES_DIR="$(NOTES_DIR)" bash "$(CURDIR)/scripts/update.sh"

.PHONY: device-sync
device-sync: ## 원격 기기 최신화 한 방(HOST=<라벨|user@host> [REMOTE_DIR=..]) — CI 확인→백업→원격 pull→검증 (specs/031; 새 기기는 make recover)
	@HOST="$(HOST)" REMOTE_DIR="$(REMOTE_DIR)" SYNC_SKIP_CI="$(SYNC_SKIP_CI)" SYNC_TEST_CMD="$(SYNC_TEST_CMD)" SYNC_ENV_PREP="$(SYNC_ENV_PREP)" bash scripts/device-sync.sh

.PHONY: restore
restore: ## 백업에서 복원: 노트 repo pull/clone → 재인덱싱
	@if git -C "$(BACKUP_DIR)" rev-parse --is-inside-work-tree >/dev/null 2>&1; then \
		if git -C "$(BACKUP_DIR)" remote | grep -q .; then \
			echo "→ 백업 repo pull: $(BACKUP_DIR)"; git -C "$(BACKUP_DIR)" pull --ff-only || echo "ℹ pull 생략/실패 — 로컬 상태로 진행"; \
		else echo "ℹ $(BACKUP_DIR) remote 없음 — 로컬 노트로 진행"; fi; \
	elif [ -n "$(RESTORE_REPO)" ]; then \
		echo "→ 백업 repo clone: $(RESTORE_REPO) → $(BACKUP_DIR)"; git clone "$(RESTORE_REPO)" "$(BACKUP_DIR)"; \
	else \
		echo "✗ $(BACKUP_DIR) 가 git repo가 아닙니다 — 백업 repo url을 주세요: make restore RESTORE_REPO=<url>"; exit 1; \
	fi
	@echo "→ 개인 설정 파일 복원 확인"; BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/restore-extras.sh"
	@echo "→ 노트 재인덱싱"; REINDEX_FALLBACK_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/reindex.sh" \
		|| echo "ℹ 재인덱싱 실패(임베딩 엔진 미기동?) — 엔진(EMBEDDINGS_URL)을 켠 뒤 'make reindex', 또는 첫 검색 때 자동 인덱싱"
	@echo "→ 자산 복원 + 쿼리 로그 병합"; BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/restore-assets.sh"

.PHONY: recover
recover: ## 새 컴퓨터에서 통째 복구를 단계별로 안내: 백업 받기→설치→노트 복원 (RESTORE_REPO 권장)
	@RESTORE_REPO="$(RESTORE_REPO)" BACKUP_DIR="$(BACKUP_DIR)" BACKUP_REPO="$(BACKUP_REPO)" bash "$(CURDIR)/scripts/recover.sh"

.PHONY: init-env
init-env: ## .env 없으면 .env.example에서 생성
	@if [ -f .env ]; then echo ".env 이미 존재 — 건너뜀"; \
	else cp .env.example .env && echo ".env 생성 완료 — NOTES_DIR·EMBEDDINGS_* 값을 채우세요"; fi
	@chmod 600 .env # 개인 설정이 담기므로 소유자 전용(specs/015 FR-9)

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
	@. "$(CURDIR)/scripts/lib/read-env.sh"; \
	n="$${NOTES_DIR:-}"; [ -z "$$n" ] && n=$$(read_env_val NOTES_DIR "$(CURDIR)/.env"); n=$${n:-$$HOME/.localmind}; \
	printf '{\n  "mcpServers": {\n    "localmind": {\n      "command": "node",\n      "args": ["%s/dist/mcp.js"],\n      "env": { "NOTES_DIR": "%s" }\n    }\n  }\n}\n' \
		"$(CURDIR)" "$$n"

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
