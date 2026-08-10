#!/usr/bin/env bash
# localmind 복구 — 새 컴퓨터에서 내 두뇌(메모리+노트)를 통째로 되살리는 비개발자용 단계별 가이드.
# 호출: make recover   (환경변수 RESTORE_REPO, BACKUP_DIR, BACKUP_REPO 로 조정)
# 흐름: 사전점검 → 백업 내려받기 → 설치·빌드 → 임베딩 확인 → 메모리 복원 → 노트 재인덱싱.
# 터미널에선 한 단계씩 묻고, 비대화 환경에선 기본값으로 자동 진행한다.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
BACKUP_REPO="${BACKUP_REPO:-localmind-backup}"
RESTORE_REPO="${RESTORE_REPO:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
# repo URL을 host/owner/repo 로 정규화한다. host는 identity의 일부이며, https↔ssh
# transport/user 표현만 제거한다. 호출 전 validate_restore_repo로 credential을 거부해야 한다.
repo_id() {
  printf '%s' "$1" | sed -E \
    -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/@]+@)?##' \
    -e 's#^[^/@]+@([^:]+):#\1/#' \
    -e 's#/+$##' -e 's#\.git$##'
}

validate_restore_repo() {
  local candidate="$1"
  if has_control_chars "$candidate"; then
    err "백업 저장소 주소에 제어문자가 있어 안전하게 처리할 수 없어요. 주소를 한 줄의 정상 URL 또는 경로로 다시 입력해 주세요."
    return 2
  fi
  case "$candidate" in
    -*)
      err "백업 저장소 주소가 옵션처럼 '-'로 시작해 안전하게 clone할 수 없어요. 로컬 경로라면 './-이름' 또는 절대경로로 명시해 주세요."
      return 2
      ;;
    *\?*|*\#*)
      err "백업 URL의 query/fragment는 clone 인자에 노출될 수 있어 사용할 수 없어요. 자격증명은 Git credential helper를 사용해 주세요."
      return 2
      ;;
    [Hh][Tt][Tt][Pp]://*|[Hh][Tt][Tt][Pp][Ss]://*|[Ss][Ss][Hh]://*)
      if ! printf '%s' "$candidate" | node -e '
        const fs = require("fs");
        const raw = fs.readFileSync(0, "utf8");
        try {
          const u = new URL(raw);
          const atCount = (raw.match(/@/g) || []).length;
          const web = u.protocol === "http:" || u.protocol === "https:";
          const ssh = u.protocol === "ssh:";
          if ((!web && !ssh) || !u.hostname || !u.pathname || u.pathname === "/" || u.search || u.hash ||
              (web && (u.username || u.password || atCount > 0)) ||
              (ssh && (u.password || atCount > 1))) process.exit(1);
        } catch { process.exit(1); }
      ' >/dev/null 2>&1; then
        err "백업 저장소 URL이 안전한 HTTPS 또는 SSH 형식이 아니에요. 자격증명은 credential helper 또는 SSH agent를 사용해 주세요."
        return 2
      fi
      ;;
    *::*|*://*)
      err "지원하지 않는 백업 저장소 전송 형식이에요. 로컬 경로, HTTPS 또는 SSH 주소를 사용해 주세요."
      return 2
      ;;
    *@*)
      case "$candidate" in *@*@*)
        err "SSH 저장소 주소의 authority 구분자가 여러 개라 안전하게 처리할 수 없어요."
        return 2
      esac
      if [[ ! "$candidate" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*:.+ ]]; then
        err "SSH 저장소 주소 형식이 올바르지 않아요. user@host:path 형식을 사용해 주세요."
        return 2
      fi
      ;;
    *:*)
      if [[ ! "$candidate" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*:.+ ]]; then
        err "백업 저장소 주소 형식이 안전하지 않아요. 로컬 경로, HTTPS 또는 SSH 주소를 사용해 주세요."
        return 2
      fi
      ;;
  esac
  return 0
}

confirm() {  # 예/아니오. 비대화면 자동 "예".
  local prompt="$1" ans
  if [ -t 0 ]; then
    read -r -p "  $prompt [Y/n] " ans || ans=""
    [[ "$ans" =~ ^[Nn] ]] && return 1 || return 0
  else
    say "  $prompt → 자동 진행(예)"; return 0
  fi
}
ask_value() {  # ask_value "안내문" "기본값" → 입력값(또는 기본값). 비대화면 기본값.
  local prompt="$1" def="$2" ans
  if [ -t 0 ]; then
    # URL은 token/userinfo를 포함할 수 있어 terminal echo를 production 쪽에서 끈다.
    read -r -s -p "  $prompt${def:+ [기본: $def]}: " ans || ans=""
    printf '\n' >&2
    printf '%s' "${ans:-$def}"
  else
    printf '%s' "$def"
  fi
}

say ""
say "$(b 'localmind 복구')를 시작합니다 — 백업해 둔 메모리와 노트를 이 컴퓨터로 되살려요."
say "총 6단계입니다. 한 단계씩 안내하고, 중간에 언제든 Ctrl+C 로 멈출 수 있어요."
say "  (처음 기동은 AI 모델 내려받기로 몇 분 걸릴 수 있어요 — 정상입니다.)"
say ""

# 전환 사전 안내(specs/019 FR-7): 백업 모델 밖의 데이터는 옮길 수 없다 — 미백업분의
# 유실을 사용자가 인지하고 진행하게 한다(비대화 환경은 안내 후 자동 진행).
say "$(b '먼저 확인해 주세요') — 이전 컴퓨터에서 $(b 'make backup')을 마지막으로 실행한 게 언제인가요?"
say "  그 백업 $(b '이후')에 만든 기억(메모리)·페르소나·검색 기록은 이 복구로 넘어오지 않아요."
say "  이전 컴퓨터를 아직 쓸 수 있다면, 거기서 'make backup'을 한 번 실행한 뒤 진행하는 걸 권해요."
confirm "이대로 복구를 진행할까요?" || { say "  준비되면 다시 '$(b 'make recover')'를 실행해 주세요."; exit 0; }
say ""

# ── 1/6 : 사전 점검 ─────────────────────────────────────────────
say "$(b '[1/6] 준비물 점검')"
for required in git node npm; do
  command -v "$required" >/dev/null 2>&1 || {
    err "$required 명령이 없어요. 설치한 뒤 다시 '$(b 'make recover')'를 실행해 주세요."
    exit 1
  }
done
ok "필수 프로그램 준비됨(git · Node.js · npm)"
# 테스트는 LOCALMIND_ENV_FILE로 .env를 격리한다(다른 스크립트와 동일 관례, specs/019)
if [ ! -f "$ENV_FILE" ]; then
  warn ".env(설정 파일)가 없어 예시에서 새로 만들어요."
  mkdir -p "$(dirname "$ENV_FILE")"
  cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
  ok ".env 생성됨 — 기본값으로도 복구는 진행돼요. (claude 연동 등은 나중에 'make secrets'로 점검)"
else
  ok ".env 있음"
fi
chmod 600 "$ENV_FILE" # OAuth 토큰·키가 담기므로 소유자 전용(specs/015 FR-9)

# ── 2/6 : 백업 내려받기 ─────────────────────────────────────────
say "$(b '[2/6] 백업 저장소 가져오기')"
if [ -n "$RESTORE_REPO" ] && ! validate_restore_repo "$RESTORE_REPO"; then
  exit 2
fi
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say "  이 컴퓨터에 이미 백업 폴더가 있어요: $BACKUP_DIR"
  existing="$(git -C "$BACKUP_DIR" remote get-url origin 2>/dev/null || true)"
  if [ -n "$existing" ] && ! validate_restore_repo "$existing"; then
    err "기존 백업 폴더의 origin에 inline credential 또는 안전하지 않은 URL 요소가 있어 중단합니다."
    exit 2
  fi
  # RESTORE_REPO 를 명시했는데 origin이 없거나 다른 저장소면 — provenance를 증명할 수
  # 없는 로컬 snapshot이나 엉뚱한 백업을 silent하게 되살리지 않는다.
  if [ -n "$RESTORE_REPO" ]; then
    if [ -z "$existing" ]; then
      err "$BACKUP_DIR 는 git 저장소지만 비교할 origin이 없어 요청한 백업 저장소의 snapshot인지 확인할 수 없어요."
      say "  origin을 올바르게 연결하거나 다른 빈 BACKUP_DIR로 다시 복구해 주세요."
      exit 1
    fi
    if [ "$(repo_id "$existing")" != "$(repo_id "$RESTORE_REPO")" ]; then
      # raw URL은 https://user:token@host 형태로 자격증명을 담을 수 있어 출력 금지 — 검증된 repo_id만 노출.
      err "$BACKUP_DIR 는 이미 다른 백업 저장소($(repo_id "$existing"))에 연결돼 있어요."
      say "  요청한 저장소($(repo_id "$RESTORE_REPO"))로 복구하려면 다른 폴더를 쓰거나(예: $(b 'make recover BACKUP_DIR=~/.localmind-new RESTORE_REPO=...')) 기존 폴더를 비운 뒤 다시 시도해 주세요."
      exit 1
    fi
  fi
  if [ -n "$existing" ]; then
    current_branch="$(git -C "$BACKUP_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    if [ -z "$current_branch" ]; then
      err "기존 백업 저장소가 detached HEAD라 검증된 origin branch를 결정할 수 없어요. 정상 branch를 checkout한 뒤 다시 실행해 주세요."
      exit 1
    fi
    verified_ref="refs/heads/$current_branch"
    # branch.<name>.remote/merge는 로컬 config에서 다른 remote로 바뀔 수 있다. provenance를
    # 확인한 literal origin과 현재 branch ref를 명시해, 검증 대상과 실제 소비 대상을 일치시킨다.
    if git -C "$BACKUP_DIR" pull --ff-only origin "$verified_ref" >/dev/null 2>&1; then
      fetched_sha="$(git -C "$BACKUP_DIR" rev-parse --verify 'FETCH_HEAD^{commit}' 2>/dev/null || true)"
      current_sha="$(git -C "$BACKUP_DIR" rev-parse --verify 'HEAD^{commit}' 2>/dev/null || true)"
      if [ -z "$fetched_sha" ] || [ "$current_sha" != "$fetched_sha" ]; then
        err "검증된 origin snapshot과 기존 백업 폴더의 HEAD가 정확히 일치하지 않아 복구를 중단합니다."
        exit 1
      fi
      ok "최신 백업으로 업데이트(pull)"
    else
      err "백업 저장소 pull에 실패해 최신 snapshot을 확인할 수 없어요 — 네트워크·origin·branch 상태를 확인한 뒤 다시 실행해 주세요."
      exit 1
    fi
  elif git -C "$BACKUP_DIR" remote | grep -q .; then
    err "기존 백업 저장소에 검증할 origin은 없고 다른 remote만 있어 최신 snapshot의 provenance를 확인할 수 없어요."
    exit 1
  else
    ok "원격 없음 — 명시적인 로컬 노트 snapshot으로 진행"
  fi
else
  # 저장소 주소 결정: RESTORE_REPO > gh 자동탐색(BACKUP_REPO) > 직접 입력
  if [ -z "$RESTORE_REPO" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    found="$(gh repo view "$BACKUP_REPO" --json url -q .url 2>/dev/null || true)"
    [ -n "$found" ] && { RESTORE_REPO="$found"; say "  내 GitHub에서 백업 저장소를 찾았어요: $(b "$(mask_url "$RESTORE_REPO")")"; }
  fi
  [ -z "$RESTORE_REPO" ] && RESTORE_REPO="$(ask_value "백업 저장소 주소(URL)를 붙여넣어 주세요" "")"
  if [ -z "$RESTORE_REPO" ]; then
    err "백업 저장소 주소가 필요해요. 예: $(b 'make recover RESTORE_REPO=https://github.com/내이름/localmind-backup')"
    exit 1
  fi
  if ! validate_restore_repo "$RESTORE_REPO"; then
    exit 2
  fi
  if [ -e "$BACKUP_DIR" ] && [ -n "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    err "$BACKUP_DIR 폴더에 이미 다른 파일이 있어 내려받을 수 없어요. 폴더를 비우거나 옮긴 뒤 다시 시도해 주세요."
    exit 1
  fi
  say "  → 백업을 내려받는 중: $BACKUP_DIR"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && [[ "$RESTORE_REPO" != http* ]]; then
    gh repo clone "$RESTORE_REPO" "$BACKUP_DIR" >/dev/null 2>&1 || git clone "$RESTORE_REPO" "$BACKUP_DIR"
  else
    git clone "$RESTORE_REPO" "$BACKUP_DIR"
  fi
  ok "백업 내려받기 완료"
fi

# ── 3/6 : 설치·빌드 ─────────────────────────────────────────────
say "$(b '[3/6] 프로그램 설치·준비')"
( cd "$PROJECT_DIR" && npm install --no-fund --no-audit >/dev/null 2>&1 ) && ok "의존성 설치 완료" || { err "설치 실패 — 인터넷 연결을 확인하고 다시 시도해 주세요."; exit 1; }
( cd "$PROJECT_DIR" && npm run --silent build >/dev/null 2>&1 ) && ok "빌드 완료" || { err "빌드 실패 — 'cd $PROJECT_DIR && npm run build' 로 메시지를 확인해 주세요."; exit 1; }

# ── 4/6 : 임베딩 엔진 확인 ──────────────────────────────────────
say "$(b '[4/6] 임베딩 엔진 확인 (노트 검색용)')"
RECOVER_EMB_URL="${EMBEDDINGS_URL:-$(read_env_val EMBEDDINGS_URL "$ENV_FILE")}"; RECOVER_EMB_URL="${RECOVER_EMB_URL:-http://localhost:11434/v1}"
RECOVER_EMB_MODEL="${EMBEDDINGS_MODEL:-$(read_env_val EMBEDDINGS_MODEL "$ENV_FILE")}"; RECOVER_EMB_MODEL="${RECOVER_EMB_MODEL:-text-embedding-3-small}"
RECOVER_EMB_KEY="${EMBEDDINGS_KEY:-$(read_env_val EMBEDDINGS_KEY "$ENV_FILE")}"
RECOVER_NOTES_DIR="${NOTES_DIR:-$(read_env_val NOTES_DIR "$ENV_FILE")}"; RECOVER_NOTES_DIR="${RECOVER_NOTES_DIR:-$BACKUP_DIR}"
RECOVER_BRAIN_INDEX="${BRAIN_INDEX:-$(read_env_val BRAIN_INDEX "$ENV_FILE")}"
if ! public_http_url "$RECOVER_EMB_URL"; then
  err "임베딩 URL이 안전한 공개 HTTP(S) endpoint 형식이 아니어서 network 요청 전에 복구를 중단합니다."
  exit 2
fi
SAFE_EMB_URL="$(mask_url "$RECOVER_EMB_URL")"
# URL·키를 argv에 넣지 않는다. health probe는 URL을 환경변수로만 전달하고 로그에는
# userinfo를 마스킹한다. 실패는 아래 재색인이 최종 gate로 판정한다.
if EMBEDDINGS_URL="$RECOVER_EMB_URL" node -e '
const base = (process.env.EMBEDDINGS_URL || "").replace(/\/$/, "");
const urls = [base + "/models", base.replace(/\/v1$/, "") + "/api/tags"];
Promise.any(urls.map(async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (!r.ok) throw new Error("not ready"); }))
  .then(() => process.exit(0), () => process.exit(1));
' >/dev/null 2>&1; then
  ok "임베딩 엔진 응답 ($SAFE_EMB_URL)"
else
  warn "임베딩 엔진 무응답 ($SAFE_EMB_URL) — 설정과 엔진 상태를 확인한 뒤 재색인을 시도합니다."
fi

# ── 5/6 : (great-reduction) 메모리 복원 단계 소멸 — 노트가 기억의 정본 ─────
say "$(b '[5/6] 메모리 되살리기')"
ok "별도 메모리 서비스가 없어요(2026-07 개편) — 기억은 전부 노트로 복원됩니다."

# ── 6/6 : 노트 재인덱싱 ─────────────────────────────────────────
say "$(b '[6/6] 노트 검색 색인 만들기')"
# 개인 설정 파일(extras) 복원 — "통째 복구" 약속에 포함(specs/015 FR-2, make restore와 동일 경로).
# BACKUP_EXTRA_FILES 미사용 백업이면 restore-extras가 조용히 통과한다.
say "  → 개인 설정 파일 복원 확인"
EXTRAS_FAIL=0
if BACKUP_DIR="$BACKUP_DIR" bash "$PROJECT_DIR/scripts/restore-extras.sh"; then :; else
  warn "개인 설정 파일 복원을 건너뛰었어요 — 나중에 'make restore'로 다시 시도할 수 있어요."
  EXTRAS_FAIL=1
fi

REINDEX_FAIL=0
if (
  export NOTES_DIR="$RECOVER_NOTES_DIR"
  export EMBEDDINGS_URL="$RECOVER_EMB_URL"
  export EMBEDDINGS_MODEL="$RECOVER_EMB_MODEL"
  export EMBEDDINGS_KEY="$RECOVER_EMB_KEY"
  if [ -n "$RECOVER_BRAIN_INDEX" ]; then export BRAIN_INDEX="$RECOVER_BRAIN_INDEX"; else unset BRAIN_INDEX; fi
  unset LITELLM_MASTER_KEY
  cd "$PROJECT_DIR"
  # tsx CLI는 일부 제한 환경에서 불필요한 IPC socket을 열 수 있다. Node loader로 같은
  # production reindex 진입점을 직접 실행해 추가 daemon/socket 의존 없이 복구한다.
  node --import tsx/esm scripts/reindex.ts
); then
  ok "노트 색인 완료 — 첫 검색부터 빨라요."
else
  warn "노트 색인은 만들지 못했지만 Markdown 정본과 복원 가능한 자산은 끝까지 복원합니다."
  REINDEX_FAIL=1
fi

# 자산(페르소나·스킬) 복원 + 쿼리 로그 병합(specs/019 FR-2·4) — 실패해도 복구를 막지
# 않는다(set -e 하 실패 허용 블록). 미러 백업(마커)은 노트 연결 전이라 보류되고 restore-assets가
# 순서를 안내한다(보류=정상, 배포 실행 실패만 비0 요약).
say "  → 페르소나·스킬 복원 확인"
ASSET_FAIL=0
if BACKUP_DIR="$BACKUP_DIR" RESTORE_CONTEXT=recover bash "$PROJECT_DIR/scripts/restore-assets.sh"; then :; else ASSET_FAIL=1; fi

if [ "$EXTRAS_FAIL" = "1" ] || [ "$REINDEX_FAIL" = "1" ] || [ "$ASSET_FAIL" = "1" ]; then
  say ""
  [ "$EXTRAS_FAIL" = "1" ] && warn "일부 개인 설정 파일 복원이 완료되지 않았어요 — 위 안내를 확인한 뒤 다시 실행해 주세요."
  [ "$REINDEX_FAIL" = "1" ] && err "Markdown 정본은 복원됐지만 검색 색인이 미완료입니다 — 임베딩 설정·엔진을 복구한 뒤 다시 실행해 주세요."
  [ "$ASSET_FAIL" = "1" ] && warn "일부 단계(페르소나·스킬 배포)가 완료되지 않았어요 — 위 안내를 확인해 주세요."
  exit 1
fi
say ""
say "$(b '🎉 복구 완료!') 두뇌가 이 컴퓨터로 돌아왔어요."
say "  • 상태 확인     : $(b 'make health')"
say "  • Claude 연동   : $(b 'make mcp-install')   (Claude Code에서 localmind 도구 사용)"
say "  • 앞으로 백업   : $(b 'make backup')"
say ""
