#!/usr/bin/env bash
# specs/014 FR-6·7 — 게이트웨이 키 자동 생성(ensure-master-key.sh) 테스트.
# 임시 디렉토리만 사용 — 라이브 스택·네트워크 불필요(CI에서 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/ensure-master-key.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

key_of() { grep -E '^LITELLM_MASTER_KEY=' "$1" | head -1 | cut -d= -f2-; }

# ── AC-6: 빈 값이면 임의 키 생성, 두 번 생성한 값은 서로 다르다 ──
printf 'LITELLM_MASTER_KEY=\n' > "$TMP/a.env"
bash "$SCRIPT" "$TMP/a.env" >/dev/null
k1="$(key_of "$TMP/a.env")"
printf 'LITELLM_MASTER_KEY=\n' > "$TMP/b.env"
bash "$SCRIPT" "$TMP/b.env" >/dev/null
k2="$(key_of "$TMP/b.env")"
assert "AC-6: 빈 키가 임의 값으로 채워진다" '[ -n "$k1" ]'
assert "AC-6: 생성 키는 sk-local이 아니다" '[ "$k1" != "sk-local" ]'
assert "AC-6: 두 번의 생성 결과가 서로 다르다(설치마다 다른 키)" '[ "$k1" != "$k2" ]'
assert "AC-6: 키 길이가 충분하다(엔트로피)" '[ "$(printf %s "$k1" | wc -c | tr -d " ")" -ge 40 ]'

# ── 키 라인 자체가 없어도 추가된다 ──
printf 'OTHER=1\n' > "$TMP/c.env"
bash "$SCRIPT" "$TMP/c.env" >/dev/null
assert "키 라인이 없으면 추가된다" '[ -n "$(key_of "$TMP/c.env")" ]'
assert "기존 다른 변수는 보존된다" 'grep -q "^OTHER=1$" "$TMP/c.env"'

# ── AC-9: 이미 값이 있으면(레거시 sk-local 포함) 바꾸지 않는다 ──
printf 'LITELLM_MASTER_KEY=sk-local\n' > "$TMP/d.env"
bash "$SCRIPT" "$TMP/d.env" >/dev/null
assert "AC-9: 레거시 sk-local은 덮어쓰지 않는다(기존 사용자 무파손)" '[ "$(key_of "$TMP/d.env")" = "sk-local" ]'
printf 'LITELLM_MASTER_KEY=my-custom-key\n' > "$TMP/e.env"
bash "$SCRIPT" "$TMP/e.env" >/dev/null
assert "AC-9: 사용자 커스텀 키는 덮어쓰지 않는다" '[ "$(key_of "$TMP/e.env")" = "my-custom-key" ]'

# ── .env 없으면 안내 후 비0 종료 ──
bash "$SCRIPT" "$TMP/none.env" >/dev/null 2>&1
assert ".env 없으면 비0 종료" '[ $? -ne 0 ]'

# ── AC-7(정적 배선): up.sh가 키 부재 시 중단하고, init-env가 생성을 배선한다 ──
assert "AC-7: up.sh에 키 부재 중단 가드 존재" 'grep -q "LITELLM_MASTER_KEY=.\+" "$ROOT/scripts/up.sh" && grep -q "ensure-master-key" "$ROOT/scripts/up.sh"'
assert "AC-6: Makefile init-env가 ensure-master-key를 호출" 'grep -q "ensure-master-key" "$ROOT/Makefile"'
assert "AC-7: compose가 키를 필수로 요구(:? 구문)" 'grep -q "LITELLM_MASTER_KEY:?" "$ROOT/docker-compose.yml"'

echo ""
echo "014 master-key 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
