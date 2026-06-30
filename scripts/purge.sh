#!/usr/bin/env bash
# localmind 완전 제거 — 로컬에서만. GitHub 백업(원격 저장소)은 절대 건드리지 않는다.
# 호출: make purge            컨테이너·볼륨·localmind 이미지·MCP 등록 제거
#       NOTES=1 make purge    + 노트 폴더(로컬)까지 삭제
#       FORCE=1 ...           비대화 환경에서 강행
# 되돌릴 수 없는 위험 작업이라 명시적 확인을 받는다.
# set -e 미사용 — 단계별로 '이미 없음'을 허용하며 끝까지 진행해야 하므로.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"   # 노트 폴더(기본) = 백업 git repo 위치
WIPE_NOTES="${NOTES:-}"
export COMPOSE_PROFILES="gateway,memory"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
DC()   { docker compose -f "$PROJECT_DIR/docker-compose.yml" "$@"; }

PROJ_NAME="$(basename "$PROJECT_DIR")"

say ""
say "$(b '⚠️  localmind 완전 제거') $(b '(로컬에서만 — GitHub 백업은 그대로)')"
say "$(b '되돌릴 수 없어요'). 다음을 삭제합니다:"
say "  • 컨테이너 정지 + 데이터 볼륨($(b '메모리 DB')·$(b 'AI 모델')·인덱스)"
say "  • localmind $(b 'Docker 이미지')(빌드본: localmind, localmind-openmemory)"
say "  • Claude Code $(b 'MCP 등록') 해제"
[ -n "$WIPE_NOTES" ] && say "  • $(b '노트 폴더')도 삭제(로컬): $(b "$BACKUP_DIR")   ← NOTES=1"
say ""
say "남깁니다(안 건드림):"
say "  • $(b 'GitHub 백업 저장소')(원격) — 그대로. 나중에 $(b 'make recover')로 복구 가능"
say "  • 공용 Docker 이미지(ollama·litellm·pgvector) — 다른 용도로 쓸 수 있어 보존"
[ -z "$WIPE_NOTES" ] && say "  • 로컬 노트(.md) — 함께 지우려면 $(b 'NOTES=1 make purge')"
say "  • 프로젝트 소스 폴더(.env 포함) — 완전히 없애려면 직접: $(b "cd .. && rm -rf $PROJ_NAME")"
say ""
[ -n "$WIPE_NOTES" ] && { say "노트를 지우기 전에 $(b 'make backup')으로 GitHub에 올려두면 안전해요."; say ""; }

# 노트 삭제 경로 안전 가드 — 루트/홈/빈값이면 거부.
if [ -n "$WIPE_NOTES" ]; then
  case "$BACKUP_DIR" in
    ""|"/"|"$HOME"|"$HOME/") err "노트 폴더 경로가 안전하지 않아요($BACKUP_DIR) — 중단."; exit 2 ;;
  esac
fi

# 위험 작업 확인: 노트 포함이면 더 강한 토큰을 요구.
TOKEN="delete"; [ -n "$WIPE_NOTES" ] && TOKEN="delete-notes"
if [ -t 0 ]; then
  read -r -p "$(printf '정말 제거하려면 \033[1m%s\033[0m 라고 입력하세요(취소는 Enter): ' "$TOKEN")" ans || ans=""
  [ "$ans" = "$TOKEN" ] || { say ""; ok "취소했어요. 아무것도 지우지 않았습니다."; exit 0; }
else
  if [ "${FORCE:-}" != "1" ]; then
    err "비대화 환경에서는 안전을 위해 자동으로 지우지 않아요. 확실하면: $(b "FORCE=1 ${WIPE_NOTES:+NOTES=1 }make purge")"
    exit 1
  fi
  say "  FORCE=1 — 자동 진행(삭제)"
fi

say ""
# 1) 컨테이너 정지 + 볼륨 삭제
say "→ 컨테이너 정지 + 데이터 볼륨 삭제..."
DC down -v >/dev/null 2>&1 && ok "컨테이너·볼륨 제거" || warn "compose down 일부 생략(이미 없을 수 있음)"

# 2) localmind 빌드 이미지만 제거(공용 pull 이미지는 보존)
if command -v docker >/dev/null 2>&1; then
  docker image rm localmind localmind-openmemory >/dev/null 2>&1 \
    && ok "localmind 이미지 제거(localmind, localmind-openmemory)" \
    || warn "localmind 이미지 없음(또는 다른 컨테이너가 사용 중)"
fi

# 3) Claude Code MCP 등록 해제
if command -v claude >/dev/null 2>&1; then
  claude mcp remove localmind -s user >/dev/null 2>&1 \
    && ok "Claude Code MCP 등록 해제" \
    || warn "MCP 등록 없음(또는 이미 해제)"
else
  warn "claude CLI 없음 — MCP 등록 해제 생략"
fi

# 4) 노트 폴더 삭제(옵션) — 로컬만. GitHub 원격은 안 건드림(push/삭제 없음).
if [ -n "$WIPE_NOTES" ]; then
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR" && ok "노트 폴더 삭제(로컬): $BACKUP_DIR" || err "노트 폴더 삭제 실패: $BACKUP_DIR"
  else
    warn "노트 폴더가 없어요: $BACKUP_DIR"
  fi
  say "  ℹ GitHub 백업은 그대로 — 되살리려면 $(b 'make recover RESTORE_REPO=<백업 repo>')"
fi

say ""
say "$(b '🧹 완전 제거 완료(로컬).')"
say "  • GitHub 백업에서 되살리기 : $(b 'make recover')"
say "  • 소스 폴더까지 없애기      : $(b "cd .. && rm -rf $PROJ_NAME")"
say ""
