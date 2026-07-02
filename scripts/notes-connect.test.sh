#!/usr/bin/env bash
# specs/012 notes-connect.sh 단위 테스트 (네트워크 불필요 — 로컬 bare repo를 원격으로 사용).
# mcp-install은 스텁으로 대체해 전달된 NOTES_DIR·호출 여부만 검증한다.
# NOTES_REPOS_DIR은 FR-17(=$HOME 하위 요구)에 맞춰 TEST_HOME 하위에 둔다.
# 실행: bash scripts/notes-connect.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
NC="${NC_SCRIPT:-$REPO_ROOT/scripts/notes-connect.sh}"
TAB="$(printf '\t')"

pass=0; fail=0
assert() { if eval "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }
has_item() { grep -qF "ITEM${TAB}$1${TAB}$2" "$OUT"; }
has_failed() { grep -qF "${TAB}failed" "$OUT"; }

setup() {
  TMP="$(mktemp -d)"
  TEST_HOME="$TMP/home"; mkdir -p "$TEST_HOME"
  REPOS_DIR="$TEST_HOME/notes"        # FR-17: $HOME 하위
  REMOTES="$TMP/remotes"; mkdir -p "$REMOTES"
  STUB_OUT="$TMP/stub-out.txt"
  ENV_FILE="$TMP/project.env"; : > "$ENV_FILE"
  OUT="$TMP/out.txt"
  STUB="$TMP/stub.sh"
  printf '%s\n' 'printf "%s\n" "${NOTES_DIR:-none}" > "${STUB_OUT:-/dev/null}"; exit "${STUB_RC:-0}"' > "$STUB"
}
teardown() { rm -rf "$TMP"; }

make_bare_repo() {
  local name="$1" work="$REMOTES/$1-work" bare="$REMOTES/$1.git"
  git init -q "$work"; printf '%s-note\n' "$name" > "$work/note.md"
  ( cd "$work" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m note )
  git clone -q --bare "$work" "$bare" >/dev/null 2>&1; echo "$bare"
}
run() {
  local repos="$1" rdir="${2:-$REPOS_DIR}" src="${3:-0}"
  ( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="$repos" NOTES_REPOS_DIR="$rdir" \
    MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" STUB_RC="$src" NOTES_CONNECT_ENV="$ENV_FILE" \
    bash "$NC" >"$OUT" 2>&1 ); echo $?
}

# AC-1 opt-in
setup; rc=$(run ""); assert "AC-1: 미설정 시 NO_REPOS+exit0" '[ "$rc" -eq 0 ] && grep -q NO_REPOS "$OUT"'
assert "AC-1: 스텁 미호출" '[ ! -f "$STUB_OUT" ]'; teardown

# AC-2 .env 폴백
setup; b=$(make_bare_repo work); printf 'NOTES_REPOS="work=%s"\n' "$b" > "$ENV_FILE"
( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="" NOTES_REPOS_DIR="$REPOS_DIR" MCP_INSTALL_CMD="$STUB" \
  STUB_OUT="$STUB_OUT" NOTES_CONNECT_ENV="$ENV_FILE" bash "$NC" >"$OUT" 2>&1 )
assert "AC-2: .env의 NOTES_REPOS로 clone" '[ -d "$REPOS_DIR/work/.git" ]'; teardown

# AC-3/AC-15 clone + 조립
setup; b=$(make_bare_repo work); rc=$(run "work=$b")
assert "AC-3: clone+connected+exit0" '[ -d "$REPOS_DIR/work/.git" ] && has_item work connected && [ "$rc" -eq 0 ]'
want="localmind=$TEST_HOME/.localmind,work=$REPOS_DIR/work"
assert "AC-15: 스텁이 정확한 NOTES_DIR 수신" 'grep -qF "$want" "$STUB_OUT"'; teardown

# AC-4 라벨 생략
setup; b=$(make_bare_repo my-notes); rc=$(run "$b")
assert "AC-4: 라벨 생략→repo 이름 폴더" '[ -d "$REPOS_DIR/my-notes/.git" ]'; teardown

# AC-5 스킴 거부(ext::)
setup; rc=$(run "x=ext::sh -c touch\\ $TMP/pwned")
assert "AC-5: ext:: 거부(마커 미생성)+실패+스텁 미호출+exit≠0" '[ ! -e "$TMP/pwned" ] && has_failed && [ ! -f "$STUB_OUT" ] && [ "$rc" -ne 0 ]'; teardown
setup; rc=$(run "x=--upload-pack=touch $TMP/pwned2")
assert "AC-5: -시작 URL 거부" '[ ! -e "$TMP/pwned2" ] && [ "$rc" -ne 0 ]'; teardown

# AC-6 경로 탈출 거부
setup; b=$(make_bare_repo good); rc=$(run "../../escape=$b")
assert "AC-6: REPOS_DIR 밖 미생성+실패" '[ ! -e "$TMP/escape" ] && has_failed'; teardown

# AC-7 라벨 charset 위반(빈 라벨 등) → failed + 오염 없음
setup; b=$(make_bare_repo good)
rc=$(run "=$b,good=$b")   # 빈 라벨 항목 실패 + 정상 항목만 조립
assert "AC-7: 빈 라벨 항목 failed" 'has_failed'
assert "AC-7: NOTES_DIR에 정상 항목만(오염 없음)" 'grep -qF "good=$REPOS_DIR/good" "$STUB_OUT" && ! grep -qF ",=" "$STUB_OUT"'; teardown

# AC-13 접근 불가+정상 혼합: 정상 연결, 불가 실패, 행 없음, exit≠0
setup; b=$(make_bare_repo good)
TIMEOUT=""; command -v timeout >/dev/null 2>&1 && TIMEOUT="timeout 60"; command -v gtimeout >/dev/null 2>&1 && TIMEOUT="gtimeout 60"
rc=$( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="good=$b,bad=/nope/missing.git" NOTES_REPOS_DIR="$REPOS_DIR" \
  MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" NOTES_CONNECT_ENV="$ENV_FILE" $TIMEOUT bash "$NC" >"$OUT" 2>&1; echo $? )
assert "AC-13: 정상 connected + 불가 failed + 행 없음(≠124) + exit≠0" \
  'has_item good connected && has_failed && [ "$rc" -ne 124 ] && [ "$rc" -ne 0 ]'; teardown

# 회귀(self-review #2): 심볼릭 링크 target은 clone하지 않고 failed
setup; b=$(make_bare_repo work); mkdir -p "$REPOS_DIR"; ln -s "$TMP/elsewhere" "$REPOS_DIR/work"
rc=$(run "work=$b")
assert "심볼릭 링크 target 거부(통과 clone 없음)" 'has_item work failed && [ ! -e "$TMP/elsewhere/.git" ]'; teardown

# AC-8 중복/예약 라벨
setup; b1=$(make_bare_repo one); b2=$(make_bare_repo two); rc=$(run "dup=$b1,dup=$b2")
assert "AC-8: 중복 라벨 실패" 'has_item dup failed'; teardown
setup; b=$(make_bare_repo three); rc=$(run "localmind=$b")
assert "AC-8: 예약 localmind 실패" 'has_item localmind failed'; teardown

# AC-9 멱등 pull
setup; b=$(make_bare_repo work); run "work=$b" >/dev/null
w2="$TMP/w2"; git clone -q "$b" "$w2"; echo more > "$w2/m.md"
( cd "$w2" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m m && git push -q origin HEAD >/dev/null 2>&1 )
rc=$(run "work=$b"); assert "AC-9: 재실행 pull 반영+connected" '[ -f "$REPOS_DIR/work/m.md" ] && has_item work connected'; teardown

# AC-10 origin 불일치
setup; b1=$(make_bare_repo alpha); b2=$(make_bare_repo beta); git clone -q "$b1" "$REPOS_DIR/work"
rc=$(run "work=$b2"); assert "AC-10: origin 다르면 failed+불변" 'has_item work failed && grep -q alpha-note "$REPOS_DIR/work/note.md"'; teardown

# AC-11 로컬 변경 보존
setup; b=$(make_bare_repo work); run "work=$b" >/dev/null; echo "LOCAL" > "$REPOS_DIR/work/note.md"
rc=$(run "work=$b"); assert "AC-11: 보존+skipped-dirty+포함" 'grep -q LOCAL "$REPOS_DIR/work/note.md" && has_item work skipped-dirty && grep -qF "work=$REPOS_DIR/work" "$STUB_OUT"'; teardown

# AC-12 비git 충돌
setup; b=$(make_bare_repo work); mkdir -p "$REPOS_DIR/work"; echo plain > "$REPOS_DIR/work/p.txt"
rc=$(run "work=$b"); assert "AC-12: 비git 폴더 불변+failed" 'grep -q plain "$REPOS_DIR/work/p.txt" && has_item work failed'; teardown

# AC-14 전부 실패 → 미등록
setup; rc=$(run "bad=/nope/a.git,worse=/nope/b.git")
assert "AC-14: 전부 실패→스텁 미호출+exit≠0" '[ ! -f "$STUB_OUT" ] && [ "$rc" -ne 0 ]'; teardown

# AC-16 등록 실패에도 요약
setup; b=$(make_bare_repo work); rc=$(run "work=$b" "$REPOS_DIR" 1)
assert "AC-16: 등록 실패해도 요약+exit≠0" 'grep -qF "ITEM${TAB}work${TAB}" "$OUT" && [ "$rc" -ne 0 ]'; teardown

# AC-17 자격증명 마스킹
setup; rc=$(run "x=https://user:SECRETTOKEN@example.invalid/r.git")
assert "AC-17: 토큰 평문 없음" '! grep -q SECRETTOKEN "$OUT"'; teardown

# AC-18 git 없음
setup; b=$(make_bare_repo work)
rc=$( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="work=$b" NOTES_REPOS_DIR="$REPOS_DIR" MCP_INSTALL_CMD="$STUB" \
  STUB_OUT="$STUB_OUT" GIT_BIN=/nonexistent/git NOTES_CONNECT_ENV="$ENV_FILE" bash "$NC" >"$OUT" 2>&1; echo $? )
assert "AC-18: git 없음→NO_GIT+exit1" 'grep -q NO_GIT "$OUT" && [ "$rc" -eq 1 ]'; teardown

# AC-25 NOTES_REPOS_DIR 검증(FR-17): $HOME 밖 → 기본값 폴백
setup; b=$(make_bare_repo work); OUTSIDE="$TMP/outside"
rc=$(run "work=$b" "$OUTSIDE")
assert "AC-25: \$HOME 밖 REPOS_DIR 거부→기본값 폴백(밖에 미생성)" '[ ! -e "$OUTSIDE/work" ] && [ -d "$TEST_HOME/localmind-notes/work/.git" ]'; teardown
# 민감 디렉토리 → 폴백
setup; b=$(make_bare_repo work)
rc=$(run "work=$b" "$TEST_HOME/.ssh")
assert "AC-25: 민감 디렉토리(~/.ssh) 거부→미clone" '[ ! -e "$TEST_HOME/.ssh/work" ]'; teardown

echo ""
echo "012 notes-connect 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
