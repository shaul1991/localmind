#!/usr/bin/env bash
# specs/019 FR-1 — 자산(페르소나 레지스트리·스킬 정본) 미러 백업.
# backup.sh가 커밋 전에 호출한다. 자산별로 독립 처리(015: 단계는 인질이 아님).
#
# 가드 우선순위(spec 공통 가드 원칙 — 판정 불확정 시 파괴 금지):
#   0. 소스가 BACKUP_DIR 안(기본 구성) → 미러 불필요(자기 복사 금지) + 잔존 마커 제거
#   1. 소스도 기존 미러도 없음(미사용) → 후퇴 여부와 무관하게 조용히 건너뜀(0)
#   2. NOTES_DIR 후퇴(env·.env 모두 부재, override 아님) → 미러 거부 + 경고 + 비0
#   3. 빈/부재 소스 + 기존 미러 존재 → 삭제 반영 거부 + 탈출구 안내 + 비0
#      (BACKUP_CONFIRM_EMPTY_ASSETS=<자산명,...>로 자산별 반영 허용)
#   4. 정상 미러: 삭제 반영 복사(*.bak-* 제외) + 마커(.localmind-mirror) 기록
# 종료: 0 정상/스킵, 1 하나라도 실패·가드 발동(backup.sh 요약에 반영).
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
CONFIRM_EMPTY="${BACKUP_CONFIRM_EMPTY_ASSETS:-}"
MARKER=".localmind-mirror"
FAIL=0

warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }

# 경로 정규화는 lib의 canon_path 공용(진단·복원과 같은 규칙).

# 콘텐츠 파일 존재 여부(마커·.bak 제외) — "빈 폴더" 판정의 기준(spec FR-1)
has_content() { [ -d "$1" ] && [ -n "$(find "$1" -type f ! -name "$MARKER" ! -name '*.bak-*' -print -quit 2>/dev/null)" ]; }

# ── 판정 조회: TS 단일 소스(scripts/asset-dirs.ts) ─────────────────────────
resolved="$(resolve_notes_dir "$ENV_FILE")"   # 빈 값 = 후퇴(기본값으로 후퇴한 판정)
if [ -n "$resolved" ]; then
  DIRS_OUT="$(cd "$PROJECT_DIR" && NOTES_DIR="$resolved" node --import tsx/esm scripts/asset-dirs.ts 2>/dev/null)" || DIRS_OUT=""
else
  DIRS_OUT="$(cd "$PROJECT_DIR" && env -u NOTES_DIR node --import tsx/esm scripts/asset-dirs.ts 2>/dev/null)" || DIRS_OUT=""
fi
AGENTS_SRC="$(printf '%s\n' "$DIRS_OUT" | grep '^agents=' | head -1 | cut -d= -f2-)"
SKILLS_SRC="$(printf '%s\n' "$DIRS_OUT" | grep '^skills=' | head -1 | cut -d= -f2-)"
AGENTS_OVR="$(printf '%s\n' "$DIRS_OUT" | grep '^agents_override=' | head -1 | cut -d= -f2-)"
SKILLS_OVR="$(printf '%s\n' "$DIRS_OUT" | grep '^skills_override=' | head -1 | cut -d= -f2-)"

if [ -z "$AGENTS_SRC" ] || [ -z "$SKILLS_SRC" ]; then
  # 판정 자체를 못 얻은 상태 — 지킬 미러가 있으면 보호(비0), 없으면 조용히 스킵.
  if [ -d "$BACKUP_DIR/agents" ] || [ -d "$BACKUP_DIR/skills" ]; then
    warn "자산 위치 판정에 실패했어요 — 기존 백업본을 보존하고 자산 백업을 건너뜁니다. ('npm install' 후 다시 시도해 주세요.)"
    exit 1
  fi
  exit 0
fi

BK_CANON="$(canon_path "$BACKUP_DIR")"

mirror_asset() { # <자산명> <소스 경로> <override 0|1>
  local name="$1" src="$2" ovr="$3"
  local mirror="$BACKUP_DIR/$name" src_canon
  src_canon="$(canon_path "$src")"

  # 0) 소스가 BACKUP_DIR 안 — 미러 불필요(git add -A로 충분). 잔존 마커는 제거(AC-7).
  case "$src_canon" in
    "$BK_CANON"|"$BK_CANON"/*)
      [ -f "$src_canon/$MARKER" ] && rm -f "$src_canon/$MARKER"
      return 0;;
  esac

  local src_has=0 mirror_has=0
  has_content "$src" && src_has=1
  has_content "$mirror" && mirror_has=1

  # 1) 미사용: 소스도 기존 미러도 없음 → 조용히 스킵(하위호환, AC-6)
  if [ "$src_has" -eq 0 ] && [ "$mirror_has" -eq 0 ]; then return 0; fi

  # 2) 후퇴 가드: 판정에 NOTES_DIR가 쓰였는데(override 아님) env·.env 모두 부재(AC-5)
  if [ "$ovr" != "1" ] && [ -z "$resolved" ]; then
    warn "$name: 노트 폴더 설정(NOTES_DIR)이 없어 자산 위치를 확정할 수 없어요 — 백업을 건너뜁니다(기존 백업본 보존)."
    local mcp; mcp="$(mcp_notes_dir)"
    [ -n "$mcp" ] && warn "$name: Claude Code(MCP) 등록은 이 목록을 쓰고 있어요: $mcp"
    warn "$name: .env에 NOTES_DIR를 추가하거나 'make mcp-install NOTES_DIR=<폴더 목록>'을 실행하면 해결돼요."
    FAIL=1; return 1
  fi

  # 3) 빈/부재 소스 + 기존 미러 → 삭제 반영 거부(+자산별 탈출구, AC-3·4)
  if [ "$src_has" -eq 0 ]; then
    case ",$CONFIRM_EMPTY," in
      *",$name,"*)
        find "$mirror" -type f ! -name "$MARKER" -delete 2>/dev/null
        find "$mirror" -mindepth 1 -type d -empty -delete 2>/dev/null
        ok "$name: 빈 상태를 백업에 반영했어요(BACKUP_CONFIRM_EMPTY_ASSETS)."
        return 0;;
    esac
    warn "$name: 정본 폴더가 비어 있는데 백업본이 남아 있어요 — 삭제를 반영하지 않았어요."
    warn "$name: 정말 모두 삭제한 것이면 'BACKUP_CONFIRM_EMPTY_ASSETS=$name make backup'으로 반영돼요."
    FAIL=1; return 1
  fi

  # 4) 정상 미러 — 삭제 반영 + *.bak-* 제외 + 마커 기록.
  # 개별 cp/rm 실패를 수집해 비0으로 보고한다(015: 조용한 부분 유실 금지) —
  # 파이프 서브셸은 카운터를 잃으므로 프로세스 치환으로 루프를 현재 셸에 둔다.
  mkdir -p "$mirror"
  local errs=0 rel
  while IFS= read -r rel; do
    rel="${rel#./}"
    case "$rel" in *.bak-*) rm -f "$mirror/$rel" || errs=$((errs+1)); continue;; esac  # 잔재 제거
    [ -f "$src/$rel" ] || rm -f "$mirror/$rel" || errs=$((errs+1))
  done < <( cd "$mirror" && find . -type f ! -name "$MARKER" -print 2>/dev/null )
  while IFS= read -r rel; do
    rel="${rel#./}"
    { mkdir -p "$mirror/$(dirname "$rel")" && cp "$src/$rel" "$mirror/$rel"; } || errs=$((errs+1))
  done < <( cd "$src" && find . -type f ! -name "$MARKER" ! -name '*.bak-*' -print 2>/dev/null )
  find "$mirror" -mindepth 1 -type d -empty -delete 2>/dev/null
  printf '%s\n' "이 폴더는 localmind 자산 미러입니다 — 정본이 아닙니다(specs/019 FR-1)." > "$mirror/$MARKER" || errs=$((errs+1))
  if [ "$errs" -gt 0 ]; then
    warn "$name: 일부 파일 반영 실패(${errs}건) — 백업이 불완전할 수 있어요. 권한·디스크 공간을 확인해 주세요."
    FAIL=1; return 1
  fi
  local n; n="$(find "$mirror" -type f ! -name "$MARKER" | wc -l | tr -d ' ')"
  ok "$name 미러 → $mirror (${n}개 파일)"
  return 0
}

mirror_asset agents "$AGENTS_SRC" "$AGENTS_OVR" || true
mirror_asset skills "$SKILLS_SRC" "$SKILLS_OVR" || true

exit "$FAIL"
