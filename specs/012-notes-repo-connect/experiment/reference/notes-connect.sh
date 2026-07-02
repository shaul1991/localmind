#!/usr/bin/env bash
# 012 notes-connect — 레퍼런스 구현(오라클 검증용 / 실험 control).
# spec.md의 Interface Contract를 따른다. 모델 실험 arm과 독립이다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GIT_BIN="${GIT_BIN:-git}"
MCP_INSTALL_CMD="${MCP_INSTALL_CMD:-$SCRIPT_DIR/mcp-install.sh}"
NOTES_CONNECT_ENV="${NOTES_CONNECT_ENV:-$PROJECT_DIR/.env}"
NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-$HOME/localmind-notes}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
mask() { sed -E 's#(://)[^/@[:space:]]*@#\1***@#g'; }
mask_s() { printf '%s' "$1" | mask; }

# 비대화 git — 자격증명 프롬프트로 행에 빠지지 않게.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -oBatchMode=yes}"

# ── git 존재 점검 ────────────────────────────────────────────────
if ! command -v "$GIT_BIN" >/dev/null 2>&1 && [ ! -x "$GIT_BIN" ]; then
  echo "NO_GIT"
  err "git이 없습니다. 먼저 git을 설치해 주세요."
  exit 1
fi

# ── 입력 로드 (env → .env 폴백) ──────────────────────────────────
read_env_val() {  # $1=key, $2=file
  [ -f "$2" ] || return 0
  grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}
NOTES_REPOS="${NOTES_REPOS:-}"
if [ -z "$NOTES_REPOS" ]; then
  NOTES_REPOS="$(read_env_val NOTES_REPOS "$NOTES_CONNECT_ENV")"
fi
if [ -z "$NOTES_REPOS" ]; then
  echo "NO_REPOS"
  warn "연결할 저장소가 없습니다. NOTES_REPOS=\"라벨=URL,...\"를 지정해 주세요."
  echo '  예: NOTES_REPOS="work=git@github.com:<user>/work-notes.git"'
  exit 0
fi

# ── 파싱·검증·clone/pull ─────────────────────────────────────────
declare -a ITEMS_LABEL ITEMS_STATUS ITEMS_REASON
declare -a OK_ENTRIES
declare -a SEEN_LABELS
label_charset() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._-]+$'; }
seen() { local x; for x in "${SEEN_LABELS[@]:-}"; do [ "$x" = "$1" ] && return 0; done; return 1; }

record() { ITEMS_LABEL+=("$1"); ITEMS_STATUS+=("$2"); ITEMS_REASON+=("$3"); }

IFS=',' read -r -a raw_items <<< "$NOTES_REPOS"
for raw in "${raw_items[@]}"; do
  item="$(printf '%s' "$raw" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [ -z "$item" ] && continue

  # 라벨/URL 분리: 첫 '=' 앞이 안전 charset이면 라벨 지정, 아니면 전체를 URL로.
  label=""; url="$item"
  if printf '%s' "$item" | grep -q '='; then
    before="${item%%=*}"
    if label_charset "$before"; then label="$before"; url="${item#*=}"; fi
  fi
  # 라벨 생략 → URL 마지막 세그먼트에서 .git·후행 / 제거
  if [ -z "$label" ]; then
    u="${url%/}"; base="${u##*/}"; label="${base%.git}"
  fi

  # 라벨 검증
  if ! label_charset "$label" || [ "$label" = "." ] || [ "$label" = ".." ]; then
    record "${label:--}" failed "잘못된 라벨"; continue
  fi
  if [ "$label" = "localmind" ]; then
    record "$label" failed "예약된 라벨(기본 노트 폴더와 충돌)"; continue
  fi
  if seen "$label"; then
    record "$label" failed "라벨 중복"; continue
  fi
  SEEN_LABELS+=("$label")

  # URL 검증: '-' 시작 거부, allowlist 밖 transport 거부
  case "$url" in
    -*) record "$label" failed "URL이 '-'로 시작(옵션 위장)"; continue ;;
    ext::*|git://*|http://*|file://*) record "$label" failed "허용되지 않는 transport"; continue ;;
  esac
  is_local=0
  case "$url" in
    https://*|ssh://*) : ;;
    /*) is_local=1 ;;
    *@*:*) : ;;   # scp 유사형 user@host:path
    *) record "$label" failed "인식할 수 없는 URL 형식"; continue ;;
  esac

  target="$NOTES_REPOS_DIR/$label"
  # 경로 봉쇄: 라벨 charset이 '/'·'..'를 이미 배제하므로 target은 항상 REPOS_DIR 직속.

  # 프로토콜 allowlist(방어적, 호출별 최소)
  if [ "$is_local" = 1 ]; then proto="https:ssh:file"; else proto="https:ssh"; fi

  if [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    if out="$(GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" clone -- "$url" "$target" 2>&1)"; then
      record "$label" connected "clone 완료"; OK_ENTRIES+=("$label=$target")
    else
      record "$label" failed "clone 실패: $(mask_s "$out" | tr '\n' ' ' | cut -c1-120)"
    fi
  elif [ -d "$target/.git" ]; then
    origin="$("$GIT_BIN" -C "$target" remote get-url origin 2>/dev/null || true)"
    if [ "$origin" != "$url" ]; then
      record "$label" failed "기존 저장소의 origin이 선언과 다름"; continue
    fi
    if [ -n "$("$GIT_BIN" -C "$target" status --porcelain 2>/dev/null)" ]; then
      record "$label" skipped-dirty "로컬 변경 있어 pull 생략(폴더는 포함)"; OK_ENTRIES+=("$label=$target")
    elif out="$(GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" -C "$target" pull --ff-only 2>&1)"; then
      record "$label" connected "pull 완료"; OK_ENTRIES+=("$label=$target")
    else
      record "$label" failed "pull 실패: $(mask_s "$out" | tr '\n' ' ' | cut -c1-120)"
    fi
  else
    record "$label" failed "git 저장소가 아닌 폴더/파일이 이미 있음"
  fi
done

# ── NOTES_DIR 조립 + 등록 ────────────────────────────────────────
register_rc=0
notes_dir=""
if [ "${#OK_ENTRIES[@]}" -ge 1 ]; then
  notes_dir="localmind=$HOME/.localmind"
  for e in "${OK_ENTRIES[@]}"; do notes_dir="$notes_dir,$e"; done
  warn "MCP 등록을 통째로 재작성합니다(기존 수동 등록 폴더는 사라짐)."
  export NOTES_DIR="$notes_dir"
  if bash "$MCP_INSTALL_CMD"; then register_rc=0; else register_rc=$?; fi
fi

# ── 요약(항상 출력) ──────────────────────────────────────────────
echo ""
echo "── 연결 요약 ──"
n_failed=0
for i in "${!ITEMS_LABEL[@]}"; do
  printf 'ITEM\t%s\t%s\t%s\n' "${ITEMS_LABEL[$i]}" "${ITEMS_STATUS[$i]}" "${ITEMS_REASON[$i]}"
  [ "${ITEMS_STATUS[$i]}" = failed ] && n_failed=$((n_failed+1))
done
if [ -n "$notes_dir" ]; then
  printf 'NOTES_DIR\t%s\n' "$notes_dir"
fi

if [ "$n_failed" -gt 0 ] || [ "$register_rc" -ne 0 ]; then
  exit 1
fi
exit 0
