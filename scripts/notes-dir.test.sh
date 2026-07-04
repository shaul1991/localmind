#!/usr/bin/env bash
# specs/019 FR-6 — NOTES_DIR 정본 해석·기록·MCP 발산 감지(lib/notes-dir.sh + reindex.sh 진입점) 테스트.
# 임시 디렉토리·스텁만 사용, 라이브 스택·claude CLI 불필요(CI 실행). AC-23(기록)·AC-24(폴백)·AC-26(경고).
# 실행: bash scripts/notes-dir.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/lib/read-env.sh"
. "$ROOT/scripts/lib/notes-dir.sh"

pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ENV="$TMP/.env"; EXAMPLE="$TMP/.env.example"
TEST_HOME="$TMP/home"; mkdir -p "$TEST_HOME"

# ── resolve_notes_dir: 우선순위 환경변수 → .env → 빈 값 ─────────────────
printf 'NOTES_DIR="a=/x,b=/y"\n' > "$ENV"
v="$(NOTES_DIR="c=/z" resolve_notes_dir "$ENV")"
assert "resolve: 환경변수가 .env보다 우선" '[ "$v" = "c=/z" ]'
v="$(NOTES_DIR="" resolve_notes_dir "$ENV")"
assert "resolve: .env 폴백(감싼 따옴표 벗김)" '[ "$v" = "a=/x,b=/y" ]'
: > "$ENV"
v="$(NOTES_DIR="" resolve_notes_dir "$ENV")"
assert "resolve: 둘 다 없으면 빈 값(호출부 기본값)" '[ -z "$v" ]'

# ── record_notes_dir: .env 생성(600) + 멱등 upsert (AC-23 재료) ─────────
rm -f "$ENV"
printf '# 예시\nOTHER=1\n' > "$EXAMPLE"
record_notes_dir "l=/n1" "$ENV" "$EXAMPLE"
assert "record: .env가 .env.example에서 생성됨(다른 키 포함)" 'grep -q "^OTHER=1" "$ENV"'
# GNU(-c) 먼저 — BSD식 'stat -f %Lp'는 GNU에서 파일시스템 정보를 stdout에 찍으며 실패해
# 폴백 출력이 그 뒤에 붙는다(CI ubuntu 실측). BSD에선 -c가 stderr로만 실패해 폴백이 깨끗하다.
perm="$(stat -c %a "$ENV" 2>/dev/null || stat -f %Lp "$ENV" 2>/dev/null)"
assert "record: 생성된 .env 권한 600(015 FR-9 계승)" '[ "$perm" = "600" ]'
assert "record: NOTES_DIR 기록" '[ "$(read_env_val NOTES_DIR "$ENV")" = "l=/n1" ]'
record_notes_dir "l=/n2,m=/n3" "$ENV" "$EXAMPLE"
assert "record: 재기록 시 중복 없이 교체(멱등)" '[ "$(grep -cE "^NOTES_DIR=" "$ENV")" -eq 1 ] && [ "$(read_env_val NOTES_DIR "$ENV")" = "l=/n2,m=/n3" ]'
assert "record: 기존 다른 키 보존" 'grep -q "^OTHER=1" "$ENV"'
rm -f "$EXAMPLE"; rm -f "$ENV"
record_notes_dir "solo=/only" "$ENV" "$EXAMPLE"
assert "record: example 없어도 빈 .env 생성 + 기록" '[ "$(read_env_val NOTES_DIR "$ENV")" = "solo=/only" ]'

# ── mcp_notes_dir: MCP 등록 조회(스텁 설정 파일) — 오탐 금지 ─────────────
CFG="$TMP/claude.json"
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"m=/mcp1,n=/mcp2"}}}}' > "$CFG"
v="$(LOCALMIND_MCP_CONFIG="$CFG" mcp_notes_dir)"
assert "mcp: 등록 env에서 NOTES_DIR 읽음" '[ "$v" = "m=/mcp1,n=/mcp2" ]'
v="$(LOCALMIND_MCP_CONFIG="$TMP/none.json" mcp_notes_dir)"
assert "mcp: 설정 파일 없으면 빈 값(조용히 건너뜀)" '[ -z "$v" ]'
printf 'not json' > "$CFG"
v="$(LOCALMIND_MCP_CONFIG="$CFG" mcp_notes_dir)"
assert "mcp: 파싱 불가도 빈 값(조용히 건너뜀)" '[ -z "$v" ]'

# ── warn_notes_dir_divergence: 후퇴+MCP 상이 → 경고 / 일치·부재 → 침묵 ──
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"m=/mcp1,n=/mcp2"}}}}' > "$CFG"
w="$(HOME="$TEST_HOME" LOCALMIND_MCP_CONFIG="$CFG" warn_notes_dir_divergence 2>&1 >/dev/null)"
assert "발산: MCP 등록이 기본값과 다르면 경고(stderr)" 'printf %s "$w" | grep -q "NOTES_DIR"'
assert "발산: 경고에 MCP 등록 값 표시" 'printf %s "$w" | grep -q "m=/mcp1,n=/mcp2"'
assert "발산: 경고에 해결 명령 안내" 'printf %s "$w" | grep -q "mcp-install"'
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"%s"}}}}' "$TEST_HOME/.localmind" > "$CFG"
w="$(HOME="$TEST_HOME" LOCALMIND_MCP_CONFIG="$CFG" warn_notes_dir_divergence 2>&1 >/dev/null)"
assert "발산: MCP 등록이 기본값과 같으면 침묵" '[ -z "$w" ]'
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"main=%s/"}}}}' "$TEST_HOME/.localmind" > "$CFG"
w="$(HOME="$TEST_HOME" LOCALMIND_MCP_CONFIG="$CFG" warn_notes_dir_divergence 2>&1 >/dev/null)"
assert "발산: 라벨·후행 슬래시만 다른 동일 폴더도 침묵(오탐 방지)" '[ -z "$w" ]'
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"main=~/.localmind"}}}}' > "$CFG"
w="$(HOME="$TEST_HOME" LOCALMIND_MCP_CONFIG="$CFG" warn_notes_dir_divergence 2>&1 >/dev/null)"
assert "발산: ~ 표기의 동일 폴더도 침묵(TS expandHome과 동일 규칙)" '[ -z "$w" ]'
w="$(HOME="$TEST_HOME" LOCALMIND_MCP_CONFIG="$TMP/none.json" warn_notes_dir_divergence 2>&1 >/dev/null)"
assert "발산: 조회 불가면 침묵(오탐 금지)" '[ -z "$w" ]'

# ── reindex.sh 진입점: .env 폴백(AC-24)·발산 경고 후 진행(AC-26)·restore 폴백 ──
mkdir -p "$TMP/bin"
cat > "$TMP/bin/npm" <<'S'
#!/bin/sh
printf 'NOTES_DIR=%s\n' "${NOTES_DIR:-}" >> "$NPM_LOG"
printf 'KEY=%s\n' "${LITELLM_MASTER_KEY:-}" >> "$NPM_LOG"
printf 'FALLBACK=%s\n' "${REINDEX_FALLBACK:-}" >> "$NPM_LOG"
printf 'PRUNE=%s\n' "${REINDEX_PRUNE_LABELS:-}" >> "$NPM_LOG"
printf 'ADOPT=%s\n' "${REINDEX_ADOPT_REBIND:-}" >> "$NPM_LOG"
printf 'BATCH=%s\n' "${BRAIN_BATCH:-}" >> "$NPM_LOG"
exit 0
S
chmod +x "$TMP/bin/npm"
run_reindex() { # run_reindex <env파일> <추가 env...>
  local envf="$1"; shift
  : > "$TMP/npm.log"
  OUT="$(PATH="$TMP/bin:$PATH" NPM_LOG="$TMP/npm.log" LOCALMIND_ENV_FILE="$envf" HOME="$TEST_HOME" \
        env -u NOTES_DIR "$@" bash "$ROOT/scripts/reindex.sh" 2>&1)"
  RC=$?
}

printf 'NOTES_DIR="a=/x,b=/y,c=/z"\nLITELLM_MASTER_KEY=k1\n' > "$ENV"
run_reindex "$ENV"
assert "AC-24: 셸 env 없이도 .env의 NOTES_DIR(3개 폴더)로 재색인" 'grep -q "NOTES_DIR=a=/x,b=/y,c=/z" "$TMP/npm.log"'
assert "reindex: LITELLM 키도 .env에서 폴백" 'grep -q "KEY=k1" "$TMP/npm.log"'
assert "reindex: 정상 0 종료" '[ "$RC" -eq 0 ]'

printf 'LITELLM_MASTER_KEY=k1\n' > "$ENV"
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"m=/mcp1"}}}}' > "$CFG"
run_reindex "$ENV" LOCALMIND_MCP_CONFIG="$CFG"
assert "AC-26: env·.env 모두 없음 + MCP 상이 → 경고 출력" 'printf %s "$OUT" | grep -q "m=/mcp1"'
assert "AC-26: 경고 후에도 색인은 진행" 'grep -q "^NOTES_DIR=$" "$TMP/npm.log"'

run_reindex "$ENV" LOCALMIND_MCP_CONFIG="$TMP/none.json" REINDEX_FALLBACK_DIR="$TMP/bk"
assert "restore 폴백: REINDEX_FALLBACK_DIR가 최후 폴백으로 쓰임" 'grep -q "NOTES_DIR=$TMP/bk" "$TMP/npm.log"'
assert "020 AC-11: 폴백 재할당 경로에서도 REINDEX_FALLBACK=1 신호 전달" 'grep -q "^FALLBACK=1$" "$TMP/npm.log"'

# ── 020 AC-11: 후퇴 신호·정리 라벨의 배선 ────────────────────────────────────
printf 'NOTES_DIR="a=/x"\nLITELLM_MASTER_KEY=k1\n' > "$ENV"
run_reindex "$ENV" REINDEX_PRUNE_LABELS=old
assert "020 AC-11: REINDEX_PRUNE_LABELS 명시 전달" 'grep -q "^PRUNE=old$" "$TMP/npm.log"'
assert "020 AC-11: 정상 해석 시 후퇴 신호 없음" 'grep -q "^FALLBACK=$" "$TMP/npm.log"'
printf 'LITELLM_MASTER_KEY=k1\n' > "$ENV"
run_reindex "$ENV" LOCALMIND_MCP_CONFIG="$TMP/none.json"
assert "020 AC-11: env·.env 모두 부재(재할당 없음)도 REINDEX_FALLBACK=1" 'grep -q "^FALLBACK=1$" "$TMP/npm.log"'
assert "020 AC-11 배선: Makefile reindex가 REINDEX_PRUNE_LABELS 전달" 'sed -n "/^reindex:/,/^$/p" "$ROOT/Makefile" | grep -q "REINDEX_PRUNE_LABELS"'

# ── 024 AC-9: 재바인딩 수락(REINDEX_ADOPT_REBIND) 배선 ──────────────────────
printf 'NOTES_DIR="a=/x"\nLITELLM_MASTER_KEY=k1\n' > "$ENV"
run_reindex "$ENV" REINDEX_ADOPT_REBIND=moved
assert "024 AC-9: REINDEX_ADOPT_REBIND 명시 전달" 'grep -q "^ADOPT=moved$" "$TMP/npm.log"'
assert "024 AC-9 배선: Makefile reindex가 REINDEX_ADOPT_REBIND 전달" 'sed -n "/^reindex:/,/^$/p" "$ROOT/Makefile" | grep -q "REINDEX_ADOPT_REBIND"'

# ── 021 AC-5: 호스트 라우팅 배치 프로파일(판정 입력 = $ENV_FILE 하나, 격리 존중) ──
printf 'NOTES_DIR="a=/x"\nOLLAMA_API_BASE=http://host.docker.internal:11434/v1\n' > "$ENV"
run_reindex "$ENV"
assert "021 AC-5: 호스트 라우팅이면 BRAIN_BATCH=32 기본 주입" 'grep -q "^BATCH=32$" "$TMP/npm.log"'
run_reindex "$ENV" BRAIN_BATCH=4
assert "021 AC-5: 명시 BRAIN_BATCH가 프로파일보다 우선" 'grep -q "^BATCH=4$" "$TMP/npm.log"'
printf 'NOTES_DIR="a=/x"\n' > "$ENV"
run_reindex "$ENV"
assert "021 AC-5: 비호스트 라우팅이면 미주입(기존 기본 유지)" 'grep -q "^BATCH=$" "$TMP/npm.log"'
# 오탐 방지(codex 교차 리뷰): 주석·비활성 라인의 host URL은 라우팅이 아니다 — 유효값만 판정
printf '# OLLAMA_API_BASE=http://host.docker.internal:11434/v1 (예시)\nNOTES_DIR="a=/x"\nOLLAMA_API_BASE=http://ollama:11434/v1\n' > "$ENV"
run_reindex "$ENV"
assert "021 AC-5: 주석 속 host URL + 유효값 docker → 미주입(오탐 방지)" 'grep -q "^BATCH=$" "$TMP/npm.log"'

# ── AC-22: doctor의 NOTES_DIR 정합 점검(FR-5) ────────────────────────────
run_doctor() { # run_doctor <env파일> <mcp설정|없는경로> [추가 env...]
  local envf="$1" mcp="$2"; shift 2
  OUT="$(HOME="$TEST_HOME" LOCALMIND_ENV_FILE="$envf" LOCALMIND_MCP_CONFIG="$mcp" \
        env -u NOTES_DIR "$@" bash "$ROOT/scripts/doctor.sh" 2>&1)"
  RC=$?
}
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"a=/x,b=/y,c=/z"}}}}' > "$CFG"
: > "$ENV"   # 셸 유효값 = 기본(~/.localmind) → 불일치
run_doctor "$ENV" "$CFG"
assert "AC-22: 불일치 경고 출력" 'printf %s "$OUT" | grep -q "불일치"'
assert "AC-22: 빠지는 폴더 목록 표시" 'printf %s "$OUT" | grep -q -- "- a=/x"'
assert "AC-22: 해결 명령 안내" 'printf %s "$OUT" | grep -q "mcp-install"'
assert "AC-22: 종료 코드 0 유지(진단 전용)" '[ "$RC" -eq 0 ]'
printf 'NOTES_DIR="a=/x,b=/y,c=/z"\n' > "$ENV"   # 셸 유효값 = MCP와 동일 → 일치
run_doctor "$ENV" "$CFG"
assert "AC-22: 일치 시 경고 없음" '! printf %s "$OUT" | grep -q "불일치"'
printf 'NOTES_DIR="p=/x,q=/y,r=/z"\n' > "$ENV"   # 라벨만 다르고 폴더 집합 동일 → 일치(오탐 방지)
run_doctor "$ENV" "$CFG"
assert "AC-22: 라벨만 달라도 폴더 집합이 같으면 일치" '! printf %s "$OUT" | grep -q "불일치"'
run_doctor "$ENV" "$TMP/none.json"               # 조회 불가 → 점검 자체 생략
assert "AC-22: 조회 불가 시 점검 출력 없음(오탐 금지)" '! printf %s "$OUT" | grep -q "노트 폴더 정합"'

# ── 022 AC-6~9: doctor 라우팅 유효값 판정 + 고아·부재 라벨 안내 ────────────
printf '# OLLAMA_API_BASE=http://host.docker.internal:11434/v1 (예시)\nNOTES_DIR="a=/x"\nOLLAMA_API_BASE=http://ollama:11434/v1\n' > "$ENV"
run_doctor "$ENV" "$TMP/none.json"
assert "022 AC-6: 주석 host URL + 유효값 docker → Docker 라우팅 표시" 'printf %s "$OUT" | grep -q "현재 라우팅.*Docker"'
printf 'NOTES_DIR="a=/x"\nOLLAMA_API_BASE=http://host.docker.internal:11434/v1\n' > "$ENV"
run_doctor "$ENV" "$TMP/none.json"
assert "022 AC-6: 유효값 host → 호스트 라우팅 표시" 'printf %s "$OUT" | grep -q "현재 라우팅.*호스트"'
assert "022 AC-7: doctor 라우팅이 read_env_val 유효값 판정 사용(배선)" 'grep -q "read_env_val OLLAMA_API_BASE" "$ROOT/scripts/doctor.sh"'
assert "022 AC-7: litellm.config.yaml 죽은 가지 제거(배선)" '! grep -q "litellm.config.yaml" "$ROOT/scripts/doctor.sh"'

IDX22="$TMP/labels-idx.json"; OK22="$TMP/ok22"; GONE22="$TMP/gone22"   # GONE22는 생성하지 않음
mkdir -p "$OK22"
printf '{"version":4,"files":{"old/a.md":{"hash":"h","folder":"old","chunks":[],"linksOut":[]},"gone22/b.md":{"hash":"h","folder":"gone22","chunks":[],"linksOut":[]},"ok22/c.md":{"hash":"h","folder":"ok22","chunks":[],"linksOut":[]}}}' > "$IDX22"
printf 'NOTES_DIR="ok22=%s,gone22=%s"\n' "$OK22" "$GONE22" > "$ENV"
printf '{"mcpServers":{"localmind":{"env":{"NOTES_DIR":"ok22=%s,gone22=%s"}}}}' "$OK22" "$GONE22" > "$CFG"
run_doctor "$ENV" "$CFG" BRAIN_INDEX="$IDX22"
assert "022 AC-8: 고아 라벨 안내(라벨·건수·보존)" 'printf %s "$OUT" | grep -q "old.*1건.*보존"'
assert "022 AC-8: 고아 라벨 정리 명령 안내" 'printf %s "$OUT" | grep -q "REINDEX_PRUNE_LABELS=old"'
assert "022 AC-8: 부재 라벨은 폴더 안내만" 'printf %s "$OUT" | grep -q "gone22.*열 수 없어"'
assert "022 AC-8: 부재 라벨에 정리 명령 금지" '! printf %s "$OUT" | grep -q "REINDEX_PRUNE_LABELS=gone22"'
assert "022 AC-8: RC 0 유지" '[ "$RC" -eq 0 ]'
assert "022 AC-8: 부재 폴더를 생성하지 않음(읽기 전용)" '[ ! -d "$GONE22" ]'
run_doctor "$ENV" "$TMP/none.json" BRAIN_INDEX="$IDX22"
assert "022 AC-8b: MCP 미등록에서도 라벨 안내 동일 동작" 'printf %s "$OUT" | grep -q "REINDEX_PRUNE_LABELS=old" && [ "$RC" -eq 0 ]'
assert "022 AC-8b: 부재 라벨 안내도 동일(정리 명령 금지 포함)" 'printf %s "$OUT" | grep -q "gone22.*열 수 없어" && ! printf %s "$OUT" | grep -q "REINDEX_PRUNE_LABELS=gone22"'
assert "022 AC-8b: 부재 폴더 미생성 유지" '[ ! -d "$GONE22" ]'
mkdir -p "$TMP/bin-nonode"; printf '#!/bin/sh\nexit 127\n' > "$TMP/bin-nonode/node"; chmod +x "$TMP/bin-nonode/node"
run_doctor "$ENV" "$TMP/none.json" BRAIN_INDEX="$IDX22" PATH="$TMP/bin-nonode:$PATH"
assert "022 AC-9: node 조회 불가(실패 스텁) → 라벨 안내 침묵 + RC 0" '! printf %s "$OUT" | grep -q "색인 라벨" && [ "$RC" -eq 0 ]'
run_doctor "$ENV" "$TMP/none.json" BRAIN_INDEX="$TMP/no-such-idx.json"
assert "022 AC-9: 색인 없음 → 라벨 안내 침묵 + RC 0" '! printf %s "$OUT" | grep -q "색인 라벨" && [ "$RC" -eq 0 ]'
printf 'not json' > "$IDX22"
run_doctor "$ENV" "$TMP/none.json" BRAIN_INDEX="$IDX22"
assert "022 AC-9: 손상 색인 → 라벨 안내 침묵 + RC 0" '! printf %s "$OUT" | grep -q "색인 라벨" && [ "$RC" -eq 0 ]'

# ── Makefile·notes-connect 배선 고정 ─────────────────────────────────────
assert "Makefile: NOTES_DIR ?= 기본값 주입 제거(폴백 가림 방지)" '! grep -qE "^NOTES_DIR[[:space:]]*\?=" "$ROOT/Makefile"'
assert "Makefile: reindex 타깃이 진입 스크립트(reindex.sh) 사용" 'sed -n "/^reindex:/,/^$/p" "$ROOT/Makefile" | grep -q "scripts/reindex.sh"'
assert "Makefile: restore 재색인이 REINDEX_FALLBACK_DIR 폴백 사용" 'grep -q "REINDEX_FALLBACK_DIR" "$ROOT/Makefile"'
assert "AC-23 후반: notes-connect가 mcp-install을 재사용(자동 충족 유지)" 'grep -q "mcp-install.sh" "$ROOT/scripts/notes-connect.sh"'

echo ""
echo "019 notes-dir(FR-6) 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
