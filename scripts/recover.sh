#!/usr/bin/env bash
# localmind 복구 — 새 컴퓨터에서 내 두뇌(메모리+노트)를 통째로 되살리는 비개발자용 단계별 가이드.
# 호출: make recover   (환경변수 RESTORE_REPO, BACKUP_DIR, BACKUP_REPO 로 조정)
# 흐름: 사전점검 → 백업 내려받기 → 설치·빌드 → 스택 기동·대기 → 메모리 복원 → 노트 재인덱싱.
# 터미널에선 한 단계씩 묻고, 비대화 환경에선 기본값으로 자동 진행한다.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
BACKUP_REPO="${BACKUP_REPO:-localmind-backup}"
RESTORE_REPO="${RESTORE_REPO:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export COMPOSE_PROFILES="gateway,memory"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
# repo URL을 owner/repo 로 정규화(스킴·호스트·user@·.git·끝슬래시 제거) → https↔ssh 같은 형식차를
# 같은 repo로 보고, 진짜 다른 repo만 구분한다.
repo_id() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://[^/]+/##; s#^[^/@]+@[^:]+:##; s#/+$##; s#\.git$##'; }

confirm() {  # 예/아니오. 비대화면 자동 "예".
  local prompt="$1" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt [Y/n] " ans || ans=""
    [[ "$ans" =~ ^[Nn] ]] && return 1 || return 0
  else
    say "  $prompt → 자동 진행(예)"; return 0
  fi
}
ask_value() {  # ask_value "안내문" "기본값" → 입력값(또는 기본값). 비대화면 기본값.
  local prompt="$1" def="$2" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt${def:+ [기본: $def]}: " ans || ans=""
    printf '%s' "${ans:-$def}"
  else
    printf '%s' "$def"
  fi
}

DC() { docker compose -f "$PROJECT_DIR/docker-compose.yml" "$@"; }

say ""
say "$(b 'localmind 복구')를 시작합니다 — 백업해 둔 메모리와 노트를 이 컴퓨터로 되살려요."
say "총 6단계입니다. 한 단계씩 안내하고, 중간에 언제든 Ctrl+C 로 멈출 수 있어요."
say "  (처음 기동은 AI 모델 내려받기로 몇 분 걸릴 수 있어요 — 정상입니다.)"
say ""

# 전환 사전 안내(specs/019 FR-7): 백업 모델 밖의 데이터는 옮길 수 없다 — 미백업분의
# 유실을 사용자가 인지하고 진행하게 한다(비대화 환경은 안내 후 자동 진행).
say "$(b '먼저 확인해 주세요') — 이전 컴퓨터에서 $(b 'make backup')을 마지막으로 실행한 게 언제인가요?"
say "  그 백업 $(b '이후')에 만든 기억(메모리)·페르소나·검색 기록은 이 복구로 넘어오지 않아요."
say "  이전 컴퓨터를 아직 쓸 수 있다면, 거기서 'make backup'을 한 번 실행한 뒤 진행하는 걸 권해요."
confirm "이대로 복구를 진행할까요?" || { say "  준비되면 다시 '$(b 'make recover')'를 실행해 주세요."; exit 0; }
say ""

# ── 1/6 : 사전 점검 ─────────────────────────────────────────────
say "$(b '[1/6] 준비물 점검')"
command -v docker >/dev/null 2>&1 || { err "Docker가 없어요. https://www.docker.com/products/docker-desktop 에서 설치 후 다시 실행해 주세요."; exit 1; }
if ! docker info >/dev/null 2>&1; then
  err "Docker가 아직 실행 중이 아니에요. Docker Desktop 을 켠 뒤 다시 '$(b 'make recover')' 를 실행해 주세요."
  exit 1
fi
ok "Docker 실행 중"
# 테스트는 LOCALMIND_ENV_FILE로 .env를 격리한다(다른 스크립트와 동일 관례, specs/019)
ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
if [ ! -f "$ENV_FILE" ]; then
  warn ".env(설정 파일)가 없어 예시에서 새로 만들어요."
  cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
  ok ".env 생성됨 — 기본값으로도 복구는 진행돼요. (claude 연동 등은 나중에 'make secrets'로 점검)"
else
  ok ".env 있음"
fi
chmod 600 "$ENV_FILE" # OAuth 토큰·키가 담기므로 소유자 전용(specs/015 FR-9)

# ── 2/6 : 백업 내려받기 ─────────────────────────────────────────
say "$(b '[2/6] 백업 저장소 가져오기')"
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say "  이 컴퓨터에 이미 백업 폴더가 있어요: $BACKUP_DIR"
  # RESTORE_REPO 를 명시했는데 기존 origin과 다른 저장소면 — 엉뚱한 백업을 silent하게
  # 되살리지 않도록 중단한다(자동 재클론은 기존 데이터 손실 위험이라 하지 않음).
  if [ -n "$RESTORE_REPO" ]; then
    existing="$(git -C "$BACKUP_DIR" remote get-url origin 2>/dev/null || true)"
    if [ -n "$existing" ] && [ "$(repo_id "$existing")" != "$(repo_id "$RESTORE_REPO")" ]; then
      # raw URL은 https://user:token@host 형태로 자격증명을 담을 수 있어 출력 금지 — repo_id(owner/repo)만 노출.
      err "$BACKUP_DIR 는 이미 다른 백업 저장소($(repo_id "$existing"))에 연결돼 있어요."
      say "  요청한 저장소($(repo_id "$RESTORE_REPO"))로 복구하려면 다른 폴더를 쓰거나(예: $(b 'make recover BACKUP_DIR=~/.localmind-new RESTORE_REPO=...')) 기존 폴더를 비운 뒤 다시 시도해 주세요."
      exit 1
    fi
  fi
  if git -C "$BACKUP_DIR" remote | grep -q .; then
    git -C "$BACKUP_DIR" pull --ff-only >/dev/null 2>&1 && ok "최신 백업으로 업데이트(pull)" || warn "pull 생략/실패 — 현재 로컬 상태로 진행"
  else
    ok "원격 없음 — 로컬 노트로 진행"
  fi
else
  # 저장소 주소 결정: RESTORE_REPO > gh 자동탐색(BACKUP_REPO) > 직접 입력
  if [ -z "$RESTORE_REPO" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    found="$(gh repo view "$BACKUP_REPO" --json url -q .url 2>/dev/null || true)"
    [ -n "$found" ] && { RESTORE_REPO="$found"; say "  내 GitHub에서 백업 저장소를 찾았어요: $(b "$RESTORE_REPO")"; }
  fi
  [ -z "$RESTORE_REPO" ] && RESTORE_REPO="$(ask_value "백업 저장소 주소(URL)를 붙여넣어 주세요" "")"
  if [ -z "$RESTORE_REPO" ]; then
    err "백업 저장소 주소가 필요해요. 예: $(b 'make recover RESTORE_REPO=https://github.com/내이름/localmind-backup')"
    exit 1
  fi
  if [ -e "$BACKUP_DIR" ] && [ -n "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    err "$BACKUP_DIR 폴더에 이미 다른 파일이 있어 내려받을 수 없어요. 폴더를 비우거나 옮긴 뒤 다시 시도해 주세요."
    exit 1
  fi
  say "  → 백업을 내려받는 중: $BACKUP_DIR"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && [[ "$RESTORE_REPO" != http* ]]; then
    gh repo clone "$RESTORE_REPO" "$BACKUP_DIR" >/dev/null 2>&1 || git clone "$RESTORE_REPO" "$BACKUP_DIR"
  else
    git clone "$RESTORE_REPO" "$BACKUP_DIR"
  fi
  ok "백업 내려받기 완료"
fi

# ── 3/6 : 설치·빌드 ─────────────────────────────────────────────
say "$(b '[3/6] 프로그램 설치·준비')"
( cd "$PROJECT_DIR" && npm install --no-fund --no-audit >/dev/null 2>&1 ) && ok "의존성 설치 완료" || { err "설치 실패 — 인터넷 연결을 확인하고 다시 시도해 주세요."; exit 1; }
( cd "$PROJECT_DIR" && npm run --silent build >/dev/null 2>&1 ) && ok "빌드 완료" || { err "빌드 실패 — 'cd $PROJECT_DIR && npm run build' 로 메시지를 확인해 주세요."; exit 1; }

# ── 4/6 : 임베딩 엔진 확인 ──────────────────────────────────────
say "$(b '[4/6] 임베딩 엔진 확인 (노트 검색용)')"
EMB_URL="$(read_env_val EMBEDDINGS_URL "$ENV_FILE" 2>/dev/null || true)"; EMB_URL="${EMB_URL:-http://localhost:11434/v1}"
if curl -fsS -m 3 "$EMB_URL/models" >/dev/null 2>&1 || curl -fsS -m 3 "${EMB_URL%/v1}/api/tags" >/dev/null 2>&1; then
  ok "임베딩 엔진 응답 ($EMB_URL)"
else
  warn "임베딩 엔진 무응답 ($EMB_URL) — Ollama를 켜세요: brew services start ollama && ollama pull bge-m3"
  warn "(색인은 나중에 'make reindex'로 다시 만들 수 있어요 — 복구는 계속 진행합니다.)"
fi

# ── 5/6 : (great-reduction) 메모리 복원 단계 소멸 — 노트가 기억의 정본 ─────
say "$(b '[5/6] 메모리 되살리기')"
ok "별도 메모리 서비스가 없어요(2026-07 개편) — 기억은 전부 노트로 복원됩니다."

# ── 6/6 : 노트 재인덱싱 ─────────────────────────────────────────
say "$(b '[6/6] 노트 검색 색인 만들기')"
# 개인 설정 파일(extras) 복원 — "통째 복구" 약속에 포함(specs/015 FR-2, make restore와 동일 경로).
# BACKUP_EXTRA_FILES 미사용 백업이면 restore-extras가 조용히 통과한다.
say "  → 개인 설정 파일 복원 확인"
BACKUP_DIR="$BACKUP_DIR" bash "$PROJECT_DIR/scripts/restore-extras.sh" \
  || warn "개인 설정 파일 복원을 건너뛰었어요 — 나중에 'make restore'로 다시 시도할 수 있어요."

MASTER_KEY="$(grep -E '^LITELLM_MASTER_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
if ( cd "$PROJECT_DIR" && NOTES_DIR="${NOTES_DIR:-$BACKUP_DIR}" LITELLM_MASTER_KEY="$MASTER_KEY" npm run --silent reindex >/dev/null 2>&1 ); then
  ok "노트 색인 완료 — 첫 검색부터 빨라요."
else
  warn "색인을 건너뛰었어요(안 해도 첫 검색 때 자동으로 만들어져요). 원하면 나중에 '$(b 'make reindex')'."
fi

# 자산(페르소나·스킬) 복원 + 쿼리 로그 병합(specs/019 FR-2·4) — 실패해도 복구를 막지
# 않는다(set -e 하 실패 허용 블록). 미러 백업(마커)은 노트 연결 전이라 보류되고 restore-assets가
# 순서를 안내한다(보류=정상, 배포 실행 실패만 비0 요약).
say "  → 페르소나·스킬 복원 확인"
ASSET_FAIL=0
if BACKUP_DIR="$BACKUP_DIR" RESTORE_CONTEXT=recover bash "$PROJECT_DIR/scripts/restore-assets.sh"; then :; else ASSET_FAIL=1; fi

say ""
say "$(b '🎉 복구 완료!') 두뇌가 이 컴퓨터로 돌아왔어요."
say "  • 상태 확인     : $(b 'make health')"
say "  • Claude 연동   : $(b 'make mcp-install')   (Claude Code에서 localmind 도구 사용)"
say "  • 앞으로 백업   : $(b 'make backup')"
if [ "$ASSET_FAIL" = "1" ]; then
  warn "일부 단계(페르소나·스킬 배포)가 완료되지 않았어요 — 위 안내를 확인해 주세요."
  exit 1
fi
say ""
