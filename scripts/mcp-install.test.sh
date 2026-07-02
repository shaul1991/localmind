#!/usr/bin/env bash
# specs/015 FR-5 — mcp-install.sh 등록 원자성 테스트.
# 가짜 claude CLI(호출 기록 + 시나리오별 실패 주입)로 실제 등록을 건드리지 않는다(CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/mcp-install.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 가짜 claude: 모든 호출을 로그에 남기고, ADD_FAIL=1이면 'mcp add' 전부,
# ADD_FAIL=real이면 실제 이름(localmind)의 add만 실패시킨다(probe는 통과 — 결함3 회귀).
mkdir -p "$TMP/bin"
cat > "$TMP/bin/claude" <<'S'
#!/bin/sh
echo "$@" >> "$CLAUDE_CALL_LOG"
if [ "$1" = "mcp" ] && [ "$2" = "add" ]; then
  [ "${ADD_FAIL:-}" = "1" ] && exit 1
  [ "${ADD_FAIL:-}" = "real" ] && [ "$3" = "localmind" ] && exit 1
fi
exit 0
S
chmod +x "$TMP/bin/claude"

run_install() { # run_install <ADD_FAIL> <로그파일>
  : > "$2"
  OUT="$(PATH="$TMP/bin:$PATH" CLAUDE_CALL_LOG="$2" ADD_FAIL="$1" NOTES_DIR="$TMP/notes" bash "$SCRIPT" </dev/null 2>&1)"
  RC=$?
}

# 전제: dist/mcp.js가 있어야 빌드 단계를 건너뛴다(리포에서 빌드돼 있음).
[ -f "$ROOT/dist/mcp.js" ] || { echo "dist/mcp.js 없음 — 'npm run build' 후 실행"; exit 1; }

# ── AC-9: add가 실패하는 환경에서 기존 등록이 소실되지 않는다 ────────────────
LOG1="$TMP/calls1.log"
run_install 1 "$LOG1"
assert "AC-9: add 실패 시 비0 종료" '[ "$RC" -ne 0 ]'
assert "AC-9: 기존 등록(remove localmind)을 건드리지 않았다" '! grep -qE "mcp remove localmind -s" "$LOG1"'
assert "AC-9: 실패가 '기존 등록은 그대로'로 안내된다" 'printf %s "$OUT" | grep -q "기존 등록은 그대로"'

# ── 정상 경로: probe 검증 → 교체 → 최종 등록 ────────────────────────────────
LOG2="$TMP/calls2.log"
run_install 0 "$LOG2"
assert "정상: 0 종료" '[ "$RC" -eq 0 ]'
assert "정상: probe 등록·정리가 선행된다" 'grep -qE "mcp add localmind-probe" "$LOG2" && grep -qE "mcp remove localmind-probe" "$LOG2"'
assert "정상: 최종 localmind 등록이 수행된다" 'grep -qE "mcp add localmind -s user" "$LOG2"'
assert "정상: 교체(remove)가 최종 add보다 먼저다" \
  '[ "$(grep -nE "mcp remove localmind -s" "$LOG2" | head -1 | cut -d: -f1)" -lt "$(grep -nE "mcp add localmind -s" "$LOG2" | head -1 | cut -d: -f1)" ]'

# ── 결함3 회귀: probe는 통과하고 실제 add만 실패하는 조건 ────────────────────
LOG3="$TMP/calls3.log"
run_install real "$LOG3"
assert "결함3: 비0 종료" '[ "$RC" -ne 0 ]'
assert "결함3: 실제 add를 재시도한다(일시 오류 흡수)" '[ "$(grep -cE "mcp add localmind -s user" "$LOG3")" -ge 2 ]'
assert "결함3: 등록이 제거된 상태를 정직하게 안내한다" 'printf %s "$OUT" | grep -q "해제된 상태"'

echo ""
echo "015 mcp-install 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
