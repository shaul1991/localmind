#!/usr/bin/env bash
# specs/019 FR-6 — make reindex / make restore(재색인) 진입점.
# NOTES_DIR 정본 해석(환경변수 → .env → REINDEX_FALLBACK_DIR)과 MCP 발산 경고(AC-26) 후
# 재색인을 실행한다. 경고는 진행을 막지 않는다 — 색인은 파생물이라 자가 치유되지만,
# 어떤 폴더가 빠지는지 사용자가 알 수 있어야 한다(019 goal: 조용한 부분 색인 방지).
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$PROJECT_DIR/scripts/lib/read-env.sh"
. "$PROJECT_DIR/scripts/lib/notes-dir.sh"

ENV_FILE="${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}"

resolved="$(resolve_notes_dir "$ENV_FILE")"
FALLBACK=""
if [ -z "$resolved" ]; then
  warn_notes_dir_divergence
  resolved="${REINDEX_FALLBACK_DIR:-}"   # make restore가 BACKUP_DIR를 최후 폴백으로 넘긴다
  # specs/020 AC-11 — 해석 실패는 폴백 재할당 여부와 무관하게 후퇴 신호를 넘긴다(색인은
  # NOTES_DIR가 세팅됐다는 것만으로 폴백 여부를 알 수 없다 → 삭제 반영 보류, FR-3).
  FALLBACK=1
fi

key="${LITELLM_MASTER_KEY:-$(read_env_val LITELLM_MASTER_KEY "$ENV_FILE")}"

# 임베딩 엔드포인트 옵션 패스스루(specs/202607211015 FR-2) — 설정된 경우에만 자식 env로 전달.
# (VAR=val 형태의 조건부 프리픽스는 파라미터 확장 결과에 재적용되지 않아 assignment로
# 인식되지 않는다 — bash 3.2 실측. env 배열 인자로 명시 전달한다.)
embeddings_url="${EMBEDDINGS_URL:-$(read_env_val EMBEDDINGS_URL "$ENV_FILE")}"
embeddings_model="${EMBEDDINGS_MODEL:-$(read_env_val EMBEDDINGS_MODEL "$ENV_FILE")}"
extra_env=()
[ -n "$embeddings_url" ] && extra_env+=("EMBEDDINGS_URL=$embeddings_url")
[ -n "$embeddings_model" ] && extra_env+=("EMBEDDINGS_MODEL=$embeddings_model")

# specs/021 FR-3 — 임베딩 라우팅이 호스트(GPU)면 배치 기본 상향(명시 env가 항상 우선).
# 판정 입력은 $ENV_FILE 하나(LOCALMIND_ENV_FILE 격리 존중) — litellm.config.yaml은
# os.environ 참조라 리터럴이 존재할 수 없는 죽은 가지(spec FR-3)라 보지 않는다.
# raw grep이 아니라 OLLAMA_API_BASE의 유효값만 본다 — 주석·예시 라인의 host URL로
# Docker(CPU) 사용자의 배치를 올리면 안 된다(codex 교차 리뷰 오탐 방지).
ollama_base="$(read_env_val OLLAMA_API_BASE "$ENV_FILE")"
if [ -z "${BRAIN_BATCH:-}" ]; then
  case "$ollama_base" in *host.docker.internal*) export BRAIN_BATCH=32;; esac
fi

cd "$PROJECT_DIR"
# REINDEX_PRUNE_LABELS·REINDEX_ADOPT_REBIND는 명시적으로 전달한다(make 암묵 export
# 의존 금지 — specs/020 AC-11 · specs/024 AC-9).
if [ -n "$resolved" ]; then
  NOTES_DIR="$resolved" LITELLM_MASTER_KEY="$key" \
    REINDEX_FALLBACK="$FALLBACK" REINDEX_PRUNE_LABELS="${REINDEX_PRUNE_LABELS:-}" \
    REINDEX_ADOPT_REBIND="${REINDEX_ADOPT_REBIND:-}" \
    env ${extra_env[@]+"${extra_env[@]}"} npm run reindex
else
  LITELLM_MASTER_KEY="$key" \
    REINDEX_FALLBACK="$FALLBACK" REINDEX_PRUNE_LABELS="${REINDEX_PRUNE_LABELS:-}" \
    REINDEX_ADOPT_REBIND="${REINDEX_ADOPT_REBIND:-}" \
    env ${extra_env[@]+"${extra_env[@]}"} npm run reindex
fi
