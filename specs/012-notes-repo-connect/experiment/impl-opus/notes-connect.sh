#!/usr/bin/env bash
# localmind 노트 저장소 연결 — NOTES_REPOS("라벨=git URL" 쉼표 구분)에 선언한 노트 git
# 저장소들을 검증 → clone(있으면 pull) → NOTES_DIR 조립 → 기존 mcp-install 등록으로 잇는다.
# 호출: make notes-connect  (인자 없음, 설정은 모두 환경변수)
# 흐름: 준비물 점검(git) → 입력 로드(env→.env 폴백) → 파싱·검증 → clone/pull → 조립 → 등록 → 요약.
#
# 보안: NOTES_REPOS는 사용자가 직접 쓰지 않았을 수 있는 입력(복원된 .env·붙여넣은 예시)으로
#       취급한다 — URL 스킴 allowlist·라벨 charset·경로 봉쇄·중복 라벨을 검증한 뒤에만 git에 넘긴다.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 테스트 seam(환경변수 오버라이드 가능) ─────────────────────────
GIT_BIN="${GIT_BIN:-git}"                                   # git 실행 파일
MCP_INSTALL_CMD="${MCP_INSTALL_CMD:-$SCRIPT_DIR/mcp-install.sh}"  # 등록 명령
NOTES_CONNECT_ENV="${NOTES_CONNECT_ENV:-$PROJECT_DIR/.env}" # .env 폴백 경로

# ── 사람용 출력 헬퍼(기계 판독 라인과 구분되도록 들여쓰기) ────────
b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# 기계 판독 라인(사람용 메시지와 별개로 반드시 출력) — 항상 컬럼 0에서 시작한다.
emit_item()  { printf 'ITEM\t%s\t%s\t%s\n' "$1" "$2" "$3"; }
emit_notes() { printf 'NOTES_DIR\t%s\n' "$1"; }

# URL의 자격증명(userinfo)을 마스킹한다 — https://user:token@host → https://***@host.
# git stderr를 그대로 전달할 때도 이 함수를 통과시켜 토큰이 평문 노출되지 않게 한다.
mask_url() { printf '%s' "$1" | sed -E 's#://[^/@]*@#://***@#g'; }

# 앞뒤 공백 제거.
trim() { printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'; }

# 라벨 charset(FR-3): ^[A-Za-z0-9._-]+$ 이고 . / .. 가 아니어야 한다.
is_valid_label() {
  case "$1" in
    ""|"."|"..") return 1 ;;
  esac
  case "$1" in
    *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  return 0
}

# URL 마지막 경로 세그먼트에서 후행 '/'·'.git'를 제거해 라벨을 유도한다.
derive_label() {
  local u="$1"
  while [ "${u%/}" != "$u" ]; do u="${u%/}"; done  # 후행 슬래시 제거
  u="${u##*/}"                                     # 마지막 경로 세그먼트
  u="${u%.git}"                                    # .git 접미사 제거
  printf '%s' "$u"
}

# URL 검증(FR-2). 성공 시 URL_KIND(remote|local)를 설정한다. 1차 방어 = 입력 스킴 검증.
URL_KIND=""
validate_url() {
  local url="$1"
  URL_KIND=""
  case "$url" in
    -*)        return 1 ;;   # '-' 시작 = 옵션 위장 차단
    *"::"*)    return 1 ;;   # ext:: 등 git 원격 헬퍼(transport::address) 차단
    git://*|http://*|file://*) return 1 ;;  # 명시적 위험/평문 transport 스킴 차단
    https://*) URL_KIND="remote"; return 0 ;;
    ssh://*)   URL_KIND="remote"; return 0 ;;
    *://*)     return 1 ;;   # 그 밖의 알 수 없는 스킴 차단
    /*)        URL_KIND="local";  return 0 ;;   # 로컬 파일시스템 절대경로
    *@*:*)     URL_KIND="remote"; return 0 ;;   # scp 유사형 user@host:path
    *)         return 1 ;;
  esac
}

# 항목 유형별 최소 프로토콜만 연다(전역 하드코딩 금지 — FR-2와 상충 방지).
allow_protocol_for() {
  case "$1" in
    local) printf 'file' ;;
    *)     printf 'https:ssh' ;;
  esac
}

# 비대화 git — 자격증명 프롬프트로 행에 빠지지 않고 즉시 실패로 떨어지게 한다(FR-6).
# $1 = GIT_ALLOW_PROTOCOL 값(비우면 미설정 — 로컬 전용 명령용).
git_ni() {
  local proto="$1"; shift
  if [ -n "$proto" ]; then
    GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -oBatchMode=yes" GIT_ALLOW_PROTOCOL="$proto" "$GIT_BIN" "$@"
  else
    GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -oBatchMode=yes" "$GIT_BIN" "$@"
  fi
}

# git stderr에 인증 실패 흔적이 있으면 평이한 한국어 안내를 덧붙인다(FR-9).
auth_hint_if_needed() {
  if printf '%s' "$1" | grep -iq -e 'permission denied' -e 'authentication failed' \
       -e 'could not read username' -e 'could not read password' -e 'publickey' \
       -e 'access denied' -e 'terminal prompts disabled'; then
    warn "인증이 필요한 저장소로 보입니다 — SSH 키 등록 또는 git 로그인(credential helper)을 확인해 주세요."
    warn "토큰을 URL에 직접 넣기(https://user:token@...)보다 SSH 키/credential helper 사용을 권장합니다."
  fi
}

# ── 시작 안내 ─────────────────────────────────────────────────────
say ""
say "$(b '노트 저장소 연결')을 시작합니다 — NOTES_REPOS에 선언한 git 저장소를 받아 localmind에 연결해요."
say ""

# ── 준비물 점검(FR-14 / AC-18): git 존재를 실행 시작 시 점검 ──────
if ! command -v "$GIT_BIN" >/dev/null 2>&1; then
  err "git 명령을 찾을 수 없어요. 먼저 git을 설치해 주세요(예: macOS 'xcode-select --install', Debian/Ubuntu 'sudo apt install git')."
  say "NO_GIT"
  exit 1
fi

# ── 입력 로드 + .env 폴백(FR-5) ───────────────────────────────────
read_env_key() {  # 프로젝트 .env에서 key 값을 읽는다(mcp-install.sh:53 관례).
  local key="$1"
  [ -f "$NOTES_CONNECT_ENV" ] || return 0
  grep -E "^$key=" "$NOTES_CONNECT_ENV" 2>/dev/null | head -1 | cut -d= -f2- || true
}
strip_quotes() {  # .env 값이 따옴표로 감싸졌으면 벗긴다.
  local v="$1"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

NOTES_REPOS="${NOTES_REPOS:-}"
NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-}"
if [ -z "$NOTES_REPOS" ]; then
  NOTES_REPOS="$(strip_quotes "$(read_env_key NOTES_REPOS)")"
fi
if [ -z "$NOTES_REPOS_DIR" ]; then
  NOTES_REPOS_DIR="$(strip_quotes "$(read_env_key NOTES_REPOS_DIR)")"
fi
NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-$HOME/localmind-notes}"

# ── opt-in 게이트(AC-1): NOTES_REPOS가 env·.env 어디에도 없으면 무영향 종료 ──
if [ -z "$NOTES_REPOS" ]; then
  say "$(b '설정된 노트 저장소가 없습니다.') 이 기능은 완전 opt-in이라 아무 것도 바꾸지 않았어요."
  say ""
  say "사용하려면 프로젝트 $(b '.env')에 다음처럼 선언한 뒤 다시 실행해 주세요:"
  say '  NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"'
  say '  # (선택) 받아올 위치. 기본값: ~/localmind-notes'
  say '  NOTES_REPOS_DIR='
  say ""
  say "주의: 토큰을 URL에 직접 넣기(https://user:token@...)보다 SSH 키/credential helper 사용을 권장합니다."
  say "NO_REPOS"
  exit 0
fi

say "받아올 위치: $(b "$NOTES_REPOS_DIR")  (각 저장소는 <이 폴더>/<라벨>에 clone됩니다)"
say ""

mkdir -p "$NOTES_REPOS_DIR" 2>/dev/null || true
REPOS_ROOT="$(cd "$NOTES_REPOS_DIR" 2>/dev/null && pwd -P || printf '%s' "$NOTES_REPOS_DIR")"

# ── 파싱·검증·clone/pull ──────────────────────────────────────────
# 성공 집합 = {connected, skipped-dirty}. 결과를 배열로 집계한다.
res_label=()   # 표시용 라벨(뽑지 못하면 '-')
res_status=()  # connected | skipped-dirty | failed
res_target=()  # 성공 항목의 대상 경로("$NOTES_REPOS_DIR/$label"), 실패면 빈 문자열
seen=" localmind "  # 예약된 기본 라벨('localmind')과의 충돌도 거부(FR-4)

fail_count=0
success_count=0

# 항목별 최종 상태를 기록하고 ITEM 라인을 즉시 출력한다.
record() {  # record <label|-> <status> <reason> [target]
  local label="$1" status="$2" reason="$3" target="${4:-}"
  res_label+=("$label"); res_status+=("$status"); res_target+=("$target")
  emit_item "$label" "$status" "$reason"
  if [ "$status" = "failed" ]; then
    fail_count=$((fail_count + 1))
  else
    success_count=$((success_count + 1))
  fi
}

IFS=',' read -r -a raw_items <<< "$NOTES_REPOS"
for raw in "${raw_items[@]}"; do
  item="$(trim "$raw")"
  [ -z "$item" ] && continue  # 후행 쉼표·빈 항목 무시

  # ── 라벨/URL 분리(FR-1) ──
  # 첫 '='' 앞 문자열이 라벨 charset에 부합하면 라벨 지정, 아니면 항목 전체를 URL로 간주.
  label=""; url=""; label_explicit="no"
  case "$item" in
    *=*)
      cand="${item%%=*}"
      if is_valid_label "$cand"; then
        label="$cand"; url="${item#*=}"; label_explicit="yes"
      fi
      ;;
  esac
  if [ "$label_explicit" = "no" ]; then
    url="$item"
    label="$(derive_label "$url")"
  fi

  # ── URL 검증(FR-2) — 1차 방어 ──
  if ! validate_url "$url"; then
    warn "허용되지 않은 URL 형식이라 건너뜁니다(라벨: ${label:--}): $(mask_url "$url")"
    warn "  ext::/git://·http://·file:// 스킴, '-'로 시작하는 값은 보안상 거부됩니다(https/ssh/scp/로컬 절대경로만 허용)."
    if is_valid_label "$label"; then record "$label" "failed" "허용되지 않은 URL"; else record "-" "failed" "허용되지 않은 URL"; fi
    continue
  fi
  proto="$(allow_protocol_for "$URL_KIND")"

  # ── 라벨 검증(FR-3) ──
  if ! is_valid_label "$label"; then
    warn "라벨 형식이 올바르지 않아 건너뜁니다(허용: A-Za-z0-9._- , '.'/'..' 불가): '${label}'"
    record "-" "failed" "라벨 형식 오류"
    continue
  fi

  # ── 라벨 중복 거부(FR-4) — 예약 'localmind' 포함 ──
  case "$seen" in
    *" $label "*)
      warn "라벨 '$label'이(가) 이미 사용 중(또는 예약됨)이라 이 항목은 건너뜁니다."
      record "$label" "failed" "라벨 중복"
      continue
      ;;
  esac

  # ── 경로 봉쇄(FR-3): 대상이 NOTES_REPOS_DIR 하위인지 재검증 ──
  target="$NOTES_REPOS_DIR/$label"
  case "$REPOS_ROOT/$label" in
    "$REPOS_ROOT"/*) ;;  # 정상(라벨 charset으로 '/'가 배제되어 항상 성립)
    *)
      warn "대상 경로가 지정 폴더를 벗어나 건너뜁니다: $label"
      record "$label" "failed" "경로 이탈"
      continue
      ;;
  esac

  # 여기까지 통과한 라벨만 예약(먼저 나온 항목이 라벨을 차지).
  seen="$seen$label "

  say "$(b "[$label]") 처리 중..."

  # ── clone / pull ──
  if [ ! -e "$target" ]; then
    # 대상 없음 → clone(FR-6)
    mkdir -p "$(dirname "$target")"
    out="$(git_ni "$proto" clone -- "$url" "$target" 2>&1)"; rc=$?
    if [ $rc -eq 0 ]; then
      ok "clone 완료 → $target"
      record "$label" "connected" "clone 완료" "$target"
    else
      err "clone 실패(라벨: $label)"
      [ -n "$out" ] && say "  $(mask_url "$out")"
      auth_hint_if_needed "$out"
      rm -rf "$target" 2>/dev/null || true  # 부분 clone 잔여물 정리
      record "$label" "failed" "clone 실패" ""
    fi

  elif [ -d "$target/.git" ]; then
    # 이미 git 저장소 → origin 대조 후 멱등 pull(FR-7)
    origin="$(git_ni "" -C "$target" remote get-url origin 2>/dev/null)"; orc=$?
    if [ $orc -ne 0 ] || [ "$origin" != "$url" ]; then
      err "기존 저장소의 origin이 선언된 URL과 달라 pull하지 않고 건너뜁니다(라벨: $label)."
      say "  선언: $(mask_url "$url")"
      say "  기존: $(mask_url "$origin")"
      record "$label" "failed" "origin 불일치" ""
    else
      dirty="$(git_ni "" -C "$target" status --porcelain 2>/dev/null)"
      if [ -n "$dirty" ]; then
        warn "커밋 안 된 로컬 변경이 있어 pull을 건너뜁니다 — 변경은 보존되고 폴더는 그대로 연결됩니다(라벨: $label)."
        record "$label" "skipped-dirty" "로컬 변경 있음 — pull 생략" "$target"
      else
        out="$(git_ni "$proto" -C "$target" pull --ff-only 2>&1)"; rc=$?
        if [ $rc -eq 0 ]; then
          ok "pull 완료(최신화) → $target"
          record "$label" "connected" "pull 완료" "$target"
        else
          err "pull 실패(라벨: $label)"
          [ -n "$out" ] && say "  $(mask_url "$out")"
          auth_hint_if_needed "$out"
          record "$label" "failed" "pull 실패" ""
        fi
      fi
    fi

  else
    # 대상에 git 저장소가 아닌 폴더/파일 → 절대 덮어쓰지 않는다(FR-8)
    err "대상 경로에 git 저장소가 아닌 항목이 이미 있어 건너뜁니다(내용은 그대로 둡니다): $target"
    record "$label" "failed" "git 저장소 아님(경로 충돌)" ""
  fi
done

# ── NOTES_DIR 조립(FR-10) + 등록(FR-11) ───────────────────────────
say ""
register_rc=0
assembled=""

if [ "$success_count" -ge 1 ]; then
  # 기본 노트 폴더를 앞에 붙이고, 성공 항목의 라벨=경로를 이어 붙인다.
  assembled="localmind=$HOME/.localmind"
  i=0
  while [ $i -lt ${#res_status[@]} ]; do
    if [ "${res_status[$i]}" != "failed" ]; then
      assembled="$assembled,${res_label[$i]}=${res_target[$i]}"
    fi
    i=$((i + 1))
  done

  emit_notes "$assembled"

  say "$(b 'MCP 등록')을 진행합니다 — 이 등록은 기존 localmind 등록을 통째로 재작성(remove 후 add)합니다."
  say "  수동으로만 추가했던 노트 폴더가 있다면 사라질 수 있어요 — NOTES_REPOS로 옮기는 것을 권장합니다."
  say ""

  # 성공 항목이 ≥1일 때만, 정확히 한 번 호출. 조립된 NOTES_DIR는 환경변수로 export해 전달.
  NOTES_DIR="$assembled" "$MCP_INSTALL_CMD" || register_rc=$?
  if [ "$register_rc" -ne 0 ]; then
    err "MCP 등록에 실패했어요(등록 명령 exit=$register_rc) — 'claude mcp list'로 상태를 확인해 주세요."
  fi
else
  warn "성공적으로 준비된 저장소가 없어 MCP 등록을 건너뜁니다(기존 등록은 그대로 유지됩니다)."
fi

# ── 요약 출력(FR-13) — 등록 성공·실패와 무관하게 항상 ─────────────
say ""
say "$(b '── 요약 ──')"
i=0
while [ $i -lt ${#res_status[@]} ]; do
  case "${res_status[$i]}" in
    connected)     ok "${res_label[$i]}: 연결됨" ;;
    skipped-dirty) warn "${res_label[$i]}: 연결됨(로컬 변경으로 pull 생략)" ;;
    failed)        err "${res_label[$i]}: 실패" ;;
  esac
  i=$((i + 1))
done
if [ "$success_count" -ge 1 ]; then
  say "최종 NOTES_DIR: $(b "$assembled")"
fi
say ""

# ── exit code(FR-13) ──────────────────────────────────────────────
# 0: 모든 항목이 성공 집합 + 등록 성공일 때만. 그 외(실패 항목·등록 실패)는 1.
if [ "$fail_count" -eq 0 ] && [ "$success_count" -ge 1 ] && [ "$register_rc" -eq 0 ]; then
  exit 0
fi
exit 1
