#!/usr/bin/env bash
# specs/010 공급망 고정 — 정적 회귀 가드.
# 외부 아티팩트 참조가 가변 태그로 되돌아가거나 고정 지점이 사라지는 것을 막는다.
# 접근: allowlist — 모든 compose image는 @sha256 digest 또는 구체 태그(숫자·v숫자·pg숫자)만
#       허용하고, latest/stable/main/edge/무태그 등 가변 참조는 거부한다.
# (라이브 도그푸드 AC-2·3는 BACKLOG A 항목 — 여기선 정적 검사 AC-1·4만.)
# 실행: bash scripts/pinning.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE="$ROOT/Dockerfile"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

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

# ── AC-1(Dockerfile): FROM에 가변 태그 없음 ─────────────────────
assert "AC-1: Dockerfile FROM에 :latest/가변 태그 없음" \
  '! grep -qE "^FROM[[:space:]]+\S+:(latest|stable|main|edge|nightly)\b" "$DOCKERFILE"'
assert "AC-1: Dockerfile에 무태그·하드코딩 node 태그 없음(ARG 경유만)" \
  '! grep -qE "^FROM[[:space:]]+node:[0-9]" "$DOCKERFILE"'

# ── 고정 지점 존재(FR-1~4) ──────────────────────────────────────
assert "FR-1: ollama digest 고정" 'grep -qE "ollama/ollama@sha256:[0-9a-f]{64}" "$ROOT/docker-compose.yml"'
assert "FR-1: litellm digest 고정" 'grep -qE "berriai/litellm@sha256:[0-9a-f]{64}" "$ROOT/docker-compose.yml"'
assert "FR-3: codex 버전 고정" 'grep -qE "@openai/codex@[0-9]+\.[0-9]+\.[0-9]+" "$DOCKERFILE"'
assert "FR-2: claude 설치 버전 인자 고정" 'grep -qE "install\.sh \| bash -s -- [0-9]+\.[0-9]+\.[0-9]+" "$DOCKERFILE"'

# ── AC-4: node 버전이 단일 지점(ARG)에만 — FROM은 변수 참조 ─────
assert "AC-4/FR-4: node 버전이 ARG 한 곳에만 정의" \
  '[ "$(grep -cE "^ARG NODE_VERSION=[0-9]+\.[0-9]+\.[0-9]+$" "$DOCKERFILE")" -eq 1 ]'
assert "AC-4: 두 FROM 모두 \${NODE_VERSION} 변수 참조" \
  '[ "$(grep -cE "^FROM node:\\\$\{NODE_VERSION\}-slim" "$DOCKERFILE")" -eq 2 ]'

# ── FR-5: 갱신 안내 주석 존재 ───────────────────────────────────
assert "FR-5: compose에 갱신 안내 주석 존재" 'grep -qE "갱신|올리려면|업데이트" "$ROOT/docker-compose.yml"'
assert "FR-5: Dockerfile에 갱신 안내 주석 존재" 'grep -qE "갱신|올리려면|업데이트" "$DOCKERFILE"'

# ── FR-6/AC-5: 비-root 결정 기록 ────────────────────────────────
assert "AC-5: 비-root 실행 결정(적용/보류 근거) 주석 존재" 'grep -qE "비-root|비루트|non-root|USER node" "$DOCKERFILE"'

echo ""
echo "010 pinning 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
