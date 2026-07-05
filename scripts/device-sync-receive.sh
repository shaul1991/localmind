#!/usr/bin/env bash
# specs/031 FR-5·FR-7 — device-sync 수신 워커(원격 기기에서 실행).
# 주 기기 오케스트레이터(device-sync.sh)가 ssh로 호출하지만, 경로를 전부 이 기기의
# .env로 스스로 해석하므로 ssh 없이 단독 실행·테스트할 수 있다(주 기기는 원격 노트
# 경로를 몰라도 됨 — "주 기기 오케스트레이션 + 원격 자기 기술").
#
# 순서: ⓐ node 확인 → ⓑ 노트 수신(pull --ff-only, 저장소별 독립 계속 — 015) →
#       ⓒ 빌드(필요 시) → ⓓ 레지스트리 검증(seed — 실패 시 배포 안 함) →
#       ⓔ 자산 복원+배포(restore-assets — 019 경로: 미러→정본 복사·삭제 전파·배포) →
#       ⓕ 배포 마커 검증(읽기 전용).
# 파괴 금지: 모든 pull은 --ff-only, reset/merge/force 없음. 종료: 0 전부 성공, 1 부분/실패.
set -uo pipefail

PROJECT_DIR="${LOCALMIND_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
FAILURES=""

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

# ── ⓐ node 실행 확인(FR-7 — command -v가 아니라 "실행 가능" 기준: 부재 shim 결정화 정합) ──
if ! node --version >/dev/null 2>&1; then
  echo "! node를 실행할 수 없어요 — 빌드·검증·배포를 진행하지 않습니다(파괴 없음)."
  echo "  해결: 주 기기 .env의 SYNC_ENV_PREP에 이 기기의 node 경로를 지정하세요."
  echo "        예) SYNC_ENV_PREP='export PATH=\"\$HOME/.nvm/versions/node/<버전>/bin:\$PATH'\"'"
  exit 1
fi

# ── ⓑ 노트 수신 — BACKUP_DIR + 노트 폴더 중 git 워크트리(저장소별 독립 — 015) ──
pull_ff() { # <라벨> <경로>
  local label="$1" dir="$2" out rc
  [ -d "$dir/.git" ] || return 0
  [ -n "$(git -C "$dir" remote 2>/dev/null)" ] || return 0
  out="$(LC_ALL=C git -C "$dir" pull --ff-only -q 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "$label 수신 ($dir)"
  else
    warn "$label 수신 불가 ($dir) — fast-forward가 안 돼요(이 기기에 별도 커밋이 있을 수 있어요)."
    warn "  이 저장소는 건드리지 않고 넘어갑니다. 해결: 이 기기에서 커밋을 정리한 뒤 재시도."
    FAILURES="$FAILURES 노트($label)"
  fi
}
pull_ff "백업 저장소" "$BACKUP_DIR"
resolved="$(resolve_notes_dir "$ENV_FILE")"
if [ -n "$resolved" ]; then
  bk_canon="$(canon_path "$BACKUP_DIR")"
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    [ "$p" = "$bk_canon" ] && continue
    pull_ff "노트 폴더" "$p"
  done <<EOF
$(notes_dir_paths "$resolved")
EOF
fi

# ── ⓒ 빌드 — dist 부재 또는 dist가 src보다 오래됨(워커 자족 판정 — mtime, 멱등) ──
need_build=0
if [ ! -f "$PROJECT_DIR/dist/mcp.js" ]; then
  need_build=1
elif [ -n "$(find "$PROJECT_DIR/src" -name '*.ts' -newer "$PROJECT_DIR/dist/mcp.js" 2>/dev/null | head -1)" ]; then
  need_build=1
fi
if [ "$need_build" -eq 1 ]; then
  if ( cd "$PROJECT_DIR" && npm run --silent build ); then
    ok "빌드"
  else
    echo "! 빌드 실패 — 검증·배포를 진행하지 않아요(깨진 상태 배포 방지)."
    [ -n "$FAILURES" ] && echo "⚠ 수신 부분 완료 — 안 된 것:$FAILURES"
    exit 1
  fi
fi

# ── ⓓ 레지스트리 검증 게이트 — 실패하면 배포하지 않는다(FR-5) ──
TEST_CMD="${SYNC_TEST_CMD:-node --import tsx/esm --test src/agents/seed.test.ts}"
if ( cd "$PROJECT_DIR" && bash -c "$TEST_CMD" >/dev/null 2>&1 ); then
  ok "레지스트리 검증(seed)"
else
  echo "! 레지스트리 검증 실패 — 깨진 페르소나 구성을 배포하지 않아요."
  echo "  이 기기에서 직접 확인: cd $PROJECT_DIR && $TEST_CMD"
  [ -n "$FAILURES" ] && echo "⚠ 수신 부분 완료 — 안 된 것:$FAILURES"
  exit 1
fi

# ── ⓔ 자산 복원 + 배포 — 019 restore-assets 경로(bare deploy 금지 — 미러 구성 전파) ──
if ( cd "$PROJECT_DIR" && bash scripts/restore-assets.sh ); then
  ok "자산 복원·배포(restore-assets)"
else
  warn "자산 복원/배포 일부 실패 — 'make restore'로 다시 시도할 수 있어요."
  FAILURES="$FAILURES 자산배포"
fi

# ── ⓕ 배포 마커 검증(읽기 전용 — managed-by 마커) ──
CLAUDE_AGENTS_DIR="${LOCALMIND_CLAUDE_AGENTS_DIR:-$HOME/.claude/agents}"
if grep -rl "managed-by: localmind" "$CLAUDE_AGENTS_DIR" >/dev/null 2>&1; then
  ok "배포 산출물 확인(managed-by 마커)"
else
  warn "배포 산출물에서 localmind 마커를 찾지 못했어요 ($CLAUDE_AGENTS_DIR)"
  FAILURES="$FAILURES 마커"
fi

if [ -z "$FAILURES" ]; then
  echo "✓ 수신 완료"
else
  echo "⚠ 수신 부분 완료 — 안 된 것:$FAILURES  (성공한 단계는 위 로그대로 반영됐어요)"
  exit 1
fi
