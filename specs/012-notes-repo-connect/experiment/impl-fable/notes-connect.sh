#!/usr/bin/env bash
# 노트 git 저장소 연결 — NOTES_REPOS("라벨=git URL" 쉼표 구분)에 선언한 노트 저장소들을
# clone(이미 있으면 pull)하고, 준비된 폴더들로 NOTES_DIR를 조립해 mcp-install.sh 등록까지 잇는다.
# 호출: make notes-connect   (bash scripts/notes-connect.sh — 인자 없음, 설정은 환경변수)
#   NOTES_REPOS       "라벨=URL,URL,..." (라벨 생략 가능). 비어 있으면 프로젝트 .env에서 읽는다.
#   NOTES_REPOS_DIR   저장소를 받아올 위치(기본 $HOME/localmind-notes). <이 폴더>/<라벨>에 clone.
# 테스트 seam(env 오버라이드): MCP_INSTALL_CMD, NOTES_CONNECT_ENV, GIT_BIN
# 기계 판독 stdout(사람용 메시지와 별개):
#   ITEM\t<라벨>\t<connected|skipped-dirty|failed>\t<사유>   — 파싱된 항목마다 정확히 한 줄
#   NOTES_DIR\t<조립된 값>                                   — 등록을 시도할 때 정확히 한 줄
#   NO_REPOS (설정 없음 → exit 0)  /  NO_GIT (git 없음 → exit 1)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MCP_INSTALL_CMD="${MCP_INSTALL_CMD:-$SCRIPT_DIR/mcp-install.sh}"
NOTES_CONNECT_ENV="${NOTES_CONNECT_ENV:-$PROJECT_DIR/.env}"
GIT_BIN="${GIT_BIN:-git}"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# URL의 자격증명(user:token@의 userinfo)을 마스킹 — 어떤 출력에도 토큰이 평문으로 나가지 않게.
mask_url() { printf '%s\n' "$1" | sed -E 's#(://)[^/@[:space:]]+@#\1***@#g'; }

trim() { printf '%s\n' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'; }

is_safe_label() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9._-]+$'; }

env_file_value() {  # .env 폴백 — mcp-install.sh의 OPENMEMORY_USER 관례. 감싼 따옴표는 벗긴다.
  local v
  v="$(grep -E "^$1=" "$NOTES_CONNECT_ENV" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  case "$v" in
    '"'*'"') v="${v#\"}"; v="${v%\"}" ;;
    "'"*"'") v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s\n' "$v"
}

# git이 자격증명 프롬프트로 행에 빠지지 않게 비대화 모드를 강제한다(FR-6).
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -oBatchMode=yes"
export GIT_ASKPASS=false

# ── 준비물 점검 (FR-14) ─────────────────────────────────────────
if ! command -v "$GIT_BIN" >/dev/null 2>&1; then
  err "git 명령을 찾을 수 없어요 — 노트 저장소를 받아오려면 git이 필요해요."
  say "  • macOS: 터미널에서 xcode-select --install  (또는 https://git-scm.com 에서 설치)"
  say "  • Linux: sudo apt install git  (배포판에 맞는 방법으로 설치)"
  say "  설치 후 다시 make notes-connect 를 실행해 주세요."
  printf 'NO_GIT\n'
  exit 1
fi

# ── 입력 로드: env → 프로젝트 .env 폴백 (FR-5) ──────────────────
NOTES_REPOS="${NOTES_REPOS:-}"
if [ -z "$NOTES_REPOS" ]; then
  NOTES_REPOS="$(env_file_value NOTES_REPOS)"
fi
NOTES_REPOS="$(trim "$NOTES_REPOS")"

NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-}"
if [ -z "$NOTES_REPOS_DIR" ]; then
  NOTES_REPOS_DIR="$(env_file_value NOTES_REPOS_DIR)"
fi
if [ -z "$NOTES_REPOS_DIR" ]; then
  NOTES_REPOS_DIR="$HOME/localmind-notes"
fi
case "$NOTES_REPOS_DIR" in
  */) NOTES_REPOS_DIR="${NOTES_REPOS_DIR%/}" ;;  # 후행 / 정리(경로 조립 일관성)
esac

no_repos_exit() {  # opt-in 게이트 — 설정이 없으면 아무 부수효과 없이 종료(exit 0)
  say ""
  say "NOTES_REPOS가 설정되어 있지 않아 아무 작업도 하지 않았어요(이 기능은 선택 사항이에요)."
  say "노트 git 저장소를 연결하려면 환경변수나 프로젝트 .env에 아래처럼 선언해 주세요:"
  say '  NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"'
  say "  (라벨은 생략 가능하고, 받아올 위치는 NOTES_REPOS_DIR — 기본 \$HOME/localmind-notes)"
  printf 'NO_REPOS\n'
  exit 0
}
if [ -z "$NOTES_REPOS" ]; then
  no_repos_exit
fi

say ""
say "$(b '노트 저장소 연결')을 시작합니다 — NOTES_REPOS의 저장소를 받아와 Claude Code 등록까지 이어드려요."
say "  받아올 위치: $NOTES_REPOS_DIR"
say ""

GIT_LOG="$(mktemp)"
trap 'rm -f "$GIT_LOG"' EXIT

# ── 항목별 결과 집계 ────────────────────────────────────────────
RES_LABEL=(); RES_STATUS=(); RES_REASON=()
RES_COUNT=0
SUCCESS_COUNT=0
FAIL_COUNT=0
SUCCESS_PAIRS=""            # ",라벨=경로" 누적 → NOTES_DIR 조립(FR-10)
SEEN_LABELS=" localmind "   # 예약 라벨 포함 중복 감지(FR-4)
BASE_READY=0
BASE_PHYS=""

record() {  # $1 라벨(뽑지 못했으면 아무 값 — '-'로 정규화) $2 상태 $3 사유
  local l="$1" s="$2" r="$3"
  if ! is_safe_label "$l"; then l="-"; fi
  r="$(printf '%s' "$r" | tr '\t\n' '  ')"   # TSV 오염 방지
  printf 'ITEM\t%s\t%s\t%s\n' "$l" "$s" "$r"
  RES_LABEL[RES_COUNT]="$l"; RES_STATUS[RES_COUNT]="$s"; RES_REASON[RES_COUNT]="$r"
  RES_COUNT=$((RES_COUNT + 1))
  case "$s" in
    connected|skipped-dirty) SUCCESS_COUNT=$((SUCCESS_COUNT + 1)) ;;
    failed)                  FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
}

derive_label() {  # URL 마지막 경로 세그먼트에서 .git·후행 / 제거(FR-1)
  local u="$1" seg
  while :; do
    case "$u" in */) u="${u%/}" ;; *) break ;; esac
  done
  seg="${u##*/}"
  case "$seg" in *:*) seg="${seg##*:}" ;; esac   # scp형 user@host:repo.git
  seg="${seg%.git}"
  printf '%s\n' "$seg"
}

check_url() {  # FR-2 — 스킴 allowlist·옵션 인젝션 차단. URL_KIND(remote|local)/URL_ERR 설정.
  URL_KIND=""; URL_ERR=""
  local u="$1" lower
  case "$u" in
    -*)
      URL_ERR="'-'로 시작하는 값은 git 옵션으로 해석될 수 있어 받지 않아요"
      return 0 ;;
  esac
  lower="$(printf '%s' "$u" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    ext::*|git://*|http://*|file://*)
      URL_ERR="허용되지 않는 주소 방식이에요(ext:: / git:// / http:// / file:// 금지)"
      return 0 ;;
    https://?*|ssh://?*)
      URL_KIND="remote"
      return 0 ;;
  esac
  case "$u" in
    /*) URL_KIND="local"; return 0 ;;   # 검증된 로컬 절대경로(테스트·로컬 사용)
  esac
  if printf '%s' "$u" | grep -Eq '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:.+$'; then
    URL_KIND="remote"   # scp 유사형 user@host:path
    return 0
  fi
  URL_ERR="지원하지 않는 주소 형식이에요(https://, ssh://, user@host:경로, 로컬 절대경로만 가능)"
  return 0
}

print_git_log() {  # git 출력을 마스킹해 그대로 전달(FR-12)
  if [ -s "$GIT_LOG" ]; then
    sed -E 's#(://)[^/@[:space:]]+@#\1***@#g' "$GIT_LOG" | sed 's/^/      /'
  fi
}

auth_hint() {  # 인증 실패로 보이면 평이한 안내(FR-9) — 감지는 안내용, 실패 처리는 exit code 기준
  if grep -Eiq 'permission denied|authentication failed|could not read username|could not read password|publickey|access rights|terminal prompts disabled' "$GIT_LOG" 2>/dev/null; then
    warn "인증에 실패한 것 같아요 — SSH 키가 등록돼 있는지, GitHub 등에 로그인돼 있는지 확인해 주세요."
    warn "(토큰을 주소에 직접 넣는 방식 대신 SSH 키나 git credential helper 사용을 권장해요)"
  fi
}

# ── 항목별 파싱·검증·clone/pull (FR-1~9) ────────────────────────
IFS=',' read -r -a RAW_ITEMS <<< "$NOTES_REPOS"
if [ "${#RAW_ITEMS[@]}" -gt 0 ]; then
  for raw in "${RAW_ITEMS[@]}"; do
    item="$(trim "$raw")"
    if [ -z "$item" ]; then continue; fi   # 앞뒤 공백·후행 쉼표 무시

    # 라벨 판정(FR-1): 첫 = 앞이 안전한 라벨 charset이면 라벨, 아니면 항목 전체가 URL
    label=""; url="$item"
    case "$item" in
      *=*)
        pre="${item%%=*}"
        if is_safe_label "$pre"; then
          label="$pre"; url="${item#*=}"
        fi
        ;;
    esac
    case "$url" in "~/"*) url="$HOME${url#\~}" ;; esac   # 로컬 경로 편의(~/ → $HOME)
    murl="$(mask_url "$url")"
    if [ -z "$label" ]; then
      label="$(derive_label "$url")"
    fi

    # 라벨 검증(FR-3)
    if [ -z "$label" ] || ! is_safe_label "$label"; then
      err "라벨을 인식할 수 없어요(허용: 영문·숫자·. _ -): $murl"
      record "$label" failed "라벨 형식 위반(영문·숫자·._-만 가능): $murl"
      continue
    fi
    if [ "$label" = "." ] || [ "$label" = ".." ]; then
      err "[$label] '.'이나 '..'은 라벨로 쓸 수 없어요."
      record "$label" failed "라벨로 '.'/'..'는 쓸 수 없습니다"
      continue
    fi

    # 라벨 중복 거부(FR-4) — 기본 라벨 localmind 포함
    case "$SEEN_LABELS" in
      *" $label "*)
        err "[$label] 같은 라벨이 이미 있어요(기본 라벨 localmind 포함) — 이 항목은 건너뜁니다."
        record "$label" failed "라벨 중복('$label') — 앞선 항목이 이미 사용"
        continue ;;
    esac
    SEEN_LABELS="${SEEN_LABELS}${label} "

    # URL 검증(FR-2)
    check_url "$url"
    if [ -n "$URL_ERR" ]; then
      err "[$label] $URL_ERR: $murl"
      record "$label" failed "$URL_ERR: $murl"
      continue
    fi

    # 대상 경로 계산 + 물리 경로 봉쇄 재검증(FR-3, backup-extras.sh 선례)
    if [ "$BASE_READY" -eq 0 ]; then
      if ! mkdir -p "$NOTES_REPOS_DIR" 2>/dev/null; then
        err "[$label] 받아올 폴더를 만들 수 없어요: $NOTES_REPOS_DIR"
        record "$label" failed "NOTES_REPOS_DIR 생성 실패: $NOTES_REPOS_DIR"
        continue
      fi
      BASE_PHYS="$(cd "$NOTES_REPOS_DIR" 2>/dev/null && pwd -P || true)"
      if [ -z "$BASE_PHYS" ]; then
        err "[$label] 받아올 폴더에 접근할 수 없어요: $NOTES_REPOS_DIR"
        record "$label" failed "NOTES_REPOS_DIR 접근 실패: $NOTES_REPOS_DIR"
        continue
      fi
      BASE_READY=1
    fi
    target="$NOTES_REPOS_DIR/$label"
    if [ -L "$target" ] && [ ! -e "$target" ]; then
      err "[$label] 대상 경로가 깨진 심볼릭 링크예요: $target"
      record "$label" failed "대상 경로가 깨진 심볼릭 링크입니다: $target"
      continue
    fi
    if [ -d "$target" ]; then
      t_phys="$(cd "$target" 2>/dev/null && pwd -P || true)"
      case "$t_phys" in
        "$BASE_PHYS"/*) ;;
        *)
          err "[$label] 대상 경로가 NOTES_REPOS_DIR를 벗어나 있어 건드리지 않아요: $target"
          record "$label" failed "대상 경로가 NOTES_REPOS_DIR 밖을 가리킵니다"
          continue ;;
      esac
    fi

    # 최소 프로토콜만 개방(FR-2) — 원격은 https:ssh, 검증된 로컬 절대경로만 file
    proto="https:ssh"
    if [ "$URL_KIND" = "local" ]; then proto="file"; fi

    if [ ! -e "$target" ]; then
      # 신규 clone(FR-6) — end-of-options(--) 강제
      say "  [$label] 저장소를 받아오는 중... ($murl)"
      if GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" clone -- "$url" "$target" >"$GIT_LOG" 2>&1; then
        ok "[$label] 새로 받아왔어요 → $target"
        record "$label" connected "clone 완료"
        SUCCESS_PAIRS="$SUCCESS_PAIRS,$label=$target"
      else
        err "[$label] 저장소를 받아오지 못했어요 ($murl) — 주소와 접근 권한을 확인해 주세요."
        print_git_log
        auth_hint
        record "$label" failed "clone 실패 — 주소·네트워크·접근 권한을 확인해 주세요"
      fi
      continue
    fi

    # 대상 경로가 이미 있음 — 충돌 보호(FR-8)·origin 대조·멱등 pull(FR-7)
    if [ ! -d "$target" ]; then
      err "[$label] 대상 경로에 git 저장소가 아닌 파일이 이미 있어요 — 덮어쓰지 않아요: $target"
      record "$label" failed "대상 경로에 git 저장소가 아닌 파일이 이미 있습니다: $target"
      continue
    fi
    if [ ! -e "$target/.git" ]; then
      err "[$label] 대상 경로에 git 저장소가 아닌 폴더가 이미 있어요 — 덮어쓰지 않아요: $target"
      record "$label" failed "대상 경로에 git 저장소가 아닌 폴더가 이미 있습니다: $target"
      continue
    fi
    origin_url="$("$GIT_BIN" -C "$target" remote get-url origin 2>/dev/null || true)"
    if [ "$origin_url" != "$url" ]; then
      err "[$label] 기존 폴더의 origin이 선언한 주소와 달라요 — 엉뚱한 원격을 당기지 않도록 건너뜁니다."
      err "        현재 origin: $(mask_url "$origin_url")"
      record "$label" failed "기존 저장소의 origin이 선언된 URL과 다릅니다(현재: $(mask_url "$origin_url"))"
      continue
    fi
    dirty="$("$GIT_BIN" -C "$target" status --porcelain 2>/dev/null || true)"
    if [ -n "$dirty" ]; then
      warn "[$label] 커밋하지 않은 로컬 변경이 있어 pull을 건너뛰어요(변경은 그대로 보존됩니다)."
      record "$label" skipped-dirty "로컬 변경이 있어 pull 생략(폴더는 NOTES_DIR에 포함)"
      SUCCESS_PAIRS="$SUCCESS_PAIRS,$label=$target"
      continue
    fi
    if GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" -C "$target" pull --ff-only >"$GIT_LOG" 2>&1; then
      ok "[$label] 최신 상태로 갱신했어요 (pull)"
      record "$label" connected "pull 완료"
      SUCCESS_PAIRS="$SUCCESS_PAIRS,$label=$target"
    else
      err "[$label] 갱신(pull)에 실패했어요 — 네트워크·권한 또는 원격과의 이력 차이를 확인해 주세요."
      print_git_log
      auth_hint
      record "$label" failed "pull 실패 — 네트워크·권한 또는 fast-forward 불가"
    fi
  done
fi

if [ "$RES_COUNT" -eq 0 ]; then
  no_repos_exit   # 항목이 하나도 없으면(쉼표만 등) 설정 없음과 동일한 no-op
fi

# ── NOTES_DIR 조립 + MCP 등록 연계 (FR-10, FR-11) ───────────────
say ""
REGISTER_RC=0
ASSEMBLED=""
if [ "$SUCCESS_COUNT" -ge 1 ]; then
  ASSEMBLED="localmind=$HOME/.localmind$SUCCESS_PAIRS"
  say "$(b '[등록] Claude Code MCP 등록')"
  warn "등록은 기존 localmind MCP 등록을 통째로 다시 씁니다(remove 후 add)."
  warn "수동으로만 추가했던 노트 폴더는 사라지니, 계속 쓰려면 NOTES_REPOS에 옮겨 선언해 주세요."
  printf 'NOTES_DIR\t%s\n' "$ASSEMBLED"
  if NOTES_DIR="$ASSEMBLED" "$MCP_INSTALL_CMD"; then
    ok "MCP 등록까지 완료했어요."
  else
    REGISTER_RC=$?
    err "MCP 등록에 실패했어요 — 아래 요약을 확인한 뒤 make mcp-install 로 다시 시도할 수 있어요."
  fi
else
  warn "성공한 저장소가 하나도 없어 MCP 등록을 건너뜁니다(기존 등록은 그대로 둡니다)."
fi

# ── 요약 출력 (FR-13) — 등록 성공·실패와 무관하게 항상 출력 ─────
say ""
say "$(b '연결 결과 요약')"
i=0
while [ "$i" -lt "$RES_COUNT" ]; do
  case "${RES_STATUS[$i]}" in
    connected)     ok   "${RES_LABEL[$i]}: 연결됨 — ${RES_REASON[$i]}" ;;
    skipped-dirty) warn "${RES_LABEL[$i]}: 로컬 변경으로 pull 건너뜀(폴더는 포함) — ${RES_REASON[$i]}" ;;
    failed)        err  "${RES_LABEL[$i]}: 실패 — ${RES_REASON[$i]}" ;;
  esac
  i=$((i + 1))
done
if [ -n "$ASSEMBLED" ]; then
  say "  최종 NOTES_DIR: $ASSEMBLED"
fi

if [ "$FAIL_COUNT" -gt 0 ] || [ "$REGISTER_RC" -ne 0 ]; then
  say ""
  err "일부 항목이 실패했어요 — 위 요약의 실패 사유를 확인해 주세요."
  exit 1
fi
say ""
ok "모든 노트 저장소 연결이 끝났어요."
exit 0
