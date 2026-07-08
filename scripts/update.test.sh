#!/usr/bin/env bash
# specs/033 — make update 테스트(가짜 npm shim + 실 git 픽스처: bare origin + clone).
# 실행: bash scripts/update.test.sh
# 실 스택(임베딩·docker) 없이 단계 로직·게이트·파괴-부재를 결정적으로 검증한다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
assert() { if eval "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"; mkdir -p "$BIN"
git_id() { git -C "$1" config user.email t@t; git -C "$1" config user.name t; }

# npm shim — 호출을 EVT_LOG에 기록만 한다(빌드·배포의 실 실행 없음)
cat > "$BIN/npm" <<'S'
#!/bin/sh
echo "EVT npm $*" >> "${EVT_LOG:-/dev/null}"
# NPM_FAIL_MATCH=build 처럼 특정 스크립트만 실패시킨다(빌드 실패를 배포 실패와 격리 검증).
if [ -n "${NPM_FAIL_MATCH:-}" ]; then case "$*" in *"$NPM_FAIL_MATCH"*) exit 1;; esac; fi
exit "${NPM_RC:-0}"
S
chmod +x "$BIN/npm"

# ── 픽스처: 코드 repo(origin 추적) + git 노트 폴더(origin 추적) + 비git 노트 폴더 ──
new_fixture() { # $1=케이스명 → PROJ N1 N2 CODE_ORIGIN NOTES_ORIGIN EVT OUT 설정
  local base="$TMP/$1"; mkdir -p "$base"
  EVT="$base/evt.log"; OUT="$base/out.log"; : > "$EVT"
  PROJ="$base/proj"; mkdir -p "$PROJ/scripts/lib"
  cp "$ROOT/scripts/update.sh" "$PROJ/scripts/"
  cp "$ROOT/scripts/lib/read-env.sh" "$ROOT/scripts/lib/notes-dir.sh" "$PROJ/scripts/lib/"
  cat > "$PROJ/scripts/reindex.sh" <<'S'
#!/bin/sh
echo "EVT reindex" >> "${EVT_LOG:-/dev/null}"
exit "${REINDEX_RC:-0}"
S
  git -C "$PROJ" init -q -b main; git_id "$PROJ"
  git -C "$PROJ" add -A; git -C "$PROJ" commit -qm base
  CODE_ORIGIN="$base/code-origin.git"; git clone -q --bare "$PROJ" "$CODE_ORIGIN"
  git -C "$PROJ" remote add origin "$CODE_ORIGIN"
  git -C "$PROJ" fetch -q origin
  git -C "$PROJ" branch -q --set-upstream-to=origin/main main
  local seed="$base/notes-seed"; mkdir -p "$seed"; echo a > "$seed/a.md"
  git -C "$seed" init -q -b main; git_id "$seed"
  git -C "$seed" add -A; git -C "$seed" commit -qm n1
  NOTES_ORIGIN="$base/notes-origin.git"; git clone -q --bare "$seed" "$NOTES_ORIGIN"
  N1="$base/n1"; git clone -q "$NOTES_ORIGIN" "$N1"; git_id "$N1"
  N2="$base/n2"; mkdir -p "$N2"; echo p > "$N2/plain.md"
}

advance_code_origin() { # 코드 origin에 새 커밋(PROJ가 behind)
  local w="$TMP/w-code-$$-$RANDOM"; git clone -q "$CODE_ORIGIN" "$w"; git_id "$w"
  echo change >> "$w/CHANGES.md"; git -C "$w" add -A; git -C "$w" commit -qm adv
  git -C "$w" push -q origin main
}
advance_notes_origin() { # 노트 origin에 새 노트(N1이 behind)
  local w="$TMP/w-notes-$$-$RANDOM"; git clone -q "$NOTES_ORIGIN" "$w"; git_id "$w"
  echo b > "$w/b.md"; git -C "$w" add -A; git -C "$w" commit -qm adv
  git -C "$w" push -q origin main
}

run_update() { # 추가 env를 인자로(예: DRY_RUN=1 REINDEX_RC=1). RC에 종료 코드.
  ( cd "$PROJ" && env PATH="$BIN:$PATH" EVT_LOG="$EVT" NOTES_DIR="${NOTES_OVERRIDE:-$N1,$N2}" "$@" \
      bash scripts/update.sh ) >"$OUT" 2>&1
  RC=$?
}
evt_seq() { grep -oE "reindex$|agents:deploy$|skills:deploy$|build$" "$EVT" | paste -sd '|' -; }

# ── AC-1·3·5: behind → 코드 pull+빌드, 노트 pull, 파생물 순서 ─────────────
printf '\n\033[1mAC-1·3·5 — 정본 pull + 파생물 재생성(순서)\033[0m\n'
new_fixture s1; advance_code_origin; advance_notes_origin
run_update
assert "전체 성공(exit 0)" '[ "$RC" -eq 0 ]'
assert "AC-1 코드 HEAD가 origin과 일치" '[ "$(git -C "$PROJ" rev-parse HEAD)" = "$(git -C "$CODE_ORIGIN" rev-parse main)" ]'
assert "AC-1 빌드 호출됨" 'grep -qE "EVT npm run --prefix .+ build" "$EVT"'
assert "AC-3 새 노트 파일 pull됨" '[ -f "$N1/b.md" ]'
assert "AC-5 순서: 빌드 → reindex → agents:deploy → skills:deploy" \
  '[ "$(evt_seq)" = "build|reindex|agents:deploy|skills:deploy" ]'

# ── AC-2·4: 변경 없음 → 빌드 생략, 비git 폴더 스킵 (+라벨 경로 통합) ────
printf '\n\033[1mAC-2·4 — 멱등(변경 없음) + 비git 폴더 스킵 + 라벨 경로\033[0m\n'
new_fixture s2
NOTES_OVERRIDE="main=$N1,$N2" run_update
assert "전체 성공(exit 0)" '[ "$RC" -eq 0 ]'
assert "AC-2 빌드 미호출" '! grep -qE "npm run .*build" "$EVT"'
assert "라벨(main=) 붙은 git 노트 폴더도 pull됨" 'grep -q "pull: " "$OUT"'
assert "AC-4 비git 폴더 건너뜀 안내" 'grep -q "git repo 아님" "$OUT"'
assert "AC-4 비git 폴더 내용 불변" '[ -f "$N2/plain.md" ]'
assert "파생물 단계는 수행됨" 'grep -q "EVT reindex" "$EVT"'

# ── AC-6: 분기(ff 불가) → pull 실패해도 진행 + 로컬 보존 + exit 1 ───────
printf '\n\033[1mAC-6 — 분기 시 파괴 부재 + 계속 진행 + exit 1\033[0m\n'
new_fixture s3; advance_code_origin; advance_notes_origin
echo local > "$PROJ/local.txt"; git -C "$PROJ" add -A; git -C "$PROJ" commit -qm local-work
LOCAL_HEAD="$(git -C "$PROJ" rev-parse HEAD)"
run_update
assert "exit 1" '[ "$RC" -eq 1 ]'
assert "로컬 커밋 보존(HEAD 불변)" '[ "$(git -C "$PROJ" rev-parse HEAD)" = "$LOCAL_HEAD" ]'
assert "로컬 작업 파일 보존" '[ -f "$PROJ/local.txt" ]'
assert "노트 단계는 계속 진행됨" '[ -f "$N1/b.md" ]'
assert "파생물 단계는 계속 진행됨" 'grep -q "EVT reindex" "$EVT"'

# ── AC-7: DRY_RUN → 아무것도 변하지 않음 ────────────────────────────────
printf '\n\033[1mAC-7 — DRY_RUN 미리보기(변경 0)\033[0m\n'
new_fixture s4; OLD_HEAD="$(git -C "$PROJ" rev-parse HEAD)"
advance_code_origin; advance_notes_origin
run_update DRY_RUN=1
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "코드 HEAD 불변" '[ "$(git -C "$PROJ" rev-parse HEAD)" = "$OLD_HEAD" ]'
assert "노트 파일 미변경" '[ ! -f "$N1/b.md" ]'
assert "빌드·재인덱싱·배포 미실행" '[ ! -s "$EVT" ]'
assert "계획이 출력됨" 'grep -q "(dry)" "$OUT"'

# ── AC-8: 재인덱싱 실패 → 안내 + exit 1, 배포는 계속 ────────────────────
printf '\n\033[1mAC-8 — 재인덱싱 실패 시 안내 + exit 1 + 배포 계속\033[0m\n'
new_fixture s5
run_update REINDEX_RC=1
assert "exit 1" '[ "$RC" -eq 1 ]'
assert "재인덱싱 실패 안내" 'grep -q "재인덱싱 실패" "$OUT"'
assert "이후 배포 단계는 수행됨" 'grep -q "skills:deploy" "$EVT"'

# ── AC-9: upstream 없음 → pull 생략 + 정상 진행 ─────────────────────────
printf '\n\033[1mAC-9 — upstream 없는 코드 repo\033[0m\n'
new_fixture s6; git -C "$PROJ" remote remove origin
run_update
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "pull 생략 안내" 'grep -q "코드 pull 생략" "$OUT"'
assert "파생물 단계는 수행됨" 'grep -q "EVT reindex" "$EVT"'

# ── AC-10: 부모 git repo 안의 비git 노트 폴더 → 부모를 pull하지 않는다 ──
printf '\n\033[1mAC-10 — 중첩(부모 repo 안 비git 폴더)은 스킵(부모 pull 금지)\033[0m\n'
new_fixture s7
PARENT="$TMP/s7/parent"; mkdir -p "$PARENT"; echo x > "$PARENT/x.txt"
git -C "$PARENT" init -q -b main; git_id "$PARENT"
git -C "$PARENT" add -A; git -C "$PARENT" commit -qm p
git clone -q --bare "$PARENT" "$TMP/s7/parent-origin.git"
git -C "$PARENT" remote add origin "$TMP/s7/parent-origin.git"
# upstream까지 설정 — 옛(버그) 게이트라면 부모 pull이 "성공"해 오보고가 실제로 나는 픽스처.
git -C "$PARENT" fetch -q origin
git -C "$PARENT" branch -q --set-upstream-to=origin/main main
SUB="$PARENT/sub/notes"; mkdir -p "$SUB"; echo n > "$SUB/note.md"
NOTES_OVERRIDE="$SUB" run_update
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "중첩 폴더는 git repo 아님으로 스킵" 'grep -q "git repo 아님" "$OUT"'
assert "부모 repo를 pull했다고 오보고하지 않음" '! grep -q "pull:.*sub/notes" "$OUT"'

# ── AC-12: 노트 repo 분기(충돌 없음) → rebase 폴백으로 합치고 성공 ──────
printf '\n\033[1mAC-12 — 노트 분기(무충돌) 시 rebase 폴백 + exit 0\033[0m\n'
new_fixture s9; advance_notes_origin
echo local-note > "$N1/local.md"; git -C "$N1" add -A; git -C "$N1" commit -qm local-backup
run_update
assert "exit 0" '[ "$RC" -eq 0 ]'
assert "AC-12 원격 커밋 반영(b.md 존재)" '[ -f "$N1/b.md" ]'
assert "AC-12 로컬 커밋 보존(local.md 존재)" '[ -f "$N1/local.md" ]'
assert "AC-12 로컬 커밋이 원격 위로 재적용됨" '[ "$(git -C "$N1" log -1 --format=%s)" = "local-backup" ]'
assert "rebase 진행 중 상태 없음" '[ ! -d "$N1/.git/rebase-merge" ] && [ ! -d "$N1/.git/rebase-apply" ]'
assert "rebase 폴백 안내 출력" 'grep -q "pull(rebase):" "$OUT"'

# ── AC-13: 노트 repo 분기(충돌) → 자동 복구 + exit 1, 이후 단계 계속 ────
printf '\n\033[1mAC-13 — 노트 분기(충돌) 시 원상 복구 + exit 1 + 계속 진행\033[0m\n'
new_fixture s10
w="$TMP/s10/w-conflict"; git clone -q "$NOTES_ORIGIN" "$w"; git_id "$w"
echo remote-side > "$w/a.md"; git -C "$w" add -A; git -C "$w" commit -qm remote-edit
git -C "$w" push -q origin main
echo local-side > "$N1/a.md"; git -C "$N1" add -A; git -C "$N1" commit -qm local-edit
LOCAL_N1_HEAD="$(git -C "$N1" rev-parse HEAD)"
run_update
assert "exit 1" '[ "$RC" -eq 1 ]'
assert "AC-13 로컬 HEAD 불변(원상 복구)" '[ "$(git -C "$N1" rev-parse HEAD)" = "$LOCAL_N1_HEAD" ]'
assert "AC-13 로컬 파일 내용 보존" '[ "$(cat "$N1/a.md")" = "local-side" ]'
assert "AC-13 rebase 진행 중 상태 없음" '[ ! -d "$N1/.git/rebase-merge" ] && [ ! -d "$N1/.git/rebase-apply" ]'
assert "pull 실패 안내" 'grep -q "pull 실패" "$OUT"'
assert "파생물 단계는 계속 진행됨" 'grep -q "EVT reindex" "$EVT"'

# ── AC-14: rebase.autoStash=true + dirty 충돌 → 성공 오보고 없이 원상 보존 ──
# (크리틱 발견 회귀: --no-autostash 없이는 stash pop 충돌이 rc 0으로 새어 나와
#  충돌 마커가 박힌 노트를 "성공"으로 오보고하고 그대로 색인한다)
printf '\n\033[1mAC-14 — autoStash 켜진 dirty 충돌은 거부(마커 오염·성공 오보고 금지)\033[0m\n'
new_fixture s11
w="$TMP/s11/w-conflict"; git clone -q "$NOTES_ORIGIN" "$w"; git_id "$w"
echo remote-side > "$w/a.md"; git -C "$w" add -A; git -C "$w" commit -qm remote-edit
git -C "$w" push -q origin main
git -C "$N1" config rebase.autoStash true
echo local-note > "$N1/local.md"; git -C "$N1" add local.md; git -C "$N1" commit -qm local-backup
echo dirty-precious > "$N1/a.md"   # 미커밋 수정 — 원격 변경과 충돌
run_update
assert "exit 1" '[ "$RC" -eq 1 ]'
assert "AC-14 미커밋 내용 그대로 보존" '[ "$(cat "$N1/a.md")" = "dirty-precious" ]'
assert "AC-14 충돌 마커 오염 없음" '! grep -q "<<<<<<<" "$N1/a.md"'
assert "AC-14 성공 오보고 없음" '! grep -q "pull(rebase):" "$OUT"'
assert "rebase 진행 중 상태 없음" '[ ! -d "$N1/.git/rebase-merge" ] && [ ! -d "$N1/.git/rebase-apply" ]'

# ── AC-11: 빌드 실패 → 표면화 + exit 1, 이후 단계 계속 ──────────────────
printf '\n\033[1mAC-11 — 빌드 실패 시 표면화 + exit 1 + 이후 단계 계속\033[0m\n'
new_fixture s8; advance_code_origin
run_update NPM_FAIL_MATCH=build
assert "exit 1 (빌드 실패만으로 — 배포는 성공)" '[ "$RC" -eq 1 ]'
assert "빌드 실패 안내" 'grep -q "빌드 실패" "$OUT"'
assert "배포는 성공(실패 원인이 빌드로 격리됨)" '! grep -q "배포 실패" "$OUT"'
assert "이후 단계(재인덱싱·배포)는 시도됨" 'grep -q "EVT reindex" "$EVT" && grep -q "skills:deploy" "$EVT"'

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
