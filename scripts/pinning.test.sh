#!/usr/bin/env bash
# specs/010 공급망 고정 — 정적 회귀 가드. (+ specs/014: openmemory 편입)
# 외부 아티팩트 참조가 가변 태그로 되돌아가거나 고정 지점이 사라지는 것을 막는다.
# 접근: allowlist — 모든 compose image는 @sha256 digest 또는 구체 태그(숫자·v숫자·pg숫자)만
#       허용하고, latest/stable/main/edge/무태그 등 가변 참조는 거부한다.
# (라이브 도그푸드 AC-2·3는 BACKLOG A 항목 — 여기선 정적 검사 AC-1·4만.)
# 실행: bash scripts/pinning.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# great-reduction(2026-07-21): 게이트웨이 Dockerfile·openmemory 이미지 제거 — 남은 외부
# 아티팩트는 compose의 ollama뿐이라 검사 범위가 compose로 줄었다.

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

# 이미지 참조가 고정됐는가: digest 또는 구체 태그(숫자/v숫자/pg숫자로 시작)만 허용.
is_pinned() {
  local ref="$1" tag
  case "$ref" in
    *@sha256:*) return 0 ;;                      # digest 고정
    localmind|localmind-openmemory) return 0 ;;  # 로컬 빌드 이미지(외부 아티팩트 아님)
    *:*) tag="${ref##*:}" ;;
    *) return 1 ;;                               # 무태그 → 런타임에 :latest → 거부
  esac
  case "$tag" in
    [0-9]*|v[0-9]*|pg[0-9]*) return 0 ;;         # 구체 버전 태그
    *) return 1 ;;                               # latest/stable/main/edge/nightly 등 거부
  esac
}

# ── AC-1: 모든 docker-compose*.yml의 image가 고정 ───────────────
violations=""
for f in "$ROOT"/docker-compose*.yml; do
  [ -f "$f" ] || continue
  while IFS= read -r ln; do
    ref="$(printf '%s' "$ln" | sed -E 's/^[[:space:]]*image:[[:space:]]*//; s/[[:space:]]*#.*$//; s/[[:space:]]*$//')"
    [ -z "$ref" ] && continue
    is_pinned "$ref" || violations="$violations $(basename "$f"):[$ref]"
  done < <(grep -E '^[[:space:]]*image:[[:space:]]' "$f")
done
assert "AC-1: 모든 compose image가 고정(digest/구체태그)  위반:$violations" '[ -z "$violations" ]'

# ── 고정 지점 존재(FR-1~4) ──────────────────────────────────────
assert "FR-1: ollama digest 고정" 'grep -qE "ollama/ollama@sha256:[0-9a-f]{64}" "$ROOT/docker-compose.yml"'
# ── FR-5: 갱신 안내 주석 존재 ───────────────────────────────────
assert "FR-5: compose에 갱신 안내 주석 존재" 'grep -qE "갱신|올리려면|업데이트" "$ROOT/docker-compose.yml"'
# ── (역사) specs/014 openmemory 가드 — 이미지 제거 후에도 negative 자기검증으로
#    가드 함수 자체의 회귀만 확인한다(검사 대상 실파일은 소멸).

# openmemory Dockerfile 검사 함수 — negative 자기검증에도 재사용한다.
check_om() {
  local f="$1" bad=""
  grep -qE '^ARG PYTHON_TAG=[0-9]+\.[0-9]+\.[0-9]+-slim$' "$f" || bad="$bad python-tag-arg"
  grep -qE '^FROM python:\$\{PYTHON_TAG\}$' "$f" || bad="$bad from-arg"
  grep -qE '^ARG MEM0_COMMIT=[0-9a-f]{40}$' "$f" || bad="$bad mem0-commit-arg"
  # 무고정 clone 금지: 실제 git fetch/checkout **라인이** $MEM0_COMMIT 변수를 참조해야
  # 한다 — 파일 어딘가의 ARG 선언만으로 통과하면 거짓 green(self-review 결함 2).
  if grep -qE 'git (clone|fetch)' "$f" \
     && ! grep -qE 'git .*(fetch|checkout).*\$\{?MEM0_COMMIT' "$f"; then bad="$bad unpinned-clone"; fi
  grep -qE '갱신|올리려면|업데이트' "$f" || bad="$bad update-note"
  printf '%s' "$bad"
}

# negative 자기검증(014 AC-2): 가변으로 되돌린 사본은 반드시 걸려야 한다 — 가드의 거짓 green 방지.
NEG_TMP="$(mktemp -d)"
cat > "$NEG_TMP/Dockerfile" <<'NEG'
FROM python:3.12-slim
RUN git clone --depth 1 https://github.com/mem0ai/mem0 /tmp/mem0
NEG
neg_bad="$(check_om "$NEG_TMP/Dockerfile")"
assert "014(negative): 가변 태그·무고정 clone 사본을 가드가 잡아낸다" '[ -n "$neg_bad" ]'

# negative 2: ARG 선언은 남긴 채 clone만 무고정으로 되돌린 사본 — 결함 2 회귀 고정.
cat > "$NEG_TMP/Dockerfile2" <<'NEG'
ARG PYTHON_TAG=3.12.13-slim
FROM python:${PYTHON_TAG}
ARG MEM0_COMMIT=cd79fa8914b5b1cf66daacc957d826065df57df8
# 갱신 절차: ...
RUN git clone --depth 1 https://github.com/mem0ai/mem0 /tmp/mem0
NEG
neg2_bad="$(check_om "$NEG_TMP/Dockerfile2")"
rm -rf "$NEG_TMP"
assert "014(negative-2): ARG만 남기고 무고정 clone으로 되돌린 사본도 잡아낸다" \
  'printf %s "$neg2_bad" | grep -q "unpinned-clone"'

# 키 하드코딩 회귀: compose가 추측 가능한 기본 키(sk-local) 폴백으로 되돌아가지 않는다(014 FR-6).
assert "014: compose에 sk-local 기본 키 폴백 없음" '! grep -q "sk-local" "$ROOT/docker-compose.yml"'

echo ""
echo "010 pinning 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
