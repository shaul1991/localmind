#!/usr/bin/env bash
# specs/015 — 배선 정합 정적 가드 (FR-2 recover→extras · FR-8 up 헬스 · FR-9 .env 600).
# 라이브 실행이 무거운 경로(recover 전 과정·docker 기동)는 정적 검사로 회귀를 막고,
# 실동작은 BACKLOG A 라이브 항목에서 확인한다. (pinning.test.sh와 같은 접근)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

# ── FR-2: recover가 extras 복원을 포함한다("통째 복구" 약속) ──
assert "FR-2: recover.sh가 restore-extras를 호출" 'grep -q "restore-extras.sh" "$ROOT/scripts/recover.sh"'
assert "FR-2(회귀): make restore의 extras 배선 유지" 'grep -q "restore-extras.sh" "$ROOT/Makefile"'

# ── FR-1: make backup이 파이프라인 스크립트를 사용(인질 구조 제거) ──
assert "FR-1: make backup이 backup.sh 경유" 'grep -q "scripts/backup.sh" "$ROOT/Makefile"'
assert "FR-6: make backup-cron이 커스텀 변수를 전달" 'grep -qE "BACKUP_EXTRA_FILES=.*backup-cron.sh" "$ROOT/Makefile"'

# great-reduction(2026-07-21): up.sh(게이트웨이 스택)·claude-token.sh 제거 — 관련 배선 검증 소멸.

# ── FR-9/AC-13: .env 생성·기록 경로의 소유자 전용 권한 ──
assert "FR-9: init-env(Makefile)에 chmod 600" 'grep -A3 "cp .env.example .env" "$ROOT/Makefile" | grep -q "chmod 600 .env"'
assert "FR-9: recover.sh 생성 경로에 chmod 600" 'grep -q "chmod 600" "$ROOT/scripts/recover.sh"'

# AC-13의 동작 검증은 실제 코드 경로(init-env·up.sh 기동)가 docker·repo 루트 .env를
# 요구해 여기서 재현하지 않는다 — 위 정적 grep 4건으로 회귀를 막고, 실동작은 BACKLOG
# A12 라이브 항목에서 확인한다. (자기충족 assert는 self-review 지적으로 제거)

echo ""
echo "015 wiring 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
