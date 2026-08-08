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
NPM_BIN="${NPM_BIN:-/usr/bin/npm}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-2}"
LOCK_FILE="${LOCK_FILE:-$STATE_DIR/deploy.lock}"
LAST_GOOD_FILE="${LAST_GOOD_FILE:-$STATE_DIR/last-good-sha}"

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

last_good_sha=""
if [ -f "$LAST_GOOD_FILE" ]; then
  IFS= read -r last_good_sha < "$LAST_GOOD_FILE" || true
fi
recover_current=0
if [ "$current_dir" = "$release_dir" ]; then
  if [ "$last_good_sha" = "$target_sha" ]; then
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
      say "최신 release의 MCP 서비스가 중지되어 재시작합니다: ${target_sha:0:7}"
      systemctl restart "$SERVICE_NAME" || fail "최신 release MCP 서비스 재시작 실패"
    fi
    say "이미 최신 배포입니다: ${target_sha:0:7}"
    exit 0
  fi
  [ -f "$release_dir/.localmind-deploy-ready" ] || fail "current release가 검증 marker 없이 전환되었습니다: $target_sha"
  recover_current=1
  say "current와 last-good 불일치를 발견해 health 검증을 재개합니다: ${target_sha:0:7}"
fi

if [ "$recover_current" -eq 0 ]; then
  command -v gh >/dev/null 2>&1 || fail "GitHub CLI(gh)가 없습니다."
  gh auth status --active --hostname github.com >/dev/null 2>&1 || fail "GitHub CLI 인증이 없습니다. deploy 전용 GH_TOKEN을 확인하세요."
  ci_result="$(gh run list --repo "$GH_REPO" --workflow "$GH_WORKFLOW" --commit "$target_sha" --status completed --limit 1 --json conclusion,headSha --jq '.[0].conclusion // ""' 2>/dev/null || true)"
  if [ "$ci_result" != "success" ]; then
    say "CI 성공이 확인되지 않아 배포를 보류합니다: ${target_sha:0:7} (CI=${ci_result:-none})"
    exit 0
  fi
fi

# GitHub 배포 자격증명은 CI gate까지만 사용하고 빌드·health 하위 프로세스에는 전달하지 않는다.
unset GH_TOKEN GITHUB_TOKEN

cleanup_failed_release() {
  local path line registered=0
  path="$(resolve_path "$1")"
  while IFS= read -r line; do
    if [ "$line" = "worktree $path" ]; then
      registered=1
      break
    fi
  done < <(git -C "$SOURCE_REPO" worktree list --porcelain)
  if [ "$registered" -eq 1 ]; then
    git -C "$SOURCE_REPO" worktree remove --force "$path" >/dev/null 2>&1 || return 1
  else
    rm -rf "$path" || return 1
  fi
  git -C "$SOURCE_REPO" worktree prune >/dev/null 2>&1 || true
}

prune_superseded_releases() {
  local candidate name candidate_dir prune_failed=0
  for candidate in "$RELEASE_ROOT"/*; do
    [ -e "$candidate" ] || [ -L "$candidate" ] || continue
    name="$(basename "$candidate")"
    [[ "$name" =~ ^[0-9a-f]{40}$ ]] || continue
    if [ -L "$candidate" ]; then
      rm -f "$candidate" || prune_failed=1
      continue
    fi
    [ -d "$candidate" ] || continue
    candidate_dir="$(resolve_path "$candidate")"
    [ "$candidate_dir" = "$release_dir" ] && continue
    [ -n "${previous_dir:-}" ] && [ "$candidate_dir" = "$previous_dir" ] && continue
    cleanup_failed_release "$candidate"
    [ ! -e "$candidate" ] || prune_failed=1
  done
  return "$prune_failed"
}

if [ "$recover_current" -eq 0 ]; then
if [ -e "$release_dir" ] && [ ! -f "$release_dir/.localmind-deploy-ready" ]; then
  cleanup_failed_release "$release_dir" || fail "기존 미완료 release worktree를 안전하게 정리하지 못했습니다."
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
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" "$NPM_BIN" ci &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" "$NPM_BIN" test &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" "$NPM_BIN" run typecheck &&
    HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" "$NPM_BIN" run build &&
    test -f dist/mcp.js
  ) || build_ok=0
else
  runuser -u "$BUILD_USER" -- env HOME="$build_home" NPM_CONFIG_CACHE="$build_home/npm-cache" \
    sh -c 'cd "$1" && "$2" ci && "$2" test && "$2" run typecheck && "$2" run build && test -f dist/mcp.js' \
    sh "$release_dir" "$NPM_BIN" || build_ok=0
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
if ! python3 - "$release_dir/.localmind-deploy-ready" <<'PY'
import os
import sys

path = sys.argv[1]
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
fd = os.open(path, flags, 0o600)
try:
    os.fchmod(fd, 0o644)
    os.fsync(fd)
finally:
    os.close(fd)
PY
then
  cleanup_failed_release "$release_dir"
  fail "release 준비 marker의 기존 entry 또는 안전하지 않은 경로를 거부했습니다."
fi
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
  local token host probe_host port path url response_file auth_header parser_status
  token="$(read_env_value MCP_AUTH_TOKEN)"
  host="$(read_env_value MCP_HTTP_HOST)"; host="${host:-127.0.0.1}"
  case "$host" in
    0.0.0.0) probe_host="127.0.0.1" ;;
    ::) probe_host="[::1]" ;;
    *:*) probe_host="[$host]" ;;
    *) probe_host="$host" ;;
  esac
  port="$(read_env_value MCP_HTTP_PORT)"; port="${port:-8789}"
  path="$(read_env_value MCP_HTTP_PATH)"; path="${path:-/mcp}"
  url="http://$probe_host:$port$path"
  [ -n "$token" ] || return 1
  printf -v auth_header '%s%s' 'Authorization: Bearer ' "${token}"
  response_file="$(mktemp "$STATE_DIR/.health-response.XXXXXX")" || return 1
  if ! curl --fail --silent --show-error --max-time 15 \
    --output "$response_file" \
    -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "${auth_header}" \
    --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"localmind-deployer","version":"1"}}}'; then
    rm -f "$response_file"
    return 1
  fi
  python3 - "$response_file" <<'PY'
import json
from pathlib import Path
import sys

try:
    raw = Path(sys.argv[1]).read_bytes().decode("utf-8")
except (OSError, UnicodeDecodeError):
    raise SystemExit(1)
payloads = []
try:
    payloads.append(json.loads(raw))
except json.JSONDecodeError:
    event_data = []
    sse_raw = raw[1:] if raw.startswith("\ufeff") else raw
    normalized = sse_raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    if normalized.endswith("\n"):
        lines.pop()
    for line in lines:
        if line == "":
            if event_data:
                data = "\n".join(event_data)
                if data != "[DONE]":
                    try:
                        payloads.append(json.loads(data))
                    except json.JSONDecodeError:
                        pass
                event_data = []
            continue
        if line.startswith(":"):
            continue
        if line == "data":
            event_data.append("")
        elif line.startswith("data:"):
            value = line[5:]
            if value.startswith(" "):
                value = value[1:]
            event_data.append(value)
valid = any(
    isinstance(payload, dict)
    and payload.get("jsonrpc") == "2.0"
    and type(payload.get("id")) is int
    and payload["id"] == 1
    and "error" not in payload
    and isinstance(payload.get("result"), dict)
    and payload["result"].get("protocolVersion") == "2025-06-18"
    for payload in payloads
)
raise SystemExit(0 if valid else 1)
PY
  parser_status=$?
  rm -f "$response_file" || return 1
  return "$parser_status"
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

write_last_good() {
  python3 - "$LAST_GOOD_FILE" "$target_sha" <<'PY'
import os
from pathlib import Path
import sys
import tempfile

path = Path(sys.argv[1])
sha = sys.argv[2]
fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(f"{sha}\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
except BaseException:
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise

# rename이 관찰 가능한 commit point다. 이후 directory fsync 실패 시 current를
# rollback하면 오히려 새 pointer와 불일치하므로 경고만 남기고 다음 실행의
# current/last-good 복구 검증에 맡긴다.
try:
    directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
except OSError as error:
    print(f"warning: last-good directory fsync failed after commit: {error}", file=sys.stderr)
PY
}

previous_dir="$current_dir"
if [ "$recover_current" -eq 1 ]; then
  previous_dir=""
  if [[ "$last_good_sha" =~ ^[0-9a-f]{40}$ ]] && [ "$last_good_sha" != "$target_sha" ]; then
    last_good_dir="$(resolve_path "$RELEASE_ROOT/$last_good_sha")"
    if [ -d "$last_good_dir" ] && [ -f "$last_good_dir/.localmind-deploy-ready" ]; then
      previous_dir="$last_good_dir"
    fi
  fi
fi
if [ "$recover_current" -eq 0 ]; then
  if ! atomic_link "$release_dir"; then
    cleanup_failed_release "$release_dir"
    fail "current release 링크 전환 실패"
  fi
fi
if systemctl restart "$SERVICE_NAME" && wait_for_health; then
  if write_last_good; then
    prune_superseded_releases || say "경고: superseded release 일부를 정리하지 못했습니다." >&2
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
