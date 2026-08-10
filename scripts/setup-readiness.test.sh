#!/usr/bin/env bash
# Phase 1 A — setup 필수 readiness를 실제 사용자 경로(setup.sh)로 검증한다.
# 실제 HOME·노트·네트워크는 쓰지 않고, 복제한 최소 repo + 합성 OpenAI 호환 curl 경계만 쓴다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/setup.sh"
REAL_NODE_BIN="$(command -v node)"

pass=0; fail=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no() { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

TMP="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

HTTP_LOG=""

new_fixture() {
  local name="$1"
  CASE="$TMP/$name"
  FIXTURE_ROOT="$CASE/repo"
  mkdir -p "$FIXTURE_ROOT/scripts/lib" "$CASE/bin" "$CASE/home" "$CASE/notes" "$CASE/state"
  cp "$SCRIPT" "$FIXTURE_ROOT/scripts/setup.sh"
  cp "$ROOT/scripts/lib/read-env.sh" "$FIXTURE_ROOT/scripts/lib/read-env.sh"
  printf '# fixture\n' > "$FIXTURE_ROOT/.env.example"
  cat > "$FIXTURE_ROOT/scripts/doctor.sh" <<'EOF_DOCTOR'
#!/usr/bin/env bash
echo "[합성 진단]"
echo "[다음 단계]"
EOF_DOCTOR
  chmod +x "$FIXTURE_ROOT/scripts/doctor.sh"

  cat > "$CASE/bin/node" <<'EOF_NODE'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ] || [ "${1:-}" = "-v" ]; then
  printf '%s\n' "${FIXTURE_NODE_VERSION:-v20.0.0}"
  exit 0
fi
exec "$REAL_NODE_BIN" "$@"
EOF_NODE
  cat > "$CASE/bin/npm" <<'EOF_NPM'
#!/usr/bin/env bash
printf '%s\tfull=%s\n' "$*" "${LOCALMIND_SMOKE_FULL_FLOW:-0}" >> "$SETUP_CALL_LOG"
case "$*" in
  install*) exit "${FIXTURE_INSTALL_RC:-0}" ;;
  "run --silent build") exit "${FIXTURE_BUILD_RC:-0}" ;;
  "run --silent smoke:mcp")
    [ -z "${LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST:-}" ] || exit 83
    [ -z "${LOCALMIND_SMOKE_ALLOW_TEST_ENTRY:-}" ] || exit 84
    if [ "${LOCALMIND_SMOKE_FULL_FLOW:-}" = "1" ]; then
      exit "${FIXTURE_FULL_SMOKE_RC:-0}"
    else
      if [ -n "${FIXTURE_EXPECTED_SMOKE_NOTES:-}" ]; then
        [ "${NOTES_DIR:-}" = "$FIXTURE_EXPECTED_SMOKE_NOTES" ] || exit 81
        [ "${LOCALMIND_SMOKE_EXPECTED_LABELS:-}" = "${FIXTURE_EXPECTED_SMOKE_LABELS:-}" ] || exit 82
      fi
      exit "${FIXTURE_IDENTITY_SMOKE_RC:-0}"
    fi
    ;;
  *) exit 0 ;;
esac
EOF_NPM
  # 소켓 없이 OpenAI-compatible HTTP 경계를 합성한다. setup이 보내는 URL/body를 기록하고
  # /api/tags 및 /v1/embeddings 응답·HTTP 실패를 curl 종료 코드로 재현한다.
  cat > "$CASE/bin/curl" <<'EOF_CURL'
#!/usr/bin/env bash
original_args="$*"
url=""; body=""; output=""; auth="missing"
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output) output="${2:-}"; shift 2 ;;
    -d|--data|--data-raw|--data-binary) body="${2:-}"; shift 2 ;;
    -H|--header)
      header="${2:-}"
      if [[ "$header" == @* ]]; then
        header_file="${header#@}"
        if [ -f "$header_file" ] && grep -qxF "Authorization: Bearer ${FIXTURE_EXPECTED_EMBED_KEY:-}" "$header_file"; then
          auth="ok"
        fi
      elif [ "$header" = "Authorization: Bearer ${FIXTURE_EXPECTED_EMBED_KEY:-}" ]; then
        auth="argv"
      elif [[ "$header" == Authorization:* ]]; then
        auth="bad"
      fi
      shift 2 ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf 'url=%s\tbody=%s\tauth=%s\n' "$url" "$body" "$auth" >> "$SETUP_HTTP_LOG"
printf 'argv=%s\n' "$original_args" >> "$SETUP_HTTP_LOG"
if [[ "$url" == */embeddings ]]; then
  [ "$auth" = "ok" ] || exit 22
  expected_model='"model":"'"${FIXTURE_EXPECTED_EMBED_MODEL:-}"'"'
  [[ "$body" == *"$expected_model"* ]] || exit 22
  if [[ "$url" == *'/reject/'* ]]; then exit 22; fi
  if [[ "$url" == *'/wait/'* ]]; then
    printf '%s\n' "$$" > "$FIXTURE_CURL_PID_FILE"
    trap 'exit 143' HUP INT TERM
    while :; do sleep 1; done
  fi
  if [[ "$url" == *'/extra-row/'* ]]; then
    response='{"data":[{"index":0,"embedding":[1,0,0,0]},{"index":1,"embedding":[0,1,0,0]}]}'
  elif [[ "$url" == *'/object-data/'* ]]; then
    response='{"data":{"0":{"index":0,"embedding":[1,0,0,0]}}}'
  elif [[ "$url" == *'/float32-overflow/'* ]]; then
    response='{"data":[{"index":0,"embedding":[1e308,0,0,0]}]}'
  else
    response='{"data":[{"index":0,"embedding":[1,0,0,0]}]}'
  fi
elif [[ "$url" == */api/tags ]]; then
  response='{"models":[{"name":"fixture-model"}]}'
else
  response='{}'
fi
if [ -n "$output" ]; then printf '%s' "$response" > "$output"; else printf '%s' "$response"; fi
EOF_CURL
  chmod +x "$CASE/bin/node" "$CASE/bin/npm" "$CASE/bin/curl"
  OUT="$CASE/output.txt"
  CALL_LOG="$CASE/calls.txt"
  HTTP_LOG="$CASE/embedding-requests.log"
  : > "$CALL_LOG"
  : > "$HTTP_LOG"
  unset FIXTURE_EXPECTED_SMOKE_NOTES FIXTURE_EXPECTED_SMOKE_LABELS FIXTURE_BRAIN_INDEX FIXTURE_OMIT_BRAIN_INDEX
}

write_env() {
  local endpoint_kind="$1"
  cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=http://embedding.invalid/${endpoint_kind}/secret-url-marker/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=fixture-secret-key
EOF_ENV
}

run_setup() {
  local notes="$1" dry_run="${2:-}" node_version="${3:-v20.0.0}" install_rc="${4:-0}" build_rc="${5:-0}" identity_rc="${6:-0}" full_rc="${7:-0}"
  local brain_index="${FIXTURE_BRAIN_INDEX:-$CASE/state/index.json}"
  [ "${FIXTURE_OMIT_BRAIN_INDEX:-}" = "1" ] && brain_index=""
  set +e
  HOME="$CASE/home" TMPDIR="$CASE/state" PATH="$CASE/bin:/usr/bin:/bin" NOTES_DIR="$notes" BACKUP_DIR="$CASE/backup" \
    QUERY_LOG="$CASE/state/query-log.jsonl" BRAIN_INDEX="$brain_index" \
    DRY_RUN="$dry_run" FIXTURE_NODE_VERSION="$node_version" FIXTURE_INSTALL_RC="$install_rc" \
    FIXTURE_BUILD_RC="$build_rc" FIXTURE_IDENTITY_SMOKE_RC="$identity_rc" FIXTURE_FULL_SMOKE_RC="$full_rc" SETUP_CALL_LOG="$CALL_LOG" \
    SETUP_HTTP_LOG="$HTTP_LOG" REAL_NODE_BIN="$REAL_NODE_BIN" \
    FIXTURE_EXPECTED_EMBED_KEY="fixture-secret-key" \
    FIXTURE_EXPECTED_EMBED_MODEL="fixture-model" \
    FIXTURE_EXPECTED_SMOKE_NOTES="${FIXTURE_EXPECTED_SMOKE_NOTES:-}" \
    FIXTURE_EXPECTED_SMOKE_LABELS="${FIXTURE_EXPECTED_SMOKE_LABELS:-}" \
    LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST="$CASE/attacker-entry.mjs" LOCALMIND_SMOKE_ALLOW_TEST_ENTRY=1 \
    bash "$FIXTURE_ROOT/scripts/setup.sh" </dev/null >"$OUT" 2>&1
  RC=$?
  set -e
}

run_setup_in_background() {
  HOME="$CASE/home" TMPDIR="$CASE/state" PATH="$CASE/bin:/usr/bin:/bin" NOTES_DIR="${1:-}" BACKUP_DIR="$CASE/backup" \
    QUERY_LOG="$CASE/state/query-log.jsonl" BRAIN_INDEX="$CASE/state/index.json" \
    FIXTURE_NODE_VERSION="v20.0.0" FIXTURE_INSTALL_RC=0 FIXTURE_BUILD_RC=0 \
    FIXTURE_IDENTITY_SMOKE_RC=0 FIXTURE_FULL_SMOKE_RC=0 \
    SETUP_CALL_LOG="$CALL_LOG" SETUP_HTTP_LOG="$HTTP_LOG" REAL_NODE_BIN="$REAL_NODE_BIN" \
    FIXTURE_EXPECTED_EMBED_KEY="fixture-secret-key" FIXTURE_EXPECTED_EMBED_MODEL="fixture-model" \
    FIXTURE_CURL_PID_FILE="$CASE/curl.pid" \
    FIXTURE_NOTES_RM_PID_FILE="$CASE/notes-rm.pid" \
    bash "$FIXTURE_ROOT/scripts/setup.sh" </dev/null >"$OUT" 2>&1 &
  SETUP_PID=$!
}

interrupt_setup_and_child() {
  local pid_file="$1" child_pid="" i
  for i in $(seq 1 100); do
    if [ -s "$pid_file" ]; then child_pid="$(cat "$pid_file")"; break; fi
    kill -0 "$SETUP_PID" 2>/dev/null || break
    sleep 0.05
  done
  [ -n "$child_pid" ] || return 1
  set +e
  kill -TERM "$child_pid" "$SETUP_PID" 2>/dev/null
  wait "$SETUP_PID"
  RC=$?
  set -e
}

printf '\n\033[1mA1 — 필수 실패 누적·failed·비밀 비노출\033[0m\n'
new_fixture failed
write_env reject
printf 'not-a-directory\n' > "$CASE/notes-file"
run_setup "$CASE/notes-file" "" "v18.19.0" 1 1 1
assert "필수 실패가 있으면 exit≠0" '[ "$RC" -ne 0 ]'
assert "최종 상태가 failed" 'grep -qF "readiness: failed" "$OUT"'
assert "Node>=20 실패를 보고" 'grep -qE "Node.*20" "$OUT"'
assert "npm install/build 실패를 보고" 'grep -qE "의존성|빌드" "$OUT"'
assert "쓰기 가능한 노트 루트 실패를 보고" 'grep -qE "노트.*쓰기|노트 폴더" "$OUT"'
assert "설정한 모델의 embedding probe 실패를 보고" 'grep -qE "임베딩.*실패|임베딩.*확인" "$OUT"'
assert "MCP tools/list+whoami 실패를 보고" 'grep -qE "MCP.*tools/list.*whoami|MCP.*필수" "$OUT"'
assert "실패인데 기본 설정 완료를 출력하지 않음" '! grep -qF "기본 설정 완료" "$OUT"'
assert "embedding URL 원문을 출력하지 않음" '! grep -qF "secret-url-marker" "$OUT"'
assert "embedding secret을 출력하지 않음" '! grep -qF "fixture-secret-key" "$OUT"'

printf '\n\033[1mA2 — 필수 전부 통과·ready\033[0m\n'
new_fixture ready
write_env good
run_setup "$CASE/notes"
assert "필수 전부 통과하면 exit=0" '[ "$RC" -eq 0 ]'
assert "최종 상태가 ready" 'grep -qF "readiness: ready" "$OUT"'
assert "npm install과 build를 모두 실행" 'grep -qF "install --no-fund --no-audit" "$CALL_LOG" && grep -qF "run --silent build" "$CALL_LOG"'
assert "identity와 isolated full-flow smoke를 순서대로 실행" '[ "$(grep -cF "run --silent smoke:mcp" "$CALL_LOG")" -eq 2 ] && sed -n "/run --silent smoke:mcp/p" "$CALL_LOG" | sed -n "1p" | grep -qF "full=0" && sed -n "/run --silent smoke:mcp/p" "$CALL_LOG" | sed -n "2p" | grep -qF "full=1"'
assert "설정한 endpoint의 /embeddings를 실제 probe" 'grep -qF "/good/secret-url-marker/v1/embeddings" "$HTTP_LOG"'
assert "설정한 model을 probe body에 사용" 'grep -qF '"'"'"model":"fixture-model"'"'"' "$HTTP_LOG"'
assert "실제 key는 argv가 아니라 보호된 header file로 전달" 'grep -qF "auth=ok" "$HTTP_LOG" && ! grep -qF "auth=argv" "$HTTP_LOG"'
assert "ready여도 URL·secret은 출력하지 않음" '! grep -qF "secret-url-marker" "$OUT" && ! grep -qF "fixture-secret-key" "$OUT"'

printf '\n\033[1mB1 — embedding probe 응답 구조 fail closed\033[0m\n'
new_fixture extra_row
write_env extra-row
run_setup "$CASE/notes"
assert "입력 1개에 extra row가 오면 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'

new_fixture object_data
write_env object-data
run_setup "$CASE/notes"
assert "data가 배열이 아닌 object면 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'

new_fixture float32_overflow
write_env float32-overflow
run_setup "$CASE/notes"
assert "inline 1-row validator가 Float32 overflow 1e308을 거부" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
assert "Float32 overflow가 embedding probe 실패 사유로 기록됨" 'grep -qF "임베딩 endpoint/model 확인 실패" "$OUT"'

printf '\n\033[1mB2 — canonical notes root 생성 정책\033[0m\n'
new_fixture explicit_missing
write_env good
missing_notes="$CASE/explicit-missing"
FIXTURE_OMIT_BRAIN_INDEX=1
run_setup "$missing_notes"
assert "명시 NOTES_DIR가 없으면 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
assert "기본 BRAIN_INDEX probe도 명시 missing NOTES_DIR를 자동 생성하지 않음" '[ ! -e "$missing_notes" ]'
assert "명시 missing root가 노트 쓰기 실패 사유로 기록됨" 'grep -qF "노트 폴더 쓰기 실패" "$OUT"'

new_fixture multi_one_missing
write_env good
missing_notes="$CASE/missing-beta"
run_setup "alpha=$CASE/notes,beta=$missing_notes"
assert "다중 explicit 중 하나라도 missing이면 ready 금지" '[ "$RC" -ne 0 ] && ! grep -qF "readiness: ready" "$OUT"'
assert "다중 explicit의 missing root 생성 0" '[ ! -e "$missing_notes" ]'
assert "다중 missing root가 노트 쓰기 실패 사유로 기록됨" 'grep -qF "노트 폴더 쓰기 실패" "$OUT"'

new_fixture default_first_use
write_env good
run_setup ""
assert "NOTES_DIR 미지정 단일 기본 HOME/.localmind만 첫 사용 생성 허용" '[ "$RC" -eq 0 ] && [ -d "$CASE/home/.localmind" ]'

printf '\n\033[1mB3 — .env NOTES_DIR와 smoke identity 계약\033[0m\n'
new_fixture env_notes_identity
mkdir -p "$CASE/alpha" "$CASE/beta"
cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=http://embedding.invalid/good/secret-url-marker/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=fixture-secret-key
NOTES_DIR=alpha=$CASE/alpha,beta=$CASE/beta
EOF_ENV
FIXTURE_EXPECTED_SMOKE_NOTES="alpha=$CASE/alpha,beta=$CASE/beta"
FIXTURE_EXPECTED_SMOKE_LABELS="alpha,beta"
run_setup ""
assert ".env NOTES_DIR를 smoke child에 전달하고 기대 label 계약을 설정" '[ "$RC" -eq 0 ] && grep -qF "readiness: ready" "$OUT"'

new_fixture duplicate_reserved_labels
mkdir -p "$CASE/a" "$CASE/b" "$CASE/c"
cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=http://embedding.invalid/good/secret-url-marker/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=fixture-secret-key
NOTES_DIR=dup=$CASE/b,dup=$CASE/a,dup-2=$CASE/c
EOF_ENV
FIXTURE_EXPECTED_SMOKE_NOTES="dup=$CASE/b,dup=$CASE/a,dup-2=$CASE/c"
FIXTURE_EXPECTED_SMOKE_LABELS="dup-3,dup,dup-2"
run_setup ""
assert "setup smoke label 계산은 Brain의 중복·명시 예약 suffix와 동일" \
  '[ "$RC" -eq 0 ] && grep -qF "readiness: ready" "$OUT"'

printf '\n\033[1mB3b — 실제 BRAIN_INDEX와 두 smoke gate\033[0m\n'
new_fixture invalid_index_parent
write_env good
printf 'parent-blocker\n' > "$CASE/not-a-parent"
FIXTURE_BRAIN_INDEX="$CASE/not-a-parent/index.json"
run_setup "$CASE/notes"
assert "실제 BRAIN_INDEX 부모를 생성/쓰기 못 하면 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
assert "BRAIN_INDEX probe 실패가 별도 사유로 기록됨" 'grep -qF "색인 저장 위치 쓰기 실패" "$OUT"'

new_fixture identity_smoke_failure
write_env good
run_setup "$CASE/notes" "" "v20.0.0" 0 0 1 0
assert "identity smoke만 실패해도 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
assert "identity 실패 뒤에도 isolated full-flow gate를 별도 실행" '[ "$(grep -cF "run --silent smoke:mcp" "$CALL_LOG")" -eq 2 ]'

new_fixture full_smoke_failure
write_env good
run_setup "$CASE/notes" "" "v20.0.0" 0 0 0 1
assert "isolated full-flow smoke만 실패해도 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'

printf '\n\033[1mB4 — signal 시 readiness temp 정리\033[0m\n'
new_fixture interrupt_embedding
write_env wait
run_setup_in_background "$CASE/notes"
interrupt_setup_and_child "$CASE/curl.pid"
embedding_temps="$(find "$CASE/state" -type f \( -name 'localmind-embedding-header.*' -o -name 'localmind-embedding-probe.*' \) -print)"
assert "curl 대기 중 TERM 뒤 embedding header/response temp가 0건" '[ -z "$embedding_temps" ]'
assert "embedding key가 argv/stdout/stderr에 없음" '! grep -qF "fixture-secret-key" "$HTTP_LOG" "$OUT"'

new_fixture interrupt_notes_probe
write_env good
cat > "$CASE/bin/rm" <<'EOF_RM'
#!/usr/bin/env bash
case "$*" in
  *'.localmind-readiness.'*)
    if [ ! -f "$FIXTURE_NOTES_RM_PID_FILE" ]; then
      printf '%s\n' "$$" > "$FIXTURE_NOTES_RM_PID_FILE"
      trap 'exit 143' HUP INT TERM
      while :; do sleep 1; done
    fi
    ;;
esac
exec /bin/rm "$@"
EOF_RM
chmod +x "$CASE/bin/rm"
run_setup_in_background "$CASE/notes"
interrupt_setup_and_child "$CASE/notes-rm.pid"
notes_temps="$(find "$CASE/notes" -type f -name '.localmind-readiness.*' -print)"
assert "노트 probe 삭제 경계 TERM 뒤 notes temp가 0건" '[ -z "$notes_temps" ]'

printf '\n\033[1mI2 — fixture HTTP 증거 격리·요청 계약\033[0m\n'
old_http_log="$HTTP_LOG"
printf '이전 fixture 오염 표식\n' >> "$old_http_log"
new_fixture isolated_http_log
assert "fixture마다 새 HTTP log를 만들고 빈 상태로 시작" '[ "$HTTP_LOG" != "$old_http_log" ] && [ ! -s "$HTTP_LOG" ]'

new_fixture wrong_model
cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=http://embedding.invalid/good/secret-url-marker/v1
EMBEDDINGS_MODEL=wrong-model
EMBEDDINGS_KEY=fixture-secret-key
EOF_ENV
run_setup "$CASE/notes"
assert "성공 stub도 기대 model과 다른 요청은 실패 처리" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'

new_fixture wrong_auth
cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=http://embedding.invalid/good/secret-url-marker/v1
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=wrong-key
EOF_ENV
run_setup "$CASE/notes"
assert "성공 stub도 기대 auth와 다른 요청은 실패 처리" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'

printf '\n\033[1mI4 — unsafe embedding URL fail closed\033[0m\n'
for unsafe_kind in userinfo query fragment; do
  new_fixture "unsafe_$unsafe_kind"
  case "$unsafe_kind" in
    userinfo) unsafe_url='https://url-secret-marker@example.invalid/v1' ;;
    query) unsafe_url='https://example.invalid/v1?token=url-secret-marker' ;;
    fragment) unsafe_url='https://example.invalid/v1#url-secret-marker' ;;
  esac
  cat > "$FIXTURE_ROOT/.env" <<EOF_ENV
EMBEDDINGS_URL=$unsafe_url
EMBEDDINGS_MODEL=fixture-model
EMBEDDINGS_KEY=fixture-secret-key
EOF_ENV
  run_setup "$CASE/notes"
  assert "$unsafe_kind URL은 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
  assert "$unsafe_kind URL 원문은 curl argv/stdout/stderr 0건" '! grep -qF "url-secret-marker" "$HTTP_LOG" "$OUT"'
done

for control_kind in tab delete; do
  new_fixture "unsafe_control_$control_kind"
  case "$control_kind" in
    tab) control_byte=$'\t' ;;
    delete) control_byte=$'\177' ;;
  esac
  control_marker="SYNTHETIC_CONTROL_URL_CANARY"
  {
    printf 'EMBEDDINGS_URL=https://example.invalid/v1%s%s\n' "$control_byte" "$control_marker"
    printf 'EMBEDDINGS_MODEL=fixture-model\nEMBEDDINGS_KEY=fixture-secret-key\n'
  } > "$FIXTURE_ROOT/.env"
  run_setup "$CASE/notes"
  assert "$control_kind control URL은 failed" '[ "$RC" -ne 0 ] && grep -qF "readiness: failed" "$OUT"'
  assert "$control_kind control URL은 curl argv/stdout/stderr 0건" '! grep -qF "$control_marker" "$HTTP_LOG" "$OUT"'
done

printf '\n\033[1mA3 — DRY_RUN은 검증 생략을 partial로 구분\033[0m\n'
new_fixture partial
write_env good
run_setup "$CASE/notes" 1
assert "DRY_RUN partial은 exit=0" '[ "$RC" -eq 0 ]'
assert "최종 상태가 partial" 'grep -qF "readiness: partial" "$OUT"'
assert "partial을 기본 설정 완료로 과장하지 않음" '! grep -qF "기본 설정 완료" "$OUT"'
assert "DRY_RUN은 install/build/MCP smoke를 실행하지 않음" '[ ! -s "$CALL_LOG" ]'
assert "partial에서도 URL·secret은 출력하지 않음" '! grep -qF "secret-url-marker" "$OUT" && ! grep -qF "fixture-secret-key" "$OUT"'

printf '\n\033[1mI5 — doctor unsafe URL은 curl하지 않음\033[0m\n'
DOCTOR_CASE="$TMP/doctor-unsafe"
mkdir -p "$DOCTOR_CASE/repo/scripts/lib" "$DOCTOR_CASE/bin" "$DOCTOR_CASE/home"
cp "$ROOT/scripts/doctor.sh" "$DOCTOR_CASE/repo/scripts/doctor.sh"
cp "$ROOT/scripts/lib/read-env.sh" "$DOCTOR_CASE/repo/scripts/lib/read-env.sh"
cp "$ROOT/scripts/lib/notes-dir.sh" "$DOCTOR_CASE/repo/scripts/lib/notes-dir.sh"
cat > "$DOCTOR_CASE/repo/.env" <<'EOF_ENV'
EMBEDDINGS_URL=https://example.invalid/v1?token=doctor-url-secret-marker
EMBEDDINGS_MODEL=fixture-model
EOF_ENV
cat > "$DOCTOR_CASE/bin/curl" <<'EOF_CURL'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCTOR_CURL_LOG"
exit 0
EOF_CURL
chmod +x "$DOCTOR_CASE/bin/curl"
: > "$DOCTOR_CASE/curl.log"
set +e
HOME="$DOCTOR_CASE/home" PATH="$DOCTOR_CASE/bin:/usr/bin:/bin" DOCTOR_CURL_LOG="$DOCTOR_CASE/curl.log" \
  bash "$DOCTOR_CASE/repo/scripts/doctor.sh" >"$DOCTOR_CASE/output.txt" 2>&1
doctor_rc=$?
set -e
assert "doctor는 unsafe URL이어도 유한 진단" '[ "$doctor_rc" -eq 0 ]'
assert "doctor는 unsafe configured URL로 curl하지 않고 원문도 숨김" '[ ! -s "$DOCTOR_CASE/curl.log" ] && ! grep -qF "doctor-url-secret-marker" "$DOCTOR_CASE/output.txt"'

doctor_control_marker="SYNTHETIC_DOCTOR_CONTROL_CANARY"
{
  printf 'EMBEDDINGS_URL=https://example.invalid/v1\t%s\n' "$doctor_control_marker"
  printf 'EMBEDDINGS_MODEL=fixture-model\n'
} > "$DOCTOR_CASE/repo/.env"
: > "$DOCTOR_CASE/curl.log"
set +e
HOME="$DOCTOR_CASE/home" PATH="$DOCTOR_CASE/bin:/usr/bin:/bin" DOCTOR_CURL_LOG="$DOCTOR_CASE/curl.log" \
  bash "$DOCTOR_CASE/repo/scripts/doctor.sh" >"$DOCTOR_CASE/output.txt" 2>&1
doctor_rc=$?
set -e
assert "doctor는 control URL이어도 유한 진단" '[ "$doctor_rc" -eq 0 ]'
assert "doctor는 control URL을 curl·출력 전에 거부" '[ ! -s "$DOCTOR_CASE/curl.log" ] && ! grep -qF "$doctor_control_marker" "$DOCTOR_CASE/output.txt"'

printf '\nsetup readiness 결과: %d 통과, %d 실패\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
