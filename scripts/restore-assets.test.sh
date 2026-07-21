#!/usr/bin/env bash
# specs/019 FR-2·FR-4 — restore-assets.sh(자산 복원·배포 재실행·쿼리 로그 병합) 테스트.
# 임시 디렉토리 + 가짜 npm(배포 호출 기록/실패 주입)만 사용, 라이브 스택 불필요(CI 실행).
# AC-11~15, AC-19~21. 실행: bash scripts/restore-assets.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/restore-assets.sh"
MARKER=".localmind-mirror"

pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
TEST_HOME="$TMP/home"

# 가짜 npm: run 호출을 기록, DEPLOY_FAIL=1이면 배포만 실패. node는 실제(판정 조회용).
mkdir -p "$TMP/bin"
cat > "$TMP/bin/npm" <<'S'
#!/bin/sh
echo "$@" >> "$NPM_LOG"
if [ "${DEPLOY_FAIL:-}" = "1" ]; then case "$*" in *agents:deploy*|*skills:deploy*) exit 1;; esac; fi
exit 0
S
chmod +x "$TMP/bin/npm"

setup() { # setup <케이스명> → BK, ENVF, LOG 초기화 + HOME 리셋
  BK="$TMP/$1-bk"; ENVF="$TMP/$1.env"; NPM_LOG="$TMP/$1-npm.log"
  rm -rf "$TEST_HOME"; mkdir -p "$TEST_HOME" "$BK"; : > "$ENVF"; : > "$NPM_LOG"
}
run_restore() { # run_restore [추가 env...]
  OUT="$(HOME="$TEST_HOME" BACKUP_DIR="$BK" LOCALMIND_ENV_FILE="$ENVF" NPM_LOG="$NPM_LOG" \
        PATH="$TMP/bin:$PATH" env -u NOTES_DIR -u QUERY_LOG -u LOCALMIND_AGENTS_DIR -u LOCALMIND_SKILLS_DIR \
        "$@" bash "$SCRIPT" 2>&1)"
  RC=$?
}

# ── AC-11: 복원(.bak 보존+교체) + 배포 실행 ──
setup ac11; T="$TMP/ac11-target"
mkdir -p "$BK/agents" "$T/agents"
printf 'NOTES_DIR="w=%s"\n' "$T" > "$ENVF"
echo "새 버전" > "$BK/agents/y.md"; echo "옛 버전" > "$T/agents/y.md"
run_restore
assert "AC-11: 기존 파일이 .bak-<ts>로 보존" 'ls "$T/agents/"y.md.bak-* >/dev/null 2>&1'
assert "AC-11: 백업본으로 교체" 'grep -q "새 버전" "$T/agents/y.md"'
assert "AC-11: agents:deploy·skills:deploy 실행" 'grep -q "agents:deploy" "$NPM_LOG" && grep -q "skills:deploy" "$NPM_LOG"'
assert "AC-11: 0 종료" '[ "$RC" -eq 0 ]'

# AC-11 후반: 복원 대상 == 백업 원본(기본 구성) → 복사 없이 배포만
setup ac11b
mkdir -p "$BK/agents"; echo "정본" > "$BK/agents/z.md"
printf 'NOTES_DIR="main=%s"\n' "$BK" > "$ENVF"
run_restore
assert "AC-11 후반: 같은 경로면 복사 생략(.bak 미생성) + 배포 실행" \
  '! ls "$BK/agents/"*.bak-* >/dev/null 2>&1 && grep -q "agents:deploy" "$NPM_LOG" && [ "$RC" -eq 0 ]'

# ── AC-12: 삭제 전파(.bak 보존) + *.bak-*·마커 비대상 ──
setup ac12; T="$TMP/ac12-target"
mkdir -p "$BK/agents" "$T/agents"
printf 'NOTES_DIR="w=%s"\n' "$T" > "$ENVF"
echo "x" > "$BK/agents/x.md"; echo "마커" > "$BK/agents/$MARKER"
echo "x" > "$T/agents/x.md"; echo "z" > "$T/agents/z.md"; echo "b" > "$T/agents/w.md.bak-1"
run_restore
assert "AC-12: 백업에 없는 z.md는 .bak 보존 후 제거" '[ ! -f "$T/agents/z.md" ] && ls "$T/agents/"z.md.bak-* >/dev/null 2>&1'
assert "AC-12: 기존 .bak 파일은 건드리지 않음" '[ -f "$T/agents/w.md.bak-1" ]'
assert "AC-12: 마커는 정본 폴더로 복사되지 않음" '[ ! -f "$T/agents/$MARKER" ]'
# AC-12 후반: 백업에 자산 폴더 자체가 없으면 아무것도 제거하지 않음
setup ac12b; T="$TMP/ac12b-target"
mkdir -p "$T/agents"; echo "keep" > "$T/agents/k.md"
printf 'NOTES_DIR="w=%s"\n' "$T" > "$ENVF"
run_restore
assert "AC-12 후반: 백업 폴더 없음 → 로컬 무손실 + 0 종료" '[ -f "$T/agents/k.md" ] && [ "$RC" -eq 0 ]'

# ── AC-13: 복원 후퇴 가드(+마커 → 순서 안내) / 미사용 스킵 ──
setup ac13
mkdir -p "$BK/agents"; echo "p" > "$BK/agents/p.md"; echo "m" > "$BK/agents/$MARKER"
run_restore   # env·.env 모두 NOTES_DIR 없음 + 기본 대상은 BACKUP_DIR 밖
assert "AC-13: 자산 복원 보류(로컬 미변경)" '[ ! -d "$TEST_HOME/.localmind/agents" ]'
assert "AC-13: notes-connect 순서 안내 포함" 'printf %s "$OUT" | grep -q "notes-connect"'
assert "AC-13: 비0 종료" '[ "$RC" -ne 0 ]'
setup ac13b   # 백업에 자산 폴더 없음(미사용) + 후퇴
run_restore
assert "AC-13 후반: 미사용자 restore는 경고 없이 0(하위호환)" '[ "$RC" -eq 0 ] && ! printf %s "$OUT" | grep -q "agents"'

# ── AC-14: 배포 실패 → 복원은 완료 + 비0(restore·recover 공통) ──
setup ac14; T="$TMP/ac14-target"
mkdir -p "$BK/agents"; echo "d" > "$BK/agents/d.md"
printf 'NOTES_DIR="w=%s"\n' "$T" > "$ENVF"
run_restore DEPLOY_FAIL=1
assert "AC-14(restore): 파일 복원은 완료" '[ -f "$T/agents/d.md" ]'
assert "AC-14(restore): 배포 실패 시 비0" '[ "$RC" -ne 0 ]'
setup ac14r
mkdir -p "$BK/agents"; echo "d" > "$BK/agents/d.md"   # 마커 없음 = 기본 구성 백업 → 배포 호출됨
run_restore DEPLOY_FAIL=1 RESTORE_CONTEXT=recover
assert "AC-14(recover): 배포 실패 시 비0" '[ "$RC" -ne 0 ]'

# ── AC-15: recover 마커 판정 ──
setup ac15
mkdir -p "$BK/agents"; echo "p" > "$BK/agents/p.md"; echo "m" > "$BK/agents/$MARKER"
run_restore RESTORE_CONTEXT=recover
assert "AC-15: 마커 존재 → 복원·배포 미실행" '[ ! -d "$TEST_HOME/.localmind/agents" ] && ! grep -q "agents:deploy" "$NPM_LOG"'
assert "AC-15: 말미 순서 안내(notes-connect 후 make restore)" 'printf %s "$OUT" | grep -q "notes-connect" && printf %s "$OUT" | grep -q "make restore"'
assert "AC-15: 보류는 실패가 아님 — 0 종료" '[ "$RC" -eq 0 ]'
setup ac15b
mkdir -p "$BK/agents"; echo "p" > "$BK/agents/p.md"   # 마커 없음(기본 구성 백업)
run_restore RESTORE_CONTEXT=recover
assert "AC-15 후반: 마커 없으면 복사 없이 배포 실행" 'grep -q "agents:deploy" "$NPM_LOG" && [ "$RC" -eq 0 ]'

# ── AC-19: 쿼리 로그 병합(합집합 6줄) + 즉시 연속 멱등 ──
setup ac19
NOW="$(date -u +%Y-%m-%dT%H:%M:%S).000Z"
line() { printf '{"ts":"%s","tool":"search_notes","query":"%s","hitCount":1,"success":true}\n' "$1" "$2"; }
line "$NOW" q1 >  "$BK/query-log.mac-a.jsonl"
line "$NOW" q2 >> "$BK/query-log.mac-a.jsonl"
line "$NOW" dup >> "$BK/query-log.mac-a.jsonl"
line "$NOW" q3 >  "$BK/query-log.mac-b.jsonl"
line "$NOW" dup >> "$BK/query-log.mac-b.jsonl"
line "$NOW" q4 >> "$BK/query-log.mac-b.jsonl"
LOCAL_LOG="$TEST_HOME/.localmind/query-log.jsonl"; mkdir -p "$(dirname "$LOCAL_LOG")"
line "$NOW" local1 > "$LOCAL_LOG"
line "$NOW" q1    >> "$LOCAL_LOG"   # 백업과 1줄 중복
run_restore
assert "AC-19: 중복 없는 합집합 6줄" '[ "$(wc -l < "$LOCAL_LOG" | tr -d " ")" = "6" ]'
run_restore
assert "AC-19: 즉시 연속 재실행 멱등" '[ "$(wc -l < "$LOCAL_LOG" | tr -d " ")" = "6" ] && [ "$RC" -eq 0 ]'

# ── AC-20: 백업 유래만 30일 필터 · 로컬 기간-외 유지 · 파싱 불가 유지 ──
setup ac20
line "2020-01-01T00:00:00.000Z" old-backup >  "$BK/query-log.mac-a.jsonl"
line "$NOW" fresh                          >> "$BK/query-log.mac-a.jsonl"
printf 'no-timestamp-line\n'               >> "$BK/query-log.mac-a.jsonl"
LOCAL_LOG="$TEST_HOME/.localmind/query-log.jsonl"; mkdir -p "$(dirname "$LOCAL_LOG")"
line "2020-01-01T00:00:00.000Z" old-local > "$LOCAL_LOG"
run_restore
assert "AC-20: 백업 유래 기간-외 라인은 들어오지 않음" '! grep -q "old-backup" "$LOCAL_LOG"'
assert "AC-20: 로컬 기간-외 라인은 유지(clean 암묵 수행 금지)" 'grep -q "old-local" "$LOCAL_LOG"'
assert "AC-20: 기간-내 라인은 병합" 'grep -q "fresh" "$LOCAL_LOG"'
assert "AC-20: 타임스탬프 파싱 불가 라인은 유지(유실 방지)" 'grep -q "no-timestamp-line" "$LOCAL_LOG"'

# ── AC-21: 병합본을 query-report가 그대로 읽는다(실제 npm) ──
QUERY_LOG="$LOCAL_LOG" npm run --silent query-report >/dev/null 2>&1
assert "AC-21: query-report가 병합본으로 에러 없이 집계" '[ "$?" -eq 0 ]'

# ── 리뷰 결함 1(치명): 판정 조회 실패 시 파괴 금지 + 정직한 비0 ──
setup guard1
mkdir -p "$BK/agents"; echo "p" > "$BK/agents/p.md"
printf '#!/bin/sh\nexit 1\n' > "$TMP/bin/node"; chmod +x "$TMP/bin/node"   # 판정 조회 강제 실패
run_restore
assert "판정 실패: 백업 자산 있으면 경고+비0(거짓 성공 금지)" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "판정에 실패"'
assert "판정 실패: 배포도 실행되지 않음" '! grep -q ":deploy" "$NPM_LOG"'
assert "판정 실패: 로컬 무변경(루트/커런트 디렉토리 오염 없음)" '[ ! -d "$TEST_HOME/.localmind/agents" ]'
setup guard2   # 백업에 자산 없음 + 판정 실패 → 조용히 0
run_restore
assert "판정 실패: 자산 미사용이면 조용히 0" '[ "$RC" -eq 0 ]'
rm -f "$TMP/bin/node"   # node 스텁 제거(이후 테스트는 실제 node)

# ── 리뷰 결함 2(중대): 혼합 구성에서 보류 자산은 배포도 억제(AC-15 정밀) ──
setup mixed
mkdir -p "$BK/agents" "$BK/skills/s"
echo "p" > "$BK/agents/p.md"; echo "m" > "$BK/agents/$MARKER"   # agents = 미러(보류 대상)
echo "s" > "$BK/skills/s/SKILL.md"                              # skills = 기본 구성(반영 대상)
run_restore RESTORE_CONTEXT=recover
assert "혼합: skills만 배포, 보류된 agents는 배포 억제" 'grep -q "skills:deploy" "$NPM_LOG" && ! grep -q "agents:deploy" "$NPM_LOG"'
assert "혼합: 보류 안내 + 0 종료" 'printf %s "$OUT" | grep -q "notes-connect" && [ "$RC" -eq 0 ]'

# ── 리뷰 결함 3(중대): 복사 실패가 삼켜지지 않음(비0 + 경고) ──
setup cpfail; T="$TMP/cpfail-target"
mkdir -p "$BK/agents" "$T/agents"
printf 'NOTES_DIR="w=%s"\n' "$T" > "$ENVF"
echo "d" > "$BK/agents/d.md"
chmod 555 "$T/agents"   # 대상 폴더 쓰기 금지 → cp 실패
run_restore
chmod 755 "$T/agents"   # teardown 가능하게 원복
assert "복사 실패: 경고 + 비0(조용한 부분 유실 금지)" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "불완전"'

# ── 배선: Makefile restore + recover.sh ──
assert "배선: Makefile restore가 restore-assets.sh 호출" 'grep -q "restore-assets.sh" "$ROOT/Makefile"'
assert "배선: recover.sh가 RESTORE_CONTEXT=recover로 호출" 'grep -q "RESTORE_CONTEXT=recover" "$ROOT/scripts/recover.sh"'

# ── AC-27: recover 시작 시 전환 사전 안내(FR-7) — docker 스텁으로 초반만 실행 ──
printf '#!/bin/sh\n[ "$1" = "info" ] && exit 1\nexit 0\n' > "$TMP/bin/docker"; chmod +x "$TMP/bin/docker"
OUT="$(PATH="$TMP/bin:$PATH" HOME="$TEST_HOME" BACKUP_DIR="$TMP/none" LOCALMIND_ENV_FILE="$TMP/recover.env" \
      bash "$ROOT/scripts/recover.sh" </dev/null 2>&1)"
assert "AC-27: 이전 기기 make backup 확인 안내 출력" 'printf %s "$OUT" | grep -q "make backup"'
assert "AC-27: 백업 이후 데이터는 오지 않음 고지" 'printf %s "$OUT" | grep -q "넘어오지 않아요"'
assert "AC-27: 비대화 환경에서 자동 진행(안내 후 다음 단계 도달)" 'printf %s "$OUT" | grep -q "자동 진행"'

# ── AC-14(recover 실행): 전 단계 스텁으로 recover를 끝까지 실행 — 배포 실패에도
#    중간 abort 없이 "복구 완료" 도달 + 실패 요약 + 비0(리뷰 결함 4) ──
printf '#!/bin/sh\nexit 0\n' > "$TMP/bin/docker"; chmod +x "$TMP/bin/docker"   # info·compose 모두 성공
printf '#!/bin/sh\nprintf 200\n' > "$TMP/bin/curl"; chmod +x "$TMP/bin/curl"   # 헬스 대기 즉시 통과
run_recover() { # run_recover <BACKUP_DIR> [추가 env...]
  local bk="$1"; shift
  : > "$TMP/recover-npm.log"
  OUT="$(PATH="$TMP/bin:$PATH" HOME="$TEST_HOME" BACKUP_DIR="$bk" LOCALMIND_ENV_FILE="$TMP/recover.env" \
        NPM_LOG="$TMP/recover-npm.log" env -u NOTES_DIR -u QUERY_LOG "$@" bash "$ROOT/scripts/recover.sh" </dev/null 2>&1)"
  RC=$?
}
BKR="$TMP/recover-bk"; mkdir -p "$BKR/agents"
git -C "$BKR" init -q 2>/dev/null; echo "노트" > "$BKR/note.md"; echo "m" > "$BKR/memory.md"
echo "p" > "$BKR/agents/p.md"    # 마커 없음(기본 구성 백업) → recover가 배포 시도
run_recover "$BKR" DEPLOY_FAIL=1
assert "AC-14(recover 실행): 중간 abort 없이 복구 완료 도달" 'printf %s "$OUT" | grep -q "복구 완료"'
assert "AC-14(recover 실행): 노트 단계 완료(인질 아님 — 메모리 서비스는 great-reduction으로 소멸)" 'printf %s "$OUT" | grep -q "노트로 복원"'
assert "AC-14(recover 실행): 실패 요약 + 비0" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "완료되지 않았어요"'
echo "m2" > "$BKR/agents/$MARKER"    # 마커 부여 → 보류 경로
run_recover "$BKR"
assert "AC-15(recover 실행): 마커 보류는 0 종료 + 순서 안내" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "notes-connect"'
rm -f "$TMP/bin/docker" "$TMP/bin/curl"

echo ""
echo "019 restore-assets(FR-2·4) 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
