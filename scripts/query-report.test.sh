#!/usr/bin/env bash
# specs/004 AC-4·5·6 — query-report.ts 분석 스크립트 테스트 (임시 로그 파일만 사용, CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run_report() { # run_report <로그경로> [추가인자...]
  OUT="$(cd "$ROOT" && QUERY_LOG="$1" npx tsx scripts/query-report.ts "${@:2}" 2>&1)"
  RC=$?
}

rec() { # rec <로그> <일전> <tool> <query> <hit> <success> [sources-json]
  local ts
  ts="$(node -e "process.stdout.write(new Date(Date.now()-$2*86400000).toISOString())")"
  printf '{"ts":"%s","tool":"%s","query":"%s","hitCount":%s,"success":%s,"folder":null,"sources":%s}\n' \
    "$ts" "$3" "$4" "$5" "$6" "${7:-[]}" >> "$1"
}

rec_scored() { # rec_scored <로그> <일전> <query> <topScore>  — 025 신규 라인(스코어 보유 성공)
  local ts
  ts="$(node -e "process.stdout.write(new Date(Date.now()-$2*86400000).toISOString())")"
  printf '{"ts":"%s","tool":"search_notes","query":"%s","hitCount":2,"success":true,"folder":null,"sources":["n/a.md"],"topScore":%s}\n' \
    "$ts" "$3" "$4" >> "$1"
}

# ── AC-5: 로그 없음 → 안내 + exit 0 ─────────────────────────────────────────
run_report "$TMP/none.jsonl"
assert "AC-5: 로그 없으면 exit 0" '[ "$RC" -eq 0 ]'
assert "AC-5: 사용 안내 출력" 'printf %s "$OUT" | grep -q "로그"'

# ── AC-6: 20건 미만 → 데이터 부족 경고 + 부분 리포트 ────────────────────────
L6="$TMP/small.jsonl"
for i in 1 2 3; do rec "$L6" 1 search_notes "백업 방법 $i" 0 false; done
for i in 4 5; do rec "$L6" 1 search_notes "쿼리$i" 2 true; done
run_report "$L6"
assert "AC-6: exit 0" '[ "$RC" -eq 0 ]'
assert "AC-6: '데이터 부족' 경고 + 건수 표기" 'printf %s "$OUT" | grep -q "데이터 부족" && printf %s "$OUT" | grep -q "5"'

# ── 025 AC-5: 스코어 분포 게이트(SCORE_MIN_SAMPLES=10, 모집단 = topScore 보유 성공분) ──
L25A="$TMP/scored.jsonl"
for i in $(seq 1 10); do rec_scored "$L25A" 1 "스코어질의$i" "0.$i"; done
for i in $(seq 1 12); do rec "$L25A" 1 search_notes "레거시$i" 1 true; done   # 총 22건(전체 게이트도 통과)
run_report "$L25A"
assert "025 AC-5: 보유 10건 → 스코어 분포 섹션 출력" 'printf %s "$OUT" | grep -q "스코어 분포"'
assert "025 AC-5: 중앙값 표기" 'printf %s "$OUT" | grep -q "중앙값"'
assert "025 AC-5: 스코어 미기록(레거시) 건수 부기" 'printf %s "$OUT" | grep -q "미기록 12건"'
L25B="$TMP/scored-few.jsonl"
for i in $(seq 1 9); do rec_scored "$L25B" 1 "스코어질의$i" "0.$i"; done
for i in $(seq 1 20); do rec "$L25B" 1 search_notes "레거시$i" 1 true; done   # 전체 29건(insufficient 아님)
run_report "$L25B"
assert "025 AC-5: 보유 9건(<10)이면 전체 표본이 충분해도 분포 미출력(모집단 분리)" '! printf %s "$OUT" | grep -q "스코어 분포"'
assert "025 AC-5: 기존 집계는 불변(총 29건 표기·exit 0)" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "29"'

# ── AC-4: 20건 이상 → 성공률·실패 키워드 Top·개선 제안 ──────────────────────
L4="$TMP/full.jsonl"
for i in $(seq 1 12); do rec "$L4" 1 search_notes "회의록 배포 일정" 0 false; done
for i in $(seq 1 6); do rec "$L4" 2 ask_brain "백업 절차" 3 true '["notes/a.md"]'; done  # 역사 레코드 호환(great-reduction 이전 로그)
for i in $(seq 1 4); do rec "$L4" 3 search_notes "장보기 목록" 1 true; done
rec "$L4" 40 search_notes "옛날 쿼리(30일 밖)" 0 false # 최근 30일 필터 확인용
run_report "$L4"
assert "AC-4: exit 0" '[ "$RC" -eq 0 ]'
assert "AC-4: 총 쿼리 수·성공률 출력(30일 밖 제외 = 22건)" 'printf %s "$OUT" | grep -q "22"'
assert "AC-4: 실패 키워드 Top에 반복 실패 키워드 노출" 'printf %s "$OUT" | grep -q "회의록"'
assert "AC-4: 개선 제안 섹션 존재" 'printf %s "$OUT" | grep -q "제안"'
assert "AC-4: 실패율 50% 초과 제안(청크 크기) 노출" 'printf %s "$OUT" | grep -q "BRAIN_CHUNK_SIZE"'
assert "AC-4: 노트 갭(출처 없는 실패 주제) 섹션 존재" 'printf %s "$OUT" | grep -q "노트 갭"'

# ── FR-6: --clean이 30일 이전 항목을 정리 ────────────────────────────────────
before="$(wc -l < "$L4" | tr -d ' ')"
run_report "$L4" --clean
after="$(wc -l < "$L4" | tr -d ' ')"
assert "FR-6: --clean이 30일 이전 항목 제거(23→22줄)" '[ "$RC" -eq 0 ] && [ "$before" -eq 23 ] && [ "$after" -eq 22 ]'

# ── D-4 회귀: ts가 불량인 레코드는 clean이 보존한다(나이 단정 불가) ──────────
printf '{"ts":"invalid-date","tool":"search_notes","query":"불량ts레코드","hitCount":0,"success":false}\n' >> "$L4"
run_report "$L4" --clean
assert "D-4: 불량 ts 레코드는 clean에서 보존된다" '[ "$RC" -eq 0 ] && grep -q "불량ts레코드" "$L4"'
assert "D-4: clean이 원자적(temp 잔여 없음)" '! ls "$L4".tmp-* 2>/dev/null | grep -q .'

# ── 손상 라인 내성: 깨진 JSON 한 줄이 있어도 리포트가 계속된다 ──────────────
echo "not-json{{{" >> "$L4"
run_report "$L4"
assert "손상 라인이 있어도 exit 0(건너뜀)" '[ "$RC" -eq 0 ]'

echo ""
echo "004 query-report 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
