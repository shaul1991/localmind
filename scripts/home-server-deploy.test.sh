#!/usr/bin/env bash
# 홈서버 안전 배포 회귀 테스트 — 실제 systemd/네트워크 없이 release 전환·CI 게이트·롤백 검증.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/home-server-deploy.sh"
pass=0; fail=0; advance_count=0
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
if [ "${1:-}" = "auth" ] && [ "${2:-}" = "status" ]; then
  [ -z "${GH_AUTH_FAIL:-}" ] || exit 4
  if [ -n "${GH_STALE_ACCOUNT:-}" ]; then
    active=0
    for argument in "$@"; do [ "$argument" = "--active" ] && active=1; done
    [ "$active" -eq 1 ] || exit 1
  fi
  exit 0
fi
printf '%s\n' "${GH_RESULT:-success}"
SH
cat > "$BIN/npm" <<'SH'
#!/bin/sh
base="$(dirname "$(dirname "$PWD")")"
npm_event_log="$base/events.log"
if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
  printf 'npm credential leak cwd=%s\n' "$PWD" >> "$npm_event_log"
  exit 42
fi
printf 'npm %s cwd=%s\n' "$*" "$PWD" >> "$npm_event_log"
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
url_ok=0
output_file=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '-H' ] && [ "$argument" = 'Authorization: Bearer test-token' ]; then auth_ok=1; fi
  if [ "$previous" = '--output' ] || [ "$previous" = '-o' ]; then output_file="$argument"; fi
  if [ -n "${EXPECT_CURL_URL:-}" ] && [ "$argument" = "$EXPECT_CURL_URL" ]; then url_ok=1; fi
  case "$argument" in http://*) printf 'curl url=%s\n' "$argument" >> "$EVENT_LOG";; esac
  previous="$argument"
done
[ "$auth_ok" -eq 1 ] || exit 22
[ -z "${EXPECT_CURL_URL:-}" ] || [ "$url_ok" -eq 1 ] || exit 22
[ -z "${CURL_ALWAYS_FAIL:-}" ] || exit 22
if [ -n "${CURL_FAIL_ONCE_FILE:-}" ] && [ ! -e "$CURL_FAIL_ONCE_FILE" ]; then
  : > "$CURL_FAIL_ONCE_FILE"
  exit 22
fi
emit_response() {
  if [ -n "${HEALTH_RESPONSE+x}" ]; then
    printf '%s\n' "$HEALTH_RESPONSE"
  else
    printf '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n'
  fi
}
if [ -n "$output_file" ]; then emit_response > "$output_file"; else emit_response; fi
SH
chmod +x "$BIN/flock" "$BIN/gh" "$BIN/npm" "$BIN/chown" "$BIN/systemctl" "$BIN/curl"

resolved_path() { python3 - "$1" <<'PY'
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
}
resolved_current() { resolved_path "$CURRENT_LINK"; }
git_id() { git -C "$1" config user.email test@example.com; git -C "$1" config user.name test; }
set_env_value() {
  python3 - "$ENV_FILE" "$1" "$2" <<'PY'
from pathlib import Path
import sys
path, key, value = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text().splitlines()
path.write_text("\n".join(f"{key}={value}" if line.startswith(f"{key}=") else line for line in lines) + "\n")
PY
}

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
  : > "$(resolved_path "$OLD_RELEASE")/.localmind-deploy-ready"
  printf '%s\n' "$OLD_SHA" > "$STATE_DIR/last-good-sha"
  ln -s "$(resolved_path "$OLD_RELEASE")" "$CURRENT_LINK"
}

advance_origin() {
  advance_count=$((advance_count + 1))
  local w="$TMP/advance-$advance_count"
  git clone -q "$ORIGIN" "$w"; git_id "$w"
  printf 'next\n' >> "$w/README.md"; git -C "$w" add README.md; git -C "$w" commit -qm next; git -C "$w" push -q origin main
  NEW_SHA="$(git -C "$w" rev-parse HEAD)"
}

advance_origin_with_ready_symlink() {
  local victim="$1" w
  advance_origin
  w="$TMP/advance-$advance_count"
  ln -s "$victim" "$w/.localmind-deploy-ready"
  git -C "$w" add .localmind-deploy-ready
  git -C "$w" commit -qm malicious-marker
  git -C "$w" push -q origin main
  NEW_SHA="$(git -C "$w" rev-parse HEAD)"
}

run_deploy() {
  (
    umask "${TEST_UMASK:-022}"
    env PATH="$BIN:$PATH" EVENT_LOG="$EVENT_LOG" CURRENT_LINK="$CURRENT_LINK" \
      SOURCE_REPO="$SOURCE_REPO" RELEASE_ROOT="$RELEASE_ROOT" STATE_DIR="$STATE_DIR" ENV_FILE="$ENV_FILE" \
      SERVICE_NAME=localmind-mcp.service GH_REPO=shaul1991/localmind GH_WORKFLOW=CI BUILD_USER="$(id -un)" NPM_BIN="$BIN/npm" \
      HEALTH_RETRIES=3 HEALTH_RETRY_DELAY=0 LOCALMIND_DEPLOY_TEST_MODE=1 \
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

printf '\n\033[1mAC-13 — fresh install transport·sandbox 경로·이식성\033[0m\n'
assert "MCP ExecStart가 EnvironmentFile보다 HTTP transport 우선" 'grep -q "^ExecStart=/usr/bin/env MCP_TRANSPORT=http HOME=/var/lib/localmind /usr/bin/node " "$ROOT/deploy/systemd/localmind-mcp.service"'
assert "MCP unit이 writable default HOME 생성" 'grep -q "^StateDirectory=localmind$" "$ROOT/deploy/systemd/localmind-mcp.service" && grep -q "^StateDirectoryMode=0700$" "$ROOT/deploy/systemd/localmind-mcp.service"'
assert "deploy unit이 StateDirectory 생성" 'grep -q "^StateDirectory=localmind-deploy$" "$ROOT/deploy/systemd/localmind-deploy.service"'
assert "배포 스크립트가 release 부모 traversal 보장" 'grep -q "chmod 0755.*RELEASE_ROOT" "$SCRIPT"'
assert "MCP unit에 개인 /root 경로 없음" '! grep -q "/root/personal" "$ROOT/deploy/systemd/localmind-mcp.service"'
assert "설치 문서가 note write allowlist drop-in 안내" 'grep -q "localmind-mcp.service.d.*write-paths.conf" "$ROOT/docs/home-server-deploy.md"'
assert "설치 문서가 write roots를 설치자에게 요구" 'grep -q "LOCALMIND_STATE_ROOT:?" "$ROOT/docs/home-server-deploy.md" && grep -q "LOCALMIND_SHARED_NOTES:?" "$ROOT/docs/home-server-deploy.md" && grep -q "LOCALMIND_PRIVATE_NOTES:?" "$ROOT/docs/home-server-deploy.md"'
assert "공개 저장소 bootstrap은 HTTPS clone" 'grep -q "git clone https://github.com/shaul1991/localmind.git" "$ROOT/docs/home-server-deploy.md" && ! grep -q "git clone git@github.com" "$ROOT/docs/home-server-deploy.md"'
assert "fresh install이 .env를 생성한 뒤 설치" 'python3 -c '\''from pathlib import Path; import sys; s=Path(sys.argv[1]).read_text(); raise SystemExit(0 if s.index("cp .env.example .env") < s.index("install -m 0640 -o root -g localmind .env") else 1)'\'' "$ROOT/docs/home-server-deploy.md"'
assert "deploy 전용 GitHub token을 별도 환경 파일로 제한" 'grep -q "^EnvironmentFile=/etc/localmind/deploy.env$" "$ROOT/deploy/systemd/localmind-deploy.service" && grep -q "GH_TOKEN:?" "$ROOT/docs/home-server-deploy.md" && grep -q "/etc/localmind/deploy.env" "$ROOT/docs/home-server-deploy.md"'
assert "bootstrap 이후에만 MCP 활성화" 'python3 -c '\''from pathlib import Path; import sys; s=Path(sys.argv[1]).read_text(); raise SystemExit(0 if s.index("systemctl start localmind-deploy.service") < s.index("systemctl enable --now localmind-mcp.service") else 1)'\'' "$ROOT/docs/home-server-deploy.md"'
assert "쓰기 경로 renderer가 공백 경로를 systemd quote" '[ "$(python3 "$ROOT/scripts/render-systemd-write-paths.py" "/srv/notes with space" /srv/index)" = '"'"'[Service]
ReadWritePaths="/srv/notes with space" "/srv/index"'"'"' ]'
assert "쓰기 경로 renderer가 상대경로 거부" '! python3 "$ROOT/scripts/render-systemd-write-paths.py" relative/path >/dev/null 2>&1'
assert "쓰기 경로 renderer가 root 경로 거부" '! python3 "$ROOT/scripts/render-systemd-write-paths.py" / >/dev/null 2>&1'
root_alias="$(resolved_path "$TMP")/root-alias"; ln -s / "$root_alias"
assert "쓰기 경로 renderer가 root symlink alias 거부" '! python3 "$ROOT/scripts/render-systemd-write-paths.py" "$root_alias" >/dev/null 2>&1'
assert "쓰기 경로 renderer가 비정규화 경로 거부" '! python3 "$ROOT/scripts/render-systemd-write-paths.py" /srv/notes/../private >/dev/null 2>&1'
assert "설치 문서가 권한 변경 전에 경로 렌더링 검증" 'python3 -c '\''from pathlib import Path; import sys; s=Path(sys.argv[1]).read_text(); raise SystemExit(0 if s.index("scripts/render-systemd-write-paths.py") < s.index("chgrp -R localmind") else 1)'\'' "$ROOT/docs/home-server-deploy.md"'
assert "쓰기 경로 renderer가 TAB·ESC 제어문자 거부" 'python3 -c '\''import subprocess,sys; script=sys.argv[1]; paths=["/srv/tab\tpath", "/srv/esc\x1bpath"]; raise SystemExit(0 if all(subprocess.run([sys.executable, script, p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0 for p in paths) else 1)'\'' "$ROOT/scripts/render-systemd-write-paths.py"'
assert "쓰기 경로 renderer가 systemd % specifier 이스케이프" '[ "$(python3 "$ROOT/scripts/render-systemd-write-paths.py" "/srv/notes/%n")" = '"'"'[Service]
ReadWritePaths="/srv/notes/%%n"'"'"' ]'
assert "deploy unit·script에 개인 source checkout 없음" '! grep -q "/root/personal/shaul1991/localmind" "$ROOT/deploy/systemd/localmind-deploy.service" "$SCRIPT"'

printf '\n\033[1mAC-14 — system Node/npm·IPv6 health URL\033[0m\n'
assert "deploy unit이 system npm 경로 명시" 'grep -q "^Environment=NPM_BIN=/usr/bin/npm$" "$ROOT/deploy/systemd/localmind-deploy.service"'
assert "설치 문서가 system-wide Node/npm 확인" 'grep -q "test -x /usr/bin/node" "$ROOT/docs/home-server-deploy.md" && grep -q "test -x /usr/bin/npm" "$ROOT/docs/home-server-deploy.md"'
new_fixture ipv6-loopback; advance_origin; set_env_value MCP_HTTP_HOST ::1; run_deploy EXPECT_CURL_URL="http://[::1]:8789/mcp"
assert "IPv6 loopback URL bracket 처리" '[ "$RC" -eq 0 ]'
new_fixture ipv6-wildcard; advance_origin; set_env_value MCP_HTTP_HOST ::; run_deploy EXPECT_CURL_URL="http://[::1]:8789/mcp"
assert "IPv6 wildcard는 loopback probe" '[ "$RC" -eq 0 ]'

printf '\n\033[1mAC-15 — current 전환 후 last-good 기록 중단 복구\033[0m\n'
new_fixture interrupted-last-good; advance_origin; run_deploy
printf '%s\n' "$OLD_SHA" > "$STATE_DIR/last-good-sha"
builds_before="$(grep -c '^npm ci ' "$EVENT_LOG")"
health_before="$(grep -c '^curl health ' "$EVENT_LOG")"
run_deploy GH_RESULT=failure
builds_after="$(grep -c '^npm ci ' "$EVENT_LOG")"
health_after="$(grep -c '^curl health ' "$EVENT_LOG")"
assert "last-good 불일치 current를 재검증" '[ "$RC" -eq 0 ] && [ "$health_after" -gt "$health_before" ] && [ "$(cat "$STATE_DIR/last-good-sha")" = "$NEW_SHA" ]'
assert "준비된 release 복구 시 재빌드하지 않음" '[ "$builds_after" -eq "$builds_before" ]'
assert "last-good 상태를 원자적으로 교체" 'grep -q "os.replace" "$SCRIPT" && grep -q "os.fsync" "$SCRIPT"'

printf '\n\033[1mAC-16 — last-good 기록 실패 시 이전 pointer 보존\033[0m\n'
new_fixture atomic-state-failure; advance_origin
fault_python="$TMP/fail-state-mkstemp"; mkdir -p "$fault_python"
cat > "$fault_python/sitecustomize.py" <<'PY'
import tempfile
_original_mkstemp = tempfile.mkstemp
def _fail_last_good(*args, **kwargs):
    if str(kwargs.get("prefix", "")).startswith(".last-good-sha."):
        raise OSError("injected last-good temp-file failure")
    return _original_mkstemp(*args, **kwargs)
tempfile.mkstemp = _fail_last_good
PY
run_deploy PYTHONPATH="$fault_python"
assert "원자 상태 기록 실패를 성공으로 보고하지 않음" '[ "$RC" -ne 0 ]'
assert "기존 last-good와 current를 보존" '[ "$(cat "$STATE_DIR/last-good-sha")" = "$OLD_SHA" ] && [ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'

printf '\n\033[1mAC-17 — rename 후 directory fsync 실패 일관성\033[0m\n'
new_fixture post-rename-fsync; advance_origin
fault_python="$TMP/fail-directory-fsync"; mkdir -p "$fault_python"
cat > "$fault_python/sitecustomize.py" <<'PY'
import os
_original_fsync = os.fsync
_calls = 0
def _fail_second_fsync(fd):
    global _calls
    _calls += 1
    if _calls == 2:
        raise OSError("injected directory fsync failure")
    return _original_fsync(fd)
os.fsync = _fail_second_fsync
PY
run_deploy PYTHONPATH="$fault_python"
assert "rename 이후 fsync 실패는 새 pointer·current 일관성 유지" '[ "$RC" -eq 0 ] && [ "$(cat "$STATE_DIR/last-good-sha")" = "$NEW_SHA" ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'
assert "directory fsync 실패를 경고" 'grep -q "directory fsync failed after commit" "$OUT"'

printf '\n\033[1mAC-18 — GitHub CLI 인증 preflight\033[0m\n'
new_fixture github-auth-failure; advance_origin; run_deploy GH_AUTH_FAIL=1
assert "GitHub 인증 부재를 명시적 실패" '[ "$RC" -ne 0 ] && grep -q "GitHub CLI 인증" "$OUT"'
assert "인증 실패 시 build·전환 없음" '! grep -q "^npm " "$EVENT_LOG" && [ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
new_fixture github-stale-account; advance_origin; run_deploy GH_STALE_ACCOUNT=1
assert "유효한 active GH_TOKEN은 stale 저장 계정과 격리" '[ "$RC" -eq 0 ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'

printf '\n\033[1mAC-19 — initialize JSON-RPC 결과 구조 검증\033[0m\n'
new_fixture health-json-error; advance_origin
run_deploy HEALTH_RESPONSE='{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"protocolVersion negotiation failed"}}'
assert "protocolVersion 문자열을 포함한 JSON-RPC error 거부" '[ "$RC" -ne 0 ]'
assert "initialize error 시 이전 정상 release rollback" '[ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ] && [ "$(cat "$STATE_DIR/last-good-sha")" = "$OLD_SHA" ]'
new_fixture health-sse-result; advance_origin
run_deploy HEALTH_RESPONSE=$'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n'
assert "SSE data의 성공 initialize result 허용" '[ "$RC" -eq 0 ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'
new_fixture health-sse-multiline; advance_origin
run_deploy HEALTH_RESPONSE=$'event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":1,"result":{"protocolVersion":"2025-06-18"}}\n\n'
assert "여러 SSE data field를 한 event payload로 조립" '[ "$RC" -eq 0 ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'
new_fixture health-boolean-id; advance_origin
run_deploy HEALTH_RESPONSE='{"jsonrpc":"2.0","id":true,"result":{"protocolVersion":"2025-06-18"}}'
assert "boolean true를 numeric JSON-RPC id 1로 허용하지 않음" '[ "$RC" -ne 0 ] && [ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
new_fixture health-sse-unterminated; advance_origin
run_deploy HEALTH_RESPONSE='data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}'
assert "빈 줄로 종료되지 않은 truncated SSE event 거부" '[ "$RC" -ne 0 ] && [ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
separator_failures=0; separator_index=0
for separator in $'\v\v' $'\f\f' $'\u0085\u0085'; do
  separator_index=$((separator_index + 1))
  new_fixture "health-sse-nonstandard-$separator_index"; advance_origin
  run_deploy HEALTH_RESPONSE="data: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-06-18\"}}${separator}"
  [ "$RC" -ne 0 ] || separator_failures=$((separator_failures + 1))
done
assert "VT·FF·NEL을 SSE line separator로 취급하지 않음" '[ "$separator_failures" -eq 0 ]'
new_fixture health-sse-bom; advance_origin
bom="$(printf '\357\273\277')"
run_deploy HEALTH_RESPONSE="${bom}"$'data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}\n'
assert "SSE stream 선두의 단일 UTF-8 BOM 무시" '[ "$RC" -eq 0 ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'

printf '\n\033[1mAC-20 — builder가 만든 ready marker symlink 거부\033[0m\n'
victim="$TMP/ready-marker-victim"; printf 'preserve-me\n' > "$victim"
new_fixture ready-marker-symlink; advance_origin_with_ready_symlink "$victim"; run_deploy
assert "기존 ready marker entry를 배포 실패 처리" '[ "$RC" -ne 0 ] && [ "$(resolved_current)" = "$(resolved_path "$OLD_RELEASE")" ]'
assert "ready marker symlink 대상 파일을 변경하지 않음" '[ "$(cat "$victim")" = "preserve-me" ]'

printf '\n\033[1mAC-21 — 성공 후 current·rollback 외 release 정리\033[0m\n'
new_fixture release-pruning; advance_origin; run_deploy
first_sha="$NEW_SHA"; first_release="$RELEASE_ROOT/$first_sha"
advance_origin; run_deploy
second_sha="$NEW_SHA"; second_release="$RELEASE_ROOT/$second_sha"
assert "두 세대 이전 release 삭제" '[ ! -e "$OLD_RELEASE" ]'
assert "current와 직전 rollback release 보존" '[ -d "$first_release" ] && [ -d "$second_release" ] && [ "$(resolved_current)" = "$(resolved_path "$second_release")" ]'

printf '\n\033[1mAC-22 — locked superseded worktree fail-closed 보존\033[0m\n'
new_fixture locked-release-pruning; advance_origin; run_deploy
first_release="$RELEASE_ROOT/$NEW_SHA"
git -C "$SOURCE_REPO" worktree lock "$OLD_RELEASE" --reason fixture
advance_origin; run_deploy
assert "locked worktree 정리 실패가 배포 상태를 손상하지 않음" '[ "$RC" -eq 0 ] && [ -d "$OLD_RELEASE" ] && [ "$(resolved_current)" = "$(resolved_path "$RELEASE_ROOT/$NEW_SHA")" ]'
assert "locked administrative worktree와 디렉터리를 함께 보존" '[ -d "$OLD_RELEASE" ] && git -C "$SOURCE_REPO" worktree list --porcelain | grep -Fqx "worktree $(resolved_path "$OLD_RELEASE")" && git -C "$SOURCE_REPO" worktree list --porcelain | grep -q "^locked fixture$"'

printf '\n\033[1mAC-23 — deploy credential 격리와 원격 overlay bind\033[0m\n'
new_fixture credential-isolation; advance_origin
run_deploy GH_TOKEN=primary-deploy-secret GITHUB_TOKEN=alternate-deploy-secret
assert "npm lifecycle·테스트·빌드에 GitHub credential 미전달" '[ "$RC" -eq 0 ] && ! grep -Fq "npm credential leak" "$EVENT_LOG"'
assert "설치 문서가 loopback 대신 원격 bind 주소를 요구" 'grep -Fq "LOCALMIND_MCP_BIND_HOST" docs/home-server-deploy.md && ! grep -Fq "MCP_HTTP_HOST=127.0.0.1" docs/home-server-deploy.md'
assert "Tailscale은 추천하되 다른 overlay 서비스를 허용" 'grep -Fq "Tailscale을 권장" docs/home-server-deploy.md && grep -Eq "WireGuard|ZeroTier" docs/home-server-deploy.md && ! grep -Fq "tailscale_v4" docs/home-server-deploy.md'
assert "공개 MCP unit은 network provider 중립" '! grep -Eqi "tailscale|tailscaled" deploy/systemd/localmind-mcp.service'
bind_fixture="$TMP/bind-interfaces.json"
printf '%s\n' '[
  {"ifname":"eth0","flags":["BROADCAST","UP","LOWER_UP"],"operstate":"UP","addr_info":[{"local":"10.20.30.40","scope":"global"},{"local":"8.8.8.8","scope":"global"},{"local":"fd00::1234","scope":"global"}]},
  {"ifname":"tailscale0","flags":["POINTOPOINT","UP","LOWER_UP"],"operstate":"UNKNOWN","addr_info":[{"local":"100.100.30.40","scope":"global"}]},
  {"ifname":"down0","flags":["BROADCAST"],"operstate":"DOWN","addr_info":[{"local":"10.30.30.40","scope":"global"}]},
  {"ifname":"lo","flags":["LOOPBACK","UP","LOWER_UP"],"operstate":"UNKNOWN","addr_info":[{"local":"10.40.30.40","scope":"global"}]},
  {"ifname":"eth1","flags":["BROADCAST","UP","LOWER_UP"],"operstate":"UP","addr_info":[{"local":"fd00::dead","scope":"global","flags":["tentative"]}]}
]' > "$bind_fixture"
validator_fixture='env LOCALMIND_BIND_VALIDATOR_TEST=1 python3 scripts/validate-private-bind.py'
assert "RFC1918 bind 허용" '$validator_fixture 10.20.30.40 --ip-json "$bind_fixture" >/dev/null'
assert "Tailscale CGNAT UNKNOWN interface bind 허용" '$validator_fixture 100.100.30.40 --ip-json "$bind_fixture" >/dev/null'
assert "IPv6 ULA bind 허용" '$validator_fixture fd00::1234 --ip-json "$bind_fixture" >/dev/null'
assert "공인 IPv4 bind 거부" '! $validator_fixture 8.8.8.8 --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "DOWN interface bind 거부" '! $validator_fixture 10.30.30.40 --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "loopback interface bind 거부" '! $validator_fixture 10.40.30.40 --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "tentative IPv6 bind 거부" '! $validator_fixture fd00::dead --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "호스트에 미할당된 private bind 거부" '! $validator_fixture 10.20.30.41 --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "fixture override는 test opt-in 없이 거부" '! python3 scripts/validate-private-bind.py 10.20.30.40 --ip-json "$bind_fixture" >/dev/null 2>&1'
assert "설치 문서가 공통 private bind validator 사용" 'grep -Fq "scripts/validate-private-bind.py" docs/home-server-deploy.md'
assert "builder를 systemd control-group 격리 후 artifact 승격" 'python3 - <<'"'"'PY'"'"'
from pathlib import Path
text = Path("scripts/home-server-deploy.sh").read_text()
raise SystemExit(0 if text.index("systemd-run") < text.index("chown -R root:root") and "KillMode=control-group" in text else 1)
PY'
assert "deploy env가 test mode·builder를 우회하지 못함" 'grep -Eq "^ExecStart=/usr/bin/env LOCALMIND_DEPLOY_TEST_MODE=0 BUILD_USER=localmind-builder " deploy/systemd/localmind-deploy.service'
assert "EnvironmentFile 특수문자 경로를 안전하게 직렬화" 'value="/srv/owner'"'"'s \\notes"; rendered="$(python3 scripts/render-systemd-env.py "NOTES_DIR=$value")"; python3 - "$rendered" "$value" <<'"'"'PY'"'"'
import json, sys
raw, expected = sys.argv[1].split("=", 1)[1], sys.argv[2]
raise SystemExit(0 if json.loads(raw) == expected else 1)
PY'
assert "설치 문서가 raw path printf를 사용하지 않음" 'grep -Fq "scripts/render-systemd-env.py" docs/home-server-deploy.md && ! grep -Fq "printf '\''\\nNOTES_DIR=%s,%s" docs/home-server-deploy.md'
assert "bind validator 오류는 평이한 한국어" '! python3 scripts/validate-private-bind.py 8.8.8.8 >"$TMP/bind-ko.out" 2>&1 && python3 - "$TMP/bind-ko.out" <<'"'"'PY'"'"'
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
raise SystemExit(0 if any("가" <= character <= "힣" for character in text) else 1)
PY'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
