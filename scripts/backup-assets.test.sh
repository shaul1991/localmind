#!/usr/bin/env bash
# specs/019 FR-1 — backup-assets.sh(자산 미러 백업 + 파괴 방지 가드) 테스트.
# 임시 디렉토리만 사용, 라이브 스택 불필요(CI 실행). 판정 조회는 실제 TS 로직
# (scripts/asset-dirs.ts)을 호출해 셸 재구현이 없음을 함께 보증한다. AC-1~9, AC-25.
# 실행: bash scripts/backup-assets.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/backup-assets.sh"
MARKER=".localmind-mirror"

pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
TEST_HOME="$TMP/home"; mkdir -p "$TEST_HOME"

run_assets() { # run_assets <BACKUP_DIR> <env파일> [추가 env...]
  local bk="$1" envf="$2"; shift 2
  OUT="$(HOME="$TEST_HOME" BACKUP_DIR="$bk" LOCALMIND_ENV_FILE="$envf" \
        env -u NOTES_DIR -u LOCALMIND_AGENTS_DIR -u LOCALMIND_SKILLS_DIR "$@" bash "$SCRIPT" 2>&1)"
  RC=$?
}

# ── AC-1·AC-25: 첫 노트 폴더(BACKUP_DIR 밖, .env 폴백)의 자산이 미러+마커로 포함 ──
B1="$TMP/b1"; R1="$TMP/repoA"; E1="$TMP/e1.env"
mkdir -p "$B1" "$R1/agents" "$R1/skills/s"
echo "persona" > "$R1/agents/x.md"; echo "skill" > "$R1/skills/s/SKILL.md"
printf 'NOTES_DIR="repoA=%s"\n' "$R1" > "$E1"
run_assets "$B1" "$E1"
assert "AC-1: agents 미러 포함" '[ -f "$B1/agents/x.md" ]'
assert "AC-1: skills 미러 포함(하위 폴더 보존)" '[ -f "$B1/skills/s/SKILL.md" ]'
assert "AC-1: 두 미러에 마커 기록" '[ -f "$B1/agents/$MARKER" ] && [ -f "$B1/skills/$MARKER" ]'
assert "AC-25: .env 폴백으로 판정 확정 — 가드 미발동·0 종료" '[ "$RC" -eq 0 ]'

# ── AC-2: 삭제 반영 ──
echo "p2" > "$R1/agents/y.md"; run_assets "$B1" "$E1"
rm "$R1/agents/y.md";          run_assets "$B1" "$E1"
assert "AC-2: 소스에서 삭제된 파일이 미러에서도 제거" '[ ! -f "$B1/agents/y.md" ] && [ -f "$B1/agents/x.md" ]'

# ── AC-9: *.bak-* 제외 ──
echo "bak" > "$R1/agents/y.md.bak-20260704"; run_assets "$B1" "$E1"
assert "AC-9: .bak 보존본은 미러로 실려 가지 않음" '[ ! -f "$B1/agents/y.md.bak-20260704" ] && [ "$RC" -eq 0 ]'

# ── AC-3: 빈 소스 + 기존 미러 → 삭제 거부 + 자산명·탈출구 경고 + 비0 ──
rm -f "$R1/agents/"*.md "$R1/agents/"*.bak-*
run_assets "$B1" "$E1"
assert "AC-3: 미러 보존(삭제 반영 거부)" '[ -f "$B1/agents/x.md" ]'
assert "AC-3: 경고에 자산명(agents) 포함" 'printf %s "$OUT" | grep -q "agents"'
assert "AC-3: 경고에 탈출구(BACKUP_CONFIRM_EMPTY_ASSETS) 안내" 'printf %s "$OUT" | grep -q "BACKUP_CONFIRM_EMPTY_ASSETS=agents"'
assert "AC-3: 비0 종료" '[ "$RC" -ne 0 ]'
assert "AC-3: 노트 백업을 막지 않는 독립 단계(skills는 정상 미러 유지)" '[ -f "$B1/skills/s/SKILL.md" ]'

# ── AC-4: 탈출구는 자산별 — agents만 반영, skills는 가드 유지 ──
rm -rf "$R1/skills"; mkdir -p "$R1/skills"   # skills 소스도 빈 폴더(미러는 존재)
run_assets "$B1" "$E1" BACKUP_CONFIRM_EMPTY_ASSETS=agents
assert "AC-4: agents 미러만 빈 상태 반영" '[ ! -f "$B1/agents/x.md" ]'
assert "AC-4: skills 미러는 불변(자산별 격리)" '[ -f "$B1/skills/s/SKILL.md" ]'
assert "AC-4: skills 쪽 경고 유지 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "BACKUP_CONFIRM_EMPTY_ASSETS=skills"'

# ── AC-5: 후퇴 가드(env·.env 모두 없음 + 소스/미러 존재) ──
B5="$TMP/b5"; E5="$TMP/e5.env"; mkdir -p "$B5"; : > "$E5"
mkdir -p "$TEST_HOME/.localmind/agents"; echo "stale" > "$TEST_HOME/.localmind/agents/old.md"
run_assets "$B5" "$E5"
assert "AC-5: 후퇴 상태에서 미러 미진행(생성 안 됨)" '[ ! -d "$B5/agents" ]'
assert "AC-5: 해결 명령 포함 경고" 'printf %s "$OUT" | grep -q "NOTES_DIR"'
assert "AC-5: 비0 종료" '[ "$RC" -ne 0 ]'
OVR="$TMP/ovr-agents"; mkdir -p "$OVR"; echo "ovr" > "$OVR/o.md"
mkdir -p "$TEST_HOME/.localmind/skills/sk"; echo "stale" > "$TEST_HOME/.localmind/skills/sk/SKILL.md"  # AC-5 Given: 소스 존재
run_assets "$B5" "$E5" LOCALMIND_AGENTS_DIR="$OVR"
assert "AC-5: override 자산은 후퇴 아님 — agents 정상 미러" '[ -f "$B5/agents/o.md" ]'
assert "AC-5: 나머지(skills)만 가드 — 비0 유지" '[ "$RC" -ne 0 ] && [ ! -d "$B5/skills" ]'

# ── AC-6: 미사용자(소스·미러 모두 없음) — 후퇴여도 조용히 0 ──
B6="$TMP/b6"; E6="$TMP/e6.env"; mkdir -p "$B6"; : > "$E6"
rm -rf "$TEST_HOME/.localmind"
run_assets "$B6" "$E6"
assert "AC-6: 경고 없음" '[ -z "$OUT" ]'
assert "AC-6: 0 종료(하위호환)" '[ "$RC" -eq 0 ]'

# ── AC-7: 소스가 BACKUP_DIR 안(자기 복사 금지) + 잔존 마커 제거 — 심링크 변형 포함 ──
B7="$TMP/b7"; E7="$TMP/e7.env"; mkdir -p "$B7/agents"
echo "canon" > "$B7/agents/c.md"; echo "잔존" > "$B7/agents/$MARKER"
ln -s "$B7" "$TMP/b7link"
printf 'NOTES_DIR="main=%s/"\n' "$TMP/b7link" > "$E7"   # 심링크+후행 슬래시 변형
run_assets "$B7" "$E7"
assert "AC-7: 자기 복사 없이 0 종료" '[ "$RC" -eq 0 ] && [ -f "$B7/agents/c.md" ]'
assert "AC-7: 잔존 마커 제거(정본으로 전환 — recover 오판 방지)" '[ ! -f "$B7/agents/$MARKER" ]'

# ── AC-8: LOCALMIND_AGENTS_DIR·LOCALMIND_SKILLS_DIR 재지정 존중 ──
B8="$TMP/b8"; E8="$TMP/e8.env"; A8="$TMP/a8"; S8="$TMP/s8"
mkdir -p "$B8" "$A8" "$S8/sk"; : > "$E8"
echo "a" > "$A8/a.md"; echo "s" > "$S8/sk/SKILL.md"
run_assets "$B8" "$E8" LOCALMIND_AGENTS_DIR="$A8" LOCALMIND_SKILLS_DIR="$S8"
assert "AC-8: 두 override 폴더가 미러 소스" '[ -f "$B8/agents/a.md" ] && [ -f "$B8/skills/sk/SKILL.md" ] && [ "$RC" -eq 0 ]'

# ── 복사 실패 삼킴 금지(리뷰 결함 3): 읽기 불가 파일 → 경고 + 비0, 나머지는 미러 ──
B9="$TMP/b9"; E9="$TMP/e9.env"; A9="$TMP/a9"
mkdir -p "$B9" "$A9"; : > "$E9"
echo "ok" > "$A9/ok.md"; echo "no" > "$A9/no.md"; chmod 000 "$A9/no.md"
run_assets "$B9" "$E9" LOCALMIND_AGENTS_DIR="$A9"
assert "복사 실패: 경고 + 비0(조용한 부분 유실 금지)" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "반영 실패"'
assert "복사 실패: 나머지 파일은 미러됨(인질 아님)" '[ -f "$B9/agents/ok.md" ]'
chmod 644 "$A9/no.md"

# ── 배선: backup.sh가 커밋 전에 자산 단계를 호출(015 인질 금지 정책) ──
assert "배선: backup.sh가 backup-assets.sh 호출" 'grep -q "backup-assets.sh" "$ROOT/scripts/backup.sh"'
assert "배선: 실패 시 FAILURES 요약에 편입" 'grep -q "자산" "$ROOT/scripts/backup.sh"'
assert "배선: Makefile backup이 BACKUP_CONFIRM_EMPTY_ASSETS 전달" 'grep -q "BACKUP_CONFIRM_EMPTY_ASSETS" "$ROOT/Makefile"'

echo ""
echo "019 backup-assets(FR-1) 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
