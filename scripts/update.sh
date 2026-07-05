#!/usr/bin/env bash
# specs/033 — 이 기기 최신화 한 방(make update).
# 정본(코드 repo·NOTES_DIR 노트 repo)을 origin에서 ff-only로 당기고,
# 파생물(dist 빌드·노트 인덱스·페르소나/스킬 배포)을 정본에서 재생성한다.
# 이웃: 원격 기기는 make device-sync(031), 새 기기는 make recover, 백업 복원은 make restore.
# memory-import는 하지 않는다 — 이 기기의 메모리 DB가 정본(백업 memory.md는 파생 export)이라
# update가 import하면 로컬에서 삭제한 기억이 부활한다(033 Non-goal).
# set -e 는 쓰지 않는다 — 한 단계가 실패해도 끝까지 진행하고 요약으로 알린다(FR-6).
set -uo pipefail

# 전체를 main으로 감싼다 — git pull이 이 파일 자신을 갱신해도, 셸이 파일 전체를 파싱한 뒤
# 실행하므로 자기갱신 중 오동작(지연 읽기로 바뀐 오프셋 실행)이 없다.
main() {
  DIR="$(cd "$(dirname "$0")/.." && pwd)"
  . "$DIR/scripts/lib/read-env.sh"
  . "$DIR/scripts/lib/notes-dir.sh"

  DRY="${DRY_RUN:-}"
  fails=""

  say()  { printf '%s\n' "$*"; }
  ok()   { [ -n "$DRY" ] || printf '  \033[32m✓\033[0m %s\n' "$*"; }
  warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
  info() { printf '  ℹ %s\n' "$*"; }
  run()  { # 뮤테이션 명령 — DRY_RUN=1이면 실행하지 않고 계획만 출력
    if [ -n "$DRY" ]; then printf '  (dry) %s\n' "$*"; return 0; fi
    "$@"
  }

  # ── ① 정본: 코드 repo (pull → 변경 시 빌드) ─────────────────────────
  say "→ ① 코드 최신화: $DIR"
  if git -C "$DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
     && git -C "$DIR" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    old_head="$(git -C "$DIR" rev-parse HEAD)"
    if run git -C "$DIR" pull --ff-only; then
      if [ -n "$DRY" ]; then
        printf '  (dry) HEAD 변경 시: npm run build\n'
      elif [ "$(git -C "$DIR" rev-parse HEAD)" != "$old_head" ]; then
        ok "코드 갱신됨($(git -C "$DIR" rev-parse --short HEAD)) — 빌드해요"
        if run npm run --prefix "$DIR" build; then
          ok "빌드 완료 — 실행 중인 스택에 반영하려면 'make up'"
        else
          warn "빌드 실패 — 코드는 최신이지만 dist가 이전 버전이에요('make build'로 재시도)"
          fails="$fails build"
        fi
      else
        ok "코드 이미 최신"
      fi
    else
      warn "코드 pull 실패 — 로컬 변경/분기가 있어요(자동으로 덮어쓰지 않아요). 나머지 단계는 계속 진행해요"
      fails="$fails code-pull"
    fi
  else
    info "git 원격(upstream)이 없어 코드 pull 생략 — 이 폴더 상태 그대로 사용해요"
  fi

  # ── ② 정본: 노트 repo (NOTES_DIR — 환경변수 → .env → 기본, specs/019 규칙) ──
  notes_value="$(resolve_notes_dir "$DIR/.env")"
  notes_value="${notes_value:-$HOME/.localmind}"
  say "→ ② 노트 최신화: $notes_value"
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    # show-toplevel = "$p" 요구 — 부모 git repo 안의 평범한 폴더에서 부모를 pull하는 사고 방지
    # (is-inside-work-tree만 보면 예: $HOME이 dotfiles repo일 때 노트 폴더가 오탐된다).
    if [ "$(git -C "$p" rev-parse --show-toplevel 2>/dev/null)" = "$p" ] \
       && git -C "$p" remote 2>/dev/null | grep -q .; then
      if run git -C "$p" pull --ff-only; then
        ok "pull: $p"
      else
        warn "pull 실패: $p — 로컬 변경/분기가 있어요(덮어쓰지 않아요)"
        fails="$fails notes-pull"
      fi
    else
      info "git repo 아님 — 로컬 상태 그대로 사용: $p"
    fi
  done < <(notes_dir_paths "$notes_value")

  # ── ③ 파생물 재생성: 인덱스 → 페르소나 → 스킬 (모두 멱등) ────────────
  say "→ ③ 파생물 재생성(인덱스·페르소나·스킬)"
  if run bash "$DIR/scripts/reindex.sh"; then
    ok "재인덱싱"
  else
    warn "재인덱싱 실패 — 임베딩(:4000)이 꺼져 있나요? 'make up' 후 'make reindex'로 다시 시도하세요"
    fails="$fails reindex"
  fi
  if run npm run --silent --prefix "$DIR" agents:deploy; then
    ok "페르소나 배포"
  else
    warn "페르소나 배포 실패 — 'make agents-deploy'로 다시 시도하세요"
    fails="$fails agents-deploy"
  fi
  if run npm run --silent --prefix "$DIR" skills:deploy; then
    ok "스킬 배포"
  else
    warn "스킬 배포 실패 — 'make skills-deploy'로 다시 시도하세요"
    fails="$fails skills-deploy"
  fi

  # ── 요약 ──────────────────────────────────────────────────────────────
  if [ -n "$DRY" ]; then
    say "✓ 미리보기 완료 — 실제 실행: make update"
  elif [ -z "$fails" ]; then
    say "✓ 최신화 완료 — 정본(코드·노트)과 파생물(인덱스·자산)이 최신이에요."
  else
    say "! 일부 단계 실패:$fails — 위 안내를 확인하세요."
    exit 1
  fi
}
main "$@"
