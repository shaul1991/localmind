#!/usr/bin/env bash
# specs/032 — 회고 진입점 통합 테스트(fixture git repo·specs·노트 폴더, analyst 부재 경로).
# AC-6(쓰기 스코프 실행 전후 대조)·AC-8(analyst 부재)·AC-9(항상 생성·데이터 부족 명시).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# fixture: 대상 git repo(+specs) — OQ·취소선·결정 노트·가이드/계약 인벤토리
REPO="$TMP/repo"; mkdir -p "$REPO/specs/031-x" "$REPO/specs/030-y"
( cd "$REPO" && git init -q . && git config user.email t@t && git config user.name t )
printf '# S\n\n## Open questions (잔존 — 확정으로 이관)\n\n- 잔존 OQ 하나 — 반복되면 재론\n- ~~해결됨~~\n' > "$REPO/specs/031-x/spec.md"
printf '# S\n\n## Open questions\n\n1. 미해결 둘\n' > "$REPO/specs/030-y/spec.md"
( cd "$REPO" && git add -A && git commit -qm "feat: a (031)" && echo x > f && git add -A && git commit -qm "feat: b (031)" && echo y >> f && git add -A && git commit -qm "feat: c" )

# fixture: 노트 폴더(HOME 격리 — analyst 부재) + 결정 노트 + guides/projects
HOME_T="$TMP/home"; NOTES="$HOME_T/.localmind"
mkdir -p "$NOTES/guides" "$NOTES/projects/memo-api" "$HOME_T"
printf -- '---\ntitle: "결정: 티어"\ndate: 2026-07-05T01:00:00\ntags: ["decision"]\n---\n관련 specs/028-domain-specialist-personas\n' > "$NOTES/2026-decision.md"
printf -- '---\ntitle: "결정: 게이트"\ndate: 2026-07-05T02:00:00\ntags: [decision]\n---\n관련 specs/030-vibe-workflow-refinements\n' > "$NOTES/2026-decision2.md"
printf -- '---\ntitle: "리포트"\ntags: [report]\ntype: report\n---\n' > "$NOTES/old-report.md"
echo g > "$NOTES/guides/backend.md"; echo c > "$NOTES/projects/memo-api/api-contract.md"
AGENTS_SNAP="$TMP/agents-before"; mkdir -p "$NOTES/agents"; echo persona > "$NOTES/agents/critic.md"
cp -R "$NOTES/agents" "$AGENTS_SNAP"
echo "# 규약 원본" > "$REPO/AGENTS.md"; AGMD_HASH="$(shasum "$REPO/AGENTS.md")"

run_retro() { # [env K=V...]
  OUT="$(cd "$ROOT" && HOME="$HOME_T" NOTES_DIR="$NOTES" QUERY_LOG="$TMP/no-query.jsonl" \
    LOCALMIND_ENV_FILE="$TMP/empty.env" env "$@" npx tsx scripts/retro-report.ts 2>&1)"
  RC=$?
}
: > "$TMP/empty.env"

# AC-8/성공 경로: analyst 부재(HOME 격리) — 집계만·0 종료·노트 생성
run_retro RETRO_REPO="$REPO" RETRO_DAYS=14
assert "성공 경로: 0 종료 + 노트 생성" '[ "$RC" -eq 0 ] && ls "$NOTES/reports"/retro-*.md >/dev/null 2>&1'
NOTE="$(ls "$NOTES/reports"/retro-*.md | head -1)"
assert "AC-8: analyst 부재 → 집계만(플레이스홀더)" 'grep -q "analyst 페르소나 없음" "$NOTE"'
assert "AC-1: OQ 대시보드 — 미해결 2건·취소선 제외" 'grep -q "잔존 OQ 하나" "$NOTE" && grep -q "미해결 둘" "$NOTE" && ! grep -q "해결됨" "$NOTE"'
assert "AC-3: 결정 노트 수집(2건·스펙 포인터)·report 제외" 'grep -q "결정: 티어" "$NOTE" && grep -q "결정: 게이트" "$NOTE" && grep -q "030-vibe-workflow-refinements" "$NOTE" && ! grep -q "old-report" "$NOTE"'
assert "AC-5: 커밋 집계(3건·031 cadence 2)" 'grep -q "커밋 3건" "$NOTE" && grep -q "031(2)" "$NOTE"'
assert "AC-7: 게이트 고지 + 제안 표기" 'grep -q "제안까지만" "$NOTE" && grep -q "SDD 스펙" "$NOTE"'
assert "AC-10: reports/ 주의 렌더" 'grep -q "백업 저장소에 커밋" "$NOTE"'
assert "인벤토리: guides·projects" 'grep -q "backend.md" "$NOTE" && grep -q "memo-api" "$NOTE"'

# AC-6: 쓰기 스코프 — reports/ 밖 불변(agents·specs·AGENTS 대조)
assert "AC-6: agents/ 불변(내용 대조)" 'diff -r "$AGENTS_SNAP" "$NOTES/agents" >/dev/null'
assert "AC-6: AGENTS.md 불변(해시 대조)" '[ "$(shasum "$REPO/AGENTS.md")" = "$AGMD_HASH" ]'
assert "AC-6: 신규 파일은 reports/ 하나뿐" '[ "$(find "$NOTES" -name "retro-*.md" | wc -l | tr -d " ")" = "1" ] && [ -z "$(find "$REPO/specs" -newer "$NOTE" -name "*.md")" ]'

# AC-9: git repo 아님 + 데이터 없음 → 항상 생성 + 명시 + 0
NOREPO="$TMP/norepo"; mkdir -p "$NOREPO"
rm -rf "$NOTES/reports"
run_retro RETRO_REPO="$NOREPO" RETRO_DAYS=14
assert "AC-9: git 아님 → 노트 생성 + 명시 + 0 종료" '[ "$RC" -eq 0 ] && NOTE2=$(ls "$NOTES/reports"/retro-*.md) && grep -q "git 저장소가 아니" "$NOTE2"'
assert "AC-9: specs 없음 → OQ 공란 명시" 'grep -q "specs/ 폴더가 없" "$(ls "$NOTES/reports"/retro-*.md)"'

# AC-8b: analyst 존재 + 표본 부족 → 해석 생략. 한계(정직): 이 테스트는 "표본 부족" 렌더와
# 0 종료를 고정할 뿐, personaChat 미호출 자체는 게이트웨이 스텁 없이 관측 불가(가드보다
# 먼저 호출하는 회귀가 fail-fast로 우연히 통과할 이론적 여지 — codex 조언, 비차단).
cat > "$NOTES/agents/analyst.md" <<'P'
---
name: analyst
description: 분석가
targets:
  claude:
    model: sonnet
---
해석자.
P
rm -rf "$NOTES/reports" "$NOTES"/2026-decision*.md
NOREPO2="$TMP/norepo2"; mkdir -p "$NOREPO2"
run_retro RETRO_REPO="$NOREPO2" RETRO_DAYS=14
assert "AC-8b: analyst 존재+표본 부족 → 표본 부족 명시 + 0(미호출은 코드 가드 — 한계 주석)" '[ "$RC" -eq 0 ] && grep -q "표본 부족" "$(ls "$NOTES/reports"/retro-*.md)"'

echo ""
echo "032 retro 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
