#!/usr/bin/env bash
# specs/011 트랙 B — 휴지통 관리(FR-5)·백업 제외(AC-8, FR-6) 단위 테스트.
# 임시 디렉토리만 사용(라이브 스택 불필요). 실행: bash scripts/trash.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRASH="$ROOT/scripts/trash.sh"

pass=0; fail=0
assert() { if eval "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }

# ── FR-5: trash-list 가 .trash/ 파일을 나열 ─────────────────────
TMP="$(mktemp -d)"; NDIR="$TMP/notes"; mkdir -p "$NDIR/.trash/sub"
echo x > "$NDIR/.trash/a.md"; echo y > "$NDIR/.trash/sub/b.md"
out="$(NOTES_DIR="$NDIR" bash "$TRASH" list 2>&1)"
assert "FR-5: list가 휴지통 파일을 표시" 'printf "%s" "$out" | grep -q "a.md" && printf "%s" "$out" | grep -q "b.md"'
rm -rf "$TMP"

# ── FR-5: 빈 휴지통 안내 ────────────────────────────────────────
TMP="$(mktemp -d)"; NDIR="$TMP/notes"; mkdir -p "$NDIR"
out="$(NOTES_DIR="$NDIR" bash "$TRASH" list 2>&1)"
assert "FR-5: 빈 휴지통 안내" 'printf "%s" "$out" | grep -q "비어 있습니다"'
rm -rf "$TMP"

# ── FR-5: empty 는 비대화에서 FORCE 없이는 거부(비가역 보호) ────
TMP="$(mktemp -d)"; NDIR="$TMP/notes"; mkdir -p "$NDIR/.trash"; echo x > "$NDIR/.trash/a.md"
NOTES_DIR="$NDIR" bash "$TRASH" empty </dev/null >/dev/null 2>&1
assert "FR-5: FORCE 없는 비대화 empty는 파일 보존" '[ -f "$NDIR/.trash/a.md" ]'
# FORCE=1 이면 비움
NOTES_DIR="$NDIR" FORCE=1 bash "$TRASH" empty </dev/null >/dev/null 2>&1
assert "FR-5: FORCE=1 이면 휴지통 비움" '[ ! -d "$NDIR/.trash" ]'
rm -rf "$TMP"

# ── FR-5: 다중 폴더(라벨=경로) 파싱 ─────────────────────────────
TMP="$(mktemp -d)"; A="$TMP/a"; B="$TMP/b"; mkdir -p "$A/.trash" "$B/.trash"
echo 1 > "$A/.trash/one.md"; echo 2 > "$B/.trash/two.md"
out="$(NOTES_DIR="work=$A,life=$B" bash "$TRASH" list 2>&1)"
assert "FR-5: 다중 폴더 둘 다 나열" 'printf "%s" "$out" | grep -q "one.md" && printf "%s" "$out" | grep -q "two.md"'
rm -rf "$TMP"

# ── 회귀: 빈/malformed NOTES_DIR에도 크래시 없음(self-review #2) ─
out="$(NOTES_DIR="," bash "$TRASH" list 2>&1)"; rc=$?
assert "회귀: malformed NOTES_DIR(빈 항목)에 크래시 없이 안내(exit 0)" '[ "$rc" -eq 0 ] && printf "%s" "$out" | grep -q "비어 있습니다"'

# ── AC-8/FR-6: backup 이 .trash/ 를 .gitignore 에 시드 ──────────
# (015에서 backup 파이프라인이 Makefile → scripts/backup.sh로 이동 — 시드 위치 추적)
assert "AC-8: backup 파이프라인 시드에 .trash/ 포함" "grep -qF \"'.trash/'\" \"$ROOT/scripts/backup.sh\""

echo ""
echo "011 trash 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
