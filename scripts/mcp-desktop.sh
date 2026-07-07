#!/usr/bin/env bash
# localmind를 Claude Desktop 설정(claude_desktop_config.json)에 자동 연결한다.
# - 기존 mcpServers는 보존하며 localmind 항목만 병합(멱등).
# - 쓰기 전 기존 설정을 백업하고, 손상된 JSON이면 덮어쓰지 않고 중단한다.
# - 미리보기: DRY_RUN=1 make mcp-desktop
# 사용: make mcp-desktop   (노트 폴더: NOTES_DIR=/내/노트경로)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
[ -f "$PROJECT_DIR/scripts/lib/read-env.sh" ] && . "$PROJECT_DIR/scripts/lib/read-env.sh"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# ── 값 해석 (make mcp-config와 동일 규칙) ──
USER_ID="$(read_env_val OPENMEMORY_USER "$ENV_FILE" 2>/dev/null || true)"; USER_ID="${USER_ID:-localmind}"
MASTER_KEY="$(read_env_val LITELLM_MASTER_KEY "$ENV_FILE" 2>/dev/null || true)"
NOTES_DIR="${NOTES_DIR:-}"
[ -z "$NOTES_DIR" ] && NOTES_DIR="$(read_env_val NOTES_DIR "$ENV_FILE" 2>/dev/null || true)"
NOTES_DIR="${NOTES_DIR:-$HOME/.localmind}"
MCP_JS="$PROJECT_DIR/dist/mcp.js"

say ""
say "$(b 'localmind → Claude Desktop 연결')"

# ── 빌드 확인 (로컬 MCP는 dist가 필요) ──
if [ ! -f "$MCP_JS" ]; then
  warn "빌드가 필요해요(dist/mcp.js 없음). 먼저 실행하세요: $(b 'make build')"
  exit 1
fi
ok "빌드됨 (dist/mcp.js)"

# ── 설정 파일 위치 (테스트는 LOCALMIND_DESKTOP_CONFIG로 주입) ──
if [ -n "${LOCALMIND_DESKTOP_CONFIG:-}" ]; then
  CONFIG="$LOCALMIND_DESKTOP_CONFIG"; mkdir -p "$(dirname "$CONFIG")"
else
  OS="$(uname -s 2>/dev/null || echo unknown)"
  case "$OS" in
    Darwin) CDIR="$HOME/Library/Application Support/Claude" ;;
    Linux)  CDIR="${XDG_CONFIG_HOME:-$HOME/.config}/Claude" ;;
    *)      CDIR="${APPDATA:-$HOME/AppData/Roaming}/Claude" ;; # Windows(git-bash 등)
  esac
  CONFIG="$CDIR/claude_desktop_config.json"
  if [ ! -d "$CDIR" ]; then
    warn "Claude Desktop 설정 폴더가 없어요: $CDIR"
    say "  Claude Desktop을 설치·한 번 실행한 뒤 다시 시도하세요."
    say "  (수동 설정을 원하면 $(b 'make mcp-config') 출력을 붙여넣기 하세요.)"
    exit 1
  fi
fi
ok "설정 파일 : $(b "$CONFIG")"
ok "노트 폴더 : $(b "$NOTES_DIR")  · 사용자: $(b "$USER_ID")"

# ── 미리보기 ──
if [ -n "${DRY_RUN:-}" ]; then
  say ""
  say "$(b '[미리보기]') 아래를 mcpServers.localmind 로 병합합니다(기존 서버는 보존):"
  printf '  {\n    "command": "node",\n    "args": ["%s"],\n    "env": { "NOTES_DIR": "%s", "OPENMEMORY_USER": "%s", "LITELLM_MASTER_KEY": "(설정값)" }\n  }\n' \
    "$MCP_JS" "$NOTES_DIR" "$USER_ID"
  say "  실제 적용: $(b 'make mcp-desktop')"
  exit 0
fi

# ── 백업 후 병합 (node — JSON 안전 병합) ──
if [ -f "$CONFIG" ]; then
  BAK="$CONFIG.localmind-bak-$(date +%Y%m%d%H%M%S)"
  cp "$CONFIG" "$BAK" && ok "기존 설정 백업: $(b "$(basename "$BAK")")"
fi

# node 실패 시 $?를 정확히 캡처하려면 `if ! cmd`(부정은 $?를 0으로 만듦) 대신 명시 캡처.
set +e
CONFIG="$CONFIG" MCP_JS="$MCP_JS" LM_NOTES="$NOTES_DIR" LM_USER="$USER_ID" LM_KEY="$MASTER_KEY" node -e '
const fs = require("fs"), path = require("path"), p = process.env.CONFIG;
let raw = ""; try { raw = fs.readFileSync(p, "utf8"); } catch (e) {}
let cfg = {};
if (raw.trim()) {
  try { cfg = JSON.parse(raw); } catch (e) { console.error("PARSE_FAIL"); process.exit(3); }
}
if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) { console.error("PARSE_FAIL"); process.exit(3); }
var ms = cfg.mcpServers;
if (typeof ms !== "object" || ms === null || Array.isArray(ms)) cfg.mcpServers = {};
cfg.mcpServers.localmind = {
  command: "node",
  args: [process.env.MCP_JS],
  env: { NOTES_DIR: process.env.LM_NOTES, OPENMEMORY_USER: process.env.LM_USER, LITELLM_MASTER_KEY: process.env.LM_KEY },
};
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
'
rc=$?
set -e
if [ "$rc" != "0" ]; then
  if [ "$rc" = "3" ]; then
    err "기존 claude_desktop_config.json이 올바른 JSON이 아니에요 — 덮어쓰지 않았어요."
    say "  직접 고치거나, $(b 'make mcp-config') 출력을 수동으로 병합하세요.(백업은 그대로 있어요)"
  else
    err "설정 쓰기에 실패했어요(node 오류 코드 $rc)."
  fi
  exit 1
fi

ok "localmind 항목을 Claude Desktop 설정에 병합했어요(기존 서버 보존)."
say ""
say "$(b '🎉 완료!') 마지막 한 단계:"
say "  👉 $(b 'Claude Desktop을 완전히 종료했다가 다시 실행')하세요(설정 재로딩)."
say "  그다음 대화창에서 \"내 노트 목록 보여줘\"로 localmind 도구를 확인할 수 있어요."
say "  해제하려면 config의 mcpServers.localmind 항목을 지우면 됩니다."
