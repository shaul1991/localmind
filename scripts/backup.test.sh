#!/usr/bin/env bash
# specs/015 FR-1·7 — backup.sh 부분 실패 허용·push 안내 테스트.
# 임시 디렉토리 + 로컬 bare repo + 가짜 npm 스텁 — 라이브 스택·네트워크 불필요(CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/backup.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 가짜 npm: memory:export를 흉내 — OK면 마지막 인자 경로에 파일 생성, FAIL이면 비0.
mkdir -p "$TMP/bin-ok" "$TMP/bin-fail"
cat > "$TMP/bin-ok/npm" <<'S'
#!/bin/sh
for last; do :; done
echo "memory dump" > "$last"
exit 0
S
printf '#!/bin/sh\nexit 1\n' > "$TMP/bin-fail/npm"
chmod +x "$TMP/bin-ok/npm" "$TMP/bin-fail/npm"

new_repo() { # new_repo <작업폴더> <bare원격|"">  — 노트 백업 repo 준비
  local dir="$1" bare="$2"
  mkdir -p "$dir"; git -C "$dir" init -q
  git -C "$dir" config user.email t@t; git -C "$dir" config user.name t
  if [ -n "$bare" ]; then git init -q --bare "$bare"; git -C "$dir" remote add origin "$bare"; fi
}

run_backup() { # run_backup <PATH선두> <BACKUP_DIR>
  OUT="$(PATH="$1:$PATH" BACKUP_DIR="$2" bash "$SCRIPT" 2>&1)"
  RC=$?
}

# ── AC-1: 스택 꺼짐(export 실패)에도 노트는 백업되고 비0 종료 ────────────────
D1="$TMP/notes1"; B1="$TMP/bare1.git"; new_repo "$D1" "$B1"
echo "노트 내용" > "$D1/note.md"
run_backup "$TMP/bin-fail" "$D1"
assert "AC-1: 비0 종료(부분 실패 식별 가능)" '[ "$RC" -ne 0 ]'
assert "AC-1: 노트 커밋이 생성된다(인질 아님)" 'git -C "$D1" log --oneline | grep -q "localmind backup"'
assert "AC-1: 노트가 원격(push)까지 반영된다" 'git -C "$B1" log --oneline | grep -q "localmind backup"'
assert "AC-1: 메모리 실패가 요약에 표기된다" 'printf %s "$OUT" | grep -q "메모리"'
assert "AC-1: 부분 완료 요약이 출력된다" 'printf %s "$OUT" | grep -q "부분 완료"'
assert "AC-1: 파생물 gitignore 시드" 'grep -q ".brain-index.json" "$D1/.gitignore"'

# ── AC-2: 정상 경로 회귀 없음 ────────────────────────────────────────────────
D2="$TMP/notes2"; B2="$TMP/bare2.git"; new_repo "$D2" "$B2"
echo "노트" > "$D2/note.md"
run_backup "$TMP/bin-ok" "$D2"
assert "AC-2: 정상 백업은 0 종료" '[ "$RC" -eq 0 ]'
assert "AC-2: memory.md가 백업에 포함된다" 'git -C "$D2" ls-files | grep -q "memory.md"'
assert "AC-2: 완료 메시지" 'printf %s "$OUT" | grep -q "백업 완료"'

# ── 멱등: 변경 없이 재실행 → 커밋 생략, 0 종료 ──────────────────────────────
run_backup "$TMP/bin-ok" "$D2"
assert "멱등: 변경 없음 재실행도 0 종료" '[ "$RC" -eq 0 ]'
assert "멱등: '변경 없음' 안내" 'printf %s "$OUT" | grep -q "변경 없음"'

# ── remote 없음: 로컬 커밋만, 0 종료 ─────────────────────────────────────────
D3="$TMP/notes3"; new_repo "$D3" ""
echo "노트" > "$D3/note.md"
run_backup "$TMP/bin-ok" "$D3"
assert "remote 없음: 0 종료 + 로컬 커밋만 안내" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "remote 없음"'

# ── AC-11: 원격이 앞서 있으면(non-ff) 원인·해결 안내 + 비0 종료 ─────────────
D4="$TMP/notes4"; B4="$TMP/bare4.git"; new_repo "$D4" "$B4"
echo "노트" > "$D4/note.md"
run_backup "$TMP/bin-ok" "$D4" # 1차 백업(원격 동기화)
CLONE="$TMP/clone4"; git clone -q "$B4" "$CLONE"
git -C "$CLONE" config user.email o@o; git -C "$CLONE" config user.name o
echo "다른 기기의 노트" > "$CLONE/other.md"
git -C "$CLONE" add -A; git -C "$CLONE" commit -qm "다른 기기 백업"; git -C "$CLONE" push -q
echo "내 새 노트" > "$D4/new.md"
run_backup "$TMP/bin-ok" "$D4"
assert "AC-11: non-ff push는 비0 종료" '[ "$RC" -ne 0 ]'
assert "AC-11: 원인(다른 기기)과 해결(pull) 안내" 'printf %s "$OUT" | grep -q "다른 기기" && printf %s "$OUT" | grep -q "pull"'
assert "AC-11: 로컬 커밋은 보존된다" 'git -C "$D4" log --oneline | head -1 | grep -q "localmind backup"'

# ── repo 아님: 안내 후 비0 종료 ──────────────────────────────────────────────
D5="$TMP/notes5"; mkdir -p "$D5"
run_backup "$TMP/bin-ok" "$D5"
assert "repo 아님: backup-init 안내 + 비0 종료" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "backup-init"'

# ── 결함1 회귀: 노트 커밋 실패가 삼켜지지 않는다(git identity 미설정) ────────
D6="$TMP/notes6"; B6="$TMP/bare6.git"
mkdir -p "$D6"; git -C "$D6" init -q
# 전역 identity가 있어도 커밋이 확실히 실패하게 — 로컬에서 빈 값으로 덮는다
git -C "$D6" config user.email ""; git -C "$D6" config user.name ""
git init -q --bare "$B6"; git -C "$D6" remote add origin "$B6"
echo "노트" > "$D6/note.md"
run_backup "$TMP/bin-ok" "$D6"
assert "결함1: 커밋 실패 시 비0 종료('백업 완료' 오보 없음)" '[ "$RC" -ne 0 ] && ! printf %s "$OUT" | grep -q "✓ 백업 완료"'
assert "결함1: 실패 요약에 노트커밋 표기 + git 설정 안내" 'printf %s "$OUT" | grep -q "노트커밋" && printf %s "$OUT" | grep -q "user.email"'

echo ""
echo "015 backup 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
