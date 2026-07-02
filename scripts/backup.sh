#!/usr/bin/env bash
# localmind 백업 파이프라인 — make backup의 본체. (specs/015 FR-1·7)
# 단계: 메모리 export → 파생물 제외 → 개인 설정(extras) → 노트 커밋 → push → 요약.
#
# 정책(2026-07-03 결정): 단계는 서로의 인질이 아니다 — 메모리 export가 실패해도
# (가장 흔한 원인: 스택 꺼짐) 노트·extras 백업은 계속 진행하고, 실행 말미의 실패 요약과
# **비0 종료 코드**로 알린다(cron 로그에서 'grep 부분 완료'로 식별 가능).
# backup-init.sh의 export 실패 처리와 같은 정책을 공유한다.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
BACKUP_EXTRA_FILES="${BACKUP_EXTRA_FILES:-}"

FAILURES=""

# ── 1) 메모리 export — 실패해도 계속(backup-init.sh와 동일 정책·문구) ──────
# stderr는 버리지 않는다 — 실패 원인을 사용자가 볼 수 있어야 한다.
if ( cd "$PROJECT_DIR" && npm run --silent memory:export -- "$BACKUP_DIR/memory.md" >/dev/null ); then
  echo "✓ 메모리 export → $BACKUP_DIR/memory.md"
else
  echo "! 메모리 내보내기를 건너뜁니다(스택이 꺼져 있을 수 있어요 — 노트는 그대로 백업됩니다)."
  FAILURES="$FAILURES 메모리"
fi

# ── 2) 백업 repo 확인 — 노트 백업의 전제 ────────────────────────
if ! git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✗ $BACKUP_DIR 는 git repo가 아닙니다 — 'make backup-init'으로 백업 저장소를 먼저 연결하세요."
  exit 1
fi

# ── 3) 파생물 제외(.gitignore 시드) ─────────────────────────────
for p in '.brain-index.json' '.brain-index.json.tmp' '.brain-index.json.tmp-*' '.brain-index.json.lock' '.trash/'; do
  grep -qxF "$p" "$BACKUP_DIR/.gitignore" 2>/dev/null || echo "$p" >> "$BACKUP_DIR/.gitignore"
done

# ── 4) 개인 설정 파일(extras) — 실패해도 계속 ───────────────────
if BACKUP_DIR="$BACKUP_DIR" BACKUP_EXTRA_FILES="$BACKUP_EXTRA_FILES" \
     bash "$PROJECT_DIR/scripts/backup-extras.sh"; then :; else
  echo "! 개인 설정 파일 백업 실패 — 노트 백업은 계속합니다."
  FAILURES="$FAILURES 개인설정"
fi

# ── 5) 커밋 — 실패를 삼키지 않는다(self-review 결함 1: identity 미설정·훅 등으로
#     커밋이 실패해도 "백업 완료"가 나가면 성공 메시지 ≠ 실제 상태가 된다) ──────
if ! git -C "$BACKUP_DIR" add -A; then
  echo "! 노트 스테이징 실패"
  FAILURES="$FAILURES 노트커밋"
elif git -C "$BACKUP_DIR" diff --cached --quiet; then
  echo "변경 없음 — 커밋 생략"
elif git -C "$BACKUP_DIR" commit -q -m "localmind backup $(date +%Y-%m-%dT%H:%M)"; then
  echo "✓ 커밋"
else
  echo "! 노트 커밋 실패 — git 사용자 정보가 없을 수 있어요. 아래 실행 후 다시 시도하세요:"
  echo "    git config --global user.email \"you@example.com\" && git config --global user.name \"이름\""
  FAILURES="$FAILURES 노트커밋"
fi

# ── 6) push — 실패 원인·해결을 알린다(FR-7). LC_ALL=C로 감지 문자열 고정 ────
if git -C "$BACKUP_DIR" remote | grep -q .; then
  PUSH_ERR="$(LC_ALL=C git -C "$BACKUP_DIR" push -q -u origin HEAD 2>&1)"
  PUSH_RC=$?
  if [ "$PUSH_RC" -eq 0 ]; then
    echo "✓ push → 백업 저장소"
  else
    if printf '%s' "$PUSH_ERR" | grep -qiE 'non-fast-forward|fetch first|rejected'; then
      echo "! push 거부 — 다른 기기의 백업이 먼저 올라가 있어요(non-fast-forward)."
      echo "  해결: git -C \"$BACKUP_DIR\" pull 실행 후 'make backup'을 다시 실행하세요."
    else
      echo "! push 실패:"
      printf '%s\n' "$PUSH_ERR" | sed 's/^/    /'
    fi
    FAILURES="$FAILURES push"
  fi
else
  echo "ℹ remote 없음 — 로컬 커밋만(push 생략)"
fi

# ── 7) 요약 — 부분 완료를 부분 완료라고 말하고, 실패 종류별 처방을 안내한다 ──
if [ -z "$FAILURES" ]; then
  echo "✓ 백업 완료"
else
  echo ""
  echo "⚠ 백업 부분 완료 — 안 된 것:$FAILURES  (성공한 단계는 위 로그대로 반영됐어요)"
  case "$FAILURES" in *메모리*)   echo "  · 메모리: 스택을 켠 뒤('make up') 'make backup' 재실행";; esac
  case "$FAILURES" in *노트커밋*) echo "  · 노트 커밋: 위의 git 사용자 정보 안내를 따른 뒤 재실행";; esac
  case "$FAILURES" in *push*)     echo "  · push: 위의 push 안내를 따른 뒤 재실행";; esac
  case "$FAILURES" in *개인설정*) echo "  · 개인 설정: BACKUP_EXTRA_FILES 경로를 확인한 뒤 재실행";; esac
  exit 1
fi
