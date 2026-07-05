#!/usr/bin/env bash
# specs/031 FR-1~4·6·7 — device-sync 오케스트레이터(주 기기에서 실행).
# 사용: make device-sync HOST=<라벨|user@host> [REMOTE_DIR=<원격 localmind 경로>]
#
# 순서(의존 체인 — 앞이 하드 실패하면 이후 중단 + 부분 완료 보고):
#   ⓪ 설정 해석(CI·backup보다 먼저 — 대상 없는 실행이 부작용을 안 남기게)
#   ① CI 게이트(gh — HEAD 커밋 green 아니면 중단, 부재 시 경고 스킵, SYNC_SKIP_CI=1 우회)
#   ② make backup(코어 실패 exit 2 = 중단 / 소프트 exit 1 = 경고 + 계속)
#      ②b 독립 노트 git 저장소 push(소프트 — 실패해도 계속, 요약에 명시)
#   ③ 원격 localmind 코드 pull --ff-only(불가/부재 시 중단 + 안내)
#   ④ 원격 수신 워커(scripts/device-sync-receive.sh — 노트 수신·검증·배포)
# 파괴 금지: 모든 pull --ff-only, reset/merge/force 없음. 종료: 0 전부 성공, 1 실패/부분.
set -uo pipefail

PROJECT_DIR="${LOCALMIND_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"; export BACKUP_DIR  # make backup에 일관 전달(codex 조언)
HOST_IN="${HOST:-}"
REMOTE_DIR_IN="${REMOTE_DIR:-}"
SYNC_ENV_PREP_VAL="${SYNC_ENV_PREP:-$(read_env_val SYNC_ENV_PREP "$ENV_FILE")}"
DONE=""   # 성공 단계 누적(부분 완료 보고)
SOFT=0    # 소프트 실패 발생(최종 종료 코드에만 반영)

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
abort() { # <메시지…> — fail-fast: 어디까지 됐는지와 함께 중단(backup.sh 문체)
  echo "! $1"; shift
  for line in "$@"; do echo "  $line"; done
  [ -n "$DONE" ] && echo "⚠ 동기화 중단 — 완료된 단계:$DONE  (이후 단계는 실행하지 않았어요)"
  exit 1
}
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }  # ssh 명령 합성용 단일 인용

# ── ⓪ 설정 해석(FR-6 — 검증이 CI·backup보다 먼저) ────────────────────────────
SYNC_DEVICES="$(read_env_val SYNC_DEVICES "$ENV_FILE")"
TARGET_HOST=""; TARGET_DIR=""
labels=""; label_count=0
if [ -n "$SYNC_DEVICES" ]; then
  while IFS= read -r item || [ -n "$item" ]; do
    item="$(printf '%s' "$item" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$item" ] && continue
    lbl="${item%%=*}"; rest="${item#*=}"
    labels="$labels $lbl"; label_count=$((label_count+1))
    if [ -n "$HOST_IN" ] && [ "$lbl" = "$HOST_IN" ]; then
      TARGET_HOST="${rest%%:*}"; TARGET_DIR="${rest#*:}"
    fi
    if [ -z "$HOST_IN" ] && [ "$label_count" -eq 1 ]; then
      ONLY_HOST="${rest%%:*}"; ONLY_DIR="${rest#*:}"
    fi
  done <<EOF
$(printf '%s' "$SYNC_DEVICES" | tr ',' '\n')
EOF
fi
if [ -z "$TARGET_HOST" ]; then
  if [ -z "$HOST_IN" ]; then
    if [ "$label_count" -eq 1 ]; then
      TARGET_HOST="$ONLY_HOST"; TARGET_DIR="$ONLY_DIR"
    elif [ "$label_count" -ge 2 ]; then
      abort "어느 기기인지 지정해 주세요 — 등록된 기기가 여러 개예요." \
        "사용: make device-sync HOST=<라벨>   (등록된 라벨:$labels)"
    else
      abort "동기화할 기기가 설정돼 있지 않아요." \
        ".env에 대상 기기를 등록하세요. 예:" \
        "  SYNC_DEVICES=\"m5=m5:/home/<user>/personal/localmind\"" \
        "  (형식: 라벨=ssh호스트:원격_localmind_경로 — 쉼표로 여러 대)" \
        "또는 1회성: make device-sync HOST=user@host REMOTE_DIR=/원격/localmind"
    fi
  elif [ -n "$REMOTE_DIR_IN" ]; then
    TARGET_HOST="$HOST_IN"; TARGET_DIR="$REMOTE_DIR_IN"
  else
    hint=""
    [ -n "$labels" ] && hint="등록된 라벨:$labels — 라벨 오타는 아닌가요? "
    abort "\"$HOST_IN\"는 등록된 라벨이 아니에요." \
      "${hint}주소로 직접 지정하려면 REMOTE_DIR도 함께 주세요:" \
      "  make device-sync HOST=$HOST_IN REMOTE_DIR=/원격/localmind"
  fi
fi
# 입력 검증(신뢰 불가 — 형식 검증 후에만 ssh 합성. SYNC_ENV_PREP는 신뢰되는 셸: .env.example 참고)
case "$TARGET_HOST" in
  *[!A-Za-z0-9._@-]*|"") abort "ssh 호스트 형식이 이상해요: \"$TARGET_HOST\" (허용: 영숫자 . _ @ -)";;
esac
case "$TARGET_DIR" in
  /*) : ;;
  *) abort "원격 경로는 절대경로여야 해요: \"$TARGET_DIR\"";;
esac
ok "대상: $TARGET_HOST:$TARGET_DIR"

PREP=""
[ -n "$SYNC_ENV_PREP_VAL" ] && PREP="$SYNC_ENV_PREP_VAL; "

# ── ① CI 게이트(FR-2 — 조회 대상은 이 저장소의 origin) ──────────────────────
if [ "${SYNC_SKIP_CI:-}" = "1" ]; then
  warn "CI 확인을 건너뜁니다(SYNC_SKIP_CI=1 — 명시 우회)"
elif gh --version >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  SHA="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [ -z "$SHA" ]; then
    abort "이 폴더가 git 저장소가 아니에요 — localmind 저장소에서 실행하세요."
  fi
  # 해당 커밋의 모든 run이 green이어야 통과(단일 --limit 1은 다중 워크플로에서 오탐 — codex 조언)
  ST="$(cd "$PROJECT_DIR" && gh run list --commit "$SHA" --json status,conclusion \
        --jq '[.[] | .status + ":" + (.conclusion // "")] | if length == 0 then "" elif all(. == "completed:success") then "completed:success" else (map(select(. != "completed:success")) | .[0]) end' 2>/dev/null || true)"
  case "$ST" in
    completed:success) ok "CI green (${SHA%????????????????????????????????})" ;;
    "") abort "이 커밋의 CI 기록이 없어요 — 원격 전파를 멈췄어요." \
          "push 후 CI 완료를 기다리거나, 정말 건너뛰려면 SYNC_SKIP_CI=1을 붙이세요." ;;
    *) abort "CI가 아직 green이 아니에요($ST) — 원격 전파를 멈췄어요." \
          "CI 완료 후 재실행하거나, 정말 건너뛰려면 SYNC_SKIP_CI=1을 붙이세요." ;;
  esac
else
  warn "gh 미설치/미인증 — CI 확인을 건너뜁니다(설치 권장: 깨진 커밋 전파 방지 게이트)"
fi
DONE="$DONE ①CI"

# ── ② 백업(FR-3 — 코어 exit 2 중단 / 소프트 exit 1 계속) ────────────────────
( cd "$PROJECT_DIR" && make backup </dev/null )
BK_RC=$?
case "$BK_RC" in
  0) ok "백업" ;;
  2) abort "백업 코어 실패(노트 커밋/push) — 원격이 오래된 정본을 받지 않도록 멈췄어요." \
        "위 백업 안내를 따른 뒤 다시 실행하세요." ;;
  *) warn "백업 소프트 실패(메모리·자산 등 콘텐츠 하위 단계 — 노트 커밋/push는 반영됨)."
     warn "  자산 백업이 실패했다면 이번 동기화에서 페르소나·스킬이 완전하지 않을 수 있어요(위 백업 로그 확인)."
     warn "  동기화는 계속합니다."; SOFT=1 ;;
esac
# ②b — 독립 노트 git 저장소 push(소프트: 실패해도 계속, stale 가능성만 명시)
resolved="$(resolve_notes_dir "$ENV_FILE")"
if [ -n "$resolved" ]; then
  bk_canon="$(canon_path "$BACKUP_DIR")"
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    [ "$p" = "$bk_canon" ] && continue
    [ -d "$p/.git" ] || continue
    [ -n "$(git -C "$p" remote 2>/dev/null)" ] || continue
    if git -C "$p" push -q 2>/dev/null; then
      ok "노트 저장소 push ($p)"
    else
      warn "노트 저장소 push 실패 ($p) — 원격이 이 노트를 오래된 상태로 받을 수 있어요. 계속합니다."
      SOFT=1
    fi
  done <<EOF
$(notes_dir_paths "$resolved")
EOF
fi
DONE="$DONE ②백업"

# ── ③ 원격 코드 pull(FR-4 — ff-only, 부재 시 recover 안내) ──────────────────
if ! ssh "$TARGET_HOST" "[ -d $(q "$TARGET_DIR")/.git ]" 2>/dev/null; then
  abort "원격에 localmind 저장소가 없어요($TARGET_HOST:$TARGET_DIR)." \
    "새 기기라면 그 기기에서 먼저 'make recover'로 부트스트랩하세요(device-sync는 증분 최신화 전용)."
fi
if ssh "$TARGET_HOST" "${PREP}git -C $(q "$TARGET_DIR") pull --ff-only" 2>&1; then
  ok "원격 코드 pull"
else
  abort "원격 코드 pull이 fast-forward가 안 돼요 — 원격을 건드리지 않고 멈췄어요." \
    "원격 기기에서 직접 해결하세요(예: 원격의 로컬 커밋 정리 후 재시도)."
fi
DONE="$DONE ③코드"

# ── ④ 원격 수신 워커(FR-5 — 노트 수신·검증·자산 복원·배포) ──────────────────
if ssh "$TARGET_HOST" "${PREP}cd $(q "$TARGET_DIR") && SYNC_TEST_CMD=$(q "${SYNC_TEST_CMD:-}") bash scripts/device-sync-receive.sh"; then
  ok "원격 수신(노트·검증·배포)"
else
  echo "! 원격 수신이 부분 완료/실패했어요 — 위 원격 로그를 확인하세요."
  echo "⚠ 동기화 부분 완료 — 완료된 단계:$DONE ④수신(부분)"
  exit 1
fi
DONE="$DONE ④수신"

if [ "$SOFT" -eq 1 ]; then
  echo "⚠ 동기화 완료(경고 있음 — 위 소프트 실패 참조):$DONE"
  exit 1
fi
echo "✓ 동기화 완료:$DONE"
