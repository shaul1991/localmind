#!/usr/bin/env bash
# specs/015 FR-1·7 — backup.sh 부분 실패 허용·push 안내 테스트.
# 임시 디렉토리 + 로컬 bare repo + 가짜 npm 스텁 — 라이브 스택·네트워크 불필요(CI 실행).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/backup.sh"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
assert() { local _lm_last=$?; if ( set +o pipefail; (exit $_lm_last); eval "$2" ); then ok "$1"; else no "$1"; fi; }  # pipefail 없이 + 직전 $? 보존 — SIGPIPE(141) 플레이키 방지

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 가짜 npm: memory:export를 흉내 — OK면 마지막 인자 경로에 파일 생성, FAIL이면 비0.
mkdir -p "$TMP/bin-ok" "$TMP/bin-fail"
cat > "$TMP/bin-ok/npm" <<'S'
#!/bin/sh
for last; do :; done
echo "memory dump" > "$last"
exit 0
S
printf '#!/bin/sh\nexit 1\n' > "$TMP/bin-fail/npm"
chmod +x "$TMP/bin-ok/npm" "$TMP/bin-fail/npm"

new_repo() { # new_repo <작업폴더> <bare원격|"">  — 노트 백업 repo 준비
  local dir="$1" bare="$2"
  mkdir -p "$dir"; git -C "$dir" init -q
  git -C "$dir" config user.email t@t; git -C "$dir" config user.name t
  if [ -n "$bare" ]; then git init -q --bare "$bare"; git -C "$dir" remote add origin "$bare"; fi
}

run_backup() { # run_backup <PATH선두> <BACKUP_DIR> [추가 env KEY=V ...]
  # HOME·.env 격리(019): 자산 단계가 실행 기기의 실제 ~/.localmind·repo .env를 보지 않게 한다.
  local p="$1" bk="$2"; shift 2
  # </dev/null: 쿼리 로그 opt-in confirm([ -t 0 ] && read)이 수동 실행 tty에서 블록되지 않게(비대화 경로 고정).
  OUT="$(PATH="$p:$PATH" BACKUP_DIR="$bk" HOME="$TMP/home" LOCALMIND_ENV_FILE="$TMP/test.env" \
        env "$@" bash "$SCRIPT" </dev/null 2>&1)"
  RC=$?
}
mkdir -p "$TMP/home"; : > "$TMP/test.env"

# ── AC-1: 노트 백업·push (great-reduction: 메모리 export 단계 소멸 — npm 스텁 무관) ──
D1="$TMP/notes1"; B1="$TMP/bare1.git"; new_repo "$D1" "$B1"
echo "노트 내용" > "$D1/note.md"
run_backup "$TMP/bin-fail" "$D1"
assert "AC-1: 노트 백업은 npm(구 메모리 export) 상태와 무관하게 0 종료" '[ "$RC" -eq 0 ]'
assert "AC-1: 노트 커밋이 생성된다(인질 아님)" 'git -C "$D1" log --oneline | grep -q "localmind backup"'
assert "AC-1: 노트가 원격(push)까지 반영된다" 'git -C "$B1" log --oneline | grep -q "localmind backup"'
assert "AC-1: 파생물 gitignore 시드" 'grep -q ".brain-index.json" "$D1/.gitignore"'

# ── AC-2: 정상 경로 회귀 없음 ────────────────────────────────────────────────
D2="$TMP/notes2"; B2="$TMP/bare2.git"; new_repo "$D2" "$B2"
echo "노트" > "$D2/note.md"
run_backup "$TMP/bin-ok" "$D2"
assert "AC-2: 정상 백업은 0 종료" '[ "$RC" -eq 0 ]'
assert "AC-2: 완료 메시지" 'printf %s "$OUT" | grep -q "백업 완료"'

# ── 멱등: 변경 없이 재실행 → 커밋 생략, 0 종료 ──────────────────────────────
run_backup "$TMP/bin-ok" "$D2"
assert "멱등: 변경 없음 재실행도 0 종료" '[ "$RC" -eq 0 ]'
assert "멱등: '변경 없음' 안내" 'printf %s "$OUT" | grep -q "변경 없음"'

# ── remote 없음: 로컬 커밋만, 0 종료 ─────────────────────────────────────────
D3="$TMP/notes3"; new_repo "$D3" ""
echo "노트" > "$D3/note.md"
run_backup "$TMP/bin-ok" "$D3"
assert "remote 없음: 0 종료 + 로컬 커밋만 안내" '[ "$RC" -eq 0 ] && printf %s "$OUT" | grep -q "remote 없음"'

# ── AC-11: 원격이 앞서 있으면(non-ff) 원인·해결 안내 + 비0 종료 ─────────────
D4="$TMP/notes4"; B4="$TMP/bare4.git"; new_repo "$D4" "$B4"
echo "노트" > "$D4/note.md"
run_backup "$TMP/bin-ok" "$D4" # 1차 백업(원격 동기화)
CLONE="$TMP/clone4"; git clone -q "$B4" "$CLONE"
git -C "$CLONE" config user.email o@o; git -C "$CLONE" config user.name o
echo "다른 기기의 노트" > "$CLONE/other.md"
git -C "$CLONE" add -A; git -C "$CLONE" commit -qm "다른 기기 백업"; git -C "$CLONE" push -q
echo "내 새 노트" > "$D4/new.md"
run_backup "$TMP/bin-ok" "$D4"
assert "AC-11: non-ff push는 비0 종료" '[ "$RC" -ne 0 ]'
assert "031: push 거부는 정확히 exit 2(코어 신호)" '[ "$RC" -eq 2 ]'
assert "AC-11: 원인(다른 기기)과 해결(pull) 안내" 'printf %s "$OUT" | grep -q "다른 기기" && printf %s "$OUT" | grep -q "pull"'
# `log | head -1`은 pipefail 아래서 git이 간헐적으로 SIGPIPE(141)를 받아 grep이 매치해도
# 실패한다(CI node22에서 3회 발현). log -1은 head 없이 결정적.
assert "AC-11: 로컬 커밋은 보존된다" 'git -C "$D4" log -1 --format=%s | grep -q "localmind backup"'

# ── repo 아님: 안내 후 비0 종료 ──────────────────────────────────────────────
D5="$TMP/notes5"; mkdir -p "$D5"
run_backup "$TMP/bin-ok" "$D5"
assert "repo 아님: backup-init 안내 + 비0 종료" '[ "$RC" -ne 0 ] && printf %s "$OUT" | grep -q "backup-init"'
assert "031: repo 아님도 정확히 exit 2(사전조건=코어 — 백업 없이 계속 방지)" '[ "$RC" -eq 2 ]'

# ── 결함1 회귀: 노트 커밋 실패가 삼켜지지 않는다(git identity 미설정) ────────
D6="$TMP/notes6"; B6="$TMP/bare6.git"
mkdir -p "$D6"; git -C "$D6" init -q
# 전역 identity가 있어도 커밋이 확실히 실패하게 — 로컬에서 빈 값으로 덮는다
git -C "$D6" config user.email ""; git -C "$D6" config user.name ""
git init -q --bare "$B6"; git -C "$D6" remote add origin "$B6"
echo "노트" > "$D6/note.md"
run_backup "$TMP/bin-ok" "$D6"
assert "결함1: 커밋 실패 시 비0 종료('백업 완료' 오보 없음)" '[ "$RC" -ne 0 ] && ! printf %s "$OUT" | grep -q "✓ 백업 완료"'
assert "결함1: 실패 요약에 노트커밋 표기 + git 설정 안내" 'printf %s "$OUT" | grep -q "노트커밋" && printf %s "$OUT" | grep -q "user.email"'
assert "031: 커밋 실패도 정확히 exit 2(코어 신호)" '[ "$RC" -eq 2 ]'

# ── 019 AC-16~18: 쿼리 로그 opt-in 백업(FR-3) ────────────────────────────────
# 가짜 hostname — 기기 식별자 정제 검증용(공백·대문자·언더스코어; -s는 점을 반환하지 않음)
mkdir -p "$TMP/bin-host"; cp "$TMP/bin-ok/npm" "$TMP/bin-host/npm"
printf '#!/bin/sh\necho "My_MacBook Pro"\n' > "$TMP/bin-host/hostname"; chmod +x "$TMP/bin-host/hostname"

D7="$TMP/notes7"; B7="$TMP/bare7.git"; new_repo "$D7" "$B7"
echo "n" > "$D7/note.md"
QL="$TMP/home/.localmind/query-log.jsonl"; mkdir -p "$(dirname "$QL")"
printf '{"ts":"2026-01-01T00:00:00.000Z","query":"q"}\n' > "$QL"

run_backup "$TMP/bin-host" "$D7"
assert "AC-16: BACKUP_QUERY_LOG 미설정 시 쿼리 로그 미백업(기존 동작 불변)" '! ls "$D7"/query-log.*.jsonl >/dev/null 2>&1'

QL2="$TMP/alt-query.jsonl"; printf '{"ts":"2026-01-02T00:00:00.000Z","query":"alt"}\n' > "$QL2"
run_backup "$TMP/bin-host" "$D7" BACKUP_QUERY_LOG=1 QUERY_LOG="$QL2"
assert "AC-16: opt-in + QUERY_LOG 재지정 경로가 백업됨" 'grep -q "alt" "$D7/query-log.my-macbook-pro.jsonl" 2>/dev/null'
assert "AC-17: 기기 식별자 정제(소문자·하이픈)" '[ -f "$D7/query-log.my-macbook-pro.jsonl" ]'
assert "025 AC-6: 최초 고지에 노트 경로 포함 명시" 'printf %s "$OUT" | grep -q "노트 경로"'
assert "AC-18: 최초 생성 시 git 이력 비가역 경고 출력" 'printf %s "$OUT" | grep -q "지워지지 않아요"'
run_backup "$TMP/bin-host" "$D7" BACKUP_QUERY_LOG=1 QUERY_LOG="$QL2"
assert "AC-18: 두 번째 백업부터는 경고 반복 없음" '! printf %s "$OUT" | grep -q "지워지지 않아요"'

printf '#!/bin/sh\necho ""\n' > "$TMP/bin-host/hostname"   # 극단 hostname: 빈 결과
run_backup "$TMP/bin-host" "$D7" BACKUP_QUERY_LOG=1 QUERY_LOG="$QL2"
assert "AC-17: 정제 결과가 비면 device로 폴백" '[ -f "$D7/query-log.device.jsonl" ]'

# ── specs/050 I-1: _bindings/(페르소나 바인딩)가 백업 커밋에서 제외된다 ─────
D8="$TMP/notes8"; B8="$TMP/bare8.git"; new_repo "$D8" "$B8"
echo "노트" > "$D8/note.md"
mkdir -p "$D8/_bindings"; echo '{"schemaVersion":1}' > "$D8/_bindings/test.json"
run_backup "$TMP/bin-ok" "$D8"
assert "050 I-1: _bindings/ gitignore 시드" 'grep -qxF "_bindings/" "$D8/.gitignore"'
assert "050 I-1: _bindings/가 백업 커밋에 포함되지 않는다" '! git -C "$D8" ls-files | grep -q "^_bindings/"'

# ── Phase 2 review: custom derived paths도 backup generation에서 제거 ────────
D9="$TMP/notes9"; new_repo "$D9" ""
echo "정본" > "$D9/note.md"
for p in custom-index.data custom-index.data.vec-old custom-index.data.tmp-old custom-index.data.lock custom-index.data.lock.guard private-searches.jsonl; do
  echo "derived" > "$D9/$p"
done
git -C "$D9" add -A; git -C "$D9" commit -qm "fixture: pretracked custom derived files"
ENV9="$TMP/custom-derived.env"
printf 'BRAIN_INDEX=%s\nQUERY_LOG=%s\n' "$D9/custom-index.data" "$D9/private-searches.jsonl" > "$ENV9"
run_backup "$TMP/bin-ok" "$D9" LOCALMIND_ENV_FILE="$ENV9"
assert "custom BRAIN_INDEX/.env의 index·vector·temp·lock·guard를 commit에서 제거" \
  'for p in custom-index.data custom-index.data.vec-old custom-index.data.tmp-old custom-index.data.lock custom-index.data.lock.guard; do ! git -C "$D9" cat-file -e "HEAD:$p" 2>/dev/null || exit 1; done'
assert "custom QUERY_LOG/.env opt-out 경로를 commit에서 제거" \
  '! git -C "$D9" cat-file -e HEAD:private-searches.jsonl 2>/dev/null'
run_backup "$TMP/bin-host" "$D9" LOCALMIND_ENV_FILE="$ENV9" BACKUP_QUERY_LOG=1
assert ".env-only custom QUERY_LOG opt-in은 effective 경로의 실제 로그를 백업" \
  'grep -q "derived" "$D9"/query-log.*.jsonl 2>/dev/null'

D10="$TMP/notes10"; new_repo "$D10" ""
echo "정본" > "$D10/note.md"
echo "derived" > "$D10/env-index.bin"
echo "private" > "$D10/env-query.jsonl"
git -C "$D10" add -A; git -C "$D10" commit -qm "fixture: env pretracked derived files"
run_backup "$TMP/bin-ok" "$D10" BRAIN_INDEX="$D10/env-index.bin" QUERY_LOG="$D10/env-query.jsonl"
assert "직접 env custom index/query 경로도 commit에서 제거" \
  '! git -C "$D10" cat-file -e HEAD:env-index.bin 2>/dev/null && ! git -C "$D10" cat-file -e HEAD:env-query.jsonl 2>/dev/null'

TILDE_HOME="$TMP/tilde-home"; D12="$TILDE_HOME/vault"; mkdir -p "$TILDE_HOME"; new_repo "$D12" ""
printf 'idx\n' > "$D12/tilde-index.bin"
printf 'query\n' > "$D12/tilde-query.jsonl"
git -C "$D12" add -A; git -C "$D12" commit -qm tilde-derived-fixture
TILDE_ENV="$TMP/tilde.env"
printf 'BRAIN_INDEX=~/vault/tilde-index.bin\nQUERY_LOG=~/vault/tilde-query.jsonl\n' > "$TILDE_ENV"
set +e
run_backup "$TMP/bin" "$D12" LOCALMIND_ENV_FILE="$TILDE_ENV" HOME="$TILDE_HOME"
TILDE_OUT="$OUT"; TILDE_RC="$RC"
set -e
assert "tilde custom path backup도 성공" '[ "$TILDE_RC" -eq 0 ]'
assert "Bash 3.2 literal ~/ custom index/query를 HOME 기준으로 제거" \
  '! git -C "$D12" cat-file -e HEAD:tilde-index.bin 2>/dev/null && ! git -C "$D12" cat-file -e HEAD:tilde-query.jsonl 2>/dev/null'
run_backup "$TMP/bin-host" "$D12" LOCALMIND_ENV_FILE="$TILDE_ENV" HOME="$TILDE_HOME" BACKUP_QUERY_LOG=1
assert ".env literal ~/ QUERY_LOG opt-in은 HOME 확장 경로의 실제 로그를 백업" \
  'grep -q "query" "$D12"/query-log.*.jsonl 2>/dev/null'

D11="$TMP/notes11"; new_repo "$D11" ""
echo "정본" > "$D11/note.md"; echo "derived" > "$D11/custom-index.data"
git -C "$D11" add -A; git -C "$D11" commit -qm "fixture: resolver failure"
BEFORE11="$(git -C "$D11" rev-parse HEAD)"
mkdir -p "$TMP/bin-resolver-fail"; cp "$TMP/bin-ok/npm" "$TMP/bin-resolver-fail/npm"
printf '#!/bin/sh\nexit 1\n' > "$TMP/bin-resolver-fail/node"; chmod +x "$TMP/bin-resolver-fail/node"
set +e
run_backup "$TMP/bin-resolver-fail" "$D11" BRAIN_INDEX="$D11/custom-index.data"
set -e
assert "custom derived path resolver 실패는 publish 전 core exit 2" '[ "$RC" -eq 2 ]'
assert "resolver 실패는 새 backup commit·완료 메시지를 만들지 않음" \
  '[ "$(git -C "$D11" rev-parse HEAD)" = "$BEFORE11" ] && ! printf %s "$OUT" | grep -q "백업 완료"'

# ── Phase 2 second review: nested host identity와 .gitignore publish 경계 ──────
D13="$TMP/notes13"; new_repo "$D13" ""
mkdir -p "$D13/nested/deeper"
echo "정본" > "$D13/note.md"
echo "host-a" > "$D13/nested/.localmind-brain-id"
echo "temp-host" > "$D13/nested/deeper/.localmind-brain-id.tmp-old"
git -C "$D13" add -A; git -C "$D13" commit -qm "fixture: pretracked nested host markers"
run_backup "$TMP/bin-ok" "$D13"
assert "nested canonical root의 tracked marker/temp marker를 다음 backup commit에서 재귀 제거" \
  '[ "$RC" -eq 0 ] && ! git -C "$D13" ls-tree -r --name-only HEAD | grep -qE "(^|/)\\.localmind-brain-id(\\.tmp-.*)?$"'

D14="$TMP/notes14"; new_repo "$D14" ""
echo "정본" > "$D14/note.md"
echo "derived" > "$D14/.brain-index.json"
git -C "$D14" add -A; git -C "$D14" commit -qm "fixture: pretracked derived with bad gitignore boundary"
BEFORE14="$(git -C "$D14" rev-parse HEAD)"
mkdir "$D14/.gitignore"
set +e
run_backup "$TMP/bin-ok" "$D14"
set -e
assert ".gitignore가 regular non-symlink file이 아니면 publish 전 core exit 2" '[ "$RC" -eq 2 ]'
assert ".gitignore 기록 실패는 새 commit·완료 메시지·derived 재봉인을 만들지 않음" \
  '[ "$(git -C "$D14" rev-parse HEAD)" = "$BEFORE14" ] && ! printf %s "$OUT" | grep -q "백업 완료"'

D15="$TMP/notes15"; new_repo "$D15" ""
echo "정본" > "$D15/note.md"
echo "derived" > "$D15/.brain-index.json"
git -C "$D15" add -A; git -C "$D15" commit -qm "fixture: symlink gitignore boundary"
BEFORE15="$(git -C "$D15" rev-parse HEAD)"
OUTSIDE15="$TMP/outside-gitignore-target"; printf 'outside-canary\n' > "$OUTSIDE15"
ln -s "$OUTSIDE15" "$D15/.gitignore"
set +e
run_backup "$TMP/bin-ok" "$D15"
set -e
assert ".gitignore symlink는 target을 열기 전에 core exit 2" '[ "$RC" -eq 2 ]'
assert ".gitignore symlink target bytes와 repo HEAD를 보존하고 완료를 억제" \
  '[ "$(<"$OUTSIDE15")" = "outside-canary" ] && [ "$(git -C "$D15" rev-parse HEAD)" = "$BEFORE15" ] && ! printf %s "$OUT" | grep -q "백업 완료"'

# ── Phase 2 latest review: custom path metachar는 canonical 이웃을 건드리지 않는다 ─
D16="$TMP/notes16"; new_repo "$D16" ""
printf 'canonical-star\n' > "$D16/canonical-note.md"
printf 'derived-index\n' > "$D16/canonical*.md"
printf 'derived-temp\n' > "$D16/canonical*.md.tmp-old"
printf 'canonical-query\n' > "$D16/privateA.jsonl"
printf 'derived-query\n' > "$D16/private?.jsonl"
git -C "$D16" add -A; git -C "$D16" commit -qm "fixture: metachar derived paths"
run_backup "$TMP/bin-ok" "$D16" BRAIN_INDEX="$D16/canonical*.md" QUERY_LOG="$D16/private?.jsonl"
assert "custom metachar index/query는 exact derived bytes와 suffix만 제거" \
  '[ "$RC" -eq 0 ] && ! git -C "$D16" cat-file -e "HEAD:canonical*.md" 2>/dev/null && ! git -C "$D16" cat-file -e "HEAD:canonical*.md.tmp-old" 2>/dev/null && ! git -C "$D16" cat-file -e "HEAD:private?.jsonl" 2>/dev/null'
assert "custom metachar path가 canonical 이웃의 HEAD·worktree bytes를 보존" \
  '[ "$(git -C "$D16" show HEAD:canonical-note.md)" = "canonical-star" ] && [ "$(<"$D16/canonical-note.md")" = "canonical-star" ] && [ "$(git -C "$D16" show HEAD:privateA.jsonl)" = "canonical-query" ]'
assert ".gitignore literal rule은 metachar derived만 ignore하고 canonical 이웃은 ignore하지 않음" \
  'git -C "$D16" check-ignore -q --no-index -- "canonical*.md" && git -C "$D16" check-ignore -q --no-index -- "private?.jsonl" && ! git -C "$D16" check-ignore -q --no-index -- canonical-note.md && ! git -C "$D16" check-ignore -q --no-index -- privateA.jsonl'

D17="$TMP/notes17"; new_repo "$D17" ""
printf 'canonical-control\n' > "$D17/canonical.md"
git -C "$D17" add -A; git -C "$D17" commit -qm "fixture: control path rejection"
BEFORE17="$(git -C "$D17" rev-parse HEAD)"
CONTROL_INDEX="$D17/bad
index.bin"
set +e
run_backup "$TMP/bin-ok" "$D17" BRAIN_INDEX="$CONTROL_INDEX"
set -e
assert "control-character custom path는 publish 전 core exit 2" '[ "$RC" -eq 2 ]'
assert "control-character rejection은 canonical HEAD·bytes 보존과 완료 억제" \
  '[ "$(git -C "$D17" rev-parse HEAD)" = "$BEFORE17" ] && [ "$(<"$D17/canonical.md")" = "canonical-control" ] && ! printf %s "$OUT" | grep -q "백업 완료"'

echo ""
echo "015 backup 결과: $pass 통과, $fail 실패"
[ "$fail" -eq 0 ]
