#!/usr/bin/env bash
# localmind ↔ Claude Code 연결 — MCP 등록을 안내하는 비개발자용 단계별 가이드.
# 호출: make mcp-install   (환경변수 NOTES_DIR 로 노트 폴더 지정 가능)
# 흐름: 준비물 점검(claude CLI·빌드) → 설정 확인 → 등록 → 재시작 안내.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
USER_ID="$(grep -E "^OPENMEMORY_USER=" "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"  # .env 없음/매치 없음에 set -e 중단 방지 → 폴백 도달
USER_ID="${USER_ID:-localmind}"
ok "사용자 이름: $(b "$USER_ID")"
ok "노트 폴더  : $(b "$NOTES_DIR")"
say "  (노트 폴더를 바꾸려면: $(b 'make mcp-install NOTES_DIR=/내/노트경로'), 여러 개는 쉼표로)"

# ── 3/3 : 등록 ──────────────────────────────────────────────────
say "$(b '[3/3] Claude Code에 등록')"
claude mcp remove localmind -s user >/dev/null 2>&1 || true   # 기존 등록 있으면 덮어쓰기
if claude mcp add localmind -s user \
     -e OPENMEMORY_USER="$USER_ID" -e NOTES_DIR="$NOTES_DIR" \
     -- node "$PROJECT_DIR/dist/mcp.js" >/dev/null 2>&1; then
  ok "등록 완료 (user 스코프)"
else
  err "등록 실패 — 'claude mcp list'로 상태를 확인해 주세요."
  exit 1
fi

say ""
say "$(b '🎉 연결 완료!') 마지막으로 한 가지만 하면 끝이에요."
say "  • $(b 'Claude Code를 완전히 종료했다 다시 켜')면 localmind 도구가 나타나요."
say "  • 확인: 새 대화에서 $(b '“localmind whoami 실행해줘”') 라고 해보세요."
say "  • 해제하려면: $(b 'make mcp-uninstall')"
say ""
