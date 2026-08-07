#!/usr/bin/env bash
# verify.sh — specs/202608071624-agents-md-core-only 의 AC 결정적 검증기
#
# AGENTS.md 를 읽기만 한다 (절대 수정하지 않는다).
# 사용: bash specs/202608071624-agents-md-core-only/verify.sh
# 종료코드: 전부 통과 0 / 하나라도 실패 1

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TARGET="${REPO_ROOT}/AGENTS.md"

if [[ ! -f "$TARGET" ]]; then
  echo "FAIL setup  AGENTS.md 를 찾을 수 없다: $TARGET"
  exit 1
fi

pass_count=0
fail_count=0

ok()   { printf 'PASS %-7s %s\n' "$1" "$2"; pass_count=$((pass_count + 1)); }
bad()  { printf 'FAIL %-7s %s\n' "$1" "$2"; fail_count=$((fail_count + 1)); }

# 금지: 패턴이 등장하면 FAIL. 무엇을 매칭했는지 보여준다.
forbid() {
  local id="$1" desc="$2" pattern="$3"
  local hits
  hits="$(grep -nE -e "$pattern" "$TARGET" || true)"
  if [[ -n "$hits" ]]; then
    bad "$id" "$desc — 남아 있음:"
    printf '%s\n' "$hits" | head -3 | sed 's/^/            /'
  else
    ok "$id" "$desc"
  fi
}

# 필수: 패턴이 없으면 FAIL.
require() {
  local id="$1" desc="$2" pattern="$3"
  if grep -qE -e "$pattern" "$TARGET"; then
    ok "$id" "$desc"
  else
    bad "$id" "$desc — 찾을 수 없음: /$pattern/"
  fi
}

echo "== 검증 대상: $TARGET ($(wc -l < "$TARGET" | tr -d ' ')줄)"
echo
echo "-- FR1 정본 단일화 (부재)"
forbid AC1.1 "goal-impl {prefix} 처리 방법 절 삭제"        '^## .*goal-impl.*처리 방법'
forbid AC1.2 "SDD 흐름 — 기본값 절(스캐폴딩 절차) 삭제"     '^## SDD 흐름'
forbid AC1.3 "실행 등급 배치 절 삭제"                       '^## 실행 등급 배치'

echo
echo "-- FR1.4 정본 애드온 지목 (존재)"
require AC1.4a "sdd-5docs 를 이름으로 가리킴"               'sdd-5docs'
require AC1.4b "goal-impl 을 이름으로 가리킴"               'goal-impl'
require AC1.4c "localmind-core 를 이름으로 가리킴"          'localmind-core'

echo
echo "-- FR2 죽은 참조 제거 (부재)"
forbid AC2.1 "sdd-toolkit 참조 0회"                         'sdd-toolkit'
forbid AC2.2 "소멸 페르소나 참조 0회"                        'designer|ux-reviewer|backend-dev|security-reviewer|auth-dev'
forbid AC2.3 "goal-ready 참조 0회"                          'goal-ready'

echo
echo "-- FR3 미적용 규칙 삭제 (부재)"
forbid AC3.1 "프로젝트 계약 저장소 절 삭제"                  '^## 프로젝트 계약 저장소'
forbid AC3.2 "바이브 코딩 — 도메인 스페셜리스트 절 삭제"      '^## 바이브 코딩'
forbid AC3.3 "변경 등급 티어 절 삭제"                        '^## 변경 등급 티어'
require AC3.3b "의식의 크기는 작업 크기에 비례 — 원칙 존치"   '비례'

echo
echo "-- FR4 코어 규칙 무손실 (존재)"
require AC4.1 "최상위 전제 — 1차 사용자는 AI"                '1차 사용자는 사람이 아니라'
require AC4.2 "범위 우선순위 — 메타 동결"                    '메타 동결'
require AC4.3a "CalVer 형식"                                'YYYY\.MM\.MICRO'
require AC4.3b "MICRO 산정 — 태그 동기화 선행"               'git fetch --tags'
require AC4.4a "릴리스 5단계 — --verify-tag"                '--verify-tag'
require AC4.4b "안전장치 — gh 계정 확인"                     'gh auth status'
require AC4.5 "도그푸드 측정 위생 — QUERY_LOG 격리"          'QUERY_LOG'
require AC4.6 "결정 로그 태그"                               'tags: \["decision"\]'
require AC4.7 "오픈소스 대상 — 비개발자 포함"                '비개발자'
require AC4.9 "main 직접 push 금지 · PR 게이트"              'main 직접 push는 금지|main 직접 push 금지'

echo
echo "-- FR5 애드온 비의존 (존재)"
# '비차단' 단독은 현행 문서에도 이미 등장해 판별력이 없다 — 애드온 문맥에 묶어 검사한다.
require AC5.1 "애드온 미설치 시 비차단 명시"                  '애드온.*비차단|비차단.*애드온|애드온이 없.*진행|설치되지 않.*진행'

echo
echo "-- FR6 분량"
lines="$(wc -l < "$TARGET" | tr -d ' ')"
if [[ "$lines" -le 200 ]]; then ok AC6.1 "200줄 이하 (현재 ${lines}줄)"; else bad AC6.1 "200줄 이하여야 하는데 ${lines}줄"; fi
if [[ "$lines" -ge 100 ]]; then ok AC6.2 "100줄 이상 (현재 ${lines}줄)"; else bad AC6.2 "100줄 이상이어야 하는데 ${lines}줄 — 과잉 삭제 의심"; fi

echo
echo "== 집계: PASS ${pass_count} / FAIL ${fail_count}"
[[ "$fail_count" -eq 0 ]] || exit 1
