#!/usr/bin/env bash
# localmind ↔ Claude Code 연결 — MCP 등록을 안내하는 비개발자용 단계별 가이드.
# 호출: make mcp-install   (환경변수 NOTES_DIR 로 노트 폴더 지정 가능)
# 흐름: 준비물 점검(claude CLI·빌드) → 설정 확인 → 등록 → 재시작 안내.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

# NOTES_DIR 정본 해석(specs/019 FR-6): 환경변수 → .env → 기본(~/.localmind).
# 등록 성공 후 같은 값을 .env에 기록해 셸 실행(reindex·backup 등)과 발산하지 않게 한다.
# 테스트는 LOCALMIND_ENV_FILE/EXAMPLE로 격리한다.
ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
ENV_EXAMPLE="${LOCALMIND_ENV_EXAMPLE:-$PROJECT_DIR/.env.example}"
NOTES_DIR="$(resolve_notes_dir "$ENV_FILE")"
NOTES_DIR="${NOTES_DIR:-$HOME/.localmind}"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

confirm() {  # 예/아니오. 비대화면 자동 "예".
  local prompt="$1" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt [Y/n] " ans || ans=""
    [[ "$ans" =~ ^[Nn] ]] && return 1 || return 0
  else
    say "  $prompt → 자동 진행(예)"; return 0
  fi
}

say ""
say "$(b 'Claude Code 연결')을 시작합니다 — Claude Code에서 localmind 도구(기억·노트)를 쓸 수 있게 등록해요."
say "총 3단계입니다."
say ""

# ── 1/3 : 준비물 점검 ───────────────────────────────────────────
say "$(b '[1/3] 준비물 점검')"
if ! command -v claude >/dev/null 2>&1; then
  err "Claude Code(claude 명령)가 없어요. 먼저 설치·로그인해 주세요 → https://claude.com/claude-code"
  exit 1
fi
ok "claude CLI 있음"
if [ ! -f "$PROJECT_DIR/dist/mcp.js" ]; then
  warn "아직 빌드되지 않았어요(dist/mcp.js 없음)."
  if confirm "지금 빌드할까요? (make build)"; then
    ( cd "$PROJECT_DIR" && npm install --no-fund --no-audit >/dev/null 2>&1 && npm run --silent build >/dev/null 2>&1 ) \
      && ok "빌드 완료" || { err "빌드 실패 — 'cd $PROJECT_DIR && npm run build'로 메시지를 확인해 주세요."; exit 1; }
  else
    say "  '$(b 'make build')' 후 다시 '$(b 'make mcp-install')'을 실행해 주세요."
    exit 1
  fi
else
  ok "빌드돼 있음 (dist/mcp.js)"
fi

# ── 2/3 : 설정 확인 ─────────────────────────────────────────────
say "$(b '[2/3] 설정 확인')"
USER_ID="$(read_env_val OPENMEMORY_USER "$ENV_FILE")"
USER_ID="${USER_ID:-localmind}"
# 게이트웨이 키 — MCP 프로세스는 .env를 읽지 않으므로 등록 env로 전달해야 임베딩(:4000)이
# 인증된다(specs/014 FR-7 — 키가 랜덤화되면서 하드코딩 폴백이 사라짐).
MASTER_KEY="$(read_env_val LITELLM_MASTER_KEY "$ENV_FILE")"
[ -z "$MASTER_KEY" ] && warn "게이트웨이 키가 .env에 없어요 — 'make init-env' 후 다시 실행하면 노트 검색이 인증돼요."
ok "사용자 이름: $(b "$USER_ID")"
ok "노트 폴더  : $(b "$NOTES_DIR")"
say "  (노트 폴더를 바꾸려면: $(b 'make mcp-install NOTES_DIR=/내/노트경로'), 여러 개는 쉼표로)"

# ── 3/3 : 등록 ──────────────────────────────────────────────────
say "$(b '[3/3] Claude Code에 등록')"
# 등록 원자성(specs/015 FR-5): 기존 등록을 지우기 전에 같은 인자 형태의 add가 실제로
# 동작하는지 임시 이름으로 먼저 확인한다 — add가 실패하는 환경(CLI 버전 차 등)에서
# 잘 되던 기존 등록까지 잃지 않기 위해서다. probe는 중단(Ctrl+C)에도 남지 않게 trap 정리.
PROBE="localmind-probe-$$"
cleanup_probe() { claude mcp remove "$PROBE" -s user >/dev/null 2>&1 || true; }
trap cleanup_probe EXIT
add_localmind() {
  claude mcp add "$1" -s user \
    -e OPENMEMORY_USER="$USER_ID" -e NOTES_DIR="$NOTES_DIR" \
    ${MASTER_KEY:+-e LITELLM_MASTER_KEY="$MASTER_KEY"} \
    -- node "$PROJECT_DIR/dist/mcp.js" >/dev/null 2>&1
}
if ! add_localmind "$PROBE"; then
  err "등록이 동작하지 않아요(사전 확인 실패) — $(b '기존 등록은 그대로') 두었어요."
  say "  'claude mcp list'로 상태를 확인하고, claude CLI 업데이트 후 다시 시도해 주세요."
  exit 1
fi
cleanup_probe
claude mcp remove localmind -s user >/dev/null 2>&1 || true   # 기존 등록 있으면 교체
# probe가 통과했으므로 여기 실패는 일시 오류가 대부분 — 한 번 재시도로 흡수한다.
if add_localmind localmind || { sleep 1; add_localmind localmind; }; then
  ok "등록 완료 (user 스코프)"
  # 정본 기록(specs/019 FR-6) — 셸 실행(reindex·backup 등)이 같은 폴더 목록을 보게 한다.
  if record_notes_dir "$NOTES_DIR" "$ENV_FILE" "$ENV_EXAMPLE"; then
    ok "노트 폴더를 .env(NOTES_DIR)에 기록 — 셸 명령(make reindex 등)도 같은 목록을 봐요"
  else
    warn ".env에 NOTES_DIR 기록 실패 — 'make reindex'가 기본 폴더만 볼 수 있어요. .env를 직접 확인해 주세요."
  fi
else
  err "등록 실패 — 기존 등록이 $(b '해제된 상태')예요. 'make mcp-install'을 다시 실행해 주세요."
  say "  ('claude mcp list'로 상태 확인 가능. 사전 확인은 통과했으므로 재시도로 대부분 해결돼요.)"
  exit 1
fi

say ""
say "$(b '🎉 연결 완료!') 마지막으로 한 가지만 하면 끝이에요."
say "  • $(b 'Claude Code를 완전히 종료했다 다시 켜')면 localmind 도구가 나타나요."
say "  • 확인: 새 대화에서 $(b '“localmind whoami 실행해줘”') 라고 해보세요."
say "  • 해제하려면: $(b 'make mcp-uninstall')"
say ""
