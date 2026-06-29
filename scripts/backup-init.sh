#!/usr/bin/env bash
# localmind 백업 1회 세팅 — 비개발자용 단계별 가이드.
# 호출: make backup-init   (환경변수 BACKUP_DIR, BACKUP_REPO 로 조정)
# 동작: gh 설치 확인 → GitHub 로그인 → 비공개 저장소 생성·연결 → 첫 백업 업로드.
# 터미널에서 실행하면 한 단계씩 묻고, 비대화(스크립트/CI) 환경에선 기본값으로 자동 진행한다.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
BACKUP_REPO="${BACKUP_REPO:-localmind-backup}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# 예/아니오 확인. 비대화 환경이면 자동으로 "예".
confirm() {
  local prompt="$1" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt [Y/n] " ans || ans=""
    [[ "$ans" =~ ^[Nn] ]] && return 1 || return 0
  else
    say "  $prompt → 자동 진행(예)"; return 0
  fi
}
# 저장소 이름 입력. 비대화 환경이면 기본값.
ask_name() {
  local def="$1" ans
  if [ -t 0 ]; then
    read -r -p "  저장소 이름 [기본: $def] (Enter=기본값, 다른 이름 입력 가능): " ans || ans=""
    printf '%s' "${ans:-$def}"
  else
    printf '%s' "$def"
  fi
}

say ""
say "$(b 'localmind 백업 설정')을 시작합니다 — 내 메모리와 노트를 GitHub $(b 비공개) 저장소에 안전하게 보관해요."
say "총 4단계입니다. 한 단계씩 안내하고, 중간에 언제든 Ctrl+C 로 멈출 수 있어요."
say ""

# ── 1/4 : gh 설치 ───────────────────────────────────────────────
say "$(b '[1/4] GitHub 연결 도구(gh) 확인')"
if ! command -v gh >/dev/null 2>&1; then
  warn "저장소를 자동으로 만들려면 GitHub 도구 'gh'가 필요한데, 아직 없어요."
  if command -v brew >/dev/null 2>&1; then
    if confirm "지금 설치할까요? (brew install gh)"; then
      brew install gh
    else
      say "  설치 후 다시 '$(b 'make backup-init')' 을 실행해 주세요. 안내 → https://cli.github.com"
      exit 1
    fi
  else
    err "자동 설치 도구(Homebrew)가 없어요. https://cli.github.com 에서 gh 설치 후 다시 실행해 주세요."
    exit 1
  fi
fi
ok "gh 준비됨 ($(gh --version | head -1))"

# ── 2/4 : 로그인 ────────────────────────────────────────────────
say "$(b '[2/4] GitHub 로그인 확인')"
if ! gh auth status >/dev/null 2>&1; then
  warn "아직 GitHub에 로그인돼 있지 않아요."
  say "  곧 브라우저가 열립니다. 화면 안내(일회용 코드 입력 등)를 따라 한 번만 로그인하면 끝이에요."
  if ! [ -t 0 ]; then
    err "로그인은 직접 입력이 필요해요. 터미널에서 '$(b 'gh auth login')' 실행 후 다시 시도해 주세요."
    exit 1
  fi
  confirm "지금 로그인할까요?" || { say "  '$(b 'gh auth login')' 후 다시 실행해 주세요."; exit 1; }
  gh auth login
fi
ACCOUNT="$(gh api user -q .login 2>/dev/null || echo '내 계정')"
ok "로그인됨: $ACCOUNT"

# ── 3/4 : 비공개 저장소 ─────────────────────────────────────────
say "$(b '[3/4] 비공개 백업 저장소 준비')"
mkdir -p "$BACKUP_DIR"
if ! git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$BACKUP_DIR" init -q
  ok "백업 폴더를 git으로 초기화: $BACKUP_DIR"
fi
touch "$BACKUP_DIR/.gitignore"
for p in .brain-index.json .DS_Store; do
  grep -qxF "$p" "$BACKUP_DIR/.gitignore" || echo "$p" >> "$BACKUP_DIR/.gitignore"
done

if git -C "$BACKUP_DIR" remote get-url origin >/dev/null 2>&1; then
  ok "이미 연결된 저장소: $(git -C "$BACKUP_DIR" remote get-url origin)"
else
  say "  '$(b "$BACKUP_REPO")' 이름으로 $(b 비공개) 저장소를 만들 거예요(남들은 볼 수 없어요)."
  BACKUP_REPO="$(ask_name "$BACKUP_REPO")"
  say "  → '$BACKUP_REPO' 저장소를 만들고 연결합니다..."
  if gh repo create "$BACKUP_REPO" --private --source "$BACKUP_DIR" --remote origin; then
    ok "비공개 저장소 생성·연결 완료"
  else
    err "저장소 생성 실패 — 같은 이름이 이미 있을 수 있어요."
    say "  다른 이름으로 다시: $(b 'make backup-init BACKUP_REPO=원하는이름')"
    exit 1
  fi
fi

# ── 4/4 : 첫 백업 ───────────────────────────────────────────────
say "$(b '[4/4] 첫 백업 올리기')"
if ( cd "$PROJECT_DIR" && npm run --silent memory:export -- "$BACKUP_DIR/memory.md" ); then
  ok "메모리를 memory.md 로 내보냄"
else
  warn "메모리 내보내기를 건너뜁니다(스택이 꺼져 있을 수 있어요 — 노트는 그대로 백업됩니다)."
fi
# 첫 커밋 전 git identity 확인 — 신규 머신서 미설정이면 commit 이 실패한다.
# identity는 git config(local→global 병합) 또는 환경변수(GIT_AUTHOR_*/GIT_COMMITTER_*)로 올 수 있어
# 둘 다 인정한다(환경변수만 준 사용자를 false positive로 막지 않도록).
have_name=false; have_email=false
git -C "$BACKUP_DIR" config user.name  >/dev/null 2>&1 && have_name=true
git -C "$BACKUP_DIR" config user.email >/dev/null 2>&1 && have_email=true
[ -n "${GIT_AUTHOR_NAME:-}${GIT_COMMITTER_NAME:-}" ]   && have_name=true
[ -n "${GIT_AUTHOR_EMAIL:-}${GIT_COMMITTER_EMAIL:-}" ] && have_email=true
if [ "$have_name" = false ] || [ "$have_email" = false ]; then
  err "Git 사용자 정보가 없어요 — 'git config --global user.name \"이름\"' 와 'git config --global user.email \"메일주소\"' 설정 후 다시 시도해 주세요."
  exit 1
fi
git -C "$BACKUP_DIR" add -A
if git -C "$BACKUP_DIR" diff --cached --quiet; then
  ok "올릴 새 내용이 없어요(이미 최신 상태)."
else
  git -C "$BACKUP_DIR" commit -q -m "localmind backup init"
  ok "백업 커밋 생성"
fi
if git -C "$BACKUP_DIR" push -u origin HEAD >/dev/null 2>&1; then
  ok "GitHub 비공개 저장소로 업로드 완료!"
else
  err "업로드 실패 — '$(b 'gh auth status')' 확인 후 '$(b 'make backup')' 다시 시도해 주세요."
  exit 1
fi

say ""
say "$(b '🎉 백업 설정이 끝났어요!') 이제부터는 명령 하나면 됩니다."
say "  • 백업하기      : $(b 'make backup')        (바뀐 것만 자동 저장·업로드)"
say "  • 매일 자동백업  : $(b 'make backup-cron')   (출력된 한 줄을 따라 하면 끝)"
say "  • 새 컴퓨터 복구 : $(b 'make recover RESTORE_REPO=<저장소 주소>')"
say "  • 저장소 열기   : $(b "gh repo view $BACKUP_REPO --web")"
say ""
