#!/usr/bin/env bash
# specs/015 FR-5 — mcp-install.sh 등록 원자성 테스트.
# 가짜 claude CLI(호출 기록 + 시나리오별 실패 주입)로 실제 등록을 건드리지 않는다(CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/mcp-install.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

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

run_install() { # run_install <ADD_FAIL> <로그파일> [NOTES_DIR값("-"이면 미설정)] [env파일]
  : > "$2"
  local nd="${3:-$TMP/notes}" envf="${4:-$TMP/test.env}"
  if [ "$nd" = "-" ]; then
    OUT="$(PATH="$TMP/bin:$PATH" CLAUDE_CALL_LOG="$2" ADD_FAIL="$1" \
          LOCALMIND_ENV_FILE="$envf" LOCALMIND_ENV_EXAMPLE="$TMP/example.env" \
          env -u NOTES_DIR bash "$SCRIPT" </dev/null 2>&1)"
  else
    OUT="$(PATH="$TMP/bin:$PATH" CLAUDE_CALL_LOG="$2" ADD_FAIL="$1" NOTES_DIR="$nd" \
          LOCALMIND_ENV_FILE="$envf" LOCALMIND_ENV_EXAMPLE="$TMP/example.env" \
          bash "$SCRIPT" </dev/null 2>&1)"
  fi
  RC=$?
}
printf '# example\n' > "$TMP/example.env"

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

# ── 019 AC-23: 등록 성공 시 NOTES_DIR가 .env(정본)에 기록된다 ────────────────
LOG4="$TMP/calls4.log"; ENV4="$TMP/ac23.env"
rm -f "$ENV4"
run_install 0 "$LOG4" "$TMP/n1,$TMP/n2,$TMP/n3" "$ENV4"
assert "AC-23: .env가 example에서 생성됨" 'grep -q "^# example" "$ENV4"'
# GNU(-c) 먼저 — BSD식 'stat -f %Lp'는 GNU에서 파일시스템 정보를 stdout에 찍으며 실패해
# 폴백 출력이 그 뒤에 붙는다(CI ubuntu 실측). BSD에선 -c가 stderr로만 실패해 폴백이 깨끗하다.
perm="$(stat -c %a "$ENV4" 2>/dev/null || stat -f %Lp "$ENV4" 2>/dev/null)"
assert "AC-23: 생성된 .env 권한 600" '[ "$perm" = "600" ]'
assert "AC-23: NOTES_DIR가 .env에 기록됨" 'grep -q "^NOTES_DIR=$TMP/n1,$TMP/n2,$TMP/n3$" "$ENV4"'
assert "AC-23: 등록 인자(-e NOTES_DIR)와 .env 기록이 일치" 'grep -q -- "-e NOTES_DIR=$TMP/n1,$TMP/n2,$TMP/n3" "$LOG4"'

# ── 019 FR-6: 환경변수 없으면 .env의 NOTES_DIR로 등록(정본 해석) ─────────────
LOG5="$TMP/calls5.log"; ENV5="$TMP/resolve.env"
printf 'NOTES_DIR="%s/from-env-file"\n' "$TMP" > "$ENV5"
run_install 0 "$LOG5" "-" "$ENV5"
assert "FR-6: 환경변수 부재 시 .env 값으로 등록" 'grep -q -- "-e NOTES_DIR=$TMP/from-env-file" "$LOG5"'

# ── 019 FR-6: 등록 실패 시 .env를 기록하지 않는다 ───────────────────────────
LOG6="$TMP/calls6.log"; ENV6="$TMP/nofail.env"
rm -f "$ENV6"
run_install 1 "$LOG6" "$TMP/notes" "$ENV6"
assert "FR-6: 등록 실패 시 NOTES_DIR 미기록" '! grep -q "^NOTES_DIR=" "$ENV6" 2>/dev/null'

echo ""
echo "015 mcp-install 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
