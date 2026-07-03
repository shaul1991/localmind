#!/usr/bin/env bash
# specs/015 FR-6 + AC-3·10 — backup-cron.sh 등록 라인·문구 테스트 (DRY_RUN만 — crontab 안 건드림).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/backup-cron.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

# ── AC-10: 커스텀 변수가 크론 라인에 실린다 ─────────────────────────────────
OUT="$(DRY_RUN=1 BACKUP_DIR=/tmp/custom-notes BACKUP_EXTRA_FILES='~/.claude/CLAUDE.md' bash "$SCRIPT" </dev/null 2>&1)"
assert "AC-10: 커스텀 BACKUP_DIR이 크론 라인에 포함" 'printf %s "$OUT" | grep -q "BACKUP_DIR=\"/tmp/custom-notes\""'
assert "AC-10: BACKUP_EXTRA_FILES가 크론 라인에 포함" 'printf %s "$OUT" | grep -q "BACKUP_EXTRA_FILES="'
assert "AC-10: DRY_RUN은 등록하지 않는다" 'printf %s "$OUT" | grep -q "미리보기"'

# ── 기본값이면 크론 라인을 불필요하게 어지럽히지 않는다 ─────────────────────
OUT2="$(DRY_RUN=1 bash "$SCRIPT" </dev/null 2>&1)"
assert "기본값: BACKUP_DIR을 라인에 싣지 않음" '! printf %s "$OUT2" | grep -q "BACKUP_DIR="'
assert "기본값: BACKUP_EXTRA_FILES를 라인에 싣지 않음" '! printf %s "$OUT2" | grep -q "BACKUP_EXTRA_FILES="'

# ── AC-3: 안내 문구가 실제 동작(스택 꺼짐 → 노트는 백업)과 일치 ─────────────
assert "AC-3: '노트는 백업' 정합 문구 존재" 'grep -q "노트는 백업" "$SCRIPT"'
assert "AC-3: 낡은 문구('켜져 있을 때만 동작') 제거됨" '! grep -q "켜져 있을 때.*만 동작" "$SCRIPT"'

echo ""
echo "015 backup-cron 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
