#!/usr/bin/env bash
# specs/019 FR-2·FR-4 — 자산(페르소나·스킬) 복원 + 배포 재실행 + 쿼리 로그 병합.
# make restore(기본)와 make recover(RESTORE_CONTEXT=recover)가 호출한다.
#
# FR-2(016 FR-9의 기기 복구 한정 개정): 복원 후 agents:deploy·skills:deploy를 실행한다.
# 파괴 규칙(spec 공통 가드 원칙): 판정 불확정 시 삭제·덮어쓰기 금지. 덮어쓰기·삭제 전파는
# 항상 .bak-<ts> 보존을 거친다. 마커(.localmind-mirror)·*.bak-*는 복원·전파 대상이 아니다.
#
# recover: 경로 판정을 신뢰할 수 없으므로(노트 연결 전·새 .env) 백업 자산 폴더의 마커로
# 구성을 판정한다 — 마커 있음 = 미러(정본이 다른 곳) → 보류 + 말미 순서 안내(종료 0,
# 보류는 설계된 2단 흐름의 1단). 마커 없음 = 기본 구성 백업 → 복사 생략 + 배포만.
# 종료: 0 정상/스킵/보류, 1 실패(후퇴 가드·배포 실패 등).
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
CONTEXT="${RESTORE_CONTEXT:-restore}"
MARKER=".localmind-mirror"
TS="$(date +%Y%m%d-%H%M%S)"
FAIL=0
DEFERRED=""      # recover에서 마커로 보류된 자산 목록(말미 안내용)
REFLECTED_ANY=0  # 하나라도 반영되면 배포 단계 진입(AC-11 — deploy는 멱등)
SUPPRESS_agents=0; SUPPRESS_skills=0  # 보류·가드된 자산은 배포도 억제(AC-15 — 미러를 소스로 배포 금지)

warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }

# 경로 정규화는 lib의 canon_path 공용(백업·진단과 같은 규칙).

# 배포 스크립트 존재 판정 파일 — 테스트 격리용 override(LOCALMIND_ENV_FILE과 같은 결).
PKG_FILE="${LOCALMIND_PKG_FILE:-$PROJECT_DIR/package.json}"

deploy_asset() { # <자산명> → agents:deploy | skills:deploy (스크립트가 있는 구성에서만)
  local script="$1:deploy"
  # 배포 스크립트는 great-reduction(2026-07-21)으로 메타와 함께 이관·소멸했다 — 부재는
  # 결함이 아니라 코어 전용 구성이므로 스킵한다(소멸한 타깃 호출로 매 복원·동기화가
  # 실패로 보이던 잔재 제거, specs/202607231856). 애드온이 스크립트를 되살리면 자동 재개.
  if ! grep -q "\"$script\"" "$PKG_FILE" 2>/dev/null; then
    ok "$1 배포 스킵 — 코어 전용 구성(배포 스크립트 없음)"
    return 0
  fi
  if ( cd "$PROJECT_DIR" && npm run --silent "$script" ); then
    ok "$1 배포 완료($script)"
  else
    warn "$1 배포 실패 — 'make restore'로 다시 시도할 수 있어요."
    FAIL=1
  fi
}

# ── 판정 조회: TS 단일 소스(backup-assets.sh와 동일 경로) ───────────────────
resolved="$(resolve_notes_dir "$ENV_FILE")"
if [ -n "$resolved" ]; then
  DIRS_OUT="$(cd "$PROJECT_DIR" && NOTES_DIR="$resolved" node --import tsx/esm scripts/asset-dirs.ts 2>/dev/null)" || DIRS_OUT=""
else
  DIRS_OUT="$(cd "$PROJECT_DIR" && env -u NOTES_DIR node --import tsx/esm scripts/asset-dirs.ts 2>/dev/null)" || DIRS_OUT=""
fi
AGENTS_DST="$(printf '%s\n' "$DIRS_OUT" | grep '^agents=' | head -1 | cut -d= -f2-)"
SKILLS_DST="$(printf '%s\n' "$DIRS_OUT" | grep '^skills=' | head -1 | cut -d= -f2-)"
AGENTS_OVR="$(printf '%s\n' "$DIRS_OUT" | grep '^agents_override=' | head -1 | cut -d= -f2-)"
SKILLS_OVR="$(printf '%s\n' "$DIRS_OUT" | grep '^skills_override=' | head -1 | cut -d= -f2-)"

# 판정 자체를 못 얻으면(빈 경로) 파괴 금지 — 빈 dst로 진행하면 cp가 루트(/)에 쓰거나
# 삭제 전파가 호출 cwd를 열거하는 사고가 난다(공통 가드 원칙, backup-assets와 대칭).
# 복원할 자산이 백업에 있으면 경고+비0, 없으면 조용히 넘어간다. 로그 병합은 판정과 무관.
JUDGMENT_OK=1
if [ -z "$AGENTS_DST" ] || [ -z "$SKILLS_DST" ]; then
  JUDGMENT_OK=0
  if [ -d "$BACKUP_DIR/agents" ] || [ -d "$BACKUP_DIR/skills" ]; then
    warn "자산 위치 판정에 실패했어요 — 복원을 건너뜁니다(로컬 보존). ('npm install' 후 다시 시도해 주세요.)"
    FAIL=1
  fi
fi

BK_CANON="$(canon_path "$BACKUP_DIR")"

restore_asset() { # <자산명> <복원 대상 경로> <override 0|1>
  local name="$1" dst="$2" ovr="$3"
  local bfolder="$BACKUP_DIR/$name"
  [ -d "$bfolder" ] || return 0                       # 백업에 폴더 없음(미사용) → 조용히 스킵
  # 최후 방어선: 빈 대상 경로로는 어떤 파일 연산도 하지 않는다(위 판정 실패 가드와 겹침)
  if [ -z "$dst" ]; then eval "SUPPRESS_$name=1"; FAIL=1; return 1; fi
  local marker_present=0; [ -f "$bfolder/$MARKER" ] && marker_present=1

  # recover: 경로 판정 불신 — 마커 기반(spec FR-2 recover 항)
  if [ "$CONTEXT" = "recover" ]; then
    if [ "$marker_present" -eq 1 ]; then DEFERRED="$DEFERRED $name"; eval "SUPPRESS_$name=1"; return 0; fi
    REFLECTED_ANY=1; return 0                         # 기본 구성 백업 — 복사 생략 + 배포만
  fi

  # restore: 대상 == 백업 원본(기본 구성) → 복사 생략 + 배포만(AC-11 후반)
  local dst_canon; dst_canon="$(canon_path "$dst")"
  if [ "$dst_canon" = "$(canon_path "$bfolder")" ]; then REFLECTED_ANY=1; return 0; fi

  # 후퇴 가드(공통 가드 원칙): 판정에 NOTES_DIR가 쓰였는데 env·.env 모두 부재(AC-13)
  if [ "$ovr" != "1" ] && [ -z "$resolved" ]; then
    eval "SUPPRESS_$name=1"
    warn "$name: 노트 폴더 설정(NOTES_DIR)이 없어 복원 위치를 확정할 수 없어요 — 복원을 보류했어요(로컬 보존)."
    if [ "$marker_present" -eq 1 ]; then
      warn "$name: 노트 저장소를 연결(make notes-connect)한 뒤 'make restore'를 한 번 더 실행하면 올바른 위치로 복원돼요."
    else
      warn "$name: .env에 NOTES_DIR를 추가하거나 'make mcp-install NOTES_DIR=<폴더 목록>'을 실행한 뒤 다시 시도해 주세요."
    fi
    FAIL=1; return 1
  fi

  # 정상 복원 — 복사(.bak 보존) + 삭제 전파(백업에 폴더가 존재할 때만 여기 도달).
  # 개별 cp/mv 실패를 수집해 비0으로 보고한다(015: 조용한 부분 유실 금지) —
  # 파이프 서브셸은 카운터를 잃으므로 프로세스 치환으로 루프를 현재 셸에 둔다.
  mkdir -p "$dst"
  local errs=0 rel
  while IFS= read -r rel; do
    rel="${rel#./}"
    if [ -f "$dst/$rel" ] && ! cmp -s "$bfolder/$rel" "$dst/$rel"; then
      cp "$dst/$rel" "$dst/$rel.bak-$TS" || errs=$((errs+1))       # 로컬 수정본 보존(006 extras 패턴)
    fi
    { mkdir -p "$dst/$(dirname "$rel")" && cp "$bfolder/$rel" "$dst/$rel"; } || errs=$((errs+1))
  done < <( cd "$bfolder" && find . -type f ! -name "$MARKER" ! -name '*.bak-*' -print 2>/dev/null )
  while IFS= read -r rel; do
    rel="${rel#./}"
    [ -f "$bfolder/$rel" ] || mv "$dst/$rel" "$dst/$rel.bak-$TS" || errs=$((errs+1))  # 삭제 전파(.bak 보존 후 제거)
  done < <( cd "$dst" && find . -type f ! -name "$MARKER" ! -name '*.bak-*' -print 2>/dev/null )
  if [ "$errs" -gt 0 ]; then
    warn "$name: 일부 파일 복원 실패(${errs}건) — 복원이 불완전할 수 있어요. 권한·디스크 공간을 확인해 주세요."
    FAIL=1
  else
    ok "$name 복원 → $dst"
  fi
  REFLECTED_ANY=1
}

merge_query_logs() { # FR-4 — 백업 repo의 query-log.*.jsonl → 로컬 로그에 dedupe 병합
  local files=() f
  for f in "$BACKUP_DIR"/query-log.*.jsonl; do [ -f "$f" ] && files+=("$f"); done
  [ "${#files[@]}" -eq 0 ] && return 0
  local local_log="${QUERY_LOG:-$HOME/.localmind/query-log.jsonl}"
  mkdir -p "$(dirname "$local_log")"; [ -f "$local_log" ] || : > "$local_log"
  # 보존 기간(004 FR-6)은 **백업 유래에만** 적용 — 로컬 라인은 기간과 무관하게 유지
  # (restore가 query-log-clean을 암묵 수행하지 않는다). ISO ts는 사전순 비교 가능.
  local cutoff
  cutoff="$(date -u -v-30d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S)"
  local tmp; tmp="$(mktemp)"
  awk -v cutoff="$cutoff" -v localfile="$local_log" '
    FILENAME == localfile { if (!seen[$0]++) print; next }
    {
      if (seen[$0]++) next
      ts = ""
      if (match($0, /"ts":"[^"]*"/)) ts = substr($0, RSTART + 6, RLENGTH - 7)
      if (ts != "" && ts < cutoff) next    # 파싱 불가 라인은 유지(유실 방지 우선)
      print
    }
  ' "$local_log" "${files[@]}" > "$tmp"
  cat "$tmp" > "$local_log"; rm -f "$tmp"
  ok "쿼리 로그 병합 완료(${#files[@]}개 기기 파일, 중복 제거)"
}

if [ "$JUDGMENT_OK" -eq 1 ]; then
  restore_asset agents "$AGENTS_DST" "${AGENTS_OVR:-0}" || true
  restore_asset skills "$SKILLS_DST" "${SKILLS_OVR:-0}" || true
fi
# 복원이 반영됐으면 배포 재실행(FR-2 — 016 FR-9의 기기 복구 한정 개정). 배포는 멱등이고
# 사용자가 직접 만든 파일은 deploy 스크립트가 보호한다(016/018). 단 보류·가드된 자산은
# 배포도 하지 않는다(AC-15 — 미러/불확정 상태를 소스로 배포하는 것을 금지).
if [ "$REFLECTED_ANY" -eq 1 ]; then
  [ "$SUPPRESS_agents" -eq 0 ] && deploy_asset agents
  [ "$SUPPRESS_skills" -eq 0 ] && deploy_asset skills
fi
merge_query_logs

if [ -n "$DEFERRED" ]; then
  echo ""
  echo "  ℹ 백업에서 페르소나·스킬($DEFERRED )을 발견했지만, 아직 노트 저장소가 연결되지 않아 복원을 보류했어요."
  echo "    노트 저장소를 연결(make notes-connect)한 뒤 'make restore'를 한 번 더 실행하면 올바른 위치로 복원돼요."
fi

exit "$FAIL"
