#!/usr/bin/env bash
# mcp-desktop.sh — Claude Desktop 설정 병합 안전성 테스트.
# 실제 Claude Desktop 설정을 건드리지 않도록 LOCALMIND_DESKTOP_CONFIG로 임시 파일에 주입한다(CI 실행).
# 점검: 새 config 병합 · 기존 서버 보존 · 백업 · 멱등 · 손상 JSON 중단(원본 보존).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/mcp-desktop.sh"

pass=0; fail=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no() { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }

# dist/mcp.js가 있어야 빌드 체크를 통과한다(CI는 build를 셸 테스트보다 먼저 수행).
if [ ! -f "$ROOT/dist/mcp.js" ]; then
  echo "  ℹ dist/mcp.js 없음 — 'make build' 후 실행하세요. 스킵."; exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

run()  { OUT="$(LOCALMIND_DESKTOP_CONFIG="$1" bash "$SCRIPT" </dev/null 2>&1)"; RC=$?; }
has()  { node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit((()=>('"$2"'))()?0:1)' "$1"; }

# 1) 새 config(파일 없음)에 병합 → localmind 추가, args가 dist/mcp.js
C="$TMP/new.json"; run "$C"
{ [ "$RC" = 0 ] && has "$C" 'c.mcpServers.localmind'; } && ok "새 config에 localmind 추가" || no "새 config 병합 실패(rc=$RC)"
has "$C" 'c.mcpServers.localmind.args[0].endsWith("/dist/mcp.js")' && ok "args가 dist/mcp.js를 가리킴" || no "args 경로 오류"

# 2) 기존 서버가 있는 config → 보존하며 병합 + 백업 생성
C="$TMP/exist.json"; printf '{"mcpServers":{"other":{"command":"x","args":[]}}}' > "$C"; run "$C"
has "$C" 'c.mcpServers.other && c.mcpServers.localmind' && ok "기존 서버(other) 보존 + localmind 추가" || no "기존 서버 보존 실패"
ls "$C".localmind-bak-* >/dev/null 2>&1 && ok "기존 설정 백업(.localmind-bak-*) 생성" || no "백업 없음"

# 3) 멱등 — 재실행해도 정상 + localmind 항목은 하나
run "$C"
{ [ "$RC" = 0 ] && has "$C" 'Object.keys(c.mcpServers).filter(function(k){return k==="localmind"}).length===1'; } \
  && ok "멱등(재실행해도 localmind 1개)" || no "멱등 실패(rc=$RC)"

# 4) 손상된 JSON → 덮어쓰지 않고 중단(exit≠0), 원본 보존, 안내 메시지
C="$TMP/broken.json"; printf '{ not json' > "$C"; cp "$C" "$C.orig"; run "$C"
[ "$RC" != 0 ] && ok "손상 JSON은 비정상 종료(exit≠0)" || no "손상 JSON인데 성공(위험)"
diff -q "$C" "$C.orig" >/dev/null 2>&1 && ok "손상 config 원본 그대로(덮어쓰지 않음)" || no "손상 config를 덮어씀(위험)"
printf '%s' "$OUT" | grep -q "올바른 JSON이 아니에요" && ok "JSON 오류를 사람이 이해할 메시지로 안내" || no "JSON 오류 메시지 없음"

# 5) DRY_RUN은 파일을 만들지 않음
C="$TMP/dry.json"; OUT="$(LOCALMIND_DESKTOP_CONFIG="$C" DRY_RUN=1 bash "$SCRIPT" </dev/null 2>&1)"
[ ! -f "$C" ] && ok "DRY_RUN은 config를 쓰지 않음(미리보기만)" || no "DRY_RUN인데 파일 생성됨"

printf '\n  통과 %d · 실패 %d\n' "$pass" "$fail"
[ "$fail" = 0 ]
