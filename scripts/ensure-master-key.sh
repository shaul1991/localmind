#!/usr/bin/env bash
# .env의 LITELLM_MASTER_KEY가 비어 있거나 없으면 임의 키를 생성해 채운다. (specs/014 FR-6)
# - 이미 값이 있으면(레거시 sk-local 포함) 바꾸지 않는다 — 기존 사용자 무파손(AC-9).
# - 설치마다 다른 추측 불가능한 값 — 같은 머신의 다른 프로세스·DNS rebinding이
#   게이트웨이(:4000)를 기본 키로 소비하는 것을 막는다.
# 사용: bash scripts/ensure-master-key.sh [.env 경로]
set -euo pipefail

ENV_FILE="${1:-.env}"
[ -f "$ENV_FILE" ] || { echo "✗ $ENV_FILE 없음 — 'make init-env' 먼저" >&2; exit 1; }

cur="$(grep -E '^LITELLM_MASTER_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
if [ -n "$cur" ]; then exit 0; fi # 이미 설정됨 — 유지

key="sk-lm-$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
if grep -qE '^LITELLM_MASTER_KEY=' "$ENV_FILE"; then
  # 빈 값 라인을 채운다. (sed -i는 macOS/GNU 비호환 — temp 파일로)
  tmp="$(mktemp)"
  sed "s|^LITELLM_MASTER_KEY=$|LITELLM_MASTER_KEY=$key|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf 'LITELLM_MASTER_KEY=%s\n' "$key" >> "$ENV_FILE"
fi
echo "  ✓ 게이트웨이 키(LITELLM_MASTER_KEY)를 새로 생성했어요 — 설치마다 다른 임의 값입니다."
