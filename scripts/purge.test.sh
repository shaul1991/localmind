#!/usr/bin/env bash
# specs/015 FR-3·4 — purge.sh 가드·정직한 보고 테스트.
# 임시 HOME + 가짜 docker/claude 스텁만 사용 — 실제 Docker·실제 홈을 건드리지 않는다(CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/purge.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 가짜 바이너리: docker(성공/실패)·claude(성공) — PATH 주입으로 실제 데몬 없이 검증.
mkdir -p "$TMP/bin-ok" "$TMP/bin-down" "$TMP/bin-downv-fail"
printf '#!/bin/sh\nexit 0\n' > "$TMP/bin-ok/docker";   chmod +x "$TMP/bin-ok/docker"
printf '#!/bin/sh\nexit 0\n' > "$TMP/bin-ok/claude";   chmod +x "$TMP/bin-ok/claude"
printf '#!/bin/sh\nexit 1\n' > "$TMP/bin-down/docker"; chmod +x "$TMP/bin-down/docker"
# 데몬은 살아있는데(docker info OK) compose down만 실패하는 스텁 — 결함2 회귀용
printf '#!/bin/sh\n[ "$1" = "info" ] && exit 0\nexit 1\n' > "$TMP/bin-downv-fail/docker"; chmod +x "$TMP/bin-downv-fail/docker"
cp "$TMP/bin-ok/claude" "$TMP/bin-downv-fail/claude"

run_purge() { # run_purge <PATH선두> <HOME> [env...] — stdout+exit코드 캡처
  local bin="$1" home="$2"; shift 2
  OUT="$( PATH="$bin:/usr/bin:/bin" HOME="$home" FORCE=1 "$@" bash "$SCRIPT" 2>&1 )"
  RC=$?
}

# ── AC-6: 홈 밖 경로는 기본 거부, PURGE_OUTSIDE_HOME=1이면 진행 ──────────────
FAKE_HOME="$TMP/home"; mkdir -p "$FAKE_HOME"
OUTSIDE="$TMP/outside-notes"; mkdir -p "$OUTSIDE"; echo x > "$OUTSIDE/note.md"

run_purge "$TMP/bin-ok" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$OUTSIDE"
assert "AC-6: 홈 밖 경로는 거부(비0 종료)" '[ "$RC" -ne 0 ]'
assert "AC-6: 거부 시 폴더가 그대로 남는다" '[ -f "$OUTSIDE/note.md" ]'
assert "AC-6: 거부 사유에 홈 밖 안내 포함" 'printf %s "$OUT" | grep -q "홈 폴더 밖"'

run_purge "$TMP/bin-ok" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$OUTSIDE" PURGE_OUTSIDE_HOME=1
assert "AC-6: PURGE_OUTSIDE_HOME=1이면 진행(폴더 삭제됨)" '[ ! -d "$OUTSIDE" ]'

# ── AC-7: 홈 안의 심링크가 홈 밖을 가리키면 실경로 기준으로 거부 ─────────────
OUTSIDE2="$TMP/outside2"; mkdir -p "$OUTSIDE2"; echo x > "$OUTSIDE2/note.md"
ln -s "$OUTSIDE2" "$FAKE_HOME/linked-notes"
run_purge "$TMP/bin-ok" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$FAKE_HOME/linked-notes"
assert "AC-7: 심링크의 실경로가 홈 밖이면 거부" '[ "$RC" -ne 0 ]'
assert "AC-7: 심링크 타겟이 그대로 남는다" '[ -f "$OUTSIDE2/note.md" ]'

# ── 홈 자체·루트 거부(기존 가드 회귀 고정) ───────────────────────────────────
run_purge "$TMP/bin-ok" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$FAKE_HOME"
assert "가드 회귀: 홈 자체는 거부" '[ "$RC" -ne 0 ] && [ -d "$FAKE_HOME" ]'

# ── AC-8: Docker 데몬이 꺼져 있으면 부분 완료를 정직하게 보고 ────────────────
NOTES_IN="$FAKE_HOME/.localmind"; mkdir -p "$NOTES_IN"; echo x > "$NOTES_IN/note.md"
run_purge "$TMP/bin-down" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$NOTES_IN"
assert "AC-8: Docker 다운 시 비0 종료" '[ "$RC" -ne 0 ]'
assert "AC-8: '완전 제거 완료'를 출력하지 않는다" '! printf %s "$OUT" | grep -q "완전 제거 완료"'
assert "AC-8: 남은 항목(볼륨·이미지)이 요약에 표기된다" 'printf %s "$OUT" | grep -q "일부가 남았어요"'
assert "AC-8: 노트 삭제는 확인된 의사대로 진행된다" '[ ! -d "$NOTES_IN" ]'

# ── 결함2 회귀: 데몬이 떠 있어도 down -v 실패는 부분 완료로 보고 ─────────────
run_purge "$TMP/bin-downv-fail" "$FAKE_HOME"
assert "결함2: down 실패 시 비0 종료" '[ "$RC" -ne 0 ]'
assert "결함2: '완전 제거 완료' 미출력 + 요약 표기" '! printf %s "$OUT" | grep -q "완전 제거 완료" && printf %s "$OUT" | grep -q "일부가 남았어요"'

# ── 정상 경로: 전부 성공하면 완료 메시지 + 0 종료 ───────────────────────────
NOTES_IN2="$FAKE_HOME/.localmind"; mkdir -p "$NOTES_IN2"; echo x > "$NOTES_IN2/note.md"
run_purge "$TMP/bin-ok" "$FAKE_HOME" env NOTES=1 BACKUP_DIR="$NOTES_IN2"
assert "정상: 전부 성공 시 0 종료" '[ "$RC" -eq 0 ]'
assert "정상: '완전 제거 완료' 출력" 'printf %s "$OUT" | grep -q "완전 제거 완료"'
assert "정상: 노트 폴더 삭제됨" '[ ! -d "$NOTES_IN2" ]'

echo ""
echo "015 purge 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
