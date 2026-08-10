#!/usr/bin/env bash
# specs/012 공용 헬퍼 read-env.sh 단위 테스트.
# FR-16의 보안 불변식(비실행 .env 읽기·자격증명 마스킹)이 여기 집중되므로 별도로 검증한다.
# 실행: bash scripts/read-env.test.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/scripts/lib/read-env.sh"

pass=0; fail=0
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE 플레이키 방지

TMP="$(mktemp -d)"; ENV="$TMP/.env"

# 값 읽기 + 감싼 따옴표 제거
printf 'NOTES_REPOS="work=git@github.com:u/r.git,life=/n/l"\n' > "$ENV"
v="$(read_env_val NOTES_REPOS "$ENV")"
assert "따옴표 벗기고 값 읽음" '[ "$v" = "work=git@github.com:u/r.git,life=/n/l" ]'

printf "NOTES_REPOS_DIR='/home/u/notes'\n" > "$ENV"
v="$(read_env_val NOTES_REPOS_DIR "$ENV")"
assert "홑따옴표도 벗김" '[ "$v" = "/home/u/notes" ]'

# 없는 키 → 빈 문자열
: > "$ENV"
v="$(read_env_val NOTES_REPOS "$ENV")"
assert "없는 키는 빈 값" '[ -z "$v" ]'

# AC-24: 비실행 읽기 — .env의 명령치환/명령이 실행되지 않는다
marker="$TMP/pwned"
printf 'NOTES_REPOS=$(touch %s)\n' "$marker" > "$ENV"
v="$(read_env_val NOTES_REPOS "$ENV")"
assert "AC-24: \$(...)가 실행되지 않음(marker 미생성)" '[ ! -e "$marker" ]'
assert "AC-24: 값은 리터럴로 읽힘" '[ "$v" = "\$(touch $marker)" ]'
printf 'NOTES_REPOS=x; touch %s\n' "$marker" > "$ENV"
read_env_val NOTES_REPOS "$ENV" >/dev/null
assert "AC-24: 'x; touch'도 실행 안 됨" '[ ! -e "$marker" ]'

# AC-23: mask_url — userinfo(토큰) 마스킹
m="$(mask_url "https://user:SECRETTOKEN@github.com/u/r.git")"
assert "AC-23: https 토큰 마스킹" 'printf "%s" "$m" | grep -q "https://\*\*\*@github.com" && ! printf "%s" "$m" | grep -q SECRETTOKEN'
m="$(mask_url "a https://u:TOK@h/x 그리고 ssh://v:TOK2@h2/y")"
assert "AC-23: 여러 URL 모두 마스킹" '! printf "%s" "$m" | grep -qE "TOK|TOK2"'
m="$(mask_url "git@github.com:u/r.git")"
assert "AC-23: scp형(토큰 없음)은 그대로" '[ "$m" = "git@github.com:u/r.git" ]'
multi_at_canary="SYNTHETIC_MULTI_AT_USERINFO_CANARY"
m="$(mask_url "https://user:SECRET@${multi_at_canary}@example.invalid/path")"
assert "AC-23: 다중 @ userinfo 전체를 마지막 authority delimiter까지 마스킹" \
  '[ "$m" = "https://***@example.invalid/path" ] && ! printf "%s" "$m" | grep -qE "SECRET|SYNTHETIC_MULTI_AT_USERINFO_CANARY"'
m="$(mask_url "https://host.example/path?token=QUERYSECRET#access_token=FRAGMENTSECRET")"
assert "AC-23: query/fragment credential 전체 제거" '! printf "%s" "$m" | grep -qE "QUERYSECRET|FRAGMENTSECRET|token=" && [ "$m" = "https://host.example/path" ]'
m="$(mask_url "prefix https://host.example/a?x=SECRET1 suffix https://other.example/b#SECRET2")"
assert "AC-23: 여러 URL의 query/fragment 모두 제거" '! printf "%s" "$m" | grep -qE "SECRET1|SECRET2"'

# 제어문자는 sed의 line/whitespace 경계를 분할해 userinfo canary를 마스킹 밖으로 밀어낼 수 있다.
# 로그 경계에 도달하기 전에 전체 값을 단일 안전 sentinel로 축약한다.
control_canary="SYNTHETIC_CONTROL_USERINFO_CANARY"
for control_name in newline tab carriage_return escape delete; do
  case "$control_name" in
    newline) control=$'\n' ;;
    tab) control=$'\t' ;;
    carriage_return) control=$'\r' ;;
    escape) control=$'\033' ;;
    delete) control=$'\177' ;;
  esac
  m="$(mask_url "https://user:${control}${control_canary}@example.invalid/repo.git")"
  assert "AC-23: $control_name 제어문자 userinfo는 전체 redact" \
    '[ "$m" = "[REDACTED]" ] && ! printf "%s" "$m" | grep -qF "$control_canary"'
done

rm -rf "$TMP"
echo ""
echo "012 read-env 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
