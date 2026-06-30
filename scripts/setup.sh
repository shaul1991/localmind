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
# 로컬 MCP(stdio)용 dist — Docker 스택과 별개로 Cursor/Claude Code 연동에 필요.
if ! have npm; then
  warn "Node(npm)가 안 보여요 — 로컬 MCP를 쓰려면 Node 설치 후 $(b 'make install build')."
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

# ── 4/5 : 연결 점검 (인증·MCP — 강제 X, 제안+선택 실행) ────────
sec "[4/5] 연결 점검 — 강제로 설치하지 않아요. 상태를 보고 명령을 제안합니다."
CTOK="$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2-)"
if [ -n "$CTOK" ]; then
  ok "claude 구독 토큰: 설정됨"
else
  no "claude 구독 토큰: 없음 (claude 백엔드를 쓰려면 브라우저로 1회 발급)"
  cmd "make claude-token"
  if confirm "지금 발급할까요?(브라우저 열림)"; then bash "$DIR/scripts/claude-token.sh"; fi
fi
if [ -e "$HOME/.codex" ]; then
  ok "codex 인증: ~/.codex 있음"
else
  no "codex 인증: 없음 (codex를 쓰려면 호스트에서 로그인)"
  cmd "codex      # 로그인하면 ~/.codex 생성"
fi
if have claude; then
  if claude mcp list 2>/dev/null | grep -q localmind; then
    ok "Claude Code 연동: localmind 등록됨"
  else
    no "Claude Code 연동: 미등록 (Claude Code에서 localmind 도구를 쓰려면)"
    cmd "make mcp-install"
    if confirm "지금 연결할까요?"; then NOTES_DIR="$NOTES_DIR" bash "$DIR/scripts/mcp-install.sh"; fi
  fi
else
  warn "Claude Code(claude) CLI가 안 보여요 — 설치 후 $(b 'make mcp-install')로 연동."
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
say "$(b '🎉 기본 설정 완료!')  바로 써보기:"
cmd "make doctor      # 임베딩 경로 재확인"
cmd "make health      # 엔진 상태"
say "  노트 폴더: $(b "$NOTES_DIR")  — 여기에 .md를 넣거나 대화로 capture하면 쌓여요."
say ""
exit 0   # 모든 단계 통과 = 성공. (중간 점검의 비0이 새어 프롬프트에 ✗로 보이지 않도록 명시)
