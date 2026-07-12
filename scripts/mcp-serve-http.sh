#!/usr/bin/env bash
# specs/045 — 원격(HTTP) MCP 서버 기동.
#
# 항상 켜진 홈서버에서 실행해 단일 두뇌를 HTTP로 서비스한다. 맥 등 다른 기기의 Claude Code가
# Tailscale 사설 URL로 붙는다(docs/home-server.md). 인증 토큰이 없으면 생성해 .env에 저장하고
# 연결법을 안내한다. 기본 바인딩은 비공개(127.0.0.1) — 네트워크 노출은 명시적 opt-in만.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "❌ .env가 없어요 — 먼저 'make setup'으로 설치를 마치세요."; exit 1; }

# 토큰이 없으면 생성해 .env에 추가(두뇌 접근권이므로 안전 보관 안내).
if ! grep -qE '^MCP_AUTH_TOKEN=.+' "$ENV_FILE"; then
  TOKEN="$(openssl rand -hex 32 2>/dev/null || (head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'))"
  printf '\n# specs/045 — 원격 MCP HTTP 인증 토큰(두뇌 접근권 — 유출 주의)\nMCP_AUTH_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
  echo "🔑 인증 토큰을 생성해 .env(MCP_AUTH_TOKEN)에 저장했어요 — 두뇌 접근권이니 안전히 보관하세요."
fi

# .env 전체를 프로세스 env로 로드(brain이 NOTES_DIR·LITELLM_MASTER_KEY 등을 읽는다).
set -a; . "$ENV_FILE"; set +a

HOST="${MCP_HTTP_HOST:-127.0.0.1}"
PORT="${MCP_HTTP_PORT:-8789}"
EP_PATH="${MCP_HTTP_PATH:-/mcp}"

echo "▶ localmind MCP(HTTP)를 http://${HOST}:${PORT}${EP_PATH} 에 띄웁니다. (Ctrl-C로 종료)"
echo "  · 기본 바인딩은 127.0.0.1(비공개). 다른 기기에서 붙이려면 Tailscale 사설망을 권장 — docs/home-server.md."
echo "  · 맥 Claude Code 연결 예시(홈서버 밖에서):"
echo "      claude mcp add --transport http localmind http://<홈서버-Tailscale-IP-또는-이름>:${PORT}${EP_PATH} \\"
echo "        --header \"Authorization: Bearer \$MCP_AUTH_TOKEN\""
echo

exec env MCP_TRANSPORT=http npx tsx src/mcp.ts
