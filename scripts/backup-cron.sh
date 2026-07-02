#!/usr/bin/env bash
# 매일 자동 백업 등록 — crontab 에 'make backup' 예약을 넣어 주는 비개발자용 가이드.
# 호출: make backup-cron   (시간 지정: HOUR=3 MIN=0 make backup-cron / 미리보기: DRY_RUN=1)
# 멱등: 이미 등록돼 있으면 새 시간으로 교체. 제거 방법은 마지막에 안내.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOUR="${HOUR:-3}"
MIN="${MIN:-0}"
MARKER="# localmind-backup"          # 우리 항목을 찾아 교체/삭제하기 위한 표식
LOG="\$HOME/localmind-backup.log"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

confirm() {  # 예/아니오. 비대화면 자동 "예".
  local prompt="$1" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt [Y/n] " ans || ans=""
    [[ "$ans" =~ ^[Nn] ]] && return 1 || return 0
  else
    say "  $prompt → 자동 진행(예)"; return 0
  fi
}

say ""
say "$(b '매일 자동 백업 설정')을 시작합니다 — 매일 정해진 시각에 '$(b 'make backup')'을 자동 실행해요."
say ""

command -v crontab >/dev/null 2>&1 || { err "이 시스템에 crontab 이 없어요. 수동 스케줄러(launchd 등)를 사용해 주세요."; exit 1; }

# 시간 입력(터미널일 때만). 0~23 / 0~59 범위 점검.
if [ -t 0 ]; then
  read -r -p "  몇 시에 백업할까요? 24시간제 시(0-23) [기본: $HOUR]: " h || h=""
  [ -n "$h" ] && HOUR="$h"
  read -r -p "  몇 분에? (0-59) [기본: $MIN]: " m || m=""
  [ -n "$m" ] && MIN="$m"
fi
case "$HOUR" in ''|*[!0-9]*) HOUR=3;; esac; [ "$HOUR" -gt 23 ] 2>/dev/null && HOUR=3
case "$MIN"  in ''|*[!0-9]*) MIN=0;;  esac; [ "$MIN"  -gt 59 ] 2>/dev/null && MIN=0

# cron 은 최소 PATH(/usr/bin:/bin)라 npm/node 를 못 찾는 경우가 많다 → 현재 위치를 박아 넣는다.
NPM_DIR="$(dirname "$(command -v npm 2>/dev/null || echo /usr/local/bin/npm)")"
NODE_DIR="$(dirname "$(command -v node 2>/dev/null || echo /usr/local/bin/node)")"
DOCKER_DIR="$(dirname "$(command -v docker 2>/dev/null || echo /usr/local/bin/docker)")"
CRON_PATH="$NPM_DIR:$NODE_DIR:$DOCKER_DIR:/usr/local/bin:/usr/bin:/bin"

# 등록 시점의 백업 설정을 크론 라인에 함께 싣는다(specs/015 FR-6) — 커스텀
# BACKUP_DIR·BACKUP_EXTRA_FILES로 수동 백업하던 사용자의 크론이 기본값으로 돌지 않게.
CRON_ENVS=""
[ "${BACKUP_DIR:-$HOME/.localmind}" != "$HOME/.localmind" ] && CRON_ENVS="BACKUP_DIR=\"$BACKUP_DIR\" "
[ -n "${BACKUP_EXTRA_FILES:-}" ] && CRON_ENVS="${CRON_ENVS}BACKUP_EXTRA_FILES=\"$BACKUP_EXTRA_FILES\" "
LINE="$MIN $HOUR * * * cd \"$PROJECT_DIR\" && PATH=\"$CRON_PATH\" ${CRON_ENVS}make backup >> $LOG 2>&1 $MARKER"
# cron은 명령의 %를 개행으로 해석한다 — 경로에 %가 있어도 잘리지 않게 이스케이프.
LINE="$(printf '%s' "$LINE" | sed 's/%/\\%/g')"

say ""
say "$(b '등록할 예약')(매일 $(printf '%02d:%02d' "$HOUR" "$MIN")):"
say "  $LINE"
say ""

# 기존 crontab 읽기(비어 있으면 빈 문자열)
CURRENT="$(crontab -l 2>/dev/null || true)"
EXISTS="$(printf '%s\n' "$CURRENT" | grep -F "$MARKER" || true)"
[ -n "$EXISTS" ] && warn "이미 등록된 자동 백업이 있어요 — 새 시간으로 교체합니다."

if [ "${DRY_RUN:-}" = "1" ]; then
  say "$(b '[미리보기]') DRY_RUN=1 — 실제로 등록하지 않았어요. 위 줄이 crontab 에 추가됩니다."
  exit 0
fi

if ! confirm "이대로 자동 백업을 등록할까요?"; then
  say ""
  say "  등록을 건너뛰었어요. 직접 넣으려면 '$(b 'crontab -e')' 후 아래 줄을 붙여넣으세요:"
  say "  $LINE"
  exit 0
fi

# 우리 표식이 붙은 기존 줄을 빼고, 새 줄을 더해 다시 설치(멱등)
{ printf '%s\n' "$CURRENT" | grep -vF "$MARKER" || true; printf '%s\n' "$LINE"; } \
  | sed '/^$/d' | crontab -
ok "자동 백업 등록 완료 — 매일 $(printf '%02d:%02d' "$HOUR" "$MIN")에 실행돼요."

say ""
say "$(b '참고')"
say "  • localmind가 꺼져 있으면 $(b '메모리만 건너뛰고 노트는 백업')돼요(로그에 '부분 완료'로 표기)."
say "  • 처음 한 번은 '$(b 'make backup-init')'으로 백업 저장소를 연결해 두어야 해요."
say "  • 기록 보기 : $(b 'tail -f ~/localmind-backup.log')"
say "  • 해제하기 : $(b "crontab -l | grep -v '$MARKER' | crontab -")"
say "  • macOS는 cron 에 '전체 디스크 접근 권한'이 필요할 수 있어요(시스템 설정 → 개인정보 보호)."
say ""
