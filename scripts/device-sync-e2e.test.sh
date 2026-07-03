#!/usr/bin/env bash
# specs/019 — 기기 전환 왕복 E2E: 기기 A backup(push) → 기기 B restore(clone) 시나리오.
# goal Success metrics 검증: 페르소나·스킬 배포 목록(삭제 반영 포함)·쿼리 로그가 기기 간
# 일치하고, 수동 이관 단계가 없다. 임시 HOME 두 개 + 로컬 bare repo, 라이브 스택 불필요.
# (recover의 docker·스택 구간은 단위 테스트 소관 — 여기서는 backup→restore 데이터 왕복만.)
# 실행: bash scripts/device-sync-e2e.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER=".localmind-mirror"

pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# 가짜 npm: memory:export는 파일 생성, 배포는 호출 기록. node는 실제(자산 판정 조회).
mkdir -p "$TMP/bin"
cat > "$TMP/bin/npm" <<'S'
#!/bin/sh
echo "$@" >> "${NPM_LOG:-/dev/null}"
case "$*" in *memory:export*) for last; do :; done; echo "memory dump" > "$last";; esac
exit 0
S
chmod +x "$TMP/bin/npm"

git_id() { git -C "$1" config user.email t@t; git -C "$1" config user.name t; }

# ── 기기 A 준비: 멀티 노트 구성(첫 노트 폴더가 BACKUP_DIR 밖) ────────────────
HOME_A="$TMP/home-a"; NOTES_A="$TMP/a-notes"; BK_A="$TMP/a-backup"; BARE="$TMP/brain.git"
mkdir -p "$HOME_A" "$NOTES_A/agents" "$NOTES_A/skills/sdd" "$BK_A"
git init -q --bare "$BARE"
git -C "$BK_A" init -q; git_id "$BK_A"; git -C "$BK_A" remote add origin "$BARE"
printf 'NOTES_DIR="main=%s"\n' "$NOTES_A" > "$TMP/a.env"
echo "# 크리틱" > "$NOTES_A/agents/critic.md"
echo "# 사서"   > "$NOTES_A/agents/librarian.md"
echo "# 스킬"   > "$NOTES_A/skills/sdd/SKILL.md"
echo "노트 A"   > "$BK_A/note.md"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S).000Z"
mkdir -p "$HOME_A/.localmind"
printf '{"ts":"%s","query":"기기A 질의"}\n' "$NOW" > "$HOME_A/.localmind/query-log.jsonl"

run_a_backup() {
  OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_A" BACKUP_DIR="$BK_A" LOCALMIND_ENV_FILE="$TMP/a.env" \
        NPM_LOG="$TMP/a-npm.log" BACKUP_QUERY_LOG=1 env -u NOTES_DIR -u QUERY_LOG bash "$ROOT/scripts/backup.sh" 2>&1)"
  RC=$?
}
run_a_backup
assert "A: 백업 0 종료(수동 단계 없음)" '[ "$RC" -eq 0 ]'
assert "A: 자산 미러+마커가 백업 repo에 커밋됨" \
  'git -C "$BK_A" ls-tree -r --name-only HEAD | grep -q "agents/critic.md" && git -C "$BK_A" ls-tree -r --name-only HEAD | grep -q "agents/$MARKER"'
assert "A: 쿼리 로그(기기 파일)·메모리 덤프 커밋됨" \
  'git -C "$BK_A" ls-tree -r --name-only HEAD | grep -q "query-log\." && git -C "$BK_A" ls-tree -r --name-only HEAD | grep -q "memory.md"'

# ── 기기 B: clone → (notes-connect 후 가정) restore ──────────────────────────
HOME_B="$TMP/home-b"; NOTES_B="$TMP/b-notes"; BK_B="$TMP/b-backup"
mkdir -p "$HOME_B" "$NOTES_B"
git clone -q "$BARE" "$BK_B"; git_id "$BK_B"
printf 'NOTES_DIR="main=%s"\n' "$NOTES_B" > "$TMP/b.env"
run_b_restore() {
  OUT="$(PATH="$TMP/bin:$PATH" HOME="$HOME_B" BACKUP_DIR="$BK_B" LOCALMIND_ENV_FILE="$TMP/b.env" \
        NPM_LOG="$TMP/b-npm.log" env -u NOTES_DIR -u QUERY_LOG bash "$ROOT/scripts/restore-assets.sh" 2>&1)"
  RC=$?
}
run_b_restore
assert "B: 자산 복원 0 종료" '[ "$RC" -eq 0 ]'
assert "B: 페르소나·스킬이 B의 정본 폴더로 복원" '[ -f "$NOTES_B/agents/critic.md" ] && [ -f "$NOTES_B/skills/sdd/SKILL.md" ]'
assert "B: 마커는 정본으로 오지 않음" '[ ! -f "$NOTES_B/agents/$MARKER" ]'
assert "B: 배포 재실행(agents·skills deploy)" 'grep -q "agents:deploy" "$TMP/b-npm.log" && grep -q "skills:deploy" "$TMP/b-npm.log"'
assert "B: 쿼리 로그 병합(기기 A 질의 포함)" 'grep -q "기기A 질의" "$HOME_B/.localmind/query-log.jsonl"'
assert "성공 지표: 페르소나 목록이 기기 간 일치" 'diff -r "$NOTES_A/agents" "$NOTES_B/agents" >/dev/null'

# ── 삭제 왕복: A에서 페르소나 삭제 → backup → B restore → B에서도 삭제(보존 포함) ──
rm "$NOTES_A/agents/librarian.md"
run_a_backup
git -C "$BK_B" pull -q
run_b_restore
assert "삭제 왕복: B에서도 librarian 제거" '[ ! -f "$NOTES_B/agents/librarian.md" ]'
assert "삭제 왕복: 제거 전 .bak-<ts> 보존" 'ls "$NOTES_B/agents/"librarian.md.bak-* >/dev/null 2>&1'
assert "삭제 왕복: 남은 목록 일치(critic만)" '[ -f "$NOTES_B/agents/critic.md" ] && [ "$(find "$NOTES_B/agents" -name "*.md" ! -name "*.bak-*" | wc -l | tr -d " ")" = "1" ]'
assert "삭제 왕복: 멱등(재실행 시 .bak 증식 없음)" \
  'n1=$(ls "$NOTES_B/agents/"librarian.md.bak-* | wc -l | tr -d " "); run_b_restore; n2=$(ls "$NOTES_B/agents/"librarian.md.bak-* | wc -l | tr -d " "); [ "$n1" = "$n2" ]'

echo ""
echo "019 기기 전환 E2E 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
