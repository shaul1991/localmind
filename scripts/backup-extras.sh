#!/usr/bin/env bash
# 사용자가 지정한 개인 설정 파일을 백업 저장소에 포함시킨다(선택 사항).
# 호출: make backup 내부에서 자동 호출 (환경변수 BACKUP_DIR, BACKUP_EXTRA_FILES)
# 동작: BACKUP_EXTRA_FILES(콤마 구분, ~ 표기 가능)에 지정된 $HOME 하위 파일들을
#       $BACKUP_DIR/extras/<$HOME 기준 상대경로>로 복사한다. 매니페스트 없이
#       상대경로 자체가 원래 위치 정보를 담는다(restore-extras.sh가 역으로 사용).
# BACKUP_EXTRA_FILES가 비어있으면 아무 것도 하지 않고 종료한다(완전 opt-in).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
BACKUP_EXTRA_FILES="${BACKUP_EXTRA_FILES:-}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

if [ -z "$BACKUP_EXTRA_FILES" ]; then
  exit 0
fi

EXTRAS_DIR="$BACKUP_DIR/extras"
# -P(물리 경로)로 정규화 — 중간 디렉토리가 심볼릭 링크여도 실제 위치로 해석되게 한다.
# (pwd 기본값인 논리 경로를 쓰면 심볼릭 링크를 경유해 $HOME 밖 파일이 경계 검사를 통과할 수 있다.)
HOME_RESOLVED="$(cd "$HOME" && pwd -P)"

IFS=',' read -r -a paths <<< "$BACKUP_EXTRA_FILES"
for raw in "${paths[@]}"; do
  raw="$(printf '%s' "$raw" | sed 's/^ *//; s/ *$//')" # trim
  [ -z "$raw" ] && continue

  # ~ 또는 / 로 시작하지 않는 상대경로는 거부(현재 작업 디렉토리 기준으로 조용히
  # 해석되는 것을 막는다 — $HOME 하위만 지원한다는 의도와 맞지 않음).
  case "$raw" in
    "~"*|/*) ;;
    *)
      warn "상대경로는 지원하지 않습니다(~/경로 형식을 쓰세요): $raw"
      continue
      ;;
  esac

  # ~ 확장
  expanded="${raw/#\~/$HOME}"

  if [ -L "$expanded" ]; then
    warn "심볼릭 링크는 건너뜁니다: $raw"
    continue
  fi
  if [ -d "$expanded" ]; then
    warn "디렉토리는 지원하지 않습니다(파일만 가능): $raw"
    continue
  fi
  if [ ! -f "$expanded" ]; then
    warn "파일이 없어 건너뜁니다: $raw"
    continue
  fi

  # $HOME 하위인지 확인(물리 경로로 정규화 후 비교 — 중간 심볼릭 링크 우회 방지)
  resolved="$(cd "$(dirname "$expanded")" && pwd -P)/$(basename "$expanded")"
  case "$resolved" in
    "$HOME_RESOLVED"/*) ;;
    *)
      warn "\$HOME 밖 경로라 건너뜁니다: $raw"
      continue
      ;;
  esac

  rel="${resolved#"$HOME_RESOLVED"/}"
  dest="$EXTRAS_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  cp "$resolved" "$dest"
  ok "백업됨: ~/$rel"
done
