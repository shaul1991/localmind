#!/usr/bin/env bash
# 012 notes-connect — 고정 공유 오라클(frozen oracle).
#
# 목적: 서로 다른 AI 모델이 spec.md의 Interface Contract만 보고 각자 구현한
#       notes-connect.sh를 "동일한 채점자"로 평가하기 위한 테스트. 이 파일은 실험 대상이
#       아니다 — 어떤 모델도 이 파일을 수정하면 안 된다.
#
# 사용: NC_SCRIPT=<구현 경로> bash oracle.test.sh
#       (NC_SCRIPT 미지정 시 저장소의 scripts/notes-connect.sh를 본다 — 아직 없으면 전부 실패)
#
# 네트워크 불필요: 로컬 bare repo를 원격으로 삼고, 실패 케이스는 example.invalid를 쓴다.
# 이식성: BSD/GNU 공통으로 동작하도록 grep -P·timeout 의존을 피한다.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
NC_SCRIPT="${NC_SCRIPT:-$REPO_ROOT/scripts/notes-connect.sh}"
TAB="$(printf '\t')"

# 선택적 timeout (macOS 기본 미설치) — 있으면 쓰고 없으면 그냥 실행.
TIMEOUT=""
if command -v timeout >/dev/null 2>&1; then TIMEOUT="timeout 60"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT="gtimeout 60"; fi

pass=0
fail=0
assert() {
  local desc="$1" cond="$2"
  if eval "$cond"; then
    printf '  \033[32m✓\033[0m %s\n' "$desc"; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %s\n' "$desc"; fail=$((fail+1))
  fi
}
# ITEM<TAB>label<TAB>status 를 고정 문자열로 검사(뒤 사유 필드는 무시).
has_item() { grep -qF "ITEM${TAB}$1${TAB}$2" "$OUT"; }
has_failed() { grep -qF "${TAB}failed" "$OUT"; }

STUB="$HERE/_stub-mcp-install.sh"

setup() {
  TMP="$(mktemp -d)"
  TEST_HOME="$TMP/home"; mkdir -p "$TEST_HOME"
  REPOS_DIR="$TMP/notes"           # NOTES_REPOS_DIR
  REMOTES="$TMP/remotes"; mkdir -p "$REMOTES"
  STUB_OUT="$TMP/stub-notesdir.txt"  # 스텁이 NOTES_DIR를 여기 기록
  ENV_FILE="$TMP/project.env"; : > "$ENV_FILE"
  OUT="$TMP/out.txt"                # stdout+stderr 캡처
}
teardown() { rm -rf "$TMP"; }

# 커밋 있는 로컬 bare repo를 만들어 그 경로(원격 URL로 쓸)를 echo. note.md엔 "<name>-note".
make_bare_repo() {
  local name="$1"
  local work="$REMOTES/$name-work" bare="$REMOTES/$name.git"
  git init -q "$work"
  printf '%s-note\n' "$name" > "$work/note.md"
  ( cd "$work" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m note )
  git clone -q --bare "$work" "$bare" >/dev/null 2>&1
  echo "$bare"
}

# 대상 구현을 정해진 seam으로 실행. NOTES_REPOS를 인자로 받는다. exit code를 echo.
run_nc() {
  local repos="$1"
  ( cd "$TMP" && \
    HOME="$TEST_HOME" \
    NOTES_REPOS="$repos" \
    NOTES_REPOS_DIR="$REPOS_DIR" \
    MCP_INSTALL_CMD="$STUB" \
    STUB_OUT="$STUB_OUT" \
    NOTES_CONNECT_ENV="$ENV_FILE" \
    bash "$NC_SCRIPT" >"$OUT" 2>&1 )
  echo $?
}

if [ ! -f "$NC_SCRIPT" ]; then
  echo "⚠ 구현 파일이 없습니다: $NC_SCRIPT  (모든 케이스가 실패로 표시됩니다)"
fi

# ── AC-1: opt-in 게이트 (env·.env 모두 비었을 때) ─────────────────
setup
rc=$(run_nc "")
assert "AC-1: 저장소 미지정 시 exit 0" '[ "$rc" -eq 0 ]'
assert "AC-1: NO_REPOS 토큰 출력" 'grep -q "NO_REPOS" "$OUT"'
assert "AC-1: NOTES_REPOS_DIR 미생성" '[ ! -d "$REPOS_DIR" ]'
assert "AC-1: 등록 스텁 미호출" '[ ! -f "$STUB_OUT" ]'
teardown

# ── AC-2: .env 폴백 ───────────────────────────────────────────────
setup
bare=$(make_bare_repo work)
printf 'NOTES_REPOS="work=%s"\n' "$bare" > "$ENV_FILE"
( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="" NOTES_REPOS_DIR="$REPOS_DIR" \
  MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" NOTES_CONNECT_ENV="$ENV_FILE" \
  bash "$NC_SCRIPT" >"$OUT" 2>&1 )
assert "AC-2: .env의 NOTES_REPOS로 clone됨" '[ -d "$REPOS_DIR/work/.git" ]'
teardown

# ── AC-3 / AC-15: 신규 clone + NOTES_DIR 조립 정확도 ──────────────
setup
bare=$(make_bare_repo work)
rc=$(run_nc "work=$bare")
assert "AC-3: work가 clone됨" '[ -d "$REPOS_DIR/work/.git" ]'
assert "AC-3: 상태 connected" 'has_item work connected'
assert "AC-3: exit 0" '[ "$rc" -eq 0 ]'
want="localmind=$TEST_HOME/.localmind,work=$REPOS_DIR/work"
assert "AC-15: NOTES_DIR 조립값이 stdout 또는 스텁에 정확히 존재" \
  'grep -qF "NOTES_DIR${TAB}$want" "$OUT" || grep -qF "$want" "$STUB_OUT"'
assert "AC-15: 스텁이 정확한 NOTES_DIR 수신" '[ -f "$STUB_OUT" ] && grep -qF "$want" "$STUB_OUT"'
teardown

# ── AC-4: 라벨 생략 → repo 이름 ───────────────────────────────────
setup
bare=$(make_bare_repo my-notes)
rc=$(run_nc "$bare")
assert "AC-4: 라벨 생략 시 repo 이름 폴더로 clone" '[ -d "$REPOS_DIR/my-notes/.git" ]'
teardown

# ── AC-5: URL 스킴 거부 (ext:: / 옵션 위장) — 명령 실행 차단 ───────
setup
marker="$TMP/pwned"
rc=$(run_nc "x=ext::sh -c touch\\ $marker")
assert "AC-5(ext): 명령이 실행되지 않음(마커 미생성)" '[ ! -e "$marker" ]'
assert "AC-5(ext): 항목 failed" 'has_failed'
assert "AC-5(ext): 전부 실패 → 스텁 미호출" '[ ! -f "$STUB_OUT" ]'
assert "AC-5(ext): exit 0 아님" '[ "$rc" -ne 0 ]'
teardown
setup
rc=$(run_nc "x=--upload-pack=touch $TMP/pwned2")
assert "AC-5(opt): -로 시작하는 URL 거부, 마커 미생성" '[ ! -e "$TMP/pwned2" ]'
assert "AC-5(opt): exit 0 아님" '[ "$rc" -ne 0 ]'
teardown

# ── AC-6: 라벨 경로 탈출 거부 ─────────────────────────────────────
setup
bare=$(make_bare_repo good)
rc=$(run_nc "../../escape=$bare")
assert "AC-6: NOTES_REPOS_DIR 밖에 escape 미생성" '[ ! -e "$TMP/escape" ]'
assert "AC-6: 항목 failed" 'has_failed'
teardown

# ── AC-7: 라벨에 ',' 포함 → 오염 없음 ─────────────────────────────
setup
bare=$(make_bare_repo good)
rc=$(run_nc "a,b=$bare")
assert "AC-7: 'a,b' 라벨이 connected로 조립되지 않음" '! has_item "a,b" connected'
teardown

# ── AC-8: 라벨 중복 / 예약 localmind ──────────────────────────────
setup
b1=$(make_bare_repo one); b2=$(make_bare_repo two)
rc=$(run_nc "dup=$b1,dup=$b2")
assert "AC-8: 중복 라벨 중 하나는 failed" 'has_item dup failed'
teardown
setup
b1=$(make_bare_repo three)
rc=$(run_nc "localmind=$b1")
assert "AC-8: 예약 라벨 localmind는 failed" 'has_item localmind failed'
teardown

# ── AC-9: 멱등 pull ───────────────────────────────────────────────
setup
bare=$(make_bare_repo work)
run_nc "work=$bare" >/dev/null
w2="$TMP/w2"; git clone -q "$bare" "$w2"
echo more > "$w2/more.md"
( cd "$w2" && git add -A && git -c user.email=t@t -c user.name=t commit -q -m more && git push -q origin HEAD >/dev/null 2>&1 )
rc=$(run_nc "work=$bare")
assert "AC-9: 재실행 시 pull로 새 파일 반영" '[ -f "$REPOS_DIR/work/more.md" ]'
assert "AC-9: 상태 connected + exit 0" 'has_item work connected && [ "$rc" -eq 0 ]'
teardown

# ── AC-10: origin 불일치 → pull 안 함, 실패 ──────────────────────
setup
b1=$(make_bare_repo alpha); b2=$(make_bare_repo beta)
git clone -q "$b1" "$REPOS_DIR/work"   # 대상에 alpha를 미리 clone
rc=$(run_nc "work=$b2")                 # 선언은 beta
assert "AC-10: origin 다르면 failed" 'has_item work failed'
assert "AC-10: 기존 repo 불변(alpha note 유지)" 'grep -q "alpha-note" "$REPOS_DIR/work/note.md"'
teardown

# ── AC-11: 로컬 변경 보존 → skipped-dirty, 폴더 포함 ─────────────
setup
bare=$(make_bare_repo work)
run_nc "work=$bare" >/dev/null
echo "LOCAL EDIT" > "$REPOS_DIR/work/note.md"
rc=$(run_nc "work=$bare")
assert "AC-11: 로컬 변경 보존됨" 'grep -q "LOCAL EDIT" "$REPOS_DIR/work/note.md"'
assert "AC-11: 상태 skipped-dirty + 폴더 NOTES_DIR 포함" \
  'has_item work skipped-dirty && grep -qF "work=$REPOS_DIR/work" "$STUB_OUT"'
teardown

# ── AC-12: 비git 폴더 충돌 ────────────────────────────────────────
setup
bare=$(make_bare_repo work)
mkdir -p "$REPOS_DIR/work"; echo "not-a-repo" > "$REPOS_DIR/work/plain.txt"
rc=$(run_nc "work=$bare")
assert "AC-12: 비git 폴더 내용 불변" 'grep -q "not-a-repo" "$REPOS_DIR/work/plain.txt"'
assert "AC-12: 항목 failed" 'has_item work failed'
teardown

# ── AC-13: 접근 불가 + 정상 혼합 (비대화, 행 없음) ────────────────
setup
bare=$(make_bare_repo good)
rc=$( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="good=$bare,bad=/nope/missing.git" \
      NOTES_REPOS_DIR="$REPOS_DIR" MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" \
      NOTES_CONNECT_ENV="$ENV_FILE" $TIMEOUT bash "$NC_SCRIPT" >"$OUT" 2>&1; echo $? )
assert "AC-13: 정상 항목 connected" 'has_item good connected'
assert "AC-13: 접근 불가 항목 failed" 'has_failed'
assert "AC-13: 행 없이 종료(timeout 아님) + exit≠0" '[ "$rc" -ne 124 ] && [ "$rc" -ne 0 ]'
teardown

# ── AC-14: 전부 실패 → 등록 미호출 ───────────────────────────────
setup
rc=$(run_nc "bad=/nope/a.git,worse=/nope/b.git")
assert "AC-14: 전부 실패 시 스텁 미호출" '[ ! -f "$STUB_OUT" ]'
assert "AC-14: exit≠0" '[ "$rc" -ne 0 ]'
teardown

# ── AC-16: 등록 실패에도 요약 출력 ───────────────────────────────
setup
bare=$(make_bare_repo work)
rc=$( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="work=$bare" NOTES_REPOS_DIR="$REPOS_DIR" \
      MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" STUB_RC=1 NOTES_CONNECT_ENV="$ENV_FILE" \
      bash "$NC_SCRIPT" >"$OUT" 2>&1; echo $? )
assert "AC-16: 등록 실패해도 ITEM 요약 출력됨" 'grep -qF "ITEM${TAB}work${TAB}" "$OUT"'
assert "AC-16: exit≠0" '[ "$rc" -ne 0 ]'
teardown

# ── AC-17: 자격증명 마스킹 ────────────────────────────────────────
setup
rc=$(run_nc "x=https://user:SECRETTOKEN@example.invalid/r.git")
assert "AC-17: 토큰이 출력에 평문으로 없음" '! grep -q "SECRETTOKEN" "$OUT"'
teardown

# ── AC-18: git 없음 (GIT_BIN seam) ────────────────────────────────
setup
bare=$(make_bare_repo work)
rc=$( cd "$TMP" && HOME="$TEST_HOME" NOTES_REPOS="work=$bare" NOTES_REPOS_DIR="$REPOS_DIR" \
      MCP_INSTALL_CMD="$STUB" STUB_OUT="$STUB_OUT" GIT_BIN="/nonexistent/git" \
      NOTES_CONNECT_ENV="$ENV_FILE" bash "$NC_SCRIPT" >"$OUT" 2>&1; echo $? )
assert "AC-18: git 없음 → NO_GIT + exit 1" 'grep -q "NO_GIT" "$OUT" && [ "$rc" -eq 1 ]'
teardown

echo ""
echo "오라클 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
