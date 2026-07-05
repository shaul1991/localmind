#!/usr/bin/env bash
# specs/031 — device-sync 파이프라인 테스트(가짜 ssh/gh/make + pass-through git shim).
# 실행: bash scripts/device-sync-pipeline.test.sh
# 실기기(실 ssh·원격 node)는 CI 재현 불가 — 수동 스모크로 분리(plan). 여기서는 단계
# 로직·게이트·파괴-부재를 결정적으로 검증한다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"; mkdir -p "$BIN"
git_id() { git -C "$1" config user.email t@t; git -C "$1" config user.name t; }

# ── 스텁: ssh(호출 기록 + 명령을 로컬 실행), gh(GH_MODE), make(backup 신호), git(로깅 통과) ──
cat > "$BIN/ssh" <<'S'
#!/bin/sh
echo "SSH $@" >> "${SSH_LOG:-/dev/null}"
echo "EVT ssh $1" >> "${EVT_LOG:-/dev/null}"
host="$1"; shift
# 실 ssh 충실도(codex block 2): 주 기기 환경변수를 원격에 넘기지 않는다 — 원격 자체
# 환경(REMOTE_*)으로 대체하고, 주 기기 전용 변수는 비운다(워커의 자기 해석 검증).
HOME="${REMOTE_HOME:-$HOME}" \
LOCALMIND_PROJECT_DIR="" \
LOCALMIND_ENV_FILE="${REMOTE_ENV_FILE:-/nonexistent}" \
BACKUP_DIR="${REMOTE_BACKUP_DIR:-${REMOTE_HOME:-$HOME}/.localmind}" \
LOCALMIND_CLAUDE_AGENTS_DIR="${REMOTE_CLAUDE_AGENTS_DIR:-}" \
sh -c "$*"
S
cat > "$BIN/gh" <<'S'
#!/bin/sh
echo "EVT gh $1" >> "${EVT_LOG:-/dev/null}"
case "${GH_MODE:-success}" in notinstalled) exit 127;; esac
case "$1" in
  --version) exit 0;;
  auth) [ "${GH_MODE:-success}" = "noauth" ] && exit 1 || exit 0;;
  run) case "${GH_MODE:-success}" in
         success) echo "completed:success";;
         failure) echo "completed:failure";;
         running) echo "in_progress:";;
         norun)   echo "";;
       esac;;
esac
exit 0
S
cat > "$BIN/make" <<'S'
#!/bin/sh
echo "MAKE $@" >> "${MAKE_LOG:-/dev/null}"
echo "EVT make $*" >> "${EVT_LOG:-/dev/null}"
case "$*" in *backup*) echo "${MAKE_BK_OUT:-✓ 백업 완료}"; exit "${MAKE_BK_RC:-0}";; esac
exit 0
S
# pass-through 로깅 git shim(031 AC-18 — 전 하위명령 기록 후 실 git 실행: ff 판정 보존)
REAL_GIT="$(command -v git)"
cat > "$BIN/git" <<S
#!/bin/sh
echo "GIT \$@" >> "\${GIT_LOG:-/dev/null}"
exec "$REAL_GIT" "\$@"
S
cat > "$BIN/npm" <<'S'
#!/bin/sh
echo "NPM $@" >> "${NPM_LOG:-/dev/null}"
case "$*" in *build*) [ "${NPM_BUILD_RC:-0}" -ne 0 ] && exit "${NPM_BUILD_RC}"; mkdir -p dist; echo built > dist/mcp.js;; esac
exit 0
S
chmod +x "$BIN"/*

# ── 픽스처: "주 기기" 프로젝트(스크립트 사본 + git repo) ─────────────────────
PROJ="$TMP/proj"; mkdir -p "$PROJ/scripts/lib" "$PROJ/src"
cp "$ROOT/scripts/device-sync.sh" "$PROJ/scripts/"
cp "$ROOT/scripts/device-sync-receive.sh" "$PROJ/scripts/"
cp "$ROOT/scripts/lib/read-env.sh" "$ROOT/scripts/lib/notes-dir.sh" "$PROJ/scripts/lib/"
cat > "$PROJ/scripts/restore-assets.sh" <<'S'
#!/bin/sh
echo "RESTORE $@" >> "${RESTORE_LOG:-/dev/null}"
mkdir -p "${LOCALMIND_CLAUDE_AGENTS_DIR:-$HOME/.claude/agents}"
echo "managed-by: localmind (persona: t)" > "${LOCALMIND_CLAUDE_AGENTS_DIR:-$HOME/.claude/agents}/t.md"
exit "${RESTORE_RC:-0}"
S
chmod +x "$PROJ/scripts/restore-assets.sh"
( cd "$PROJ" && "$REAL_GIT" init -q . && git_id "$PROJ" && "$REAL_GIT" -C "$PROJ" add -A && "$REAL_GIT" -C "$PROJ" commit -qm init )

# 원격 repo(bare + 클론 — ff 가능 상태) + 원격 홈
RBARE="$TMP/remote-proj.git"; RDIR="$TMP/remote-proj"; RHOME="$TMP/remote-home"
"$REAL_GIT" init -q --bare "$RBARE"
"$REAL_GIT" clone -q "$RBARE" "$RDIR" 2>/dev/null || { mkdir -p "$RDIR"; ( cd "$RDIR" && "$REAL_GIT" init -q . ); }
cp -R "$PROJ/scripts" "$RDIR/"; mkdir -p "$RDIR/src" "$RHOME"
( cd "$RDIR" && git_id "$RDIR" && "$REAL_GIT" -C "$RDIR" add -A && "$REAL_GIT" -C "$RDIR" commit -qm init && "$REAL_GIT" -C "$RDIR" push -q -u origin HEAD 2>/dev/null || true )

# 원격 백업 저장소(노트) — ff 가능
NBARE="$TMP/notes.git"; NDIR="$RHOME/.localmind"
"$REAL_GIT" init -q --bare "$NBARE"; mkdir -p "$NDIR"
( cd "$NDIR" && "$REAL_GIT" init -q . && git_id "$NDIR" && echo n > note.md && "$REAL_GIT" -C "$NDIR" add -A && "$REAL_GIT" -C "$NDIR" commit -qm n && "$REAL_GIT" -C "$NDIR" remote add origin "$NBARE" && "$REAL_GIT" -C "$NDIR" push -q -u origin HEAD )

ENVF="$TMP/main.env"
printf 'SYNC_DEVICES="dev=devhost:%s,extra=other:/tmp/x"\n' "$RDIR" > "$ENVF"

run_sync() { # [env K=V ...] — 오케스트레이터 실행
  OUT="$(cd "$PROJ" && PATH="$BIN:$PATH" HOME="$TMP/main-home" \
    LOCALMIND_PROJECT_DIR="$PROJ" LOCALMIND_ENV_FILE="$ENVF" BACKUP_DIR="$TMP/main-home/.localmind" \
    SSH_LOG="$TMP/ssh.log" MAKE_LOG="$TMP/make.log" GIT_LOG="$TMP/git.log" EVT_LOG="$TMP/evt.log" \
    REMOTE_HOME="$RHOME" REMOTE_ENV_FILE="$TMP/recv.env" REMOTE_BACKUP_DIR="$NDIR" \
    REMOTE_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" \
    env "$@" bash scripts/device-sync.sh 2>&1)"
  RC=$?
}
reset_logs() { : > "$TMP/ssh.log"; : > "$TMP/make.log"; : > "$TMP/git.log"; : > "$TMP/evt.log"; : > "$TMP/recv.env"; mkdir -p "$TMP/main-home/.localmind"; }

echo "— 오케스트레이터 —"
# AC-1: 성공 경로 순서(①CI→②backup→③pull→④수신) + 0 종료
reset_logs
run_sync HOST=dev GH_MODE=success LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" RESTORE_LOG="$TMP/restore.log" SYNC_TEST_CMD=true
assert "AC-1: 성공 경로 0 종료" '[ "$RC" -eq 0 ]'
assert "AC-1: 완료 요약(①~④)" 'printf %s "$OUT" | grep -q "동기화 완료" && printf %s "$OUT" | grep -q "④수신"'
assert "AC-1: 순서 ①gh→②make→③ssh(공유 이벤트 로그 라인 비교)" 'g=$(grep -n "EVT gh" "$TMP/evt.log" | head -1 | cut -d: -f1); m=$(grep -n "EVT make" "$TMP/evt.log" | head -1 | cut -d: -f1); s=$(grep -n "EVT ssh" "$TMP/evt.log" | head -1 | cut -d: -f1); [ -n "$g" ] && [ -n "$m" ] && [ -n "$s" ] && [ "$g" -lt "$m" ] && [ "$m" -lt "$s" ]'
assert "AC-8: 수신이 restore-assets 경로를 호출(bare deploy 아님)" 'grep -q RESTORE "$TMP/restore.log"'
assert "AC-11: 배포 마커 검증 통과" 'printf %s "$OUT" | grep -q "managed-by 마커"'

# AC-2/5b: backup 코어(2)=중단, 소프트(1)=계속
reset_logs
run_sync HOST=dev GH_MODE=success MAKE_BK_RC=2 SYNC_TEST_CMD=true
assert "AC-2: backup exit 2 → 중단 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "코어 실패"'
assert "AC-2: 중단 후 ssh 미호출(fail-fast)" '! grep -q "SSH" "$TMP/ssh.log"'
reset_logs
run_sync HOST=dev GH_MODE=success MAKE_BK_RC=1 LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-5b: backup exit 1(소프트) → ③④ 진행 + 최종 비0" '[ "$RC" -ne 0 ] && grep -q "SSH devhost" "$TMP/ssh.log" && printf %s "$OUT" | grep -q "경고 있음"'

# AC-3: CI red/진행 중/기록 없음 → ② 이후 미실행
for mode in failure running norun; do
  reset_logs
  run_sync HOST=dev GH_MODE=$mode
  assert "AC-3: CI $mode → 중단(② 미실행)" '[ "$RC" -ne 0 ] && ! grep -q MAKE "$TMP/make.log" && ! grep -q SSH "$TMP/ssh.log"'
done

# AC-4: gh 부재(exit 127 shim) → 경고 스킵 후 진행 / SYNC_SKIP_CI=1
reset_logs
run_sync HOST=dev GH_MODE=notinstalled LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-4: gh 부재 → 경고 + 계속(0 종료)" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "gh 미설치/미인증"'
reset_logs
run_sync HOST=dev GH_MODE=failure SYNC_SKIP_CI=1 LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-4: SYNC_SKIP_CI=1 → 게이트 우회(경고)" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "SYNC_SKIP_CI"'

# AC-7: 원격 ff 불가 → 원격 불변 + 중단 / repo 부재 → recover 안내
( cd "$RDIR" && echo local > local.md && "$REAL_GIT" -C "$RDIR" add -A && "$REAL_GIT" -C "$RDIR" commit -qm local )
CLONE2="$TMP/clone2"; "$REAL_GIT" clone -q "$RBARE" "$CLONE2"; git_id "$CLONE2"
( cd "$CLONE2" && echo up > up.md && "$REAL_GIT" -C "$CLONE2" add -A && "$REAL_GIT" -C "$CLONE2" commit -qm up && "$REAL_GIT" -C "$CLONE2" push -q )
HEAD_BEFORE="$("$REAL_GIT" -C "$RDIR" rev-parse HEAD)"
reset_logs
run_sync HOST=dev GH_MODE=success SYNC_TEST_CMD=true
assert "AC-7: ff 불가 → 중단 + 안내 + ④ 미실행" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "fast-forward" && ! printf %s "$OUT" | grep -q "수신 완료"'
assert "AC-7/18: 원격 HEAD 불변" '[ "$("$REAL_GIT" -C "$RDIR" rev-parse HEAD)" = "$HEAD_BEFORE" ]'
assert "AC-18: 파괴 git 하위명령 없음(GIT_LOG — 옵션 위치 무관)" '! grep -qE "(^|[[:space:]])(reset|merge|revert|clean)([[:space:]]|$)" "$TMP/git.log" && ! grep -qE "push[^\n]*(--force|[[:space:]]-f([[:space:]]|$))" "$TMP/git.log"'
( cd "$RDIR" && "$REAL_GIT" -C "$RDIR" pull -q --rebase 2>/dev/null || "$REAL_GIT" -C "$RDIR" pull -q --no-rebase --no-edit )
"$REAL_GIT" -C "$RDIR" push -q 2>/dev/null || true
reset_logs
printf 'SYNC_DEVICES="dev=devhost:%s"\n' "$TMP/no-such-dir" > "$TMP/norepo.env"
OUT="$(cd "$PROJ" && PATH="$BIN:$PATH" LOCALMIND_PROJECT_DIR="$PROJ" LOCALMIND_ENV_FILE="$TMP/norepo.env" BACKUP_DIR="$TMP/main-home/.localmind" SSH_LOG="$TMP/ssh.log" MAKE_LOG="$TMP/make.log" env GH_MODE=success bash scripts/device-sync.sh 2>&1)"; RC=$?
assert "AC-7: 원격 repo 부재 → recover 안내 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "recover"'

# AC-13/14/14b/15/16: 설정 해석
reset_logs
run_sync HOST=dev GH_MODE=success LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-13: 라벨 해석(devhost + 원격 경로)" 'grep -q "SSH devhost" "$TMP/ssh.log" && grep -q "remote-proj" "$TMP/ssh.log"'
reset_logs
printf '\n' > "$TMP/empty.env"
OUT="$(cd "$PROJ" && PATH="$BIN:$PATH" LOCALMIND_PROJECT_DIR="$PROJ" LOCALMIND_ENV_FILE="$TMP/empty.env" SSH_LOG="$TMP/ssh.log" MAKE_LOG="$TMP/make.log" bash scripts/device-sync.sh 2>&1)"; RC=$?
assert "AC-14: 미설정 → 안내 + 비0 + ssh/backup 미실행" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "SYNC_DEVICES" && ! grep -q SSH "$TMP/ssh.log" && ! grep -q MAKE "$TMP/make.log"'
reset_logs
OUT="$(cd "$PROJ" && PATH="$BIN:$PATH" LOCALMIND_PROJECT_DIR="$PROJ" LOCALMIND_ENV_FILE="$ENVF" SSH_LOG="$TMP/ssh.log" MAKE_LOG="$TMP/make.log" bash scripts/device-sync.sh 2>&1)"; RC=$?
assert "AC-14b: 복수 라벨 + HOST 생략 → 지정 요구 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "등록된 라벨" && ! grep -q MAKE "$TMP/make.log"'
reset_logs
run_sync HOST=user@raw GH_MODE=success
assert "AC-15: 미지 라벨(raw host) + REMOTE_DIR 없음 → 힌트 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "오타"'
reset_logs
run_sync HOST=user@raw REMOTE_DIR="$RDIR" GH_MODE=success LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-15: raw host + REMOTE_DIR → 진행" '[ "$RC" -eq 0 ] && grep -q "SSH user@raw" "$TMP/ssh.log"'
reset_logs
run_sync HOST=dev GH_MODE=success SYNC_ENV_PREP='export MARKER_PREP=1' LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" SYNC_TEST_CMD=true
assert "AC-16: SYNC_ENV_PREP가 원격 명령에 주입" 'grep -q "MARKER_PREP" "$TMP/ssh.log"'

echo "— 수신 워커(단독 — ssh 불필요) —"
run_recv() { # [env K=V ...]
  OUT="$(cd "$RDIR" && PATH="$BIN:$PATH" HOME="$RHOME" \
    LOCALMIND_PROJECT_DIR="$RDIR" LOCALMIND_ENV_FILE="$TMP/recv.env" BACKUP_DIR="$NDIR" \
    NPM_LOG="$TMP/npm.log" RESTORE_LOG="$TMP/restore.log" GIT_LOG="$TMP/git.log" \
    LOCALMIND_CLAUDE_AGENTS_DIR="$RHOME/claude-agents" \
    env "$@" bash scripts/device-sync-receive.sh 2>&1)"
  RC=$?
}
: > "$TMP/recv.env"

# AC-8/12: 성공 경로 — dist 부재 → build → seed → restore-assets → 마커
rm -rf "$RDIR/dist"; : > "$TMP/npm.log"; : > "$TMP/restore.log"
run_recv SYNC_TEST_CMD=true
assert "AC-8: 수신 성공(0) + 순서(build→검증→복원)" '[ "$RC" -eq 0 ] && grep -q build "$TMP/npm.log" && grep -q RESTORE "$TMP/restore.log"'
assert "AC-12: dist 부재 시 build 실행" 'grep -q "NPM run --silent build" "$TMP/npm.log"'
rm -rf "$RDIR/dist"; : > "$TMP/npm.log"; : > "$TMP/restore.log"
run_recv SYNC_TEST_CMD=true NPM_BUILD_RC=1
assert "AC-12: build 실패 → test·deploy 미실행 + 비0" '[ "$RC" -ne 0 ] && ! grep -q RESTORE "$TMP/restore.log"'
rm -rf "$RDIR/dist"

# AC-10: seed 게이트 — 실패 시 배포 안 함
: > "$TMP/restore.log"
run_recv SYNC_TEST_CMD=false
assert "AC-10: seed 실패 → restore-assets 미실행 + 비0" '[ "$RC" -ne 0 ] && ! grep -q RESTORE "$TMP/restore.log" && printf %s "$OUT" | grep -q "검증 실패"'

# AC-9: 노트 저장소 per-repo 계속(하나 ff 불가여도 나머지 진행)
N2BARE="$TMP/n2.git"; N2="$TMP/n2"; "$REAL_GIT" init -q --bare "$N2BARE"; mkdir -p "$N2"
( cd "$N2" && "$REAL_GIT" init -q . && git_id "$N2" && echo x > x.md && "$REAL_GIT" -C "$N2" add -A && "$REAL_GIT" -C "$N2" commit -qm x && "$REAL_GIT" -C "$N2" remote add origin "$N2BARE" && "$REAL_GIT" -C "$N2" push -q -u origin HEAD )
# n2를 ff 불가로: 원격이 앞서고 로컬에 별도 커밋
NC="$TMP/nc"; "$REAL_GIT" clone -q "$N2BARE" "$NC"; git_id "$NC"
( cd "$NC" && echo up > up.md && "$REAL_GIT" -C "$NC" add -A && "$REAL_GIT" -C "$NC" commit -qm up && "$REAL_GIT" -C "$NC" push -q )
( cd "$N2" && echo local > local.md && "$REAL_GIT" -C "$N2" add -A && "$REAL_GIT" -C "$N2" commit -qm local )
# 백업 저장소(NDIR)는 ff 가능하게 원격에 신규 커밋
NB="$TMP/nb"; "$REAL_GIT" clone -q "$NBARE" "$NB"; git_id "$NB"
( cd "$NB" && echo new > new.md && "$REAL_GIT" -C "$NB" add -A && "$REAL_GIT" -C "$NB" commit -qm new && "$REAL_GIT" -C "$NB" push -q )
printf 'NOTES_DIR="a=%s,b=%s"\n' "$NDIR" "$N2" > "$TMP/recv.env"
N2_HEAD="$("$REAL_GIT" -C "$N2" rev-parse HEAD)"
run_recv SYNC_TEST_CMD=true
assert "AC-9: ff 불가 저장소는 불변 + 요약 명시 + 비0" '[ "$RC" -ne 0 ] && [ "$("$REAL_GIT" -C "$N2" rev-parse HEAD)" = "$N2_HEAD" ] && printf %s "$OUT" | grep -q "수신 불가"'
assert "AC-9: 가능한 저장소(백업)는 pull됨(계속)" '[ -f "$NDIR/new.md" ]'
assert "AC-18: 수신 워커에도 파괴 git 없음(옵션 위치 무관)" '! grep -qE "(^|[[:space:]])(reset|merge|revert|clean)([[:space:]]|$)" "$TMP/git.log"'
: > "$TMP/recv.env"

# AC-17: node 부재(exit 127 shim) → npm 단계 전 중단
NOBIN="$TMP/nobin"; mkdir -p "$NOBIN"; cp "$BIN"/* "$NOBIN/"
printf '#!/bin/sh\nexit 127\n' > "$NOBIN/node"; chmod +x "$NOBIN/node"
: > "$TMP/npm.log"
OUT="$(cd "$RDIR" && PATH="$NOBIN:$PATH" HOME="$RHOME" LOCALMIND_PROJECT_DIR="$RDIR" LOCALMIND_ENV_FILE="$TMP/recv.env" BACKUP_DIR="$NDIR" NPM_LOG="$TMP/npm.log" bash scripts/device-sync-receive.sh 2>&1)"; RC=$?
assert "AC-17: node 부재 → SYNC_ENV_PREP 안내 + npm 미실행 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "SYNC_ENV_PREP" && ! grep -q NPM "$TMP/npm.log"'

echo ""
echo "031 device-sync 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
