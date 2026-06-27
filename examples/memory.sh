#!/usr/bin/env bash
# 진화하는 기억(mem0) — REST로 저장/회상. claude가 사실을 추출하고 bge-m3로 임베딩.
# user_id는 시드된 사용자여야 함(기본 OPENMEMORY_USER=localmind). jq 필요.
#   bash examples/memory.sh
set -euo pipefail
OM=http://localhost:8767/api/v1/memories
U=${OPENMEMORY_USER:-localmind}

echo "# 1) 저장 — 자연어를 넣으면 사실로 추출해 저장"
curl -s -X POST $OM/ -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$U\",\"text\":\"나는 매주 화요일 오전에 팀 회고를 진행하고, 회의록은 Notion에 남긴다\",\"infer\":true}" \
  | jq -r '"  저장: " + (.content // "(중복이면 추가 안 될 수 있음)")'

echo "# 2) 의미 회상 — 키워드가 달라도 의미로 찾음"
curl -s -X POST $OM/semantic -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$U\",\"query\":\"회고 언제 하더라?\",\"limit\":3}" \
  | jq -r '.results[]? | "  (" + (.score|tostring) + ") " + .memory'

echo "# 3) 전체 목록"
curl -s "$OM/?user_id=$U&size=100" | jq -r '.items[]? | "  - " + .content'

# 백업: make memory-export FILE=~/brain/memory.md  →  git commit
