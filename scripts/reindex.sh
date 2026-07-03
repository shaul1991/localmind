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
if [ -z "$resolved" ]; then
  warn_notes_dir_divergence
  resolved="${REINDEX_FALLBACK_DIR:-}"   # make restore가 BACKUP_DIR를 최후 폴백으로 넘긴다
fi

key="${LITELLM_MASTER_KEY:-$(read_env_val LITELLM_MASTER_KEY "$ENV_FILE")}"

cd "$PROJECT_DIR"
if [ -n "$resolved" ]; then
  NOTES_DIR="$resolved" LITELLM_MASTER_KEY="$key" npm run reindex
else
  LITELLM_MASTER_KEY="$key" npm run reindex
fi
