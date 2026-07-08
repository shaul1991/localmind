#!/usr/bin/env bash
# localmind 처음 설정 — 비개발자용 단계별 온보딩(최초 1회).
# 호출: make setup        미리보기(아무것도 안 켜고 흐름만): make setup DRY_RUN=1
# 흐름: 준비물 → 진단(doctor) → 임베딩 엔진 켜기(embed) → 연결 점검(인증·MCP) → 체크리스트.
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
NOTES_DIR="${NOTES_DIR:-$HOME/.localmind}"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
sec()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
cmd()  { printf '      \033[36m%s\033[0m\n' "$*"; }   # 복붙용 제안 명령
have() { command -v "$1" >/dev/null 2>&1; }

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
say "$(b 'localmind 처음 설정')을 시작합니다 — 5단계로 차근차근 안내할게요."
[ -n "$DRY_RUN" ] && say "$(b '[미리보기 모드]') 실제로 켜거나 설치하지 않고 흐름만 보여줍니다."
say "  언제든 $(b 'Ctrl+C')로 멈출 수 있어요."

# ── 1/5 : 준비물 ───────────────────────────────────────────────
sec "[1/5] 준비물 점검"
if have docker && docker info >/dev/null 2>&1; then
  ok "Docker 실행 중"
else
  no "Docker가 없거나 아직 안 켜졌어요."
  say "  Docker Desktop을 설치·실행한 뒤 다시 $(b 'make setup'):"
  brew_hint "brew install --cask docker-desktop   # 설치 후 Docker Desktop 앱을 한 번 실행"
  cmd "https://www.docker.com/products/docker-desktop"
  [ -z "$DRY_RUN" ] && exit 1
fi
if [ -f .env ]; then
  ok ".env(설정 파일) 있음"
elif [ -n "$DRY_RUN" ]; then
  warn ".env 없음 — [미리보기]라 생성은 생략"
else
  cp .env.example .env && ok ".env 생성(예시 기본값으로도 동작)"
fi
# specs/014 — 게이트웨이 키 자동 생성: docker-compose가 LITELLM_MASTER_KEY를 필수(:?)로
# 요구하므로, 비어 있으면 여기서 채워야 첫 `make setup`의 docker compose가 실패하지 않는다
# (make init-env와 동일 로직 — 멱등, 이미 값 있으면 무변경).
[ -z "$DRY_RUN" ] && [ -f .env ] && bash "$DIR/scripts/ensure-master-key.sh" .env
# 로컬 MCP(stdio)용 dist — Docker 스택과 별개로 Cursor/Claude Code 연동에 필요.
if ! have npm; then
  warn "Node(npm)가 안 보여요 — 로컬 MCP와 웹 대시보드($(b 'make ui'))에 Node가 필요해요."
  brew_hint "brew install node                  # npm 포함 (설치 후 make setup 다시)"
  say "      $(b 'https://nodejs.org') 에서 LTS를 설치해도 됩니다(설치 후 $(b 'make install build'))."
elif [ -n "$DRY_RUN" ]; then
  warn "의존성·빌드 — [미리보기]라 생략"
elif npm install --no-fund --no-audit >/dev/null 2>&1 && npm run --silent build >/dev/null 2>&1; then
  ok "프로그램 준비 완료(dist 빌드)"
else
  warn "설치/빌드 일부 실패 — 나중에 $(b 'make install build')로 확인"
fi

# ── 2/5 : 진단 ─────────────────────────────────────────────────
sec "[2/5] 이 기기 살펴보기 (진단)"
say "  $(b 'make doctor')로 이 컴퓨터에 맞는 임베딩 방식을 확인합니다."
bash "$DIR/scripts/doctor.sh" | sed '/다음 단계/,$d'   # doctor의 '다음 단계'는 아래 [3]에서 직접 켜므로 생략

# ── 3/5 : 임베딩 엔진 켜기 ─────────────────────────────────────
sec "[3/5] 임베딩 엔진 켜기"
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
        cmd "brew services start ollama && ollama pull bge-m3 && make embed BACKEND=host"
      fi
    else
      say "  Ollama가 설치되지 않았어요. 설치 후 brew services로 등록하면 재시작 후에도 자동 기동됩니다:"
      cmd "brew install ollama"
      cmd "brew services start ollama   # 재시작 후 자동 기동"
      cmd "ollama pull bge-m3"
      cmd "make embed BACKEND=host      # 설치 후 Metal 가속으로 전환"
      DEC="cpu"
      say "  일단 CPU로 시작합니다."
    fi
  fi
elif [ "$OS" = "Linux" ] && { have nvidia-smi || ls /dev/nvidia0 >/dev/null 2>&1; }; then
  DEC="gpu"; ok "Linux + NVIDIA → $(b 'GPU 가속(gpu)')으로 켭니다."
else
  DEC="cpu"; ok "이 기기는 $(b '기본(CPU)')으로 켭니다."
fi
say "  → $(b "make embed BACKEND=$DEC")"
BACKEND="$DEC" DRY_RUN="$DRY_RUN" bash "$DIR/scripts/embed.sh"
if [ -z "$DRY_RUN" ]; then
  printf '  준비 상태 확인 중'
  for i in $(seq 1 60); do
    g="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health/liveliness 2>/dev/null || echo 000)"
    [ "$g" = "200" ] && { printf '\n'; ok "엔진 준비됨 (:4000)"; break; }
    printf '.'; sleep 3
  done
fi

# .env 값 설정(있으면 교체, 없으면 추가). sed는 macOS/GNU 비호환 → awk+temp. 값의 특수문자 안전.
set_env_val() {
  local key="$1" val="$2" f="$DIR/.env" tmp
  [ -f "$f" ] || return 1
  if grep -qE "^${key}=" "$f"; then
    tmp="$(mktemp)"
    KEY="$key" VAL="$val" awk -F= '$1==ENVIRON["KEY"]{print ENVIRON["KEY"]"="ENVIRON["VAL"]; next} {print}' "$f" > "$tmp" && mv "$tmp" "$f"
  else
    printf '%s=%s\n' "$key" "$val" >> "$f"
  fi
}

# 백엔드별 인증 안내/설정(주·부 공용). $1 = claude|codex|gemini
setup_backend_auth() {
  local be="$1" gk="" GKEY="" CT
  case "$be" in
    claude)
      CT="$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
      if [ -n "$CT" ]; then ok "claude 구독 토큰: 이미 설정됨"; return 0; fi
      no "claude 구독 토큰이 없어요 — 브라우저로 1회 발급합니다."
      cmd "make claude-token"
      if confirm "지금 claude 로그인(토큰 발급)할까요? (브라우저 열림)"; then bash "$DIR/scripts/claude-token.sh"; fi
      ;;
    codex)
      if [ -e "$HOME/.codex" ]; then ok "codex 인증: ~/.codex 있음(로그인됨)"; return 0; fi
      no "codex 인증이 없어요 — codex CLI로 ChatGPT 로그인이 필요해요."
      if have codex; then
        cmd "codex      # 실행 후 'Sign in with ChatGPT' 선택 → ~/.codex 생성"
        say "  ChatGPT 구독(Plus/Pro 등)으로 로그인하면 됩니다(추가 요금 없음)."
      else
        say "  codex CLI 설치: $(b 'npm i -g @openai/codex') → $(b 'codex')로 로그인."
      fi
      ;;
    gemini)
      GKEY="$(read_env_val GEMINI_API_KEY "$DIR/.env" 2>/dev/null)"
      if [ -n "$GKEY" ]; then ok "Gemini API 키: 이미 설정됨"; return 0; fi
      no "Gemini API 키가 없어요."
      say "  키 발급(무료): $(b 'https://aistudio.google.com/apikey')"
      if [ -t 0 ] && [ -z "$DRY_RUN" ]; then
        read -r -p "    └ Gemini API 키를 붙여넣으세요(엔터=건너뛰기): " gk || gk=""
        if [ -n "$gk" ]; then set_env_val GEMINI_API_KEY "$gk" && ok "Gemini API 키 저장됨(.env)"; fi
      else
        cmd ".env의 GEMINI_API_KEY= 에 키를 넣으세요"
      fi
      ;;
  esac
}

# ── 4/5 : 백엔드 설정 (주 백엔드 선택 → 인증, 부 백엔드는 선택 추가) ────────
sec "[4/5] 백엔드 설정 — 주 백엔드를 고르고, 원하면 부 백엔드도 추가합니다(강제 X)."
say "$(b '주 백엔드를 고르세요') — 모델명 없이 보낸 요청이 이 백엔드로 갑니다(나중에 바꿀 수 있어요)."
say "  1) Claude   (claude 구독)"
say "  2) ChatGPT  (codex / OpenAI 구독)"
say "  3) Gemini   (Google · API 키)"
primary="claude"; pick=""
if [ -t 0 ] && [ -z "$DRY_RUN" ]; then
  read -r -p "    └ 선택 [1/2/3, 기본 1]: " pick || pick=""
  case "$pick" in 2) primary="codex" ;; 3) primary="gemini" ;; *) primary="claude" ;; esac
else
  say "    └ [비대화/미리보기] 기본값 claude로 진행"
fi
if [ -z "$DRY_RUN" ]; then
  set_env_val DEFAULT_BACKEND "$primary" && ok "주 백엔드: $(b "$primary")  (.env의 DEFAULT_BACKEND)"
else
  say "  [미리보기] 주 백엔드=$(b "$primary") — DEFAULT_BACKEND 기록은 실행 안 함"
fi
setup_backend_auth "$primary"

# 부(보조) 백엔드 — 주 설정 완료 후 부가적으로(선택). 자동 폴백 아님: gemini:/gpt: 등 모델명으로 골라 씀.
say ""
if confirm "부(보조) 백엔드도 설정할까요? (선택 — 모델명으로 골라 쓸 수 있어요)"; then
  rem=""
  [ "$primary" != claude ] && rem="$rem claude"
  [ "$primary" != codex ]  && rem="$rem codex"
  [ "$primary" != gemini ] && rem="$rem gemini"
  rem="${rem# }"
  say "  부 백엔드 후보:"
  i=1; for o in $rem; do say "    $i) $o"; i=$((i+1)); done
  spick=""; read -r -p "    └ 선택 [번호, 엔터=건너뛰기]: " spick || spick=""
  case "$spick" in (''|*[!0-9]*) spick=0 ;; esac
  sec_be=""; j=1
  for o in $rem; do [ "$j" = "$spick" ] && sec_be="$o"; j=$((j+1)); done
  if [ -n "$sec_be" ]; then
    say "  부 백엔드: $(b "$sec_be") 인증을 설정합니다(기본값은 그대로 $(b "$primary"))."
    setup_backend_auth "$sec_be"
  else
    say "  부 백엔드는 건너뜁니다 — 나중에 make setup을 다시 돌리면 추가할 수 있어요."
  fi
fi
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

# ── 5/5 : 마무리 체크리스트 ────────────────────────────────────
sec "[5/5] 설치 체크리스트"
CTOK="$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
OAB="$(grep -E '^OLLAMA_API_BASE=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
NEXT=()
docker info >/dev/null 2>&1 && ok "Docker 실행" || { no "Docker 실행"; NEXT+=("Docker Desktop 켜기"); }
[ -f .env ] && ok ".env 설정" || no ".env 설정"
ok "임베딩 엔진: $DEC  (${OAB:-기본})"
[ -n "$CTOK" ] && ok "claude 토큰" || { no "claude 토큰(선택)"; NEXT+=("make claude-token   # claude 구독 연결"); }
[ -e "$HOME/.codex" ] && ok "codex 인증(~/.codex)" || { no "codex 인증(선택)"; NEXT+=("codex                # codex 로그인"); }
if have claude && claude mcp list 2>/dev/null | grep -q localmind; then ok "Claude Code 연동"; else no "Claude Code 연동(선택)"; NEXT+=("make mcp-install     # Claude Code 도구 연동"); fi
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then ok "백업 저장소 연결됨"; else no "백업(권장)"; NEXT+=("make backup-init     # 노트·메모리 백업 시작"); fi

if [ ${#NEXT[@]} -gt 0 ]; then
  sec "남은 추천 작업 (원할 때 직접)"
  for n in "${NEXT[@]}"; do cmd "$n"; done
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
say "  노트 폴더: $(b "$NOTES_DIR")  — 여기에 .md를 넣거나 대화로 capture하면 쌓여요."
say ""
say "$(b '🚀 임베딩 최적화 (ollama)') — 지금 엔진: $(b "${DEC:-cpu}")"
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
  # Apple Silicon: ollama가 Metal(GPU) 가속을 자동 사용 → host가 CPU보다 훨씬 빠름.
  if [ "${DEC:-cpu}" != "host" ]; then
    say "  Apple Silicon Mac은 $(b 'host ollama + Metal 가속')이 CPU보다 훨씬 빠릅니다. 준비되면 전환:"
    cmd "brew services start ollama && ollama pull bge-m3 && make embed BACKEND=host"
  else
    say "  이미 host(Metal 가속) 사용 중 — 최적입니다."
  fi
elif [ "$OS" = "Darwin" ]; then
  # Intel Mac: ollama는 Metal(GPU) 가속을 지원하지 않음(2026 기준) → 임베딩은 CPU로 동작.
  say "  $(b 'Intel Mac은 ollama의 Metal(GPU) 가속을 쓸 수 없어요') — 임베딩은 CPU로 동작합니다."
  say "  임베딩은 가벼운 연산이라 실사용엔 무리 없어요(무거운 AI 생성은 claude/codex/gemini 클라우드 몫)."
else
  say "  엔진 변경은 $(b 'make embed BACKEND=host|gpu|cpu'), 상태 재확인은 $(b 'make doctor')."
fi
say ""
# 비개발자 편의(A안): 설치 직후 바로 대시보드를 열어준다 — 사용자는 아무것도 안 침.
# UI는 포그라운드로 뜨고(Ctrl+C로 종료), 브라우저는 ui.sh가 자동으로 연다.
# confirm은 DRY_RUN·비대화형에서 자동 skip하므로 스크립트/CI를 막지 않는다.
if ! have npm; then
  # 대시보드는 Node 서버라 npm이 있어야 열린다. 없으면 프롬프트로 유도했다가 실패하지 말고 안내만.
  say "  $(b '웹 대시보드는 Node.js가 있어야 열 수 있어요') — 지금은 npm이 안 보여요."
  say "  Node.js(LTS · 버전 20 이상) 설치 후 $(b 'make ui')로 열 수 있어요:"
  cmd "https://nodejs.org      # LTS 설치 (macOS는 brew install node 도 가능)"
elif confirm "지금 웹 대시보드(모니터링 UI)를 열어볼까요? — 브라우저가 자동으로 열려요"; then
  say "  $(b '대시보드를 엽니다')… 닫으려면 이 터미널에서 $(b 'Ctrl+C') 하세요."
  say "  (이 터미널은 대시보드가 점유해요 — 명령을 더 쓰려면 터미널 창을 하나 더 열거나,"
  say "   백그라운드로 열려면 나중에 $(b 'make ui-bg') 를 쓰세요.)"
  bash "$DIR/scripts/ui.sh" || true   # Ctrl+C(130)가 아래 exit 0을 덮지 않도록
else
  say "  나중에 대시보드를 열려면: $(b 'make ui')  (백그라운드로는 $(b 'make ui-bg'))"
fi

say ""
exit 0   # 모든 단계 통과 = 성공. (중간 점검의 비0이 새어 프롬프트에 ✗로 보이지 않도록 명시)
