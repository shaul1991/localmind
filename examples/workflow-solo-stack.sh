#!/usr/bin/env bash
# 1인 개발/스타트업 워크플로우 — repo 하나로 제품 백엔드 + 개인 비서를 한 번에.
#   make up && bash examples/workflow-solo-stack.sh   (jq 필요)
set -euo pipefail
GW=http://localhost:4000/v1
OM=http://localhost:8767/api/v1/memories
# 게이트웨이 키는 설치마다 임의 생성된다(.env) — env 또는 프로젝트 .env에서 읽는다.
KEY="${LITELLM_MASTER_KEY:-$(grep -E '^LITELLM_MASTER_KEY=' "$(dirname "$0")/../.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
[ -n "$KEY" ] || { echo "게이트웨이 키를 찾지 못했어요 — 'make init-env' 후 다시 실행해 주세요."; exit 1; }
U=${OPENMEMORY_USER:-localmind}

echo "## 0) 스택 상태"
echo "  gateway    → $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/v1/models --max-time 5 || true)"
echo "  embeddings → $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/health/liveliness --max-time 5 || true)"
echo "  memory     → $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8767/docs --max-time 5 || true)"

echo "## 1) 제품 LLM 기능 (chat 백엔드, 메터드 0원)"
curl -s $GW/chat/completions -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"신규 가입 환영 메시지 1줄"}]}' \
  | jq -r '.choices[0].message.content'

echo "## 2) 제품 검색 기능 (로컬 임베딩)"
curl -s $GW/embeddings -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","input":"환불 정책"}' | jq -r '"  임베딩 " + (.data[0].embedding|length|tostring) + "차원"'

echo "## 3) 내 개인 비서 (기억)"
curl -s -X POST $OM/ -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$U\",\"text\":\"이번 주 목표는 결제 연동 마무리\",\"infer\":true}" | jq -r '"  저장: " + (.content // "(처리됨)")'

echo "💡 워크플로우: make up → 제품 LLM/검색은 :4000 백엔드 → 내 작업은 MCP(remember/recall/ask_brain) → 노트·기억 git 백업"
