#!/usr/bin/env bash
# 주 1회 자동 리포트 등록 — crontab 에 'make report' 예약을 넣어 주는 비개발자용 가이드.
# 호출: make report-cron   (요일/시간 지정: DOW=1 HOUR=9 MIN=0 make report-cron / 미리보기: DRY_RUN=1)
# 멱등: 이미 등록돼 있으면 새 시간으로 교체. 제거 방법은 마지막에 안내.
# (specs/017 FR-7 — backup-cron.sh 패턴 계승)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOW="${DOW:-1}"     # 요일: 0=일 … 6=토 (기본 월요일)
HOUR="${HOUR:-9}"
MIN="${MIN:-0}"
MARKER="# localmind-report"          # 우리 항목을 찾아 교체/삭제하기 위한 표식
LOG="\$HOME/localmind-report.log"

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
say "$(b '주 1회 자동 리포트 설정')을 시작합니다 — 매주 정해진 시각에 '$(b 'make report')'로 검색 품질 리포트 노트를 만들어요."
say ""

command -v crontab >/dev/null 2>&1 || { err "이 시스템에 crontab 이 없어요. 수동 스케줄러(launchd 등)를 사용해 주세요."; exit 1; }

if [ -t 0 ]; then
  read -r -p "  무슨 요일에? 0=일…6=토 [기본: $DOW(월)]: " d || d=""
  [ -n "$d" ] && DOW="$d"
  read -r -p "  몇 시에? 24시간제 시(0-23) [기본: $HOUR]: " h || h=""
  [ -n "$h" ] && HOUR="$h"
  read -r -p "  몇 분에? (0-59) [기본: $MIN]: " m || m=""
  [ -n "$m" ] && MIN="$m"
fi
case "$DOW"  in ''|*[!0-9]*) DOW=1;;  esac; [ "$DOW"  -gt 6 ]  2>/dev/null && DOW=1
case "$HOUR" in ''|*[!0-9]*) HOUR=9;; esac; [ "$HOUR" -gt 23 ] 2>/dev/null && HOUR=9
case "$MIN"  in ''|*[!0-9]*) MIN=0;;  esac; [ "$MIN"  -gt 59 ] 2>/dev/null && MIN=0

# cron 은 최소 PATH(/usr/bin:/bin)라 npm/node 를 못 찾는 경우가 많다 → 현재 위치를 박아 넣는다.
NPM_DIR="$(dirname "$(command -v npm 2>/dev/null || echo /usr/local/bin/npm)")"
NODE_DIR="$(dirname "$(command -v node 2>/dev/null || echo /usr/local/bin/node)")"
CRON_PATH="$NPM_DIR:$NODE_DIR:/usr/local/bin:/usr/bin:/bin"

# 등록 시점의 커스텀 설정을 크론 라인에 함께 싣는다(backup-cron과 동일한 이유).
CRON_ENVS=""
[ -n "${NOTES_DIR:-}" ] && CRON_ENVS="NOTES_DIR=\"$NOTES_DIR\" "
[ -n "${QUERY_LOG:-}" ] && CRON_ENVS="${CRON_ENVS}QUERY_LOG=\"$QUERY_LOG\" "
LINE="$MIN $HOUR * * $DOW cd \"$PROJECT_DIR\" && PATH=\"$CRON_PATH\" ${CRON_ENVS}make report >> $LOG 2>&1 $MARKER"
# cron은 명령의 %를 개행으로 해석한다 — 경로에 %가 있어도 잘리지 않게 이스케이프.
LINE="$(printf '%s' "$LINE" | sed 's/%/\\%/g')"

DOW_NAMES=(일 월 화 수 목 금 토)
say ""
say "$(b '등록할 예약')(매주 ${DOW_NAMES[$DOW]}요일 $(printf '%02d:%02d' "$HOUR" "$MIN")):"
say "  $LINE"
say ""

CURRENT="$(crontab -l 2>/dev/null || true)"
EXISTS="$(printf '%s\n' "$CURRENT" | grep -F "$MARKER" || true)"
[ -n "$EXISTS" ] && warn "이미 등록된 자동 리포트가 있어요 — 새 시간으로 교체합니다."

if [ "${DRY_RUN:-}" = "1" ]; then
  say "$(b '[미리보기]') DRY_RUN=1 — 실제로 등록하지 않았어요. 위 줄이 crontab 에 추가됩니다."
  exit 0
fi

if ! confirm "이대로 자동 리포트를 등록할까요?"; then
  say "  취소했어요 — 아무것도 바꾸지 않았습니다."
  exit 0
fi

{ printf '%s\n' "$CURRENT" | grep -vF "$MARKER" || true; printf '%s\n' "$LINE"; } \
  | grep -v '^$' | crontab -

ok "등록 완료!"
say ""
say "  • 확인하기 : $(b 'crontab -l')"
say "  • 로그 보기: $(b "cat $LOG")"
say "  • 해제하기 : $(b "crontab -l | grep -v '$MARKER' | crontab -")"
say ""
