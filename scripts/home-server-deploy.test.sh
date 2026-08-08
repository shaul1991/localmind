#!/usr/bin/env bash
# 홈서버 안전 배포 회귀 테스트 — 실제 systemd/네트워크 없이 release 전환·CI 게이트·롤백 검증.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/home-server-deploy.sh"
pass=0; fail=0
assert() { if eval "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }

TMP="$(mktemp -d)"; trap '[ -n "${KEEP_TMP:-}" ] || rm -rf "$TMP"' EXIT
[ -z "${KEEP_TMP:-}" ] || printf 'TMP=%s\n' "$TMP"
BIN="$TMP/bin"; mkdir -p "$BIN"

cat > "$BIN/flock" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$BIN/gh" <<'SH'
#!/bin/sh
printf '%s\n' "${GH_RESULT:-success}"
SH
cat > "$BIN/npm" <<'SH'
#!/bin/sh
printf 'npm %s cwd=%s\n' "$*" "$PWD" >> "$EVENT_LOG"
case "$*" in
  *build*) mkdir -p dist; printf 'built\n' > dist/mcp.js ;;
esac
[ "${NPM_FAIL_MATCH:-}" = "" ] || case "$*" in *"$NPM_FAIL_MATCH"*) exit 1;; esac
SH
cat > "$BIN/chown" <<'SH'
#!/bin/sh
printf 'chown %s\n' "$*" >> "$EVENT_LOG"
exit 0
SH
cat > "$BIN/systemctl" <<'SH'
#!/bin/sh
printf 'systemctl %s current=%s\n' "$*" "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" >> "$EVENT_LOG"
if [ "${1:-}" = "is-active" ] && [ -n "${SYSTEMCTL_INACTIVE:-}" ]; then exit 3; fi
exit "${SYSTEMCTL_RC:-0}"
SH
cat > "$BIN/curl" <<'SH'
#!/bin/sh
printf 'curl health current=%s\n' "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" >> "$EVENT_LOG"
auth_ok=0
previous=''
for argument in "$@"; do
  if [ "$previous" = '-H' ] && [ "$argument" = 'Authorization: Bearer test-token' ]; then auth_ok=1; fi
  previous="$argument"
done
[ "$auth_ok" -eq 1 ] || exit 22
[ -z "${CURL_ALWAYS_FAIL:-}" ] || exit 22
if [ -n "${CURL_FAIL_ONCE_FILE:-}" ] && [ ! -e "$CURL_FAIL_ONCE_FILE" ]; then
  : > "$CURL_FAIL_ONCE_FILE"
  exit 22
fi
printf '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n'
SH
chmod +x "$BIN/flock" "$BIN/gh" "$BIN/npm" "$BIN/chown" "$BIN/systemctl" "$BIN/curl"

resolved_path() { python3 - "$1" <<'PY'
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
}
resolved_current() { resolved_path "$CURRENT_LINK"; }
git_id() { git -C "$1" config user.email test@example.com; git -C "$1" config user.name test; }

new_fixture() {
  local name="$1" base="$TMP/$1"
  SOURCE_REPO="$base/source"; RELEASE_ROOT="$base/releases"; CURRENT_LINK="$base/current"
  STATE_DIR="$base/state"; ENV_FILE="$base/localmind.env"; EVENT_LOG="$base/events.log"; OUT="$base/run.out"
  mkdir -p "$SOURCE_REPO" "$RELEASE_ROOT" "$STATE_DIR"; : > "$EVENT_LOG"
  printf 'MCP_AUTH_TOKEN=test-token\nMCP_HTTP_HOST=127.0.0.1\nMCP_HTTP_PORT=8789\nMCP_HTTP_PATH=/mcp\n' > "$ENV_FILE"
  git -C "$SOURCE_REPO" init -q -b main; git_id "$SOURCE_REPO"
  printf '{"scripts":{"test":"x","typecheck":"x","build":"x"}}\n' > "$SOURCE_REPO/package.json"
  printf '{}\n' > "$SOURCE_REPO/package-lock.json"
  mkdir -p "$SOURCE_REPO/scripts"; printf 'base\n' > "$SOURCE_REPO/README.md"
  git -C "$SOURCE_REPO" add -A; git -C "$SOURCE_REPO" commit -qm base
  OLD_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
  ORIGIN="$base/origin.git"; git clone -q --bare "$SOURCE_REPO" "$ORIGIN"
  git -C "$SOURCE_REPO" remote add origin "$ORIGIN"
  git -C "$SOURCE_REPO" fetch -q origin
  git -C "$SOURCE_REPO" branch --set-upstream-to=origin/main main >/dev/null
  OLD_RELEASE="$RELEASE_ROOT/$OLD_SHA"; git -C "$SOURCE_REPO" worktree add -q --detach "$(resolved_path "$OLD_RELEASE")" "$OLD_SHA"
  mkdir -p "$(resolved_path "$OLD_RELEASE")/dist"; printf 'old\n' > "$(resolved_path "$OLD_RELEASE")/dist/mcp.js"
  ln -s "$(resolved_path "$OLD_RELEASE")" "$CURRENT_LINK"
}

advance_origin() {
  local w="$TMP/advance-$RANDOM"
  git clone -q "$ORIGIN" "$w"; git_id "$w"
  printf 'next\n' >> "$w/README.md"; git -C "$w" add README.md; git -C "$w" commit -qm next; git -C "$w" push -q origin main
  NEW_SHA="$(git -C "$w" rev-parse HEAD)"
}

run_deploy() {
  (
    umask "${TEST_UMASK:-022}"
    env PATH="$BIN:$PATH" EVENT_LOG="$EVENT_LOG" CURRENT_LINK="$CURRENT_LINK" \
      SOURCE_REPO="$SOURCE_REPO" RELEASE_ROOT="$RELEASE_ROOT" STATE_DIR="$STATE_DIR" ENV_FILE="$ENV_FILE" \
      SERVICE_NAME=localmind-mcp.service GH_REPO=shaul1991/localmind GH_WORKFLOW=CI BUILD_USER="$(id -un)" \
      HEALTH_RETRIES=3 HEALTH_RETRY_DELAY=0 \
      "$@" bash "$SCRIPT" > "$OUT" 2>&1
  )
  RC=$?
}

printf '\n\033[1mAC-1 — CI green 새 main을 검증 후 원자 전환\033[0m\n'
new_fixture success; advance_origin; run_deploy
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "current가 새 SHA release" '[ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'
assert "last-good SHA 기록" '[ "$(cat "$STATE_DIR/last-good-sha")" = "$NEW_SHA" ]'
assert "ci→test→typecheck→build→restart→health 실행" 'grep -q "npm ci" "$EVENT_LOG" && grep -q "npm test" "$EVENT_LOG" && grep -q "npm run typecheck" "$EVENT_LOG" && grep -q "npm run build" "$EVENT_LOG" && grep -q "systemctl restart" "$EVENT_LOG" && grep -q "curl health" "$EVENT_LOG"'

printf '\n\033[1mAC-2 — CI 실패는 배포하지 않음\033[0m\n'
new_fixture ci-fail; advance_origin; run_deploy GH_RESULT=failure
assert "변경 없음으로 정상 보류" '[ "$RC" -eq 0 ]'
assert "current는 이전 release" '[ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
assert "npm·systemctl 미호출" '! grep -qE "npm|systemctl" "$EVENT_LOG"'

printf '\n\033[1mAC-3 — 새 release health 실패 시 이전 release 롤백\033[0m\n'
new_fixture rollback; advance_origin; run_deploy CURL_ALWAYS_FAIL=1
assert "배포 실패 exit 1" '[ "$RC" -eq 1 ]'
assert "current가 이전 release로 복귀" '[ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
assert "새 release와 롤백 release 각각 restart" '[ "$(grep -c "systemctl restart" "$EVENT_LOG")" -eq 2 ]'
assert "새 release와 롤백 health를 재시도" '[ "$(grep -c "curl health" "$EVENT_LOG")" -eq 6 ]'

printf '\n\033[1mAC-4 — 추적 파일 dirty면 중단\033[0m\n'
new_fixture dirty; advance_origin; printf 'dirty\n' >> "$SOURCE_REPO/README.md"; run_deploy
assert "dirty 중단 exit 1" '[ "$RC" -eq 1 ]'
assert "current 불변" '[ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
assert "npm·systemctl 미호출" '! grep -qE "npm|systemctl" "$EVENT_LOG"'

printf '\n\033[1mAC-5 — 이미 배포된 SHA는 멱등 no-op\033[0m\n'
new_fixture noop; run_deploy
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "npm·restart 미호출" '! grep -q "npm" "$EVENT_LOG" && ! grep -q "systemctl restart" "$EVENT_LOG"'

printf '\n\033[1mAC-6 — 환경 파일 값은 셸 코드로 실행하지 않음\033[0m\n'
new_fixture env-literal; advance_origin; MARKER="$TMP/env-command-executed"
printf 'MCP_AUTH_TOKEN=$(touch %s)\nMCP_HTTP_HOST=127.0.0.1\nMCP_HTTP_PORT=8789\nMCP_HTTP_PATH=/mcp\n' "$MARKER" > "$ENV_FILE"
run_deploy
assert "환경 값 command substitution 미실행" '[ ! -e "$MARKER" ]'

printf '\n\033[1mAC-7 — 최초 배포 health 실패는 self-link 없이 종료\033[0m\n'
new_fixture first-failure; rm "$CURRENT_LINK"; advance_origin
run_deploy CURL_ALWAYS_FAIL=1
assert "최초 배포 실패 exit 1" '[ "$RC" -eq 1 ]'
assert "current self-link를 남기지 않음" '[ ! -L "$CURRENT_LINK" ]'
assert "롤백 대상 없이 restart 1회" '[ "$(grep -c "systemctl restart" "$EVENT_LOG")" -eq 1 ]'

printf '\n\033[1mAC-8 — 기동 지연은 bounded health 재시도로 흡수\033[0m\n'
new_fixture readiness; advance_origin; FAIL_ONCE="$TMP/readiness-once"
run_deploy CURL_FAIL_ONCE_FILE="$FAIL_ONCE"
assert "두 번째 health에서 배포 성공" '[ "$RC" -eq 0 ] && [ "$(grep -c "curl health" "$EVENT_LOG")" -eq 2 ]'
assert "current가 새 release" '[ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'

printf '\n\033[1mAC-9 — restrictive umask에서도 런타임 artifact 읽기 가능\033[0m\n'
new_fixture permissions; advance_origin; TEST_UMASK=077 run_deploy; unset TEST_UMASK
NEW_RELEASE="$(resolved_path "$RELEASE_ROOT/$NEW_SHA")"
assert "배포 성공" '[ "$RC" -eq 0 ]'
assert "release 디렉터리에 other r-x" 'python3 -c '\''import os,sys; raise SystemExit(0 if os.stat(sys.argv[1]).st_mode & 7 == 5 else 1)'\'' "$NEW_RELEASE"'
assert "dist/mcp.js에 other read" 'python3 -c '\''import os,sys; raise SystemExit(0 if os.stat(sys.argv[1]).st_mode & 4 else 1)'\'' "$NEW_RELEASE/dist/mcp.js"'
assert "release 트리에 group/other 쓰기 권한 없음" 'python3 -c '\''import os,sys; raise SystemExit(0 if os.stat(sys.argv[1]).st_mode & 0o22 == 0 else 1)'\'' "$NEW_RELEASE"'
assert "artifact에 group/other 쓰기 권한 없음" 'python3 -c '\''import os,sys; raise SystemExit(0 if os.stat(sys.argv[1]).st_mode & 0o22 == 0 else 1)'\'' "$NEW_RELEASE/dist/mcp.js"'

printf '\n\033[1mAC-10 — systemd가 권한 전환·finalization capability를 유지\033[0m\n'
assert "CAP_SETUID·CAP_SETGID·CAP_DAC_OVERRIDE 포함" 'grep -q "CapabilityBoundingSet=.*CAP_SETUID.*CAP_SETGID.*CAP_DAC_OVERRIDE" "$ROOT/deploy/systemd/localmind-deploy.service"'

printf '\n\033[1mAC-11 — 최신 SHA라도 MCP가 중지됐으면 복구\033[0m\n'
new_fixture stopped-noop; run_deploy SYSTEMCTL_INACTIVE=1
assert "재시작 후 정상 종료" '[ "$RC" -eq 0 ] && [ "$(grep -c "systemctl restart" "$EVENT_LOG")" -eq 1 ]'
assert "불필요한 npm 빌드 없음" '! grep -q "npm" "$EVENT_LOG"'

printf '\n\033[1mAC-12 — 검증 완료 release는 builder에게서 회수\033[0m\n'
new_fixture immutable-release; advance_origin; run_deploy TEST_UMASK=077
assert "활성화 전 root:root 소유권 회수" 'grep -q "chown -R root:root .*releases/" "$EVENT_LOG"'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
