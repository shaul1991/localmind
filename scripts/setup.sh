#!/usr/bin/env bash
# localmind 처음 설정 — 비개발자용 단계별 온보딩(최초 1회).
# 호출: make setup        미리보기(아무것도 안 켜고 흐름만): make setup DRY_RUN=1
# 흐름: 준비물 → 진단(doctor) → 임베딩 엔진 켜기(Ollama) → 연결(MCP)·체크리스트.
# great-reduction(2026-07-21): 게이트웨이·백엔드 인증·대시보드 단계 소멸 — 임베딩은 Ollama 직결.
#
# 원칙: 인증/MCP는 '강제로' 설치하지 않는다. 상태를 확인해 ✓/✗로 보여주고, 미충족이면
#       복붙용 명령을 제안한다. 원하면 그 자리에서 대신 실행하되(기본은 '아니오') 강제하지 않는다.
# set -e 미사용 — 일부 점검이 실패해도 끝까지 안내해야 하므로.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
. "$DIR/scripts/lib/read-env.sh"   # read_env_val(비실행 .env 읽기)·mask_url 공용 헬퍼(specs/012)
DRY_RUN="${DRY_RUN:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.localmind}"
NOTES_DIR_FROM_ENV="${NOTES_DIR:-}"
NOTES_DIR="${NOTES_DIR_FROM_ENV:-$HOME/.localmind}"
READINESS_FAILURES=()
READINESS_SKIPPED=()
READINESS_NOTES_PROBE=""
READINESS_EMB_PROBE=""
READINESS_EMB_HEADER=""
READINESS_INDEX_PROBE=""

# readiness가 만드는 민감·임시 파일은 정상 종료뿐 아니라 터미널 중단에도 남기지 않는다.
# Bash 3.2 + set -u에서 빈 배열 확장은 안전하지 않아 현재 파일 하나씩 scalar로 추적한다.
cleanup_readiness_temp() {
  if [ -n "${READINESS_NOTES_PROBE:-}" ]; then
    rm -f -- "$READINESS_NOTES_PROBE" 2>/dev/null || true
    READINESS_NOTES_PROBE=""
  fi
  if [ -n "${READINESS_EMB_PROBE:-}" ]; then
    rm -f -- "$READINESS_EMB_PROBE" 2>/dev/null || true
    READINESS_EMB_PROBE=""
  fi
  if [ -n "${READINESS_EMB_HEADER:-}" ]; then
    rm -f -- "$READINESS_EMB_HEADER" 2>/dev/null || true
    READINESS_EMB_HEADER=""
  fi
  if [ -n "${READINESS_INDEX_PROBE:-}" ]; then
    rm -f -- "$READINESS_INDEX_PROBE" 2>/dev/null || true
    READINESS_INDEX_PROBE=""
  fi
}
trap cleanup_readiness_temp EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
sec()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
cmd()  { printf '      \033[36m%s\033[0m\n' "$*"; }   # 복붙용 제안 명령
have() { command -v "$1" >/dev/null 2>&1; }
readiness_fail() { READINESS_FAILURES+=("$1"); }
readiness_skip() { READINESS_SKIPPED+=("$1"); }
public_http_url() {
  [ -n "${1:-}" ] && have node || return 1
  has_control_chars "$1" && return 1
  printf '%s' "$1" | node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    try {
      const u = new URL(raw);
      if (raw !== raw.trim() || !["http:", "https:"].includes(u.protocol) ||
          u.username || u.password || u.href.includes("?") || u.href.includes("#")) process.exit(1);
    } catch { process.exit(1); }
  ' >/dev/null 2>&1
}

# macOS + Homebrew일 때만 brew 설치 명령을 덤으로 보여준다(그 외 OS/무brew는 URL 안내만).
# brew가 없으면 그 명령이 안 먹으니 조건을 걸어 헛안내를 막는다.
IS_MAC_BREW=""
[ "$(uname -s 2>/dev/null)" = "Darwin" ] && have brew && IS_MAC_BREW=1
brew_hint() { [ -n "$IS_MAC_BREW" ] && cmd "$*"; }

# 예/아니오. 기본은 '아니오'(강제 실행 방지). DRY_RUN·비대화면 자동 아니오.
confirm() {
  local prompt="$1" ans
  if [ -n "$DRY_RUN" ]; then say "    └ $prompt → [미리보기] 실행 안 함"; return 1; fi
  if [ -t 0 ]; then
    read -r -p "    └ $prompt [y/N] " ans || ans=""
    [[ "$ans" =~ ^[Yy] ]]
  else
    say "    └ $prompt → 비대화: 건너뜀(나중에 위 명령으로 직접)"; return 1
  fi
}

say ""
say "$(b 'localmind 처음 설정')을 시작합니다 — 4단계로 차근차근 안내할게요."
[ -n "$DRY_RUN" ] && say "$(b '[미리보기 모드]') 실제로 켜거나 설치하지 않고 흐름만 보여줍니다."
say "  언제든 $(b 'Ctrl+C')로 멈출 수 있어요."

# ── 1/4 : 준비물 ───────────────────────────────────────────────
sec "[1/4] 준비물 점검"
# Docker는 컨테이너 Ollama(cpu/gpu 경로)에만 필요 — 맥에서 호스트 Ollama(brew)를 쓰면 없어도 된다.
if have docker && docker info >/dev/null 2>&1; then
  ok "Docker 실행 중 (컨테이너 Ollama 경로 사용 가능)"
else
  warn "Docker가 없거나 안 켜졌어요 — 괜찮아요: 맥은 호스트 Ollama(brew)로 임베딩이 됩니다."
  say "  컨테이너로 쓰고 싶으면 Docker Desktop 설치·실행 후 다시 $(b 'make setup'):"
  brew_hint "brew install --cask docker-desktop   # 설치 후 Docker Desktop 앱을 한 번 실행"
  cmd "https://www.docker.com/products/docker-desktop"
fi
if [ -f .env ]; then
  ok ".env(설정 파일) 있음"
elif [ -n "$DRY_RUN" ]; then
  warn ".env 없음 — [미리보기]라 생성은 생략"
else
  cp .env.example .env && ok ".env 생성(예시 기본값으로도 동작)"
fi

# endpoint는 공개 base URL 계약이다. URL 자체는 stdin으로만 parser에 전달해 process argv와
# 오류 출력에 userinfo/query/fragment의 자격증명이 노출되지 않게 한다.
EMB_URL_SET="${EMBEDDINGS_URL:-}"
[ -n "$EMB_URL_SET" ] || EMB_URL_SET="$(read_env_val EMBEDDINGS_URL "$DIR/.env" 2>/dev/null)"
EMB_URL_PUBLIC=""
if [ -n "$EMB_URL_SET" ]; then
  if public_http_url "$EMB_URL_SET"; then
    EMB_URL_PUBLIC=1
  else
    no "임베딩 endpoint는 자격증명 없는 공개 http(s) base URL이어야 해요. key는 EMBEDDINGS_KEY에 넣어 주세요."
    readiness_fail "임베딩 endpoint 공개 URL 계약 위반"
  fi
fi
# 로컬 MCP(stdio)용 dist — 특정 MCP client와 무관하게 Node 20+와 빌드는 필수다.
if ! have node; then
  no "Node가 안 보여요 — LocalMind에는 Node 20 이상이 필요해요."
  readiness_fail "Node 20 이상을 확인하지 못함"
  brew_hint "brew install node                  # npm 포함 (설치 후 make setup 다시)"
  say "      $(b 'https://nodejs.org') 에서 LTS를 설치해도 됩니다(설치 후 $(b 'make install build'))."
else
  node_version="$(node --version 2>/dev/null || true)"
  node_major="${node_version#v}"; node_major="${node_major%%.*}"
  if [[ "$node_major" =~ ^[0-9]+$ ]] && [ "$node_major" -ge 20 ]; then
    ok "Node 20 이상 확인됨"
  else
    no "Node 버전이 낮거나 확인되지 않아요 — Node 20 이상이 필요해요."
    readiness_fail "Node 20 이상이 아님"
  fi
fi

if ! have npm; then
  no "npm이 안 보여 의존성 설치와 빌드를 할 수 없어요."
  readiness_fail "npm을 찾지 못함"
  readiness_fail "의존성 설치와 빌드를 완료하지 못함"
elif [ -n "$DRY_RUN" ]; then
  warn "의존성·빌드 — [미리보기]라 생략"
  readiness_skip "npm install과 build 실행"
elif npm install --no-fund --no-audit >/dev/null 2>&1; then
  if npm run --silent build >/dev/null 2>&1; then
    ok "프로그램 준비 완료(dist 빌드)"
  else
    no "프로그램 빌드에 실패했어요 — 오류를 확인한 뒤 다시 실행해 주세요."
    readiness_fail "빌드 실패"
  fi
else
  no "의존성 설치에 실패해 빌드를 완료하지 못했어요."
  readiness_fail "의존성 설치 실패"
  readiness_fail "의존성 설치 실패로 빌드를 완료하지 못함"
fi

# ── 2/4 : 진단 ─────────────────────────────────────────────────
sec "[2/4] 이 기기 살펴보기 (진단)"
say "  $(b 'make doctor')로 이 컴퓨터에 맞는 임베딩 방식을 확인합니다."
# setup 출력에서는 설정 URL 원문을 숨긴다. unsafe URL은 doctor의 HTTP probe에도 넘기지 않는다.
if [ -z "$EMB_URL_SET" ] || [ -n "$EMB_URL_PUBLIC" ]; then
  LOCALMIND_REDACT_EMBEDDINGS_URL=1 bash "$DIR/scripts/doctor.sh" | sed '/다음 단계/,$d'   # doctor의 '다음 단계'는 아래 [3]에서 직접 켜므로 생략
else
  say "  임베딩 endpoint 설정이 안전하지 않아 네트워크 진단을 실행하지 않았어요."
fi

# ── 3/4 : 임베딩 엔진 켜기 ─────────────────────────────────────
sec "[3/4] 임베딩 엔진 켜기"
OS="$(uname -s 2>/dev/null || echo unknown)"; ARCH="$(uname -m 2>/dev/null || echo unknown)"
DEC="cpu"
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
  if curl -fsS -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    DEC="host"; ok "맥 + 호스트 Ollama 가동 → $(b 'Metal 가속(host)')으로 켭니다."
    # brew services로 등록돼 있지 않으면 재시작 후 자동 기동 추천
    if brew services list 2>/dev/null | grep -E '^ollama\s+none' >/dev/null 2>&1; then
      warn "Ollama가 brew services에 등록되지 않아 재시작 후 자동 기동이 안 돼요."
      cmd "brew services start ollama   # 재시작 후 자동 기동 등록"
      if confirm "지금 brew services에 등록할까요?"; then
        brew services start ollama && ok "등록 완료 — 이제 재시작 후에도 자동 기동됩니다." || warn "등록 실패 — 수동으로 위 명령을 실행해 주세요."
      fi
    fi
  else
    warn "맥북은 호스트 Ollama(Metal)로 임베딩이 10~50배 빨라져요 — 지금은 안 켜져 있어요."
    if have ollama; then
      say "  Ollama가 설치됐지만 실행 중이 아닙니다."
      say "  $(b 'brew services start ollama')로 시작하면 재시작 후에도 자동 기동됩니다:"
      cmd "brew services start ollama"
      cmd "ollama pull bge-m3   # 모델이 없으면"
      if confirm "지금 'brew services start ollama'를 실행할까요?"; then
        brew services start ollama
        printf '  Ollama 기동 대기 중'
        for i in $(seq 1 20); do
          curl -fsS -m 1 http://localhost:11434/api/tags >/dev/null 2>&1 && { printf '\n'; ok "Ollama 기동됨"; break; }
          printf '.'; sleep 1
        done
        if ! curl -fsS -m 3 http://localhost:11434/api/tags 2>/dev/null | grep -q 'bge-m3'; then
          warn "bge-m3 모델이 없어요."
          if confirm "지금 받을까요?(수 분 소요)"; then ollama pull bge-m3 && ok "bge-m3 준비 완료"; fi
        fi
        DEC="host"
      else
        DEC="cpu"
        say "  일단 CPU로 진행합니다. 나중에 아래로 가속 가능:"
        cmd "brew services start ollama && ollama pull bge-m3   # .env: EMBEDDINGS_URL=http://localhost:11434/v1"
      fi
    else
      say "  Ollama가 설치되지 않았어요. 설치 후 brew services로 등록하면 재시작 후에도 자동 기동됩니다:"
      cmd "brew install ollama"
      cmd "brew services start ollama   # 재시작 후 자동 기동"
      cmd "ollama pull bge-m3"
      cmd "# 설치 후 .env에 EMBEDDINGS_URL=http://localhost:11434/v1 · EMBEDDINGS_MODEL=bge-m3 · EMBEDDINGS_KEY=dummy"
      DEC="cpu"
      say "  일단 CPU로 시작합니다."
    fi
  fi
elif [ "$OS" = "Linux" ] && { have nvidia-smi || ls /dev/nvidia0 >/dev/null 2>&1; }; then
  DEC="gpu"; ok "Linux + NVIDIA → $(b 'GPU 가속(gpu)')으로 켭니다."
else
  DEC="cpu"; ok "이 기기는 $(b '기본(CPU)')으로 켭니다."
fi
# 엔진 기동 — host(맥 네이티브 Ollama)는 위에서 이미 확인/기동됨. cpu/gpu는 컨테이너 Ollama.
if [ "$DEC" != "host" ]; then
  if [ -n "$DRY_RUN" ]; then
    say "  [미리보기] 컨테이너 Ollama 기동은 생략 — 실제로는: $(b 'docker compose up -d')"
  elif have docker && docker info >/dev/null 2>&1; then
    if [ "$DEC" = "gpu" ]; then
      say "  → $(b 'docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d')"
      docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d || warn "컨테이너 기동 실패 — 'docker compose up -d'로 다시 시도해 주세요."
    else
      say "  → $(b 'docker compose up -d')"
      docker compose up -d || warn "컨테이너 기동 실패 — 'docker compose up -d'로 다시 시도해 주세요."
    fi
  else
    warn "Docker가 없어 컨테이너 Ollama를 못 켰어요 — 맥이면 $(b 'brew install ollama')로 호스트 실행을 권장해요."
  fi
fi
# 준비 확인 — EMBEDDINGS_URL(.env, 기본 http://localhost:11434/v1)의 Ollama 응답을 본다.
EMB_BASE="${EMB_URL_SET:-http://localhost:11434/v1}"; EMB_BASE="${EMB_BASE%/v1}"
if [ -z "$DRY_RUN" ] && { [ -z "$EMB_URL_SET" ] || [ -n "$EMB_URL_PUBLIC" ]; }; then
  case "$EMB_BASE" in
    *11434*)
      printf '  임베딩 엔진 준비 확인 중'
      ready=""
      for i in $(seq 1 15); do
        curl -fsS -m 2 "$EMB_BASE/api/tags" >/dev/null 2>&1 && { ready=1; break; }
        printf '.'; sleep 2
      done
      printf '\n'
      if [ -n "$ready" ]; then
        ok "임베딩 엔진 응답 확인됨"
      else
        warn "임베딩 엔진 응답이 아직 없어요 — 모델 내려받기 중일 수 있어요."
        cmd "make doctor    # 잠시 후 상태 재확인"
      fi
      ;;
    *) say "  설정된 OpenAI 호환 임베딩은 마지막 필수 점검에서 모델까지 확인합니다.";;
  esac
fi

# ── 4/4 : Claude Code 연결 ─────────────────────────────────────
sec "[4/4] Claude Code 연결"
# specs/012 FR-16: NOTES_REPOS(env→.env 비실행 읽기)가 있으면 notes-connect 경로로 분기.
# 값 자체는 화면에 출력하지 않는다(토큰 유출 방지) — 존재/개수만 노출.
NREPOS="${NOTES_REPOS:-}"; [ -z "$NREPOS" ] && NREPOS="$(read_env_val NOTES_REPOS "$DIR/.env")"
if have claude; then
  if [ -n "$NREPOS" ]; then
    ncount="$(printf '%s' "$NREPOS" | tr ',' '\n' | grep -c .)"
    if claude mcp list 2>/dev/null | grep -q localmind; then
      ok "Claude Code 연동: localmind 등록됨 (노트 저장소 ${ncount}곳 선언 — 갱신/재연결 가능)"
    else
      no "Claude Code 연동: 미등록 (노트 저장소 ${ncount}곳 선언)"
    fi
    cmd "make notes-connect"
    if confirm "노트 저장소를 받아와 연결할까요?"; then
      bash "$DIR/scripts/notes-connect.sh" || warn "일부 저장소 연결 실패 — 위 요약을 확인해 주세요."
      # 전부 실패로 여전히 미등록이면 기본 폴더 등록으로 폴백(레거시보다 나빠지지 않게) — FR-16/AC-22
      if ! claude mcp list 2>/dev/null | grep -q localmind; then
        no "아직 미등록입니다(모든 저장소 연결 실패일 수 있어요)."
        cmd "make mcp-install"
        if confirm "우선 기본 노트 폴더($NOTES_DIR)로 등록할까요?"; then NOTES_DIR="$NOTES_DIR" bash "$DIR/scripts/mcp-install.sh"; fi
      fi
    fi
  elif claude mcp list 2>/dev/null | grep -q localmind; then
    ok "Claude Code 연동: localmind 등록됨"
  else
    no "Claude Code 연동: 미등록 (Claude Code에서 localmind 도구를 쓰려면)"
    cmd "make mcp-install"
    if confirm "지금 연결할까요?"; then NOTES_DIR="$NOTES_DIR" bash "$DIR/scripts/mcp-install.sh"; fi
  fi
else
  warn "Claude Code(claude) CLI가 안 보여요 — 설치 후 $(b 'make mcp-install')로 연동."
  brew_hint "brew install claude-code            # 설치 후 make mcp-install"
  [ -n "$NREPOS" ] && say "  (노트 저장소가 선언돼 있어요 — claude 설치 후 $(b 'make notes-connect')로 연결하세요.)"
fi

# ── 마무리 체크리스트 ──────────────────────────────────────────
sec "설치 체크리스트"
NEXT=()
[ -f .env ] && ok ".env 설정" || no ".env 설정"
ok "임베딩 엔진 방식: $DEC"
if have claude && claude mcp list 2>/dev/null | grep -q localmind; then ok "Claude Code 연동"; else no "Claude Code 연동(선택)"; NEXT+=("make mcp-install     # Claude Code 도구 연동"); fi
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then ok "백업 저장소 연결됨"; else no "백업(권장)"; NEXT+=("make backup-init     # 노트 백업 시작"); fi

if [ ${#NEXT[@]} -gt 0 ]; then
  sec "남은 추천 작업 (원할 때 직접)"
  for n in "${NEXT[@]}"; do cmd "$n"; done
fi

# ── 필수 readiness 판정 ────────────────────────────────────────
# Docker·backup·특정 MCP client는 선택이다. 아래 코어 5종만 최종 상태와 exit를 결정한다.
sec "필수 준비 상태"

# 노트 정본 루트: env → .env → 기본값. 명시 root는 존재해야 하며 setup이 대신 만들지 않는다.
# 아무 설정도 없는 첫 사용의 단일 기본 HOME/.localmind만 하위호환으로 생성한다.
READINESS_NOTES="$NOTES_DIR_FROM_ENV"
if [ -z "$READINESS_NOTES" ]; then
  READINESS_NOTES="$(read_env_val NOTES_DIR "$DIR/.env" 2>/dev/null)"
fi
if [ -z "$READINESS_NOTES" ]; then
  READINESS_NOTES="$HOME/.localmind"
  [ -n "$DRY_RUN" ] || mkdir -p "$READINESS_NOTES" >/dev/null 2>&1 || true
fi
if [ -n "$DRY_RUN" ]; then
  readiness_skip "노트 폴더 쓰기 확인"
  warn "노트 폴더 쓰기 확인 — [미리보기]라 생략"
else
  notes_writable=1
  while IFS= read -r notes_spec; do
    notes_spec="$(printf '%s' "$notes_spec" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -n "$notes_spec" ] || continue
    case "$notes_spec" in *=*) notes_root="${notes_spec#*=}";; *) notes_root="$notes_spec";; esac
    notes_root="$(printf '%s' "$notes_root" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    case "$notes_root" in "~/"*) notes_root="$HOME/${notes_root#\~/}";; esac
    probe_file=""
    if [ ! -d "$notes_root" ]; then
      notes_writable=0
      continue
    fi
    probe_file="$(mktemp "$notes_root/.localmind-readiness.XXXXXX" 2>/dev/null || true)"
    READINESS_NOTES_PROBE="$probe_file"
    if [ -z "$probe_file" ]; then
      notes_writable=0
    else
      if rm -f "$probe_file"; then READINESS_NOTES_PROBE=""; fi
    fi
  done <<EOF_NOTES
$(printf '%s' "$READINESS_NOTES" | tr ',' '\n')
EOF_NOTES
  if [ "$notes_writable" -eq 1 ]; then
    ok "노트 폴더 쓰기 가능"
  else
    no "노트 폴더에 쓸 수 없어요 — 경로와 권한을 확인해 주세요."
    readiness_fail "노트 폴더 쓰기 실패"
  fi
fi

# full-flow가 격리 BRAIN_INDEX를 쓰더라도 사용자의 실제 설정이 망가진 상태를 숨기지 않는다.
# 기존 index 파일은 건드리지 않고 부모에 mode-0600 temp를 만들었다 지우는 비파괴 probe만 한다.
READINESS_INDEX_EXPLICIT=""
READINESS_INDEX="${BRAIN_INDEX:-}"
if [ -n "$READINESS_INDEX" ]; then
  READINESS_INDEX_EXPLICIT=1
else
  READINESS_INDEX="$(read_env_val BRAIN_INDEX "$DIR/.env" 2>/dev/null)"
  [ -n "$READINESS_INDEX" ] && READINESS_INDEX_EXPLICIT=1
fi
if [ -z "$READINESS_INDEX" ]; then
  first_notes_spec="${READINESS_NOTES%%,*}"
  first_notes_spec="$(printf '%s' "$first_notes_spec" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  case "$first_notes_spec" in *=*) first_notes_root="${first_notes_spec#*=}";; *) first_notes_root="$first_notes_spec";; esac
  first_notes_root="$(printf '%s' "$first_notes_root" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  case "$first_notes_root" in "~/"*) first_notes_root="$HOME/${first_notes_root#\~/}";; esac
  READINESS_INDEX="$first_notes_root/.brain-index.json"
fi
if [ -n "$DRY_RUN" ]; then
  readiness_skip "색인 저장 위치 쓰기 확인"
  warn "색인 저장 위치 쓰기 확인 — [미리보기]라 생략"
else
  index_writable=1
  case "$READINESS_INDEX" in "~/"*) READINESS_INDEX="$HOME/${READINESS_INDEX#\~/}";; esac
  index_parent="$(dirname "$READINESS_INDEX")"
  if [ -d "$READINESS_INDEX" ] || { [ ! -d "$index_parent" ] && { [ -z "$READINESS_INDEX_EXPLICIT" ] || ! mkdir -p "$index_parent" >/dev/null 2>&1; }; }; then
    index_writable=0
  else
    previous_umask="$(umask)"
    umask 077
    index_probe_file="$(mktemp "$index_parent/.localmind-index-readiness.XXXXXX" 2>/dev/null || true)"
    READINESS_INDEX_PROBE="$index_probe_file"
    umask "$previous_umask"
    if [ -z "$index_probe_file" ]; then
      index_writable=0
    elif rm -f "$index_probe_file"; then
      READINESS_INDEX_PROBE=""
    else
      index_writable=0
    fi
  fi
  if [ "$index_writable" -eq 1 ]; then
    ok "색인 저장 위치 쓰기 가능"
  else
    no "색인 저장 위치를 준비할 수 없어요 — BRAIN_INDEX 설정과 부모 폴더 권한을 확인해 주세요."
    readiness_fail "색인 저장 위치 쓰기 실패"
  fi
fi

# 설정한 endpoint/model로 실제 OpenAI-compatible embeddings 요청을 보낸다.
EMB_MODEL_SET="${EMBEDDINGS_MODEL:-}"
[ -n "$EMB_MODEL_SET" ] || EMB_MODEL_SET="$(read_env_val EMBEDDINGS_MODEL "$DIR/.env" 2>/dev/null)"
EMB_KEY_SET="${EMBEDDINGS_KEY:-}"
[ -n "$EMB_KEY_SET" ] || EMB_KEY_SET="$(read_env_val EMBEDDINGS_KEY "$DIR/.env" 2>/dev/null)"
if [ -n "$DRY_RUN" ]; then
  readiness_skip "임베딩 endpoint/model 확인"
  warn "임베딩 endpoint/model 확인 — [미리보기]라 생략"
elif [ -z "$EMB_URL_SET" ] || [ -z "$EMB_MODEL_SET" ] || [ -z "$EMB_KEY_SET" ]; then
  no "임베딩 endpoint·model·key 설정을 모두 확인해 주세요."
  readiness_fail "임베딩 endpoint/model 설정 확인 실패"
elif [ -z "$EMB_URL_PUBLIC" ]; then
  no "임베딩 endpoint 공개 URL 계약을 통과하지 못해 요청을 보내지 않았어요."
  readiness_fail "임베딩 endpoint/model 확인 실패"
elif ! have curl; then
  no "임베딩 확인에 필요한 curl이 없어요."
  readiness_fail "임베딩 endpoint/model 확인 실패"
else
  emb_probe_file="$(mktemp "${TMPDIR:-/tmp}/localmind-embedding-probe.XXXXXX" 2>/dev/null || true)"
  READINESS_EMB_PROBE="$emb_probe_file"
  # 인증 key를 curl argv에 넣지 않는다. mode 0600 임시 header file로 전달하고 즉시 지운다.
  previous_umask="$(umask)"
  umask 077
  emb_header_file="$(mktemp "${TMPDIR:-/tmp}/localmind-embedding-header.XXXXXX" 2>/dev/null || true)"
  READINESS_EMB_HEADER="$emb_header_file"
  umask "$previous_umask"
  emb_header_ready=""
  if [ -n "$emb_header_file" ] && printf 'Authorization: Bearer %s\n' "$EMB_KEY_SET" > "$emb_header_file"; then
    emb_header_ready=1
  fi
  emb_model_json="$(printf '%s' "$EMB_MODEL_SET" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  if [ -n "$emb_probe_file" ] && [ -n "$emb_header_ready" ] && \
    curl -fsS -m 10 -o "$emb_probe_file" \
      -H 'Content-Type: application/json' -H "@$emb_header_file" \
      -d "{\"model\":\"$emb_model_json\",\"input\":[\"localmind readiness\"]}" \
      "${EMB_URL_SET%/}/embeddings" >/dev/null 2>&1 && \
    node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const d=j?.data;if(!Array.isArray(d)||d.length!==1)process.exit(1);const r=d[0];if(r===null||typeof r!=="object"||Array.isArray(r)||r.index!==0||!Array.isArray(r.embedding)||r.embedding.length===0||!r.embedding.every((v)=>typeof v==="number"&&Number.isFinite(v)&&Number.isFinite(Math.fround(v))))process.exit(1)' \
      "$emb_probe_file" >/dev/null 2>&1; then
    ok "설정한 임베딩 endpoint/model 응답 확인됨"
  else
    no "설정한 임베딩 endpoint/model 확인에 실패했어요. 설정과 엔진 상태를 확인해 주세요."
    readiness_fail "임베딩 endpoint/model 확인 실패"
  fi
  if [ -z "$emb_probe_file" ] || rm -f "$emb_probe_file"; then READINESS_EMB_PROBE=""; fi
  if [ -z "$emb_header_file" ] || rm -f "$emb_header_file"; then READINESS_EMB_HEADER=""; fi
fi

# 외부 client 등록 여부가 아니라 실제 사용자 NOTES_DIR identity와 격리 full-flow를 차례로 확인한다.
SMOKE_EXPECTED_LABELS=""
if have node; then
  SMOKE_EXPECTED_LABELS="$(NOTES_DIR="$READINESS_NOTES" node -e '
    const path=require("path");
    const raw=(process.env.NOTES_DIR||path.join(process.env.HOME||".",".localmind")).trim();
    const specs=raw.split(",").map((s)=>s.trim()).filter(Boolean).map((spec,order)=>{
      const eq=spec.indexOf("=");
      let baseLabel=eq>0?spec.slice(0,eq).trim():"";
      const rawPath=eq>0?spec.slice(eq+1).trim():spec;
      const expanded=rawPath.startsWith("~")?path.join(process.env.HOME||".",rawPath.slice(1)):rawPath;
      const dir=path.resolve(expanded);
      if(!baseLabel) baseLabel=path.basename(dir).replace(/^\.+/,"")||"notes";
      return {baseLabel,dir,order};
    });
    const reservations=new Set(specs.map(({baseLabel})=>baseLabel));
    const used=new Set(), assigned=new Map();
    const canonical=[...specs].sort((a,b)=>a.baseLabel.localeCompare(b.baseLabel)||a.dir.localeCompare(b.dir)||a.order-b.order);
    for(const candidate of canonical){
      let label=candidate.baseLabel;
      for(let n=2;used.has(label)||(label!==candidate.baseLabel&&reservations.has(label));n++){
        label=`${candidate.baseLabel}-${n}`;
      }
      used.add(label);
      assigned.set(candidate.order,label);
    }
    const labels=specs.map(({order})=>assigned.get(order)).map((label)=>/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(label)?label:"unknown");
    process.stdout.write([...new Set(labels.length?labels:["notes"])].join(","));
  ' 2>/dev/null || true)"
fi
if [ -n "$DRY_RUN" ]; then
  readiness_skip "MCP tools/list와 whoami 확인"
  warn "MCP tools/list와 whoami 확인 — [미리보기]라 생략"
elif have npm && env -u LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST -u LOCALMIND_SMOKE_ALLOW_TEST_ENTRY \
  NOTES_DIR="$READINESS_NOTES" LOCALMIND_SMOKE_EXPECTED_LABELS="$SMOKE_EXPECTED_LABELS" \
  npm run --silent smoke:mcp >/dev/null 2>&1; then
  ok "MCP tools/list와 whoami 확인됨"
else
  no "MCP 필수 도구(tools/list·whoami) 확인에 실패했어요."
  readiness_fail "MCP tools/list와 whoami 확인 실패"
fi

if [ -n "$DRY_RUN" ]; then
  readiness_skip "MCP 격리 full-flow 확인"
  warn "MCP 격리 full-flow 확인 — [미리보기]라 생략"
elif [ -z "$EMB_URL_PUBLIC" ] || [ -z "$EMB_MODEL_SET" ] || [ -z "$EMB_KEY_SET" ]; then
  no "임베딩 설정이 안전·완전하지 않아 MCP 격리 full-flow를 실행하지 않았어요."
  readiness_fail "MCP 격리 full-flow 확인 실패"
elif have npm && env -u LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST -u LOCALMIND_SMOKE_ALLOW_TEST_ENTRY \
  EMBEDDINGS_URL="$EMB_URL_SET" EMBEDDINGS_MODEL="$EMB_MODEL_SET" EMBEDDINGS_KEY="$EMB_KEY_SET" \
  LOCALMIND_SMOKE_FULL_FLOW=1 npm run --silent smoke:mcp >/dev/null 2>&1; then
  ok "MCP 격리 capture·search·brief full-flow 확인됨"
else
  no "MCP 격리 capture·search·brief full-flow 확인에 실패했어요."
  readiness_fail "MCP 격리 full-flow 확인 실패"
fi

if [ ${#READINESS_FAILURES[@]} -gt 0 ]; then
  no "readiness: failed — 필수 준비가 끝나지 않았어요."
  for reason in "${READINESS_FAILURES[@]}"; do say "    - $reason"; done
  say "  위 항목을 해결한 뒤 다시 $(b 'make setup')을 실행해 주세요."
  exit 1
elif [ ${#READINESS_SKIPPED[@]} -gt 0 ]; then
  warn "readiness: partial — 미리보기라 실제 검증을 생략했어요."
  for reason in "${READINESS_SKIPPED[@]}"; do say "    - 생략: $reason"; done
  say "  실제 준비 상태는 $(b 'make setup')으로 확인해 주세요."
  exit 0
else
  ok "readiness: ready — LocalMind 코어를 사용할 준비가 됐어요."
fi

say ""
say "$(b '🎉 기본 설정 완료!')"
say ""
say "$(b '🎓 다음: 첫 사용 튜토리얼 (5분)') — MCP 연결 → 첫 노트(Live-Verify) 적재 → 찾아보기"
say "   👉 $(b 'docs/tutorial.md') 를 따라 하세요 (GitHub에서 열어봐도 됩니다)."
say ""
say "바로 확인해볼 것:"
cmd "make doctor      # 임베딩 경로 재확인"
cmd "make health      # 엔진 상태"
say "  설정한 노트 폴더에 .md를 넣거나 대화로 capture하면 쌓여요."
say ""
say "$(b '🚀 임베딩 최적화 (ollama)') — 지금 엔진: $(b "${DEC:-cpu}")"
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
  # Apple Silicon: ollama가 Metal(GPU) 가속을 자동 사용 → host가 CPU보다 훨씬 빠름.
  if [ "${DEC:-cpu}" != "host" ]; then
    say "  Apple Silicon Mac은 $(b 'host ollama + Metal 가속')이 CPU보다 훨씬 빠릅니다. 준비되면 전환:"
    cmd "brew services start ollama && ollama pull bge-m3   # .env: EMBEDDINGS_URL=http://localhost:11434/v1"
  else
    say "  이미 host(Metal 가속) 사용 중 — 최적입니다."
  fi
elif [ "$OS" = "Darwin" ]; then
  # Intel Mac: ollama는 Metal(GPU) 가속을 지원하지 않음(2026 기준) → 임베딩은 CPU로 동작.
  say "  $(b 'Intel Mac은 ollama의 Metal(GPU) 가속을 쓸 수 없어요') — 임베딩은 CPU로 동작합니다."
  say "  임베딩은 가벼운 연산이라 실사용엔 무리 없어요(무거운 AI 생성은 claude/codex/gemini 클라우드 몫)."
else
  say "  컨테이너 Ollama 재기동은 $(b 'docker compose up -d'), 상태 재확인은 $(b 'make doctor')."
fi
say ""
exit 0   # 모든 단계 통과 = 성공. (중간 점검의 비0이 새어 프롬프트에 ✗로 보이지 않도록 명시)
