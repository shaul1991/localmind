#!/usr/bin/env bash
# specs/012 notes-connect — 노트 git 저장소를 받아와 Claude Code(MCP)에 연결한다.
# 흐름: 입력 로드(env→.env) → 검증(URL 스킴·라벨·NOTES_REPOS_DIR) → clone/pull(비대화·origin 대조)
#       → NOTES_DIR 조립 → mcp-install 재사용 → 요약.
# 호출: make notes-connect   (설정: NOTES_REPOS="라벨=URL,...", NOTES_REPOS_DIR=)
# 이식성: BSD/GNU 공통. 입력은 신뢰 불가로 취급(복원된 .env·붙여넣기) — 검증 후에만 git에 넘긴다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/lib/read-env.sh"

GIT_BIN="${GIT_BIN:-git}"
MCP_INSTALL_CMD="${MCP_INSTALL_CMD:-$SCRIPT_DIR/mcp-install.sh}"
NOTES_CONNECT_ENV="${NOTES_CONNECT_ENV:-$PROJECT_DIR/.env}"
DEFAULT_REPOS_DIR="$HOME/localmind-notes"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# 비대화 git — 자격증명 프롬프트로 행에 빠지지 않게 즉시 실패로 떨어뜨린다(FR-6).
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -oBatchMode=yes}"

# ── git 점검 (FR-14) ────────────────────────────────────────────
if ! command -v "$GIT_BIN" >/dev/null 2>&1 && [ ! -x "$GIT_BIN" ]; then
  echo "NO_GIT"
  err "git이 없습니다. 먼저 git을 설치해 주세요 → https://git-scm.com"
  exit 1
fi

# ── 입력 로드: env → .env 비실행 폴백 (FR-5) ────────────────────
NOTES_REPOS="${NOTES_REPOS:-}"
[ -z "$NOTES_REPOS" ] && NOTES_REPOS="$(read_env_val NOTES_REPOS "$NOTES_CONNECT_ENV")"
NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-}"
[ -z "$NOTES_REPOS_DIR" ] && NOTES_REPOS_DIR="$(read_env_val NOTES_REPOS_DIR "$NOTES_CONNECT_ENV")"

# ── NOTES_REPOS_DIR 검증 (FR-17) — .env발 신뢰 불가 입력 ────────
# 존재하지 않을 수 있는 경로의 물리 경로(심링크 해소)를 구한다 — 존재하는 최상위 조상까지 해소.
phys_path() {
  local existing="$1" rest=""
  while [ ! -e "$existing" ] && [ "$existing" != "/" ]; do
    rest="/$(basename "$existing")$rest"; existing="$(dirname "$existing")"
  done
  if [ -d "$existing" ]; then printf '%s%s' "$(cd "$existing" && pwd -P)" "$rest"; else printf '%s' "$1"; fi
}
# 결과를 전역 NOTES_REPOS_DIR에 설정한다(경고를 stdout으로 내되 값과 섞이지 않도록 $()로 안 받음).
validate_repos_dir() {
  local d="$1" home_p dp sensitive
  if [ -z "$d" ]; then NOTES_REPOS_DIR="$DEFAULT_REPOS_DIR"; return; fi
  case "$d" in
    /*) ;;
    *) warn "NOTES_REPOS_DIR는 절대경로여야 합니다 — 기본값 사용($DEFAULT_REPOS_DIR)."; NOTES_REPOS_DIR="$DEFAULT_REPOS_DIR"; return;;
  esac
  home_p="$(phys_path "$HOME")"; dp="$(phys_path "$d")"
  case "$dp" in
    "$home_p"|"$home_p"/*) ;;
    *) warn "NOTES_REPOS_DIR가 \$HOME 밖입니다 — 기본값 사용($DEFAULT_REPOS_DIR)."; NOTES_REPOS_DIR="$DEFAULT_REPOS_DIR"; return;;
  esac
  for sensitive in .ssh .config .claude .codex .gnupg; do
    case "$dp" in
      "$home_p/$sensitive"|"$home_p/$sensitive"/*) warn "NOTES_REPOS_DIR가 민감 디렉토리(~/$sensitive)라 거부 — 기본값 사용($DEFAULT_REPOS_DIR)."; NOTES_REPOS_DIR="$DEFAULT_REPOS_DIR"; return;;
    esac
  done
  NOTES_REPOS_DIR="$d"
}
validate_repos_dir "$NOTES_REPOS_DIR"

# ── opt-in 게이트 (FR-2) ────────────────────────────────────────
if [ -z "$NOTES_REPOS" ]; then
  echo "NO_REPOS"
  warn "연결할 노트 저장소가 없습니다."
  echo "  설정: NOTES_REPOS=\"라벨=URL,...\" (env 또는 프로젝트 .env)"
  echo '  예:   NOTES_REPOS="work=git@github.com:<user>/work-notes.git"'
  exit 0
fi

# ── 파싱·검증·clone/pull ────────────────────────────────────────
declare -a I_LABEL I_STATUS I_REASON OK_ENTRIES SEEN
label_ok() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._-]+$'; }
seen() { local x; for x in ${SEEN[@]+"${SEEN[@]}"}; do [ "$x" = "$1" ] && return 0; done; return 1; }
rec() { I_LABEL+=("$1"); I_STATUS+=("$2"); I_REASON+=("$3"); }

IFS=',' read -r -a RAW <<< "$NOTES_REPOS"
for raw in ${RAW[@]+"${RAW[@]}"}; do
  item="$(printf '%s' "$raw" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [ -z "$item" ] && continue

  # 라벨/URL 분리: 첫 '=' 앞이 안전 charset이면 라벨, 아니면 전체를 URL로.
  label=""; url="$item"
  if printf '%s' "$item" | grep -q '='; then
    before="${item%%=*}"
    if label_ok "$before"; then label="$before"; url="${item#*=}"; fi
  fi
  if [ -z "$label" ]; then u="${url%/}"; base="${u##*/}"; label="${base%.git}"; fi

  # 라벨 검증 (FR-3)
  if ! label_ok "$label" || [ "$label" = "." ] || [ "$label" = ".." ]; then
    rec "${label:--}" failed "잘못된 라벨"; continue
  fi
  [ "$label" = "localmind" ] && { rec "$label" failed "예약된 라벨(기본 노트 폴더와 충돌)"; continue; }
  seen "$label" && { rec "$label" failed "라벨 중복"; continue; }

  # URL 검증: '-' 시작·비허용 transport 거부 (FR-2)
  case "$url" in
    -*) rec "$label" failed "URL이 '-'로 시작(옵션 위장 차단)"; continue;;
    ext::*|git://*|http://*|file://*) rec "$label" failed "허용되지 않는 transport"; continue;;
  esac
  is_local=0
  case "$url" in
    https://*|ssh://*) : ;;
    /*) is_local=1 ;;
    *@*:*) : ;;
    *) rec "$label" failed "인식할 수 없는 URL 형식"; continue;;
  esac
  # 라벨은 URL 검증까지 통과한 뒤에만 예약한다 — malformed 항목(URL 실패)이 뒤의
  # 유효 항목 라벨을 "중복"으로 오염시키지 않도록(self-review에서 발견).
  SEEN+=("$label")

  target="$NOTES_REPOS_DIR/$label"  # 라벨 charset이 '/'·'..'를 배제 → target은 REPOS_DIR 직속
  if [ "$is_local" = 1 ]; then proto="https:ssh:file"; else proto="https:ssh"; fi

  if [ -L "$target" ]; then
    # 심볼릭 링크(정상/dangling 불문) 경유 clone은 REPOS_DIR 밖으로 쓰기가 될 수 있어 거부(FR-3 봉쇄).
    rec "$label" failed "대상 경로가 심볼릭 링크 — 안전을 위해 건너뜀"
  elif [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    if out="$(GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" clone -- "$url" "$target" 2>&1)"; then
      rec "$label" connected "clone 완료"; OK_ENTRIES+=("$label=$target")
    else
      m="$(mask_url "$out" | tr '\n' ' ')"
      case "$m" in *[Pp]ermission*|*publickey*|*[Aa]uthentication*) m="$m (SSH 키/로그인 확인 필요)";; esac
      rec "$label" failed "clone 실패: $(printf '%s' "$m" | cut -c1-140)"
    fi
  elif [ -d "$target/.git" ]; then
    origin="$("$GIT_BIN" -C "$target" remote get-url origin 2>/dev/null || true)"
    if [ "$origin" != "$url" ]; then
      rec "$label" failed "기존 저장소의 origin이 선언과 다름(덮어쓰지 않음)"; continue
    fi
    if [ -n "$("$GIT_BIN" -C "$target" status --porcelain 2>/dev/null)" ]; then
      rec "$label" skipped-dirty "로컬 변경 있어 pull 생략(폴더는 포함)"; OK_ENTRIES+=("$label=$target")
    elif out="$(GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" -C "$target" pull --ff-only 2>&1)"; then
      rec "$label" connected "pull 완료"; OK_ENTRIES+=("$label=$target")
    else
      rec "$label" failed "pull 실패: $(mask_url "$out" | tr '\n' ' ' | cut -c1-140)"
    fi
  else
    rec "$label" failed "git 저장소가 아닌 폴더/파일이 이미 있음"
  fi
done

# ── NOTES_DIR 조립 + 등록 (FR-10, FR-11) ────────────────────────
register_rc=0
notes_dir=""
if [ "${#OK_ENTRIES[@]}" -ge 1 ]; then
  notes_dir="localmind=$HOME/.localmind"
  for e in "${OK_ENTRIES[@]}"; do notes_dir="$notes_dir,$e"; done
  warn "MCP 등록을 통째로 재작성합니다(수동으로만 추가했던 폴더는 사라짐 — NOTES_REPOS로 옮기세요)."
  export NOTES_DIR="$notes_dir"
  bash "$MCP_INSTALL_CMD" || register_rc=$?
fi

# ── 요약(항상 출력, FR-13) ──────────────────────────────────────
echo ""
echo "── 연결 요약 ──"
n_failed=0
for i in "${!I_LABEL[@]}"; do
  printf 'ITEM\t%s\t%s\t%s\n' "${I_LABEL[$i]}" "${I_STATUS[$i]}" "${I_REASON[$i]}"
  [ "${I_STATUS[$i]}" = failed ] && n_failed=$((n_failed+1))
done
[ -n "$notes_dir" ] && printf 'NOTES_DIR\t%s\n' "$notes_dir"

if [ "${#OK_ENTRIES[@]}" -eq 0 ]; then
  err "연결된 저장소가 없습니다 — 등록을 건너뜁니다(기존 등록 불변)."
fi
{ [ "$n_failed" -gt 0 ] || [ "$register_rc" -ne 0 ]; } && exit 1
exit 0
