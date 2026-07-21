#!/usr/bin/env bash
# localmind 환경 진단 — 이 기기에서 임베딩(노트 색인)이 "어디서·무엇으로" 도는지 점검하고
# 더 빠른 구성을 안내한다. 읽기 전용 — 아무것도 바꾸지 않는다.
# 호출: make doctor
# set -e 는 일부러 쓰지 않는다 — 일부 점검이 실패(미설치 등)해도 끝까지 진단해야 하므로.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/lib/read-env.sh"
. "$DIR/scripts/lib/notes-dir.sh"   # NOTES_DIR 정합 점검(specs/019 FR-5)

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

# ── 현재 임베딩 라우팅 (great-reduction: OpenAI 호환 엔드포인트 직결) ─────────
ENV_FILE="${LOCALMIND_ENV_FILE:-$DIR/.env}"
EMB_URL="$(read_env_val EMBEDDINGS_URL "$ENV_FILE")"
EMB_URL="${EMB_URL:-http://localhost:11434/v1}"
EMB_MODEL="$(read_env_val EMBEDDINGS_MODEL "$ENV_FILE")"
EMB_MODEL="${EMB_MODEL:-bge-m3}"
route_label="$EMB_URL (모델: $EMB_MODEL)"

# 실효 백엔드(지금 임베딩이 실제로 도는 형태) 판정
case "$EMB_URL" in
  *11434*) if [ "$accel" = "metal" ]; then effective="Ollama 직결 → Metal GPU (빠름)"
           elif [ "$accel" = "cuda" ]; then effective="Ollama 직결 → NVIDIA GPU (빠름)"
           else effective="Ollama 직결 → CPU"; fi;;
  *)       effective="외부 OpenAI 호환 엔드포인트";;
esac

# 임베딩 엔드포인트 살아있나
emb_up="✗ 응답 없음 ($EMB_URL) — 임베딩 엔진(예: ollama serve)이 켜져 있나요?"
if http "$EMB_URL/models" || http "${EMB_URL%/v1}/api/tags"; then emb_up="✓ 응답 ($EMB_URL)"; fi

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
  if [ "${host_ollama#✓}" != "$host_ollama" ] && case "$EMB_URL" in *11434*) true;; *) false;; esac; then
    say "  ✓ 최적 구성입니다 — 호스트 Ollama(Metal)로 임베딩 중."
  else
    say "  $(b '맥북의 GPU(Metal)를 살리면 임베딩이 10~50배 빨라집니다.')"
    say "  지금은 Docker 안에서 CPU로 돌아 가장 큰 장점을 못 쓰는 상태예요."
    say ""
    say "    1) $(b 'brew install ollama')        # 호스트에 네이티브 설치(또는 Ollama.app)"
    say "    2) $(b 'ollama serve')               # 새 터미널에 켜둔 채로(또는 brew services start ollama)"
    say "    3) $(b 'ollama pull bge-m3')         # 임베딩 모델 받기"
    say "    4) .env에 $(b 'EMBEDDINGS_URL=http://localhost:11434/v1') · $(b 'EMBEDDINGS_MODEL=bge-m3') · $(b 'EMBEDDINGS_KEY=dummy')"
  fi
elif [ "$OS" = "Linux" ] && [ "$accel" = "cuda" ]; then
  say "  NVIDIA GPU가 있습니다 — $(b 'docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d')로 Ollama GPU 가속."
  say "  (nvidia-container-toolkit 설치 전제)"
elif [ "$OS" = "Linux" ]; then
  say "  이 서버엔 GPU가 없어 $(b 'CPU 임베딩이 현재로선 최선')입니다."
  say "  • 평소엔 변경된 노트만 색인하므로 느림이 거의 안 느껴집니다."
  say "  • 최초/대량 색인이 답답하면: 노트를 나눠 넣거나, GPU 있는 기기(맥북 등)에서 색인."
else
  say "  CPU 임베딩으로 동작합니다. 대량 색인 시에만 시간이 듭니다."
fi

# ── 노트 폴더(NOTES_DIR) 정합(specs/019 FR-5) ──────────────────
# 셸 명령(make reindex 등)과 Claude Code(MCP)가 같은 폴더 목록을 보는지 비교한다.
# MCP 등록을 읽을 수 없는 환경(claude 미설치 등)에서는 조용히 건너뛴다(오탐 금지).
# eff_nd(셸 유효값: 환경변수 → .env → 기본)는 이 섹션 밖(색인 라벨 안내)에서도 쓰므로
# MCP 유무와 무관하게 여기서 해석한다(specs/022 FR-4 — 정합 블록 안에 두면 MCP 미등록
# 사용자에게 라벨 진단이 무효화되고 set -u에서 unbound가 된다).
eff_nd="$(resolve_notes_dir "$ENV_FILE")"
eff_nd="${eff_nd:-$HOME/.localmind}"
mcp_nd="$(mcp_notes_dir)"
if [ -n "$mcp_nd" ]; then
  head "[노트 폴더 정합]  ← 셸 명령과 Claude Code가 같은 노트를 보는지"
  # 라벨·~·심링크·후행 슬래시 표기 차이는 같은 폴더로 본다 — 정규화된 경로 집합으로 비교(오탐 방지).
  if [ "$(notes_dir_paths "$eff_nd" | sort)" = "$(notes_dir_paths "$mcp_nd" | sort)" ]; then
    say "  ✓ 일치 — 셸(make reindex 등)과 Claude Code(MCP)가 같은 폴더 목록을 봅니다."
  else
    say "  ⚠ 불일치 — 셸과 Claude Code가 서로 다른 노트 폴더 목록을 보고 있어요."
    row "셸(유효값)" "$eff_nd"
    row "MCP 등록"   "$mcp_nd"
    # MCP 목록에는 있는데 셸 유효값에 없는 항목 = 셸 색인(make reindex)에서 빠지는 폴더.
    # 라벨·심링크·후행 슬래시 표기 차이는 같은 폴더로 본다(canon_path 정규화 — 오탐 방지).
    missing=""
    eff_paths="$(notes_dir_paths "$eff_nd")"
    IFS=',' read -r -a _mcp_items <<< "$mcp_nd"
    for _it in "${_mcp_items[@]}"; do
      _it="$(printf '%s' "$_it" | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
      [ -z "$_it" ] && continue
      case "$_it" in *=*) _p="${_it#*=}";; *) _p="$_it";; esac
      _p="$(canon_path "$_p")"
      printf '%s\n' "$eff_paths" | grep -qxF -- "$_p" || missing="$missing\n      - $_it"
    done
    if [ -n "$missing" ]; then
      say "  셸에서 색인 시 빠지는 폴더:"
      printf '%b\n' "$missing" | sed '/^$/d'
    fi
    say "  해결: .env에 NOTES_DIR를 추가하거나 $(b 'make mcp-install NOTES_DIR=<폴더 목록>')을 다시 실행하면 맞춰져요."
  fi
fi

# ── 색인 라벨(specs/022 FR-4) ──────────────────────────────────
# 지금 설정에 없는(고아) 또는 열 수 없는(부재) 폴더의 색인을 안내한다 — 읽기 전용,
# 판정은 TS 단일 소스(scripts/index-labels.ts → brain.indexLabelReport). 색인 없음·
# 손상·node 부재·0건이면 침묵(섹션 미출력 — 오탐 금지), exit 0 유지.
if have node; then
  labels_out="$(cd "$DIR" && NOTES_DIR="$eff_nd" node --import tsx/esm scripts/index-labels.ts 2>/dev/null || true)"
  if [ -n "$labels_out" ]; then
    head "[색인 라벨]  ← 지금 설정에 없는(또는 열 수 없는) 폴더의 색인"
    while IFS="$(printf '\t')" read -r kind label f3 f4; do
      case "$kind" in
        orphan)  say "  ! $label: 지금 설정에 없는 폴더의 색인 ${f3}건을 보존 중이에요 — 안 쓰는 폴더면 'REINDEX_PRUNE_LABELS=$label make reindex'로 정리할 수 있어요.";;
        missing) say "  ! $label: 폴더를 열 수 없어 색인 ${f4}건을 보존 중이에요 ($f3) — 연결(마운트)·권한을 확인해 주세요.";;
      esac
    done <<EOF_LABELS
$labels_out
EOF_LABELS
  fi
fi

head "[다음 단계]"
say "  $(b 'make reindex')                     # 설정(.env EMBEDDINGS_*) 반영해 노트 재색인"
say "  $(b 'docker compose up -d')             # Ollama를 직접 설치하기 어려운 환경의 대안(컨테이너)"
say ""
exit 0   # 진단 성공 = 0 (프롬프트 ✗ 방지)
