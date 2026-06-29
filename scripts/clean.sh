#!/usr/bin/env bash
# localmind 완전 초기화 — 스택 정지 + 데이터 볼륨 삭제. 되돌릴 수 없는 위험 작업이라 꼭 확인을 받는다.
# 호출: make clean   (비대화 환경에서 강행: FORCE=1 make clean)
# 지우는 것: 메모리 DB(Postgres), 내려받은 AI 모델, 인덱스. 노트(.md 파일)와 .env 는 그대로 남는다.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
export COMPOSE_PROFILES="gateway,memory"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
DC()   { docker compose -f "$PROJECT_DIR/docker-compose.yml" "$@"; }

say ""
say "$(b '⚠️  localmind 완전 초기화')"
say "이 작업은 $(b '되돌릴 수 없어요'). 다음이 영구 삭제됩니다:"
say "  • 저장된 $(b 메모리)(데이터베이스)"
say "  • 내려받은 $(b 'AI 모델')(다시 받으면 시간이 걸려요)"
say "  • 검색 인덱스"
say "남는 것: $(b '노트(.md) 파일')과 $(b .env) 설정은 그대로예요."
say ""
say "먼저 $(b 'make backup')으로 백업해 두는 걸 권해요(메모리를 GitHub에 보관)."
say ""

# 위험 작업: 터미널에선 명시적 입력, 비대화 환경에선 FORCE=1 없으면 중단(자동 삭제 금지).
if [ -t 0 ]; then
  read -r -p "$(printf '정말 초기화하려면 \033[1mdelete\033[0m 라고 입력하세요(취소는 Enter): ')" ans || ans=""
  [ "$ans" = "delete" ] || { say ""; ok "취소했어요. 아무것도 지우지 않았습니다."; exit 0; }
else
  if [ "${FORCE:-}" != "1" ]; then
    err "비대화 환경에서는 안전을 위해 자동으로 지우지 않아요. 확실하면: $(b 'FORCE=1 make clean')"
    exit 1
  fi
  say "  FORCE=1 — 자동 진행(삭제)"
fi

say ""
say "→ 정지하고 데이터 볼륨을 삭제하는 중..."
DC down -v || { err "초기화 실패 — '$(b 'make ps')'로 상태를 확인해 주세요."; exit 1; }
ok "초기화 완료 — 메모리·모델·인덱스가 비워졌어요."
say ""
say "다시 시작하려면:"
say "  • 백업에서 되살리기 : $(b 'make recover')   (메모리·노트 복원)"
say "  • 빈 상태로 새로 켜기: $(b 'make up')"
say ""
