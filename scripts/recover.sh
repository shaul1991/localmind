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

# ── 1/6 : 사전 점검 ─────────────────────────────────────────────
say "$(b '[1/6] 준비물 점검')"
command -v docker >/dev/null 2>&1 || { err "Docker가 없어요. https://www.docker.com/products/docker-desktop 에서 설치 후 다시 실행해 주세요."; exit 1; }
if ! docker info >/dev/null 2>&1; then
  err "Docker가 아직 실행 중이 아니에요. Docker Desktop 을 켠 뒤 다시 '$(b 'make recover')' 를 실행해 주세요."
  exit 1
fi
ok "Docker 실행 중"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  warn ".env(설정 파일)가 없어 예시에서 새로 만들어요."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  ok ".env 생성됨 — 기본값으로도 복구는 진행돼요. (claude 연동 등은 나중에 'make secrets'로 점검)"
else
  ok ".env 있음"
fi

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

# ── 4/6 : 스택 기동 + 헬스 대기 ─────────────────────────────────
say "$(b '[4/6] localmind 켜기 (메모리·AI 엔진)')"
say "  → 시작하는 중... (처음엔 모델 내려받기로 몇 분 걸려요. 기다려 주세요.)"
DC up -d --build >/dev/null 2>&1 || { err "스택 기동 실패 — 'make logs' 로 원인을 확인해 주세요."; exit 1; }
ready=0
for i in $(seq 1 120); do
  m="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8767/docs 2>/dev/null || echo 000)"
  g="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health/liveliness 2>/dev/null || echo 000)"
  if [ "$m" = "200" ] && [ "$g" = "200" ]; then ready=1; break; fi
  printf '\r  준비 중... %s/120 (메모리=%s AI엔진=%s)   ' "$i" "$m" "$g"
  sleep 5
done
printf '\r%*s\r' 60 ''  # 진행줄 지우기
if [ "$ready" != "1" ]; then
  err "엔진이 제때 안 떴어요. 'make logs' 로 확인 후, 떠 있으면 '$(b 'make restore')' 로 데이터만 복원하세요."
  exit 1
fi
ok "localmind 엔진 준비 완료 (메모리 :8767 · AI :4000)"

# ── 5/6 : 메모리 복원 ───────────────────────────────────────────
say "$(b '[5/6] 메모리 되살리기')"
if [ -f "$BACKUP_DIR/memory.md" ]; then
  ( cd "$PROJECT_DIR" && npm run --silent memory:import -- "$BACKUP_DIR/memory.md" ) && ok "메모리 복원 완료(이미 있는 건 건너뜀)" \
    || warn "메모리 복원 중 문제 — 나중에 '$(b 'make memory-import FILE='"$BACKUP_DIR"'/memory.md')' 로 다시 시도하세요."
else
  ok "백업에 memory.md 가 없어요 — 메모리 복원은 건너뜁니다(노트는 복원됨)."
fi

# ── 6/6 : 노트 재인덱싱 ─────────────────────────────────────────
say "$(b '[6/6] 노트 검색 색인 만들기')"
if ( cd "$PROJECT_DIR" && NOTES_DIR="${NOTES_DIR:-$BACKUP_DIR}" npm run --silent reindex >/dev/null 2>&1 ); then
  ok "노트 색인 완료 — 첫 검색부터 빨라요."
else
  warn "색인을 건너뛰었어요(안 해도 첫 검색 때 자동으로 만들어져요). 원하면 나중에 '$(b 'make reindex')'."
fi

say ""
say "$(b '🎉 복구 완료!') 두뇌가 이 컴퓨터로 돌아왔어요."
say "  • 상태 확인     : $(b 'make health')"
say "  • Claude 연동   : $(b 'make mcp-install')   (Claude Code에서 localmind 도구 사용)"
say "  • 앞으로 백업   : $(b 'make backup')"
say ""
