#!/usr/bin/env bash
# 스트리밍(SSE) — 토큰이 생성되는 대로 받기. (curl -N 로 버퍼링 끔)
#   bash examples/chat-streaming.sh
set -euo pipefail

# 게이트웨이 키는 설치마다 임의 생성된다(.env) — env 또는 프로젝트 .env에서 읽는다.
KEY="${LITELLM_MASTER_KEY:-$(grep -E '^LITELLM_MASTER_KEY=' "$(dirname "$0")/../.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
[ -n "$KEY" ] || { echo "게이트웨이 키를 찾지 못했어요 — 'make init-env' 후 다시 실행해 주세요."; exit 1; }

echo "=== OpenAI 형식 스트리밍 (:4000) ==="
curl -N -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"sonnet","stream":true,"messages":[{"role":"user","content":"하이쿠 한 편 천천히"}]}'
echo
echo "  (각 줄: data: {\"choices\":[{\"delta\":{\"content\":\"...\"}}]} ... 끝은 data: [DONE])"

echo
echo "=== Anthropic 형식 스트리밍 (:8787) ==="
curl -N -s http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"sonnet","max_tokens":256,"stream":true,"messages":[{"role":"user","content":"세 단어로 인사"}]}'
echo
echo "  (event: message_start / content_block_delta / message_delta ...)"
