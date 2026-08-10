#!/usr/bin/env bash
# Phase 2 Gate A — 실제 사용자 경로·자격증명에 닿지 않는 clean-room 복구 왕복.
# temp HOME + 로컬 git 백업 + 로컬 OpenAI-compatible embedding stub만 사용한다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECOVER="$ROOT/scripts/recover.sh"
BACKUP="$ROOT/scripts/backup.sh"
TMP="$(mktemp -d)"
STUB_PID=""
cleanup() {
  if [ -n "$STUB_PID" ]; then
    kill "$STUB_PID" >/dev/null 2>&1 || true
    wait "$STUB_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

pass=0
fail=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no() { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() {
  local label="$1"
  shift
  if "$@"; then ok "$label"; else no "$label"; fi
}
assert_secret_absent() {
  local label="$1" output="$2"
  case "$output" in
    *"$SECRET"*) no "$label" ;;
    *) ok "$label" ;;
  esac
}

HOME_DIR="$TMP/home"
SOURCE_REPO="$TMP/backup-source"
REMOTE_REPO="$TMP/backup-origin.git"
RESTORED="$HOME_DIR/restored-brain"
STATE_DIR="$HOME_DIR/state"
ENV_FILE="$HOME_DIR/recover.env"
PORT_FILE="$TMP/embedding.port"
DOCKER_LOG="$TMP/docker-called.log"
MARKER="PHASE2-CLEAN-ROOM-$(date +%s)-$$"
SECRET="phase2-fixture-secret-$$"
mkdir -p "$HOME_DIR" "$SOURCE_REPO" "$STATE_DIR" "$TMP/bin"
printf 'NOTES_DIR=canonical=%s\n' "$HOME_DIR/isolated-notes" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
export LOCALMIND_ENV_FILE="$ENV_FILE"

# inline HTTP userinfo는 clone 전에 거부되고 git/gh argv에 도달하지 않아야 한다.
INLINE_BIN="$TMP/inline-bin"
INLINE_ARGV_LOG="$TMP/inline-argv.log"
mkdir -p "$INLINE_BIN"
cat > "$INLINE_BIN/git" <<'SH'
#!/bin/sh
printf 'git %s\n' "$*" >> "$INLINE_ARGV_LOG"
exit 99
SH
cat > "$INLINE_BIN/gh" <<'SH'
#!/bin/sh
printf 'gh %s\n' "$*" >> "$INLINE_ARGV_LOG"
exit 99
SH
chmod +x "$INLINE_BIN/git" "$INLINE_BIN/gh"
set +e
INLINE_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
  BACKUP_DIR="$HOME_DIR/inline-rejected" RESTORE_REPO="https://fixture-user:$SECRET@example.invalid/brain.git" \
  bash "$RECOVER" </dev/null 2>&1)"
INLINE_RC=$?
set -e
assert "inline-userinfo URL은 clone 전 exit 2" test "$INLINE_RC" -eq 2
assert "inline-userinfo 거부 전 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
assert_secret_absent "inline-userinfo 오류 로그에 secret 없음" "$INLINE_OUT"
assert "inline-userinfo 오류가 안전한 인증 경로를 안내" grep -q "credential helper" <<< "$INLINE_OUT"

: > "$INLINE_ARGV_LOG"
set +e
UPPER_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
  BACKUP_DIR="$HOME_DIR/uppercase-rejected" RESTORE_REPO="HTTPS://fixture-user:$SECRET@example.invalid/brain.git" \
  bash "$RECOVER" </dev/null 2>&1)"
UPPER_RC=$?
set -e
assert "mixed-case HTTPS userinfo도 exit 2" test "$UPPER_RC" -eq 2
assert "mixed-case 거부 전 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
assert_secret_absent "mixed-case 오류 로그에 secret 없음" "$UPPER_OUT"

: > "$INLINE_ARGV_LOG"
set +e
GENERIC_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
  BACKUP_DIR="$HOME_DIR/generic-rejected" RESTORE_REPO="ftp://$SECRET@example.invalid/brain.git" \
  bash "$RECOVER" </dev/null 2>&1)"
GENERIC_RC=$?
set -e
assert "generic URI inline password도 clone 전 exit 2" test "$GENERIC_RC" -eq 2
assert "generic URI 거부 전 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
assert_secret_absent "generic URI 오류 로그에 secret 없음" "$GENERIC_OUT"

: > "$INLINE_ARGV_LOG"
set +e
OPTION_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
  BACKUP_DIR="$HOME_DIR/option-rejected" RESTORE_REPO="--upload-pack=/tmp/not-a-repo" \
  bash "$RECOVER" </dev/null 2>&1)"
OPTION_RC=$?
set -e
assert "option-shaped RESTORE_REPO는 clone 전 exit 2" test "$OPTION_RC" -eq 2
assert "option-shaped 거부 전 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
assert "option-shaped 입력을 안전한 명시 경로로 고치도록 안내" grep -q "./" <<< "$OPTION_OUT"

: > "$INLINE_ARGV_LOG"
CONTROL_REPO="https://example.invalid/brain.git"$'\n'"$SECRET"
set +e
CONTROL_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
  BACKUP_DIR="$HOME_DIR/control-rejected" RESTORE_REPO="$CONTROL_REPO" \
  bash "$RECOVER" </dev/null 2>&1)"
CONTROL_RC=$?
set -e
assert "control-character RESTORE_REPO는 clone 전 exit 2" test "$CONTROL_RC" -eq 2
assert "control-character 거부 전 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
assert_secret_absent "control-character URL canary가 stdout/stderr에 없음" "$CONTROL_OUT"

# 임베딩 URL은 health probe의 fetch 경계보다 먼저 C0/DEL과 비공개 URL 요소를 거부해야 한다.
RECOVER_C0_REPO="$TMP/recover-c0-repo"
RECOVER_C0_NOTES="$TMP/recover-c0-notes"
RECOVER_C0_STATE="$TMP/recover-c0-state"
RECOVER_C0_BIN="$TMP/recover-c0-bin"
RECOVER_C0_FETCH_LOG="$TMP/recover-c0-fetch.log"
RECOVER_C0_HOOK="$TMP/recover-c0-fetch-hook.cjs"
mkdir -p "$RECOVER_C0_REPO" "$RECOVER_C0_NOTES" "$RECOVER_C0_STATE" "$RECOVER_C0_BIN"
git -C "$RECOVER_C0_REPO" init -q
cat > "$RECOVER_C0_BIN/npm" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$RECOVER_C0_HOOK" <<'JS'
const fs = require("node:fs");
globalThis.fetch = async (url) => {
  fs.appendFileSync(process.env.RECOVER_C0_FETCH_LOG, String(url) + "\n");
  return { ok: true, status: 200, json: async () => ({ data: [] }) };
};
JS
chmod +x "$RECOVER_C0_BIN/npm"
RECOVER_C0_CANARY="SYNTHETIC_RECOVER_CONTROL_URL_CANARY"
RECOVER_C0_URL="https://example.invalid/v1"$'\t'"$RECOVER_C0_CANARY"
set +e
RECOVER_C0_OUT="$(PATH="$RECOVER_C0_BIN:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$RECOVER_C0_REPO" \
  LOCALMIND_ENV_FILE="$ENV_FILE" NOTES_DIR="canonical=$RECOVER_C0_NOTES" \
  BRAIN_INDEX="$RECOVER_C0_STATE/index.json" QUERY_LOG="$RECOVER_C0_STATE/query-log.jsonl" \
  EMBEDDINGS_URL="$RECOVER_C0_URL" EMBEDDINGS_MODEL=fixture-model EMBEDDINGS_KEY=fixture-key \
  NODE_OPTIONS="--require=$RECOVER_C0_HOOK" RECOVER_C0_FETCH_LOG="$RECOVER_C0_FETCH_LOG" \
  bash "$RECOVER" </dev/null 2>&1)"
RECOVER_C0_RC=$?
set -e
assert "recover C0 embedding URL은 health fetch 전 exit 2" test "$RECOVER_C0_RC" -eq 2
assert "recover C0 embedding URL은 fetch boundary 호출 0" test ! -s "$RECOVER_C0_FETCH_LOG"
assert "recover C0 embedding URL 원문 canary는 stdout/stderr에 없음" \
  sh -c '! printf %s "$1" | grep -Fq "$2"' sh "$RECOVER_C0_OUT" "$RECOVER_C0_CANARY"

# Git 주소는 intended local/HTTPS/SSH 형태만 허용한다. remote-helper와 다중 authority는
# credential·subprocess 경계를 우회할 수 있으므로 git/gh 호출 전에 거부한다.
for unsafe_kind in ext_helper unknown_scheme multi_at_ssh; do
  : > "$INLINE_ARGV_LOG"
  case "$unsafe_kind" in
    ext_helper) UNSAFE_REPO="ext::sh -c $SECRET" ;;
    unknown_scheme) UNSAFE_REPO="ftp://example.invalid/$SECRET/repo.git" ;;
    multi_at_ssh) UNSAFE_REPO="ssh://fixture@${SECRET}@example.invalid/repo.git" ;;
  esac
  set +e
  UNSAFE_OUT="$(PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR" \
    BACKUP_DIR="$HOME_DIR/$unsafe_kind-rejected" RESTORE_REPO="$UNSAFE_REPO" \
    bash "$RECOVER" </dev/null 2>&1)"
  UNSAFE_RC=$?
  set -e
  assert "$unsafe_kind 저장소 주소는 subprocess 전 exit 2" test "$UNSAFE_RC" -eq 2
  assert "$unsafe_kind 저장소 주소는 git/gh argv 호출 없음" test ! -s "$INLINE_ARGV_LOG"
  assert_secret_absent "$unsafe_kind 저장소 canary는 stdout/stderr에 없음" "$UNSAFE_OUT"
done

# 기존 origin 자체에 credential이 있으면 요청 URL 비교나 pull보다 먼저 거부해야 한다.
EXISTING_CRED="$TMP/existing-credential-origin"
git -C "$EXISTING_CRED" init -q 2>/dev/null || { mkdir -p "$EXISTING_CRED"; git -C "$EXISTING_CRED" init -q; }
git -C "$EXISTING_CRED" remote add origin "https://fixture-user:$SECRET@example.invalid/u/r.git"
set +e
EXISTING_CRED_OUT="$(HOME="$HOME_DIR" BACKUP_DIR="$EXISTING_CRED" \
  RESTORE_REPO="https://example.invalid/u/other.git" bash "$RECOVER" </dev/null 2>&1)"
EXISTING_CRED_RC=$?
set -e
assert "credential-bearing existing origin은 비교/pull 전 exit 2" test "$EXISTING_CRED_RC" -eq 2
assert_secret_absent "existing origin 거부 로그에 secret 없음" "$EXISTING_CRED_OUT"

# owner/repo가 같아도 host가 다르면 같은 저장소가 아니다.
HOST_REPO="$TMP/host-identity-repo"
mkdir -p "$HOST_REPO"
git -C "$HOST_REPO" init -q
git -C "$HOST_REPO" remote add origin "https://github.invalid/u/r.git"
HOST_BIN="$TMP/host-bin"
mkdir -p "$HOST_BIN"
REAL_GIT="$(command -v git)"
cat > "$HOST_BIN/git" <<SH
#!/bin/sh
case "\$*" in *" pull "*|*" pull") exit 1;; esac
exec "$REAL_GIT" "\$@"
SH
cat > "$HOST_BIN/npm" <<'SH'
#!/bin/sh
exit 99
SH
chmod +x "$HOST_BIN/git" "$HOST_BIN/npm"
set +e
HOST_OUT="$(PATH="$HOST_BIN:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$HOST_REPO" \
  RESTORE_REPO="https://gitlab.invalid/u/r.git" bash "$RECOVER" </dev/null 2>&1)"
HOST_RC=$?
set -e
assert "서로 다른 host의 같은 owner/repo는 기존 폴더에서 거부" sh -c '[ "$1" -ne 0 ] && printf %s "$2" | grep -q "다른 백업 저장소"' sh "$HOST_RC" "$HOST_OUT"
assert "host 충돌 진단에 두 host identity 포함" sh -c 'printf %s "$1" | grep -q github.invalid && printf %s "$1" | grep -q gitlab.invalid' sh "$HOST_OUT"

# matching existing origin이라도 pull --ff-only 실패는 stale snapshot을 복구하지 않고 즉시 중단한다.
PULL_REPO="$TMP/pull-failure-repo"; mkdir -p "$PULL_REPO"; git -C "$PULL_REPO" init -q
PULL_URL="https://example.invalid/u/r.git"; git -C "$PULL_REPO" remote add origin "$PULL_URL"
PULL_NPM_LOG="$TMP/pull-npm.log"; : > "$PULL_NPM_LOG"
cat > "$HOST_BIN/npm" <<'SH'
#!/bin/sh
printf 'called\n' >> "$PULL_NPM_LOG"
exit 99
SH
chmod +x "$HOST_BIN/npm"
set +e
PULL_OUT="$(PATH="$HOST_BIN:$PATH" PULL_NPM_LOG="$PULL_NPM_LOG" HOME="$HOME_DIR" BACKUP_DIR="$PULL_REPO" \
  RESTORE_REPO="$PULL_URL" bash "$RECOVER" </dev/null 2>&1)"
PULL_RC=$?
set -e
assert "existing origin pull 실패는 즉시 non-zero" test "$PULL_RC" -ne 0
assert "pull 실패 뒤 install/build 진입 없음" test ! -s "$PULL_NPM_LOG"
assert "pull 실패를 명시하고 복구 완료를 출력하지 않음" sh -c 'printf %s "$1" | grep -q "pull" && ! printf %s "$1" | grep -q "복구 완료"' sh "$PULL_OUT"

# 검증한 origin과 branch upstream이 달라도 실제 소비자는 반드시 origin이어야 한다.
UPSTREAM_ORIGIN="$TMP/upstream-origin.git"
UPSTREAM_OTHER="$TMP/upstream-other.git"
UPSTREAM_SOURCE="$TMP/upstream-source"
UPSTREAM_OTHER_WORK="$TMP/upstream-other-work"
UPSTREAM_EXISTING="$TMP/upstream-existing"
UPSTREAM_BIN="$TMP/upstream-bin"
git init -q --bare "$UPSTREAM_ORIGIN"
git init -q --bare "$UPSTREAM_OTHER"
mkdir -p "$UPSTREAM_SOURCE" "$UPSTREAM_BIN"
git -C "$UPSTREAM_SOURCE" init -q
git -C "$UPSTREAM_SOURCE" config user.name fixture
git -C "$UPSTREAM_SOURCE" config user.email fixture@example.invalid
printf '%s\n' 'shared base' > "$UPSTREAM_SOURCE/canonical.md"
git -C "$UPSTREAM_SOURCE" add canonical.md
git -C "$UPSTREAM_SOURCE" commit -qm "fixture: shared base"
UPSTREAM_BRANCH="$(git -C "$UPSTREAM_SOURCE" symbolic-ref --short HEAD)"
git -C "$UPSTREAM_SOURCE" remote add origin "$UPSTREAM_ORIGIN"
git -C "$UPSTREAM_SOURCE" push -q origin "HEAD:refs/heads/$UPSTREAM_BRANCH"
git -C "$UPSTREAM_SOURCE" push -q "$UPSTREAM_OTHER" "HEAD:refs/heads/$UPSTREAM_BRANCH"
git --git-dir="$UPSTREAM_ORIGIN" symbolic-ref HEAD "refs/heads/$UPSTREAM_BRANCH"
git --git-dir="$UPSTREAM_OTHER" symbolic-ref HEAD "refs/heads/$UPSTREAM_BRANCH"
git clone -q "$UPSTREAM_ORIGIN" "$UPSTREAM_EXISTING"
git clone -q "$UPSTREAM_OTHER" "$UPSTREAM_OTHER_WORK"

ORIGIN_ONLY_MARKER="verified-origin-$RANDOM-$$"
printf '%s\n' "$ORIGIN_ONLY_MARKER" >> "$UPSTREAM_SOURCE/canonical.md"
git -C "$UPSTREAM_SOURCE" add canonical.md
git -C "$UPSTREAM_SOURCE" commit -qm "fixture: verified origin incoming"
git -C "$UPSTREAM_SOURCE" push -q origin "HEAD:refs/heads/$UPSTREAM_BRANCH"
UPSTREAM_ORIGIN_SHA="$(git --git-dir="$UPSTREAM_ORIGIN" rev-parse "refs/heads/$UPSTREAM_BRANCH")"

OTHER_ONLY_MARKER="unverified-upstream-$RANDOM-$$"
git -C "$UPSTREAM_OTHER_WORK" config user.name fixture
git -C "$UPSTREAM_OTHER_WORK" config user.email fixture@example.invalid
printf '%s\n' "$OTHER_ONLY_MARKER" >> "$UPSTREAM_OTHER_WORK/canonical.md"
git -C "$UPSTREAM_OTHER_WORK" add canonical.md
git -C "$UPSTREAM_OTHER_WORK" commit -qm "fixture: unverified upstream incoming"
git -C "$UPSTREAM_OTHER_WORK" push -q origin "HEAD:refs/heads/$UPSTREAM_BRANCH"
UPSTREAM_OTHER_SHA="$(git --git-dir="$UPSTREAM_OTHER" rev-parse "refs/heads/$UPSTREAM_BRANCH")"

git -C "$UPSTREAM_EXISTING" remote add other "$UPSTREAM_OTHER"
git -C "$UPSTREAM_EXISTING" config "branch.$UPSTREAM_BRANCH.remote" other
git -C "$UPSTREAM_EXISTING" config "branch.$UPSTREAM_BRANCH.merge" "refs/heads/$UPSTREAM_BRANCH"
cat > "$UPSTREAM_BIN/npm" <<'SH'
#!/bin/sh
exit 23
SH
chmod +x "$UPSTREAM_BIN/npm"
set +e
UPSTREAM_OUT="$(PATH="$UPSTREAM_BIN:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$UPSTREAM_EXISTING" \
  RESTORE_REPO="$UPSTREAM_ORIGIN" LOCALMIND_ENV_FILE="$ENV_FILE" bash "$RECOVER" </dev/null 2>&1)"
UPSTREAM_RC=$?
set -e
assert "upstream-confusion fixture는 서로 다른 incoming SHA" test "$UPSTREAM_ORIGIN_SHA" != "$UPSTREAM_OTHER_SHA"
assert "recover는 검증된 origin SHA를 소비" test "$(git -C "$UPSTREAM_EXISTING" rev-parse HEAD)" = "$UPSTREAM_ORIGIN_SHA"
assert "verified origin marker가 worktree에 존재" grep -Fq "$ORIGIN_ONLY_MARKER" "$UPSTREAM_EXISTING/canonical.md"
assert "unverified upstream marker는 worktree에 없음" sh -c '! grep -Fq "$1" "$2"' sh "$OTHER_ONLY_MARKER" "$UPSTREAM_EXISTING/canonical.md"
assert "verified origin pull 뒤 설치 stub에서만 중단" sh -c '[ "$1" -ne 0 ] && printf %s "$2" | grep -q "최신 백업으로 업데이트" && printf %s "$2" | grep -q "설치 실패"' sh "$UPSTREAM_RC" "$UPSTREAM_OUT"

NO_ORIGIN_REPO="$TMP/no-origin-repo"; mkdir -p "$NO_ORIGIN_REPO"; git -C "$NO_ORIGIN_REPO" init -q
: > "$PULL_NPM_LOG"
set +e
NO_ORIGIN_OUT="$(PATH="$HOST_BIN:$PATH" PULL_NPM_LOG="$PULL_NPM_LOG" HOME="$HOME_DIR" BACKUP_DIR="$NO_ORIGIN_REPO" \
  RESTORE_REPO="https://example.invalid/u/r.git" bash "$RECOVER" </dev/null 2>&1)"
NO_ORIGIN_RC=$?
set -e
assert "RESTORE_REPO 명시 + origin 없음은 provenance 실패" test "$NO_ORIGIN_RC" -ne 0
assert "origin provenance 실패 뒤 install/build 진입 없음" test ! -s "$PULL_NPM_LOG"
assert "origin 없음 진단 후 복구 완료 억제" sh -c 'printf %s "$1" | grep -q "origin" && ! printf %s "$1" | grep -q "복구 완료"' sh "$NO_ORIGIN_OUT"

: > "$INLINE_ARGV_LOG"
# TTY 경로의 선행 .env 생성 prompt가 URL payload를 소비하지 않도록 temp 설정을 준비한다.
printf 'NOTES_DIR=canonical=%s\n' "$HOME_DIR/interactive-rejected" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
PTY_RUNNER="$TMP/pty-run.py"
cat > "$PTY_RUNNER" <<'PY'
import errno, os, pty, select, subprocess, sys, time
payload = sys.stdin.buffer.read()
responses = payload.splitlines(keepends=True)
master, slave = pty.openpty()
child = subprocess.Popen(["bash", sys.argv[1]], stdin=slave, stdout=slave, stderr=slave, env=os.environ.copy(), close_fds=True)
os.close(slave)
out = bytearray()
sent = 0
deadline = time.monotonic() + 20
while True:
    ready, _, _ = select.select([master], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(master, 65536)
            if not chunk:
                break
            out.extend(chunk)
            if sent == 0 and b"[Y/n]" in out and responses:
                os.write(master, responses[0])
                sent = 1
            if sent == 1 and b"(URL)" in out and len(responses) > 1:
                os.write(master, responses[1])
                sent = 2
        except OSError as exc:
            if exc.errno != errno.EIO:
                raise
            break
    if child.poll() is not None and not ready:
        break
    if time.monotonic() >= deadline:
        child.terminate()
        child.wait(timeout=5)
        out.extend(b"\n[pty fixture timeout]\n")
        break
try:
    os.close(master)
except OSError:
    pass
sys.stdout.buffer.write(out)
sys.exit(child.wait())
PY
set +e
INTERACTIVE_OUT="$(
  export PATH="$INLINE_BIN:$PATH" INLINE_ARGV_LOG="$INLINE_ARGV_LOG" HOME="$HOME_DIR"
  export BACKUP_DIR="$HOME_DIR/interactive-rejected" RESTORE_REPO= LOCALMIND_ENV_FILE="$ENV_FILE"
  printf '\n%s\n' "HTTPS://fixture-user:$SECRET@example.invalid/brain.git" | python3 "$PTY_RUNNER" "$RECOVER" 2>&1
)"
INTERACTIVE_RC=$?
set -e
if [ "${RECOVER_TEST_DIAGNOSTICS:-}" = "1" ] && [ "$INTERACTIVE_RC" -ne 2 ]; then
  case "$INTERACTIVE_OUT" in *"$SECRET"*) printf '%s\n' '[secret-containing interactive output suppressed]' ;; *) printf '%s\n' "$INTERACTIVE_OUT" ;; esac
  printf 'interactive_rc=%s\n' "$INTERACTIVE_RC"
fi
assert "대화형 최종 userinfo URL도 exit 2" test "$INTERACTIVE_RC" -eq 2
INTERACTIVE_ARGV="$(cat "$INLINE_ARGV_LOG" 2>/dev/null || true)"
assert_secret_absent "대화형 URL이 git/gh argv에 도달하지 않음" "$INTERACTIVE_ARGV"
assert_secret_absent "대화형 오류 로그에 secret 없음" "$INTERACTIVE_OUT"

NOTE="$SOURCE_REPO/canonical.md"
git init -q --bare "$REMOTE_REPO"
git -C "$SOURCE_REPO" init -q
git -C "$SOURCE_REPO" config user.name fixture
git -C "$SOURCE_REPO" config user.email fixture@example.invalid
git -C "$SOURCE_REPO" remote add origin "$REMOTE_REPO"
printf '# Clean-room 정본\n\n%s 는 복구 뒤 새 프로세스에서도 검색되어야 한다.\n' "$MARKER" > "$NOTE"
set +e
SOURCE_FINGERPRINT="$(HOME="$HOME_DIR" NOTES_DIR="canonical=$SOURCE_REPO" BRAIN_INDEX="$STATE_DIR/source-index.json" \
  QUERY_LOG="$STATE_DIR/source-query-log.jsonl" NODE_OPTIONS= \
  node --import tsx/esm -e \
  'import("./src/mcp-server.ts").then((m) => process.stdout.write(String(m.brainRootFingerprint()))).catch((e) => { console.error(e.message); process.exit(1); })' \
  2>"$TMP/source-identity.err")"
SOURCE_ID_RC=$?
set -e
SOURCE_ROOT_ID="$(tr -d '\r\n' < "$SOURCE_REPO/.localmind-brain-id" 2>/dev/null || true)"
assert "source identity를 production brainRootFingerprint로 생성" test "$SOURCE_ID_RC" -eq 0
assert "source marker가 UUID v4" grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' <<< "$SOURCE_ROOT_ID"
assert "source fingerprint가 SHA-256 형식" grep -Eq '^[0-9a-f]{64}$' <<< "$SOURCE_FINGERPRINT"
printf '%s\n' 'stale lock owner metadata' > "$SOURCE_REPO/.brain-index.json.lock.guard"
git -C "$SOURCE_REPO" add .brain-index.json.lock.guard
git -C "$SOURCE_REPO" commit -qm "fixture: pretracked derived lock guard"

# production opt-in query-log backup이 source worktree가 아니라 remote publish 결과에 포함돼야 한다.
DEGRADED_LOG_MARKER="phase2-degraded-log-$RANDOM-$$"
DEGRADED_LOG_SRC="$STATE_DIR/source-query-log.jsonl"
printf '{"ts":"2026-08-09T00:00:00.000Z","tool":"search_notes","query":"%s"}\n' "$DEGRADED_LOG_MARKER" > "$DEGRADED_LOG_SRC"
set +e
BACKUP_OUT="$(HOME="$HOME_DIR" BACKUP_DIR="$SOURCE_REPO" BACKUP_EXTRA_FILES= BACKUP_QUERY_LOG=1 \
  QUERY_LOG="$DEGRADED_LOG_SRC" BACKUP_CONFIRM_EMPTY_ASSETS=1 bash "$BACKUP" </dev/null 2>&1)"
BACKUP_RC=$?
set -e
SOURCE_BRANCH="$(git -C "$SOURCE_REPO" symbolic-ref --short HEAD)"
SOURCE_PUBLISHED_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
REMOTE_PUBLISHED_SHA="$(git --git-dir="$REMOTE_REPO" rev-parse "refs/heads/$SOURCE_BRANCH" 2>/dev/null || true)"
assert "production backup이 clean-room 정본을 커밋·push" test "$BACKUP_RC" -eq 0
assert "backup 성공 로그가 거짓 성공이 아님" grep -q "백업 완료" <<< "$BACKUP_OUT"
assert "bare remote가 source production backup SHA를 수신" test "$REMOTE_PUBLISHED_SHA" = "$SOURCE_PUBLISHED_SHA"
assert "remote backup commit에 Markdown 정본 포함" git --git-dir="$REMOTE_REPO" cat-file -e "$REMOTE_PUBLISHED_SHA:canonical.md"
assert "deployment marker는 source와 remote backup commit에서 제외" sh -c \
  '! git -C "$1" cat-file -e HEAD:.localmind-brain-id 2>/dev/null && ! git --git-dir="$2" cat-file -e "$3:.localmind-brain-id" 2>/dev/null' \
  sh "$SOURCE_REPO" "$REMOTE_REPO" "$REMOTE_PUBLISHED_SHA"
assert "pretracked lock.guard도 remote backup commit에서 제거" sh -c \
  '! git --git-dir="$1" cat-file -e "$2:.brain-index.json.lock.guard" 2>/dev/null' sh "$REMOTE_REPO" "$REMOTE_PUBLISHED_SHA"
assert "production opt-in query log가 remote backup commit에 포함" sh -c \
  'git --git-dir="$1" ls-tree -r --name-only "$2" | grep -qE "^query-log\\..*\\.jsonl$"' sh "$REMOTE_REPO" "$REMOTE_PUBLISHED_SHA"

# production backup의 core failure는 recover 입력을 만들 수 없다고 명시해야 한다.
BROKEN_REPO="$TMP/broken-backup"
mkdir -p "$BROKEN_REPO"
git -C "$BROKEN_REPO" init -q
git -C "$BROKEN_REPO" config user.name ""
git -C "$BROKEN_REPO" config user.email ""
printf '커밋되면 안 되는 정본\n' > "$BROKEN_REPO/uncommitted.md"
set +e
BROKEN_BACKUP_OUT="$(HOME="$HOME_DIR" BACKUP_DIR="$BROKEN_REPO" BACKUP_EXTRA_FILES= BACKUP_QUERY_LOG=0 \
  BACKUP_CONFIRM_EMPTY_ASSETS=1 bash "$BACKUP" </dev/null 2>&1)"
BROKEN_BACKUP_RC=$?
set -e
assert "backup 미커밋은 core 실패(exit 2)" test "$BROKEN_BACKUP_RC" -eq 2
assert "backup 미커밋이 완료로 보고되지 않음" sh -c '! printf %s "$1" | grep -q "✓ 백업 완료"' sh "$BROKEN_BACKUP_OUT"

# Docker가 호출되면 흔적을 남기고 실패한다. great-reduction 복구에는 Docker가 필요 없어야 한다.
cat > "$TMP/bin/docker" <<'SH'
#!/bin/sh
printf 'called\n' >> "$DOCKER_LOG"
[ "${FAKE_DOCKER_OK:-}" = "1" ] && exit 0
exit 97
SH
chmod +x "$TMP/bin/docker"

# /v1/embeddings는 정상, /fail/v1/embeddings는 의도적으로 실패한다.
cat > "$TMP/embedding-stub.mjs" <<'JS'
import http from "node:http";
import fs from "node:fs";
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if ((req.url || "").includes("/fail/") && (req.url || "").endsWith("/embeddings")) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "fixture failure" }));
      return;
    }
    if ((req.url || "").endsWith("/embeddings")) {
      const input = JSON.parse(raw || "{}").input || [];
      res.end(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [1, 0, 0, 0] })) }));
      return;
    }
    res.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
  });
});
server.on("error", () => {
  fs.writeFileSync(process.env.PORT_FILE, "unavailable");
  process.exit(0);
});
server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(process.env.PORT_FILE, String(server.address().port));
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
JS
PORT_FILE="$PORT_FILE" node "$TMP/embedding-stub.mjs" &
STUB_PID=$!
tries=0
while [ ! -s "$PORT_FILE" ] && [ "$tries" -lt 100 ]; do
  sleep 0.05
  tries=$((tries+1))
done
if [ ! -s "$PORT_FILE" ]; then
  no "로컬 embedding stub 기동"
  printf '\n  통과 %d · 실패 %d\n' "$pass" "$fail"
  exit 1
fi
PORT="$(cat "$PORT_FILE")"
NODE_PRELOAD=""
if [ "$PORT" = "unavailable" ]; then
  # 일부 코드 실행 샌드박스는 loopback bind 자체를 금지한다. 일반 CI/로컬에서는 위 실제
  # HTTP stub을 쓰고, 그 환경에서만 자식 Node의 fetch를 같은 응답으로 대체한다.
  cat > "$TMP/fetch-stub.mjs" <<'JS'
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (target.includes("/fail/") && target.endsWith("/embeddings")) {
    return { ok: false, status: 500, text: async () => "fixture failure" };
  }
  const input = JSON.parse(String(init.body || "{}")).input || [];
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0, 0, 0] })) }),
    text: async () => "",
  };
};
JS
  NODE_PRELOAD="--import=$TMP/fetch-stub.mjs"
  BASE="http://embedding.stub.invalid"
  wait "$STUB_PID" >/dev/null 2>&1 || true
  STUB_PID=""
else
  BASE="http://127.0.0.1:$PORT"
fi

cat > "$ENV_FILE" <<EOF
EMBEDDINGS_URL=$BASE/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=$SECRET
NOTES_DIR=canonical=$RESTORED
BRAIN_INDEX=$STATE_DIR/index.json
EOF
chmod 600 "$ENV_FILE"

set +e
SUCCESS_OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$RESTORED" RESTORE_REPO="$REMOTE_REPO" \
  LOCALMIND_ENV_FILE="$ENV_FILE" QUERY_LOG="$STATE_DIR/recover-query-log.jsonl" EMBED_RETRIES=1 \
  NODE_OPTIONS="$NODE_PRELOAD" DOCKER_LOG="$DOCKER_LOG" LITELLM_MASTER_KEY= bash "$RECOVER" </dev/null 2>&1)"
SUCCESS_RC=$?
set -e
if [ "${RECOVER_TEST_DIAGNOSTICS:-}" = "1" ]; then
  case "$SUCCESS_OUT" in
    *"$SECRET"*) printf '%s\n' '[secret-containing recover output suppressed]' ;;
    *) printf '%s\n' "$SUCCESS_OUT" ;;
  esac
fi

assert "clean-room recover가 Docker 없이 성공" test "$SUCCESS_RC" -eq 0
assert "recover가 Docker를 호출하지 않음" test ! -s "$DOCKER_LOG"
assert "복구 완료를 출력" grep -q "복구 완료" <<< "$SUCCESS_OUT"
assert_secret_absent "현대 EMBEDDINGS_KEY secret을 출력하지 않음" "$SUCCESS_OUT"
assert "Markdown 정본이 byte-equal" cmp -s "$NOTE" "$RESTORED/canonical.md"
assert "명시한 BRAIN_INDEX에 색인 생성" test -f "$STATE_DIR/index.json"
assert "fresh recover clone의 origin이 bare backup remote" test "$(git -C "$RESTORED" remote get-url origin)" = "$REMOTE_REPO"
assert "fresh clone은 source host marker를 물려받지 않음" test ! -e "$RESTORED/.localmind-brain-id"
set +e
RESTORED_FINGERPRINT="$(HOME="$HOME_DIR" NOTES_DIR="canonical=$RESTORED" BRAIN_INDEX="$STATE_DIR/index.json" \
  QUERY_LOG="$STATE_DIR/identity-query-log.jsonl" NODE_OPTIONS= \
  node --import tsx/esm -e \
  'import("./src/mcp-server.ts").then((m) => process.stdout.write(String(m.brainRootFingerprint()))).catch((e) => { console.error(e.message); process.exit(1); })' \
  2>"$TMP/restored-identity.err")"
RESTORED_ID_RC=$?
set -e
RESTORED_ROOT_ID="$(tr -d '\r\n' < "$RESTORED/.localmind-brain-id" 2>/dev/null || true)"
assert "fresh recover identity를 별도 production child에서 생성" test "$RESTORED_ID_RC" -eq 0
assert "restored marker가 UUID v4" grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' <<< "$RESTORED_ROOT_ID"
assert "source와 restored root UUID가 다름" test "$RESTORED_ROOT_ID" != "$SOURCE_ROOT_ID"
assert "restored fingerprint가 SHA-256이고 source와 다름" sh -c \
  'printf %s "$1" | grep -Eq "^[0-9a-f]{64}$" && [ "$1" != "$2" ]' sh "$RESTORED_FINGERPRINT" "$SOURCE_FINGERPRINT"

set +e
SEARCH_OUT="$(HOME="$HOME_DIR" NOTES_DIR="canonical=$RESTORED" BRAIN_INDEX="$STATE_DIR/index.json" \
  QUERY_LOG="$STATE_DIR/fresh-query-log.jsonl" EMBEDDINGS_URL="$BASE/v1" EMBEDDINGS_MODEL=fixture-model \
  EMBEDDINGS_KEY="$SECRET" LITELLM_MASTER_KEY= EMBED_RETRIES=1 MARKER="$MARKER" NODE_OPTIONS="$NODE_PRELOAD" \
  node --import tsx/esm -e \
  'import("./src/brain.ts").then(async (m) => process.stdout.write(JSON.stringify(await m.searchNotes(process.env.MARKER)))).catch((e) => { console.error(e.message); process.exit(1); })' \
  2>&1)"
SEARCH_RC=$?
set -e
assert "새 Node 프로세스 search 성공" test "$SEARCH_RC" -eq 0
assert "새 프로세스가 고유 marker 검색" grep -Fq "$MARKER" <<< "$SEARCH_OUT"
assert_secret_absent "fresh search도 secret을 출력하지 않음" "$SEARCH_OUT"

# existing clone의 production pull은 실제 incoming commit을 받아야 한다(no-op pull green 금지).
EXISTING_BEFORE_PULL_SHA="$(git -C "$RESTORED" rev-parse HEAD)"
INCOMING_MARKER="phase2-incoming-$RANDOM-$$"
printf '\n%s 는 existing clone pull 뒤 fresh process에서도 검색되어야 한다.\n' "$INCOMING_MARKER" >> "$NOTE"
set +e
INCOMING_BACKUP_OUT="$(HOME="$HOME_DIR" BACKUP_DIR="$SOURCE_REPO" BACKUP_EXTRA_FILES= BACKUP_QUERY_LOG=0 \
  BACKUP_CONFIRM_EMPTY_ASSETS=1 bash "$BACKUP" </dev/null 2>&1)"
INCOMING_BACKUP_RC=$?
set -e
SOURCE_INCOMING_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
REMOTE_INCOMING_SHA="$(git --git-dir="$REMOTE_REPO" rev-parse "refs/heads/$SOURCE_BRANCH")"
assert "production backup이 existing clone용 incoming commit을 push" test "$INCOMING_BACKUP_RC" -eq 0
assert "bare remote가 두 번째 source SHA를 수신" test "$REMOTE_INCOMING_SHA" = "$SOURCE_INCOMING_SHA"
set +e
INCOMING_RECOVER_OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$RESTORED" RESTORE_REPO="$REMOTE_REPO" \
  LOCALMIND_ENV_FILE="$ENV_FILE" QUERY_LOG="$STATE_DIR/incoming-recover-query-log.jsonl" EMBED_RETRIES=1 \
  NODE_OPTIONS="$NODE_PRELOAD" DOCKER_LOG="$DOCKER_LOG" LITELLM_MASTER_KEY= bash "$RECOVER" </dev/null 2>&1)"
INCOMING_RECOVER_RC=$?
set -e
assert "incoming remote commit은 existing clone의 이전 SHA와 다름" test "$REMOTE_INCOMING_SHA" != "$EXISTING_BEFORE_PULL_SHA"
assert "existing clone production recover가 incoming pull로 성공" test "$INCOMING_RECOVER_RC" -eq 0
assert "existing clone HEAD가 incoming remote SHA로 전진" test "$(git -C "$RESTORED" rev-parse HEAD)" = "$REMOTE_INCOMING_SHA"
assert "incoming canonical marker가 pull된 worktree에 존재" grep -Fq "$INCOMING_MARKER" "$RESTORED/canonical.md"
set +e
INCOMING_SEARCH_OUT="$(HOME="$HOME_DIR" NOTES_DIR="canonical=$RESTORED" BRAIN_INDEX="$STATE_DIR/index.json" \
  QUERY_LOG="$STATE_DIR/incoming-fresh-query-log.jsonl" EMBEDDINGS_URL="$BASE/v1" EMBEDDINGS_MODEL=fixture-model \
  EMBEDDINGS_KEY="$SECRET" LITELLM_MASTER_KEY= EMBED_RETRIES=1 MARKER="$INCOMING_MARKER" NODE_OPTIONS="$NODE_PRELOAD" \
  node --import tsx/esm -e \
  'import("./src/brain.ts").then(async (m) => process.stdout.write(JSON.stringify(await m.searchNotes(process.env.MARKER)))).catch((e) => { console.error(e.message); process.exit(1); })' \
  2>&1)"
INCOMING_SEARCH_RC=$?
set -e
assert "incoming commit reindex 뒤 fresh process search 성공" test "$INCOMING_SEARCH_RC" -eq 0
assert "fresh process search가 incoming marker를 반환" grep -Fq "$INCOMING_MARKER" <<< "$INCOMING_SEARCH_OUT"
assert_secret_absent "incoming pull/search도 secret을 출력하지 않음" "$INCOMING_RECOVER_OUT$INCOMING_SEARCH_OUT"

# extras 복원만 실패하는 partial recovery: reindex/assets는 계속하되 최종 성공이면 안 된다.
mkdir -p "$RESTORED/extras/blocked"
printf '%s\n' 'extra fixture' > "$RESTORED/extras/blocked/file.txt"
printf '%s\n' 'regular file blocks destination directory' > "$HOME_DIR/blocked"
set +e
EXTRAS_FAIL_OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$RESTORED" RESTORE_REPO="$REMOTE_REPO" \
  LOCALMIND_ENV_FILE="$ENV_FILE" QUERY_LOG="$STATE_DIR/extras-fail-query-log.jsonl" EMBED_RETRIES=1 \
  NODE_OPTIONS="$NODE_PRELOAD" DOCKER_LOG="$DOCKER_LOG" LITELLM_MASTER_KEY= bash "$RECOVER" </dev/null 2>&1)"
EXTRAS_FAIL_RC=$?
set -e
assert "extras 복원만 실패해도 recover 최종 non-zero" test "$EXTRAS_FAIL_RC" -ne 0
assert "extras 실패 뒤 복구 완료를 출력하지 않음" sh -c '! printf %s "$1" | grep -q "복구 완료"' sh "$EXTRAS_FAIL_OUT"
assert "extras 실패 뒤에도 reindex 수행" grep -q "노트 색인 완료" <<< "$EXTRAS_FAIL_OUT"
assert "extras 실패 뒤에도 자산 복원 수행" grep -q "페르소나·스킬 복원 확인" <<< "$EXTRAS_FAIL_OUT"
assert_secret_absent "extras partial failure 로그에도 secret 없음" "$EXTRAS_FAIL_OUT"
rm -rf "$RESTORED/extras"
rm -f "$HOME_DIR/blocked"

# 같은 백업을 별도 clean-room으로 복구하되 embedding 요청을 실패시킨다.
FAIL_RESTORED="$HOME_DIR/failing-brain"
FAIL_STATE="$HOME_DIR/failing-state"
FAIL_ENV="$HOME_DIR/recover-fail.env"
mkdir -p "$FAIL_STATE"
cat > "$FAIL_ENV" <<EOF
EMBEDDINGS_URL=$BASE/fail/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=$SECRET
NOTES_DIR=canonical=$FAIL_RESTORED
BRAIN_INDEX=$FAIL_STATE/index.json
EOF
chmod 600 "$FAIL_ENV"

set +e
FAIL_OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_DIR" BACKUP_DIR="$FAIL_RESTORED" RESTORE_REPO="$REMOTE_REPO" \
  LOCALMIND_ENV_FILE="$FAIL_ENV" QUERY_LOG="$FAIL_STATE/query-log.jsonl" EMBED_RETRIES=1 FAKE_DOCKER_OK=1 \
  NODE_OPTIONS="$NODE_PRELOAD" DOCKER_LOG="$DOCKER_LOG" LITELLM_MASTER_KEY= bash "$RECOVER" </dev/null 2>&1)"
FAIL_RC=$?
set -e
assert "실제 reindex 실패는 recover 비0" test "$FAIL_RC" -ne 0
assert "reindex 실패 뒤 복구 완료를 출력하지 않음" sh -c '! printf %s "$1" | grep -q "복구 완료"' sh "$FAIL_OUT"
assert "reindex 실패 뒤에도 자산·로그 복원 단계 실행" grep -q "페르소나·스킬 복원 확인" <<< "$FAIL_OUT"
assert "reindex 실패 뒤에도 query log 병합" grep -Fq "$DEGRADED_LOG_MARKER" "$FAIL_STATE/query-log.jsonl"
assert_secret_absent "실패 로그에도 secret을 출력하지 않음" "$FAIL_OUT"

printf '\nPhase 2 recover clean-room 결과: %d 통과, %d 실패\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
