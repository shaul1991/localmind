#!/usr/bin/env bash
# scripts/restore-extras.sh 단위 테스트 (임시 디렉토리만 사용, 라이브 스택 불필요).
# 실행: bash scripts/restore-extras.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/restore-extras.sh"

pass=0
fail=0
assert() {
  local _lm_last=$? desc="$1" cond="$2"
  # pipefail 없이 + 직전 $? 보존 — grep -q 조기 종료의 SIGPIPE(141) 플레이키 방지
  if ( set +o pipefail; (exit $_lm_last); eval "$cond" ); then
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

# ── AC-5: 정상 복원 ────────────────────────────────────────────
setup
mkdir -p "$BACKUP_DIR/extras/.claude"
echo "restored content" > "$BACKUP_DIR/extras/.claude/CLAUDE.md"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" bash "$TARGET"
assert "AC-5: extras/ 파일이 \$HOME/원래경로로 복원됨" '[ -f "$TEST_HOME/.claude/CLAUDE.md" ]'
assert "AC-5: 복원된 내용이 백업본과 동일" 'cmp -s "$BACKUP_DIR/extras/.claude/CLAUDE.md" "$TEST_HOME/.claude/CLAUDE.md"'
teardown

# ── AC-6: 복원 충돌 시 .bak 보존 후 덮어씀 ────────────────────
setup
mkdir -p "$BACKUP_DIR/extras/.claude" "$TEST_HOME/.claude"
echo "new content" > "$BACKUP_DIR/extras/.claude/CLAUDE.md"
echo "old content" > "$TEST_HOME/.claude/CLAUDE.md"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" bash "$TARGET"
bak_count=$(find "$TEST_HOME/.claude" -name "CLAUDE.md.bak-*" | wc -l | tr -d ' ')
assert "AC-6: 기존 파일이 .bak-*로 보존됨" '[ "$bak_count" -ge 1 ]'
assert "AC-6: 대상 파일이 새 내용으로 교체됨" 'grep -q "new content" "$TEST_HOME/.claude/CLAUDE.md"'
old_bak="$(find "$TEST_HOME/.claude" -name "CLAUDE.md.bak-*" | head -1)"
assert "AC-6: .bak 파일에 기존 내용이 남아있음" 'grep -q "old content" "$old_bak"'
teardown

# ── AC-7: 동일 내용이면 .bak 생성 안 함 ───────────────────────
setup
mkdir -p "$BACKUP_DIR/extras/.claude" "$TEST_HOME/.claude"
echo "same content" > "$BACKUP_DIR/extras/.claude/CLAUDE.md"
echo "same content" > "$TEST_HOME/.claude/CLAUDE.md"
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" bash "$TARGET"
bak_count=$(find "$TEST_HOME/.claude" -name "CLAUDE.md.bak-*" 2>/dev/null | wc -l | tr -d ' ')
assert "AC-7: 내용이 동일하면 .bak 파일을 만들지 않음" '[ "$bak_count" -eq 0 ]'
teardown

# ── AC-8: extras/ 없음 — graceful 생략 ────────────────────────
setup
set +e
HOME="$TEST_HOME" BACKUP_DIR="$BACKUP_DIR" bash "$TARGET"
rc=$?
set -e
assert "AC-8: extras/ 없어도 에러 없이 종료(0)" '[ "$rc" -eq 0 ]'
teardown

echo ""
echo "결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
