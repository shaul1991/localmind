#!/usr/bin/env bash
# GitHub main의 CI-green 커밋만 release 디렉터리에 검증 배포하고 health 실패 시 이전 release로 롤백한다.
set -uo pipefail

SOURCE_REPO="${SOURCE_REPO:-/var/lib/localmind-deploy/source}"
RELEASE_ROOT="${RELEASE_ROOT:-/opt/localmind/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/localmind/current}"
STATE_DIR="${STATE_DIR:-/var/lib/localmind-deploy}"
ENV_FILE="${ENV_FILE:-/etc/localmind/localmind.env}"
SERVICE_NAME="${SERVICE_NAME:-localmind-mcp.service}"
GH_REPO="${GH_REPO:-shaul1991/localmind}"
GH_WORKFLOW="${GH_WORKFLOW:-CI}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
BUILD_USER="${BUILD_USER:-localmind-builder}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-2}"
LOCK_FILE="${LOCK_FILE:-$STATE_DIR/deploy.lock}"

say() { printf '%s\n' "$*"; }
fail() { printf '배포 실패: %s\n' "$*" >&2; exit 1; }

current_parent="$(dirname "$CURRENT_LINK")"
mkdir -p "$RELEASE_ROOT" "$STATE_DIR" "$current_parent" || fail "배포 디렉터리 준비 실패"
chmod 0755 "$RELEASE_ROOT" "$current_parent" || fail "release 부모 traversal 권한 설정 실패"
if ! exec 9>"$LOCK_FILE"; then
  fail "배포 lock 파일을 열 수 없습니다: $LOCK_FILE"
fi
if ! flock -n 9; then
  say "다른 LocalMind 배포가 진행 중이므로 이번 실행을 건너뜁니다."
  exit 0
fi

[ -d "$SOURCE_REPO/.git" ] || fail "source repo가 아닙니다: $SOURCE_REPO"
[ -f "$ENV_FILE" ] || fail "환경 파일이 없습니다: $ENV_FILE"
if [ -n "$(git -C "$SOURCE_REPO" status --porcelain --untracked-files=no)" ]; then
  fail "source repo에 추적 파일 변경이 있어 덮어쓰지 않습니다."
fi

resolve_path() {
  python3 - "$1" <<'PY'
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
}

if ! git -C "$SOURCE_REPO" fetch "$REMOTE" "$BRANCH" --prune; then
  fail "origin/$BRANCH fetch 실패"
fi
target_sha="$(git -C "$SOURCE_REPO" rev-parse "$REMOTE/$BRANCH")" || fail "target SHA 확인 실패"
release_dir="$(resolve_path "$RELEASE_ROOT/$target_sha")"
if [ -e "$CURRENT_LINK" ] || [ -L "$CURRENT_LINK" ]; then
  current_dir="$(resolve_path "$CURRENT_LINK" 2>/dev/null || true)"
else
  current_dir=""
fi

if [ "$current_dir" = "$release_dir" ]; then
  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    say "최신 release의 MCP 서비스가 중지되어 재시작합니다: ${target_sha:0:7}"
    systemctl restart "$SERVICE_NAME" || fail "최신 release MCP 서비스 재시작 실패"
  fi
  say "이미 최신 배포입니다: ${target_sha:0:7}"
  exit 0
fi

ci_result="$(gh run list --repo "$GH_REPO" --workflow "$GH_WORKFLOW" --commit "$target_sha" --status completed --limit 1 --json conclusion,headSha --jq '.[0].conclusion // ""' 2>/dev/null || true)"
if [ "$ci_result" != "success" ]; then
  say "CI 성공이 확인되지 않아 배포를 보류합니다: ${target_sha:0:7} (CI=${ci_result:-none})"
  exit 0
fi

cleanup_failed_release() {
  local path="$1"
  git -C "$SOURCE_REPO" worktree remove --force "$path" >/dev/null 2>&1 || rm -rf "$path"
  git -C "$SOURCE_REPO" worktree prune >/dev/null 2>&1 || true
}

if [ -e "$release_dir" ] && [ ! -f "$release_dir/.localmind-deploy-ready" ]; then
  cleanup_failed_release "$release_dir"
fi
if [ ! -d "$release_dir" ]; then
  if ! git -C "$SOURCE_REPO" worktree add --detach "$release_dir" "$target_sha"; then
    fail "release worktree 생성 실패: $target_sha"
  fi
fi

id "$BUILD_USER" >/dev/null 2>&1 || fail "빌드 전용 사용자가 없습니다: $BUILD_USER"
build_home="$release_dir/.build-home"
mkdir -p "$build_home" || fail "빌드 HOME 준비 실패"
if [ "$(id -un)" != "$BUILD_USER" ]; then
  command -v runuser >/dev/null 2>&1 || fail "runuser가 없어 비권한 빌드를 실행할 수 없습니다."
  chown -R "$BUILD_USER" "$release_dir" || fail "release 소유권을 빌드 사용자에게 넘기지 못했습니다."
fi

build_ok=1
if [ "$(id -un)" = "$BUILD_USER" ]; then
  (
    cd "$release_dir" || exit 1
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" npm ci &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" npm test &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" npm run typecheck &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" npm run build &&
    test -f dist/mcp.js
  ) || build_ok=0
else
  runuser -u "$BUILD_USER" -- env HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" \
    sh -c 'cd "$1" && npm ci && npm test && npm run typecheck && npm run build && test -f dist/mcp.js' \
    sh "$release_dir" || build_ok=0
fi
if [ "$build_ok" -ne 1 ]; then
  cleanup_failed_release "$release_dir"
  fail "테스트·타입검사·빌드 중 하나가 실패했습니다. 현재 서비스는 변경하지 않았습니다."
fi
rm -rf "$build_home" || {
  cleanup_failed_release "$release_dir"
  fail "빌드 임시 HOME 정리 실패"
}
chown -R root:root "$release_dir" || {
  cleanup_failed_release "$release_dir"
  fail "release 소유권 고정 실패"
}
chmod -R u=rwX,go=rX "$release_dir" || {
  cleanup_failed_release "$release_dir"
  fail "런타임 artifact 읽기·불변 권한 설정 실패"
}
if ! : > "$release_dir/.localmind-deploy-ready" || ! chmod 0644 "$release_dir/.localmind-deploy-ready"; then
  cleanup_failed_release "$release_dir"
  fail "release 준비 marker 기록 실패"
fi

atomic_link() {
  local target="$1" tmp="$CURRENT_LINK.next.$$"
  rm -f "$tmp"
  ln -s "$target" "$tmp" || return 1
  python3 - "$tmp" "$CURRENT_LINK" <<'PY'
import os, sys
os.replace(sys.argv[1], sys.argv[2])
PY
}

read_env_value() {
  python3 - "$ENV_FILE" "$1" <<'PY'
from pathlib import Path
import sys
path, key = sys.argv[1], sys.argv[2]
for raw in Path(path).read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    name, value = line.split("=", 1)
    if name.strip() != key:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    print(value, end="")
    break
PY
}

health_check() {
  local token host port path url response auth_header
  token="$(read_env_value MCP_AUTH_TOKEN)"
  host="$(read_env_value MCP_HTTP_HOST)"; host="${host:-127.0.0.1}"
  [ "$host" = "0.0.0.0" ] && host="127.0.0.1"
  port="$(read_env_value MCP_HTTP_PORT)"; port="${port:-8789}"
  path="$(read_env_value MCP_HTTP_PATH)"; path="${path:-/mcp}"
  url="http://$host:$port$path"
  [ -n "$token" ] || return 1
  printf -v auth_header '%s%s' 'Authorization: Bearer ' "${token}"
  response="$(curl --fail --silent --show-error --max-time 15 \
    -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "${auth_header}" \
    --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"localmind-deployer","version":"1"}}}')" || return 1
  case "$response" in *protocolVersion*) return 0;; *) return 1;; esac
}

wait_for_health() {
  local attempt=1
  while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
    health_check && return 0
    [ "$attempt" -eq "$HEALTH_RETRIES" ] || sleep "$HEALTH_RETRY_DELAY"
    attempt=$((attempt + 1))
  done
  return 1
}

previous_dir="$current_dir"
if ! atomic_link "$release_dir"; then
  cleanup_failed_release "$release_dir"
  fail "current release 링크 전환 실패"
fi
if systemctl restart "$SERVICE_NAME" && wait_for_health; then
  if printf '%s\n' "$target_sha" > "$STATE_DIR/last-good-sha"; then
    say "배포 완료: ${target_sha:0:7}"
    exit 0
  fi
  say "last-good SHA 기록 실패 — 이전 release로 롤백합니다." >&2
else
  say "새 release health check 실패 — 이전 release로 롤백합니다." >&2
fi
if [ -n "$previous_dir" ] && [ -d "$previous_dir" ]; then
  if ! atomic_link "$previous_dir"; then
    say "경고: 이전 release 링크 복원에 실패했습니다." >&2
    exit 1
  fi
  systemctl restart "$SERVICE_NAME" || true
  if wait_for_health; then
    say "롤백 완료: $(basename "$previous_dir")" >&2
  else
    say "경고: 이전 release health check도 실패했습니다." >&2
  fi
else
  rm -f "$CURRENT_LINK"
  systemctl stop "$SERVICE_NAME" || true
  say "경고: 롤백할 이전 release가 없어 실패한 서비스를 중지했습니다." >&2
fi
exit 1
