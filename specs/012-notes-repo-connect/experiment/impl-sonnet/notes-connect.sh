#!/usr/bin/env bash
# scripts/notes-connect.sh
# NOTES_REPOS("라벨=URL" 쉼표 구분)로 선언된 노트 git 저장소를
# clone(있으면 pull)하고 NOTES_DIR를 조립해 MCP 등록까지 연결한다.
# 호출: make notes-connect  (설정은 환경변수 또는 프로젝트 .env로)
#
# 환경변수:
#   NOTES_REPOS       — "라벨=URL" 쉼표 구분 저장소 목록 (없으면 no-op)
#   NOTES_REPOS_DIR   — clone 대상 상위 폴더 (기본: $HOME/localmind-notes)
# 테스트 seam:
#   GIT_BIN           — git 실행 파일 경로 (기본: git)
#   MCP_INSTALL_CMD   — 등록 명령 (기본: <SCRIPT_DIR>/mcp-install.sh)
#   NOTES_CONNECT_ENV — .env 폴백 파일 경로 (기본: <PROJECT_DIR>/.env)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 출력 헬퍼 ────────────────────────────────────────────────────────
b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# URL의 userinfo(user:token@) 마스킹 — stdout·stderr 출력 전 적용
mask_url() {
  printf '%s' "$1" | sed 's|://[^@/][^@]*@|://***@|g'
}

# 여러 줄 텍스트(git stderr 등)의 자격증명 마스킹
mask_text() {
  sed 's|://[^@/][^@]*@|://***@|g'
}

# ── 테스트 seam ──────────────────────────────────────────────────────
GIT_BIN="${GIT_BIN:-git}"
MCP_INSTALL_CMD="${MCP_INSTALL_CMD:-"$SCRIPT_DIR/mcp-install.sh"}"
NOTES_CONNECT_ENV="${NOTES_CONNECT_ENV:-"$PROJECT_DIR/.env"}"

# ── FR-14: git 존재 점검 ─────────────────────────────────────────────
if ! command -v "$GIT_BIN" >/dev/null 2>&1; then
  say "NO_GIT"
  err "git 명령을 찾을 수 없습니다. git을 먼저 설치해 주세요."
  err "  macOS: brew install git"
  err "  Linux: sudo apt install git  (또는 배포판 패키지 관리자)"
  err "  Windows: https://git-scm.com/download/win"
  exit 1
fi

# ── FR-5: env → .env 폴백으로 NOTES_REPOS / NOTES_REPOS_DIR 로드 ───
NOTES_REPOS="${NOTES_REPOS:-}"
NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-}"

if [ -z "$NOTES_REPOS" ] && [ -f "$NOTES_CONNECT_ENV" ]; then
  _val="$(grep -E '^NOTES_REPOS=' "$NOTES_CONNECT_ENV" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  NOTES_REPOS="${_val:-}"
fi
if [ -z "$NOTES_REPOS_DIR" ] && [ -f "$NOTES_CONNECT_ENV" ]; then
  _val="$(grep -E '^NOTES_REPOS_DIR=' "$NOTES_CONNECT_ENV" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  NOTES_REPOS_DIR="${_val:-}"
fi

NOTES_REPOS_DIR="${NOTES_REPOS_DIR:-$HOME/localmind-notes}"

# ── opt-in 게이트 ────────────────────────────────────────────────────
if [ -z "$NOTES_REPOS" ]; then
  say "NO_REPOS"
  say ""
  say "$(b 'NOTES_REPOS')가 설정되지 않았어요."
  say "노트 저장소를 연결하려면 .env 또는 환경변수에 아래와 같이 설정하세요:"
  say ""
  say '  NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"'
  say ""
  say "설정 후 $(b 'make notes-connect')를 다시 실행해 주세요."
  exit 0
fi

# ── 헬퍼: 라벨 유효성 검사 (FR-3) ───────────────────────────────────
validate_label() {
  local label="$1"
  [ -z "$label" ] && return 1
  [ "$label" = "." ] && return 1
  [ "$label" = ".." ] && return 1
  printf '%s' "$label" | grep -E '^[A-Za-z0-9._-]+$' >/dev/null 2>&1 || return 1
  return 0
}

# ── 헬퍼: URL 유효성 검사 (FR-2) ─────────────────────────────────────
# 허용: https:// · ssh:// · scp형(user@host:path) · 로컬 절대경로(/)
# 거부: - 시작(옵션 위장) · ext:: · git:// · http:// · file://
validate_url() {
  local url="$1"
  # - 로 시작하는 값 거부
  case "$url" in -*) return 1 ;; esac
  # 차단 스킴
  case "$url" in
    ext::*|git://*|http://*|file://*) return 1 ;;
  esac
  # 허용 스킴·형태
  case "$url" in
    https://*|ssh://*) return 0 ;;
    /*) return 0 ;;  # 로컬 절대경로
  esac
  # scp 형태: user@host:path
  printf '%s' "$url" | grep -E '^[A-Za-z0-9%_.+-]+@[A-Za-z0-9._-]+:.+' >/dev/null 2>&1 && return 0
  return 1
}

# ── 헬퍼: 로컬 절대경로 여부 ──────────────────────────────────────────
is_local_path() {
  case "$1" in /*) return 0 ;; *) return 1 ;; esac
}

# ── 헬퍼: 디렉토리 물리 경로 정규화 ─────────────────────────────────
resolve_dir() {
  local dir="$1"
  if [ -d "$dir" ]; then
    ( cd "$dir" && pwd -P )
  else
    local parent base
    parent="$(dirname "$dir")"
    base="$(basename "$dir")"
    if [ -d "$parent" ]; then
      echo "$(cd "$parent" && pwd -P)/$base"
    else
      # 상위 디렉토리도 없으면 그대로 반환
      echo "$dir"
    fi
  fi
}

# NOTES_REPOS_DIR 물리 경로 (봉쇄 기준)
NOTES_REPOS_DIR_RESOLVED="$(resolve_dir "$NOTES_REPOS_DIR")"

# ── 파싱·검증 루프 ───────────────────────────────────────────────────
say ""
say "$(b '노트 저장소 연결') 시작"
say ""

declare -a p_labels=()
declare -a p_urls=()
declare -a p_targets=()
declare -a p_statuses=()   # pending|connected|skipped-dirty|failed
declare -a p_reasons=()

declare -a seen_labels=("localmind")  # 예약 라벨

IFS=',' read -r -a raw_entries <<< "$NOTES_REPOS"

for raw in "${raw_entries[@]}"; do
  # 앞뒤 공백 제거
  entry="$(printf '%s' "$raw" | sed 's/^ *//; s/ *$//')"
  [ -z "$entry" ] && continue

  # ── 라벨/URL 분리 (FR-1) ───────────────────────────────────────────
  label=""
  url=""
  if printf '%s' "$entry" | grep -qF '='; then
    _before_eq="${entry%%=*}"
    _after_eq="${entry#*=}"
    if printf '%s' "$_before_eq" | grep -qE '^[A-Za-z0-9._-]+$'; then
      label="$_before_eq"
      url="$_after_eq"
    else
      # 첫 = 앞 부분이 charset 불일치 → 전체를 URL로 간주(쿼리스트링 등)
      url="$entry"
    fi
  else
    url="$entry"
  fi

  # 라벨 생략 시 URL 마지막 경로 세그먼트에서 유도
  if [ -z "$label" ]; then
    _seg="${url%/}"      # 후행 / 제거
    _seg="${_seg##*/}"   # 마지막 세그먼트
    _seg="${_seg%.git}"  # .git 제거
    label="$_seg"
  fi

  masked="$(mask_url "$url")"

  # ── 라벨 검증 (FR-3) ───────────────────────────────────────────────
  if ! validate_label "$label"; then
    err "라벨이 유효하지 않습니다: '${label:-(없음)}'"
    err "  라벨은 영숫자·점·하이픈·밑줄만 허용되며 '.'·'..'는 불가합니다."
    p_labels+=("${label:--}")
    p_urls+=("$url")
    p_targets+=("")
    p_statuses+=("failed")
    p_reasons+=("라벨 형식 오류")
    printf 'ITEM\t%s\tfailed\t라벨 형식 오류\n' "${label:--}"
    continue
  fi

  # ── URL 검증 (FR-2) ────────────────────────────────────────────────
  if ! validate_url "$url"; then
    err "허용되지 않는 URL 형식입니다: '$masked'"
    err "  허용: https:// / ssh:// / git@host:path / /로컬/절대경로"
    err "  거부: - 로 시작 · ext:: · git:// · http:// · file://"
    p_labels+=("$label")
    p_urls+=("$url")
    p_targets+=("")
    p_statuses+=("failed")
    p_reasons+=("URL 형식 거부")
    printf 'ITEM\t%s\tfailed\tURL 형식 거부\n' "$label"
    continue
  fi

  # ── 중복 라벨 (FR-4) ───────────────────────────────────────────────
  _dup=0
  for _sl in "${seen_labels[@]}"; do
    if [ "$_sl" = "$label" ]; then
      _dup=1
      break
    fi
  done
  if [ "$_dup" -eq 1 ]; then
    err "중복 라벨: '$label' (이미 처리됐거나 예약 라벨입니다)"
    p_labels+=("$label")
    p_urls+=("$url")
    p_targets+=("")
    p_statuses+=("failed")
    p_reasons+=("중복 라벨")
    printf 'ITEM\t%s\tfailed\t중복 라벨\n' "$label"
    continue
  fi
  seen_labels+=("$label")

  # ── 대상 경로 계산 + 봉쇄 검증 (FR-3) ────────────────────────────
  target="$NOTES_REPOS_DIR/$label"
  target_resolved="$NOTES_REPOS_DIR_RESOLVED/$label"

  case "$target_resolved" in
    "$NOTES_REPOS_DIR_RESOLVED/"*)
      ;;
    *)
      err "대상 경로가 NOTES_REPOS_DIR 밖입니다(보안 거부): $target_resolved"
      p_labels+=("$label")
      p_urls+=("$url")
      p_targets+=("")
      p_statuses+=("failed")
      p_reasons+=("경로 탈출 시도 거부")
      printf 'ITEM\t%s\tfailed\t경로 탈출 시도 거부\n' "$label"
      continue
      ;;
  esac

  p_labels+=("$label")
  p_urls+=("$url")
  p_targets+=("$target")
  p_statuses+=("pending")
  p_reasons+=("")
done

# ── clone/pull 루프 ──────────────────────────────────────────────────
_n=${#p_labels[@]}
_i=0
while [ "$_i" -lt "$_n" ]; do
  if [ "${p_statuses[$_i]}" != "pending" ]; then
    _i=$((_i + 1))
    continue
  fi

  label="${p_labels[$_i]}"
  url="${p_urls[$_i]}"
  target="${p_targets[$_i]}"
  masked="$(mask_url "$url")"

  # 프로토콜 최소 개방 (FR-2)
  if is_local_path "$url"; then
    _git_allow_proto="file"
  else
    _git_allow_proto="https:ssh"
  fi

  say "  처리 중: $(b "$label")  ($masked)"

  if [ ! -e "$target" ]; then
    # ── 신규 clone (FR-6) ──────────────────────────────────────────────
    mkdir -p "$NOTES_REPOS_DIR"
    _stderr_tmp="$(mktemp)"
    set +e
    GIT_TERMINAL_PROMPT=0 \
    GIT_SSH_COMMAND="ssh -oBatchMode=yes" \
    GIT_ALLOW_PROTOCOL="$_git_allow_proto" \
      "$GIT_BIN" clone -- "$url" "$target" 2>"$_stderr_tmp"
    _rc=$?
    set -e
    _stderr_masked="$(mask_text < "$_stderr_tmp")"
    rm -f "$_stderr_tmp"

    if [ "$_rc" -eq 0 ]; then
      ok "clone 완료: $label → $target"
      p_statuses[$_i]="connected"
      p_reasons[$_i]="clone 성공"
      printf 'ITEM\t%s\tconnected\tclone 성공\n' "$label"
    else
      err "clone 실패: $label  ($masked)"
      if printf '%s' "$_stderr_masked" | \
           grep -qiE 'permission denied|authentication failed|publickey|could not read.*[Pp]assword|repository.*not found|fatal.*could not'; then
        err "  → SSH 키 또는 인증 정보를 확인해 주세요."
        err "    도움말: https://docs.github.com/authentication"
      fi
      [ -n "$_stderr_masked" ] && err "  git 출력: $_stderr_masked"
      p_statuses[$_i]="failed"
      p_reasons[$_i]="clone 실패"
      printf 'ITEM\t%s\tfailed\tclone 실패\n' "$label"
    fi

  else
    # 대상 경로 존재 — git 저장소인지 확인
    set +e
    "$GIT_BIN" -C "$target" rev-parse --git-dir >/dev/null 2>&1
    _is_git=$?
    set -e

    if [ "$_is_git" -ne 0 ]; then
      # ── 경로 충돌: git 저장소가 아님 (FR-8) ────────────────────────────
      err "대상 경로에 git 저장소가 아닌 항목이 이미 있습니다(덮어쓰기 거부): $target"
      p_statuses[$_i]="failed"
      p_reasons[$_i]="경로 충돌(git 저장소 아님)"
      printf 'ITEM\t%s\tfailed\t경로 충돌(git 저장소 아님)\n' "$label"

    else
      # ── pull — origin 대조 후 갱신 (FR-7) ─────────────────────────────
      set +e
      _origin_url="$(GIT_TERMINAL_PROMPT=0 "$GIT_BIN" -C "$target" remote get-url origin 2>/dev/null)"
      _origin_rc=$?
      set -e

      if [ "$_origin_rc" -ne 0 ] || [ "$_origin_url" != "$url" ]; then
        err "origin URL 불일치: $label"
        err "  기존 origin: $(mask_url "${_origin_url:-<없음>}")"
        err "  선언된 URL : $masked"
        err "  이 저장소는 pull하지 않습니다(기존 저장소 불변)."
        p_statuses[$_i]="failed"
        p_reasons[$_i]="origin 불일치"
        printf 'ITEM\t%s\tfailed\torigin 불일치\n' "$label"

      else
        # 커밋 안 된 변경 확인
        set +e
        _porcelain="$("$GIT_BIN" -C "$target" status --porcelain 2>/dev/null)"
        set -e

        if [ -n "$_porcelain" ]; then
          warn "로컬 변경이 있어 pull을 건너뜁니다(변경은 보존됩니다): $label"
          p_statuses[$_i]="skipped-dirty"
          p_reasons[$_i]="로컬 변경 있음(pull 생략)"
          printf 'ITEM\t%s\tskipped-dirty\t로컬 변경 있음(pull 생략)\n' "$label"

        else
          _stderr_tmp="$(mktemp)"
          set +e
          GIT_TERMINAL_PROMPT=0 \
          GIT_SSH_COMMAND="ssh -oBatchMode=yes" \
          GIT_ALLOW_PROTOCOL="$_git_allow_proto" \
            "$GIT_BIN" -C "$target" pull --ff-only 2>"$_stderr_tmp"
          _rc=$?
          set -e
          _stderr_masked="$(mask_text < "$_stderr_tmp")"
          rm -f "$_stderr_tmp"

          if [ "$_rc" -eq 0 ]; then
            ok "pull 완료: $label"
            p_statuses[$_i]="connected"
            p_reasons[$_i]="pull 성공"
            printf 'ITEM\t%s\tconnected\tpull 성공\n' "$label"
          else
            err "pull 실패: $label"
            [ -n "$_stderr_masked" ] && err "  git 출력: $_stderr_masked"
            p_statuses[$_i]="failed"
            p_reasons[$_i]="pull 실패"
            printf 'ITEM\t%s\tfailed\tpull 실패\n' "$label"
          fi
        fi
      fi
    fi
  fi

  _i=$((_i + 1))
done

# ── 성공 집계 + NOTES_DIR 조립 (FR-10) ──────────────────────────────
_success=0
_fail=0
_notes_dir="localmind=$HOME/.localmind"

_i=0
while [ "$_i" -lt "$_n" ]; do
  _st="${p_statuses[$_i]}"
  case "$_st" in
    connected|skipped-dirty)
      _notes_dir="$_notes_dir,${p_labels[$_i]}=${p_targets[$_i]}"
      _success=$((_success + 1))
      ;;
    failed)
      _fail=$((_fail + 1))
      ;;
  esac
  _i=$((_i + 1))
done

# ── MCP 등록 (FR-11) ─────────────────────────────────────────────────
_register_rc=0
if [ "$_success" -ge 1 ]; then
  say ""
  say "$(b 'MCP 등록') — NOTES_DIR를 조립해 등록합니다."
  warn "주의: 이 명령은 기존 MCP 등록(수동으로 추가한 노트 폴더 포함)을 통째로 재작성합니다."
  warn "      수동 관리 중인 노트 폴더는 NOTES_REPOS에 추가해야 계속 유지됩니다."
  say ""
  printf 'NOTES_DIR\t%s\n' "$_notes_dir"
  say ""
  set +e
  (
    export NOTES_DIR="$_notes_dir"
    eval "$MCP_INSTALL_CMD"
  )
  _register_rc=$?
  set -e
  if [ "$_register_rc" -ne 0 ]; then
    err "MCP 등록 실패 (종료 코드: $_register_rc)"
  fi
fi

# ── 요약 출력 (FR-13) ─────────────────────────────────────────────────
say ""
say "$(b '══ 결과 요약 ══')"
_i=0
while [ "$_i" -lt "$_n" ]; do
  _lb="${p_labels[$_i]}"
  _st="${p_statuses[$_i]}"
  _rs="${p_reasons[$_i]}"
  _mu="$(mask_url "${p_urls[$_i]}")"
  case "$_st" in
    connected)
      ok "$_lb  →  연결됨  ($_mu)"
      ;;
    skipped-dirty)
      warn "$_lb  →  pull 건너뜀(로컬 변경 보존됨)  ($_mu)"
      ;;
    failed)
      err "$_lb  →  실패: $_rs  ($_mu)"
      ;;
    *)
      warn "$_lb  →  알 수 없는 상태: $_st"
      ;;
  esac
  _i=$((_i + 1))
done

say ""
if [ "$_success" -ge 1 ]; then
  ok "최종 NOTES_DIR: $_notes_dir"
fi
[ "$_fail" -gt 0 ] && err "실패한 저장소: ${_fail}개"
[ "$_register_rc" -ne 0 ] && err "MCP 등록에 실패했습니다."
say ""

# ── exit code ─────────────────────────────────────────────────────────
if [ "$_fail" -gt 0 ] || [ "$_register_rc" -ne 0 ]; then
  exit 1
fi
exit 0
