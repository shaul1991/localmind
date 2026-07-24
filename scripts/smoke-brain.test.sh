#!/usr/bin/env bash
# specs/202607241810 — smoke-brain이 도구 에러 응답을 실패로 판정하는지(거짓 안심 방지).
# 결정적 실패 경로만 검증: 임베딩 키 없는 환경 → search_notes가 isError 반환 →
# 스모크는 비0 + ✗ 이어야 한다. (성공 경로는 임베딩 엔진 필요 — 비헤르메틱이라 여기서 제외.)
# 전제: dist/mcp.js 빌드돼 있음(CI는 셸 테스트 전에 build 수행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
assert() { if eval "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# 키 부재 + 격리(노트 임시 폴더·쿼리 로그 격리 — specs/202607231810 수칙)
OUT="$(cd "$ROOT" && CLAUDE_JOB_DIR="$TMP" QUERY_LOG="$TMP/query-log.jsonl" \
      env -u EMBEDDINGS_KEY -u LITELLM_MASTER_KEY -u NOTES_DIR \
      node --import tsx/esm scripts/smoke-brain.ts 2>&1)"
RC=$?

assert "AC-1: 도구 에러 응답 → 비0 종료" '[ "$RC" -ne 0 ]'
assert "AC-1: ✗ 실패 표시 + 오류 본문 노출" 'printf %s "$OUT" | grep -q "✗" && printf %s "$OUT" | grep -q "임베딩 키"'
assert "AC-1: 거짓 통과 문구 없음" '! printf %s "$OUT" | grep -q "모든 second-brain 도구 통과"'

echo ""
echo "202607241810 smoke-brain 에러 판정 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
