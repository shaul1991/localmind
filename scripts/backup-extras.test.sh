#!/usr/bin/env bash
# scripts/backup-extras.sh 단위 테스트 (임시 디렉토리만 사용, 라이브 스택 불필요).
# 실행: bash scripts/backup-extras.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/backup-extras.sh"

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

setup() {
  TMP="$(mktemp -d)"
  TEST_HOME="$TMP/home"
  BACKUP_DIR="$TMP/backup"
  mkdir -p "$TEST_HOME" "$BACKUP_DIR"
}
teardown() { rm -rf "$TMP"; }

# ── AC-1: 미설정 시 extras/ 미생성 ────────────────────────────
setup
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" BACKUP_EXTRA_FILES="" bash "$TARGET"
assert "AC-1: BACKUP_EXTRA_FILES 미설정 시 extras/ 미생성" '[ ! -d "$BACKUP_DIR/extras" ]'
teardown

# ── AC-2: 정상 파일 백업 ──────────────────────────────────────
setup
mkdir -p "$TEST_HOME/.claude"
echo "test content" > "$TEST_HOME/.claude/CLAUDE.md"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md" bash "$TARGET"
assert "AC-2: 지정 파일이 extras/에 상대경로로 복사됨" '[ -f "$BACKUP_DIR/extras/.claude/CLAUDE.md" ]'
assert "AC-2: 복사된 내용이 원본과 동일" 'cmp -s "$TEST_HOME/.claude/CLAUDE.md" "$BACKUP_DIR/extras/.claude/CLAUDE.md"'
teardown

# ── AC-3: 존재하지 않는 파일 — graceful 처리 ──────────────────
setup
mkdir -p "$TEST_HOME/.claude"
echo "real" > "$TEST_HOME/.claude/CLAUDE.md"
set +e
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md,~/.does-not-exist" bash "$TARGET"
rc=$?
set -e
assert "AC-3: 존재하지 않는 파일이 있어도 스크립트는 실패하지 않음" '[ "$rc" -eq 0 ]'
assert "AC-3: 존재하는 파일은 정상 백업됨" '[ -f "$BACKUP_DIR/extras/.claude/CLAUDE.md" ]'
teardown

# ── AC-4: $HOME 밖 경로 거부 ───────────────────────────────────
setup
OUTSIDE="$TMP/outside.txt"
echo "outside" > "$OUTSIDE"
mkdir -p "$TEST_HOME/.claude"
echo "real" > "$TEST_HOME/.claude/CLAUDE.md"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_EXTRA_FILES="$OUTSIDE,~/.claude/CLAUDE.md" bash "$TARGET"
assert "AC-4: \$HOME 밖 파일은 백업되지 않음" '[ ! -e "$BACKUP_DIR/extras/outside.txt" ]'
assert "AC-4: 나머지 정상 파일은 백업됨" '[ -f "$BACKUP_DIR/extras/.claude/CLAUDE.md" ]'
teardown

# ── 심볼릭 링크 — 건너뜀 ──────────────────────────────────────
setup
echo "real" > "$TEST_HOME/real.txt"
ln -s "$TEST_HOME/real.txt" "$TEST_HOME/link.txt"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" BACKUP_EXTRA_FILES="~/link.txt" bash "$TARGET"
assert "심볼릭 링크는 백업되지 않음" '[ ! -e "$BACKUP_DIR/extras/link.txt" ]'
teardown

# ── 회귀: 디렉토리 심볼릭 링크를 경유한 $HOME 밖 탈출 차단 ─────
# (self-review에서 발견 — 중간 디렉토리가 심볼릭 링크면 물리경로 정규화 없이는
#  $HOME 경계 검사가 우회됨. dotfile 관리 도구(stow 등)가 흔히 쓰는 패턴이라 중요.)
setup
OUTSIDE_DIR="$TMP/outside"
mkdir -p "$OUTSIDE_DIR"
echo "TOP-SECRET" > "$OUTSIDE_DIR/secret.txt"
ln -s "$OUTSIDE_DIR" "$TEST_HOME/mylink"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_EXTRA_FILES="~/mylink/secret.txt" bash "$TARGET"
assert "회귀: 디렉토리 심볼릭 링크 경유 \$HOME 밖 탈출이 차단됨" \
  '[ ! -e "$BACKUP_DIR/extras/mylink/secret.txt" ]'
teardown

# ── 회귀: ~ 또는 / 없는 상대경로 거부 ──────────────────────────
# (self-review에서 발견 — "Makefile" 같은 값이 CWD(호출한 곳) 기준으로 조용히
#  해석돼 의도치 않은 파일이 백업될 수 있었음.)
setup
cd "$TMP"
echo "cwd-file" > "$TMP/relative-target.txt"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_EXTRA_FILES="relative-target.txt" bash "$TARGET"
cd - >/dev/null
assert "회귀: ~ 또는 / 없는 상대경로는 거부됨" \
  '[ ! -e "$BACKUP_DIR/extras/relative-target.txt" ] && ! find "$BACKUP_DIR/extras" -name "relative-target.txt" 2>/dev/null | grep -q .'
teardown

echo ""
echo "결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
