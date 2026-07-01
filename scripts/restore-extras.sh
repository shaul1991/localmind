#!/usr/bin/env bash
# 백업 저장소의 extras/를 새 기기의 원래 경로($HOME 기준)로 복원한다.
# 호출: make restore 내부에서 자동 호출 (환경변수 BACKUP_DIR)
# 동작: $BACKUP_DIR/extras/<rel> 형태의 파일들을 $HOME/<rel>로 복사한다.
#       대상에 이미 다른 내용의 파일이 있으면 <대상>.bak-<타임스탬프>로 보존 후 덮어쓴다.
#       동일 내용이면 건너뛴다. extras/ 자체가 없으면 조용히 종료한다.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
EXTRAS_DIR="$BACKUP_DIR/extras"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

if [ ! -d "$EXTRAS_DIR" ]; then
  exit 0
fi

while IFS= read -r -d '' src; do
  rel="${src#"$EXTRAS_DIR"/}"
  dest="$HOME/$rel"
  mkdir -p "$(dirname "$dest")"

  if [ -f "$dest" ]; then
    if cmp -s "$src" "$dest"; then
      continue # 이미 동일한 내용 — 건너뜀
    fi
    backup="$dest.bak-$(date +%Y%m%d%H%M%S)"
    cp "$dest" "$backup"
    warn "기존 파일 보존: $backup"
  fi

  cp "$src" "$dest"
  ok "복원됨: ~/$rel"
done < <(find "$EXTRAS_DIR" -type f -print0)
