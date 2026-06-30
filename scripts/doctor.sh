#!/usr/bin/env bash
# localmind 환경 진단 — 이 기기에서 임베딩(노트 색인)이 "어디서·무엇으로" 도는지 점검하고
# 더 빠른 구성을 안내한다. 읽기 전용 — 아무것도 바꾸지 않는다.
# 호출: make doctor
# set -e 는 일부러 쓰지 않는다 — 일부 점검이 실패(미설치 등)해도 끝까지 진단해야 하므로.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }
# 한글(CJK) 라벨 정렬: printf %-Ns 는 바이트 기준이라 한글이 어긋난다.
# 표시폭(한글=2, ASCII=1)을 직접 계산해 콜론을 정렬한다.
row() {
  local label="$1" val="$2" target=15 ascii pad w
  ascii="${label//[^ -~]/}"                       # 인쇄가능 ASCII만 남김
  w=$(( ${#ascii} + (${#label} - ${#ascii}) * 2 )) # ASCII 1폭 + 비ASCII 2폭
  pad=$(( target - w )); (( pad < 0 )) && pad=0
  printf '  %s%*s : %s\n' "$label" "$pad" '' "$val"
}
have() { command -v "$1" >/dev/null 2>&1; }
http() { curl -fsS -m 2 "$1" >/dev/null 2>&1; } # 2초 타임아웃, 무응답이면 실패

OS="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"

# ── 기기/칩 ────────────────────────────────────────────────────
# accel: 이 기기에서 임베딩을 GPU로 돌릴 '잠재력'(none|metal|cuda)
accel="none"; accel_note=""; chip=""
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) chip="Apple Silicon"; accel="metal"
             accel_note="Metal GPU 가속 가능 — 단, 호스트 네이티브 Ollama로만 (macOS Docker는 Apple GPU 접근 불가)";;
      *)     chip="Intel"
             accel_note="Intel Mac — 임베딩은 사실상 CPU";;
    esac
    platform="macOS / $ARCH${chip:+ ($chip)}";;
  Linux)
    platform="Linux / $ARCH"
    if have nvidia-smi || ls /dev/nvidia0 >/dev/null 2>&1; then
      accel="cuda"; accel_note="NVIDIA GPU 감지 — Docker에 GPU 지정 시 가속 가능"
    else
      accel_note="GPU 미감지 — CPU 임베딩 (NVIDIA GPU 추가 시 가속 여지)"
    fi;;
  *) platform="$OS / $ARCH"; accel_note="알 수 없는 플랫폼 — CPU 가정";;
esac

# ── Docker ─────────────────────────────────────────────────────
docker_state="✗ 없음"
if have docker; then
  if docker info >/dev/null 2>&1; then docker_state="✓ 실행 중"; else docker_state="! 설치됨(미실행)"; fi
fi

# ── 호스트 네이티브 Ollama (Docker 밖) ─────────────────────────
host_ollama="✗ 미설치"
if have ollama; then
  if http "http://localhost:11434/api/tags"; then host_ollama="✓ 가동 중 (:11434)"; else host_ollama="! 설치됨(미가동)"; fi
fi

# ── 현재 임베딩 라우팅 ─────────────────────────────────────────
# litellm.config.yaml(직접 하드코딩) 또는 .env(OLLAMA_API_BASE) 중 하나에
# host.docker.internal 이 있으면 호스트 모드로 판정한다.
route="docker"; route_label="Docker Ollama (litellm:4000 → ollama:11434)"
if grep -q 'host.docker.internal' "$DIR/litellm.config.yaml" 2>/dev/null || \
   grep -q 'host.docker.internal' "$DIR/.env" 2>/dev/null; then
  route="host"; route_label="호스트 Ollama (litellm:4000 → host.docker.internal:11434)"
fi

# 실효 백엔드(지금 임베딩이 실제로 도는 형태) 판정
if [ "$route" = "host" ]; then
  if [ "$accel" = "metal" ]; then effective="호스트 Ollama → Metal GPU (빠름)"
  elif [ "$accel" = "cuda" ]; then effective="호스트 Ollama → NVIDIA GPU (빠름)"
  else effective="호스트 Ollama → CPU"; fi
else
  effective="Docker Ollama → CPU (청크당 약 1~4초)"
fi

# 임베딩 엔드포인트 살아있나
emb_up="✗ 응답 없음 (:4000) — 스택 미기동?"
if http "http://127.0.0.1:4000/health/liveliness"; then emb_up="✓ 응답 (:4000)"; fi

# ── 출력 ───────────────────────────────────────────────────────
say ""
say "$(b '== localmind 환경 진단 (make doctor) ==')"

head "[이 기기]"
row "OS / 칩"   "$platform"
row "Docker"    "$docker_state"

head "[임베딩 엔진]  ← 노트 색인(인덱싱) 속도를 좌우"
row "현재 라우팅"  "$route_label"
row "실효 백엔드"  "$effective"
row "이 기기 잠재력" "$accel_note"
row "호스트 Ollama" "$host_ollama"
row "엔드포인트"    "$emb_up"

# ── 권장 ───────────────────────────────────────────────────────
head "[권장]"
if [ "$OS" = "Darwin" ] && [ "$accel" = "metal" ]; then
  if [ "$route" = "host" ] && [ "${host_ollama#✓}" != "$host_ollama" ]; then
    say "  ✓ 최적 구성입니다 — 호스트 Ollama(Metal)로 임베딩 중."
  else
    say "  $(b '맥북의 GPU(Metal)를 살리면 임베딩이 10~50배 빨라집니다.')"
    say "  지금은 Docker 안에서 CPU로 돌아 가장 큰 장점을 못 쓰는 상태예요."
    say ""
    say "    1) $(b 'brew install ollama')        # 호스트에 네이티브 설치(또는 Ollama.app)"
    say "    2) $(b 'ollama serve')               # 새 터미널에 켜둔 채로"
    say "    3) $(b 'ollama pull bge-m3')         # 임베딩 모델 받기"
    say "    4) $(b 'make embed BACKEND=host')    # 임베딩을 호스트(Metal)로 전환"
  fi
elif [ "$OS" = "Linux" ] && [ "$accel" = "cuda" ]; then
  say "  NVIDIA GPU가 있습니다 — $(b 'make embed BACKEND=gpu')로 Docker Ollama를 GPU 가속."
  say "  (nvidia-container-toolkit 설치 전제)"
elif [ "$OS" = "Linux" ]; then
  say "  이 서버엔 GPU가 없어 $(b 'CPU 임베딩이 현재로선 최선')입니다."
  say "  • 평소엔 변경된 노트만 색인하므로 느림이 거의 안 느껴집니다."
  say "  • 최초/대량 색인이 답답하면: 노트를 나눠 넣거나, GPU 있는 기기(맥북 등)에서 색인."
else
  say "  CPU 임베딩으로 동작합니다. 대량 색인 시에만 시간이 듭니다."
fi

head "[다음 단계]"
say "  $(b 'make embed')                       # 이 기기에 맞는 엔진으로 전환(auto 감지)"
say "  $(b 'make embed BACKEND=host|gpu|cpu')  # 강제 지정 · $(b 'DRY_RUN=1')로 미리보기"
say "  $(b 'make reindex')                     # 전환 후 기존 노트 재색인"
say ""
exit 0   # 진단 성공 = 0 (프롬프트 ✗ 방지)
