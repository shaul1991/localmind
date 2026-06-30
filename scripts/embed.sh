#!/usr/bin/env bash
# doctor 진단을 '적용'하는 명령 — 이 기기에 맞는 임베딩 엔진으로 스택을 (재)기동한다.
# 호출: make embed [BACKEND=auto|host|gpu|cpu] [DRY_RUN=1]
#   auto(기본): macOS/arm64 → host(Metal) · Linux+NVIDIA → gpu · 그 외 → cpu
# set -e 는 쓰지 않는다 — 사전 점검(미설치 등) 후 직접 안내/exit 하기 위해.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
http() { curl -fsS -m 2 "$1" >/dev/null 2>&1; }
gpu_present() { have nvidia-smi || ls /dev/nvidia0 >/dev/null 2>&1; }

# 선택한 임베딩 라우팅을 .env에 기록 → 다음 'make up'도 같은 엔진을 유지한다.
# (host는 맥이 host.docker.internal을 기본 해석하므로 .env 한 줄로 영속된다.
#  gpu의 deploy override는 .env로 영속 안 됨 — 재기동 땐 make embed BACKEND=gpu, BACKLOG B2)
persist_backend() {
  local env="$DIR/.env" val="$1"
  [ -f "$env" ] || return 0
  if grep -q '^OLLAMA_API_BASE=' "$env" 2>/dev/null; then
    sed -i.bak "s#^OLLAMA_API_BASE=.*#OLLAMA_API_BASE=$val#" "$env" && rm -f "$env.bak"
  else
    printf 'OLLAMA_API_BASE=%s\n' "$val" >> "$env"
  fi
  ok "선택을 .env에 기록 — 다음 'make up'도 이 엔진을 유지합니다."
}

BACKEND="${BACKEND:-auto}"
DRY_RUN="${DRY_RUN:-}"
OS="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"

# ── auto: doctor와 동일한 감지로 백엔드 선택 ──────────────────
if [ "$BACKEND" = "auto" ]; then
  if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then BACKEND="host"
  elif [ "$OS" = "Linux" ] && gpu_present; then BACKEND="gpu"
  else BACKEND="cpu"; fi
  say "$(b '자동 감지')($OS/$ARCH) → 백엔드: $(b "$BACKEND")"
fi

# ── 백엔드별 compose 구성 + 임베딩 라우팅 결정 ────────────────
# OLLAMA_API_BASE를 백엔드 기준으로 '명시' export → .env 잔여값에 휘둘리지 않게.
FILES=(-f docker-compose.yml)
case "$BACKEND" in
  host)
    if ! http "http://localhost:11434/api/tags"; then
      err "호스트 Ollama가 켜져 있지 않아요(:11434 무응답)."
      say "  맥에서 Metal 가속을 쓰려면 호스트에 Ollama를 띄워야 합니다:"
      say "    1) $(b 'brew install ollama')      # 또는 https://ollama.com 앱"
      say "    2) $(b 'ollama serve')             # 새 터미널에서 켜둔 채로"
      say "    3) $(b 'ollama pull bge-m3')       # 임베딩 모델 받기"
      say "  준비되면 다시 $(b 'make embed')."
      exit 1
    fi
    ok "호스트 Ollama 가동 중(:11434)"
    if curl -fsS -m 3 "http://localhost:11434/api/tags" 2>/dev/null | grep -q 'bge-m3'; then
      ok "bge-m3 모델 있음"
    else
      warn "호스트에 bge-m3 가 안 보여요 → 첫 색인 전에 $(b 'ollama pull bge-m3') 권장."
    fi
    FILES+=(-f docker-compose.host.yml)
    export OLLAMA_API_BASE="http://host.docker.internal:11434/v1"
    ;;
  gpu)
    if ! gpu_present; then
      warn "NVIDIA GPU가 안 보여요 → cpu로 진행합니다."
      BACKEND="cpu"; export OLLAMA_API_BASE="http://ollama:11434/v1"
    else
      ok "NVIDIA GPU 감지"
      FILES+=(-f docker-compose.gpu.yml)
      export OLLAMA_API_BASE="http://ollama:11434/v1"
    fi
    ;;
  cpu)
    export OLLAMA_API_BASE="http://ollama:11434/v1"
    ;;
  *)
    err "알 수 없는 BACKEND='$BACKEND' (auto|host|gpu|cpu 중 하나)"; exit 2
    ;;
esac

PROFILES=(--profile gateway --profile memory)
say "→ 백엔드 $(b "$BACKEND") · 임베딩 라우팅 $(b "$OLLAMA_API_BASE")"

# ── DRY_RUN: 실제 기동 없이 병합 구성만 확인 ──────────────────
if [ -n "$DRY_RUN" ]; then
  say "$(b '[DRY_RUN]') 실제 기동 없이 구성만 검증합니다."
  say "  명령: docker compose ${FILES[*]} ${PROFILES[*]} up -d --build"
  say "── 병합 결과(라우팅/GPU 관련 줄) ──"
  docker compose "${FILES[@]}" "${PROFILES[@]}" config 2>/dev/null \
    | grep -nE 'OLLAMA_API_BASE|host.docker.internal|driver: nvidia|capabilities|host-gateway' \
    | sed 's/^/  /' || warn "config 출력에서 관련 줄을 못 찾음(또는 docker 미동작)."
  exit 0
fi

# ── 실제 (재)기동 ─────────────────────────────────────────────
persist_backend "$OLLAMA_API_BASE"
say "→ 컨테이너 (재)기동 중... (처음/이미지 갱신 시 몇 분)"
if docker compose "${FILES[@]}" "${PROFILES[@]}" up -d --build; then
  ok "기동 완료"
else
  err "기동 실패 — '$(b 'make logs')'로 원인 확인."
  exit 1
fi

say ""
say "$(b '다음:')  $(b 'make reindex')   # 기존 노트를 새 엔진으로 재색인(가속 체감)"
say "       $(b 'make doctor')    # 적용 결과 재확인"
exit 0   # 기동 성공 = 0 (프롬프트 ✗ 방지)
