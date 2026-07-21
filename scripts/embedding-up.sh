#!/usr/bin/env bash
# 임베딩 엔진(Ollama) 켜기 — 설치 마법사(install-wizard)·수동 실행 공용.
# great-reduction(2026-07-21) r2: 구 스택 오케스트레이터 삭제 후 마법사 "스택 기동" 단계의
# 대체 — 켜는 대상은 이제 임베딩 엔진 하나뿐이다(Ollama 직결, docker compose는 그 편의 실행).
# 정책: 이미 떠 있으면 그대로 통과(비파괴) → docker compose 가능하면 자동 기동 → 아니면
# 평이한 한국어 안내 후 잠시 대기. 성공=exit 0, 못 켜면 exit 1(안내 포함).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# .env의 EMBEDDINGS_URL 우선(값은 출력하지 않음 — 위치만), 기본은 Ollama 직결.
EMB_URL="${EMBEDDINGS_URL:-}"
if [ -z "$EMB_URL" ] && [ -f "$DIR/.env" ]; then
  EMB_URL="$(grep -E '^EMBEDDINGS_URL=' "$DIR/.env" | tail -1 | cut -d= -f2- || true)"
fi
EMB_URL="${EMB_URL:-http://localhost:11434/v1}"
BASE="${EMB_URL%/v1}"; BASE="${BASE%/}"

healthy() { curl -fsS --max-time 3 "$BASE/api/tags" >/dev/null 2>&1; }

if healthy; then
  echo "✓ 임베딩 엔진이 이미 켜져 있어요 ($BASE)"
  exit 0
fi

echo "임베딩 엔진(Ollama)이 아직 안 켜져 있어요 — 켜볼게요."
STARTED=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && [ -f "$DIR/docker-compose.yml" ]; then
  echo "Docker로 켭니다 (처음엔 모델 내려받기로 몇 분 걸릴 수 있어요 — 정상이에요)."
  (cd "$DIR" && docker compose up -d) || echo "docker compose 실행이 매끄럽지 않았어요 — 아래에서 상태를 계속 확인할게요."
  STARTED="docker"
elif command -v ollama >/dev/null 2>&1; then
  echo "Ollama가 설치돼 있어요. 이렇게 켤 수 있어요:"
  echo "  - macOS(brew): brew services start ollama"
  echo "  - 또는 Ollama 앱을 실행"
  echo "켜지는지 잠시 기다려 볼게요…"
else
  echo "✗ 임베딩 엔진이 없어요. 다음 중 하나로 준비한 뒤 [다시 시도]를 눌러주세요:"
  echo "  - Docker Desktop을 켠 뒤 이 단계를 다시 실행 (자동으로 켜져요)"
  echo "  - 또는 https://ollama.com 에서 Ollama 설치 후 실행"
  exit 1
fi

# docker 기동은 모델 내려받기(bge-m3 1.2GB)까지 감안해 길게, 수동 기동 대기는 짧게.
LIMIT=120
[ "$STARTED" != "docker" ] && LIMIT=30
i=0
while [ "$i" -lt "$LIMIT" ]; do
  if healthy; then
    echo "✓ 임베딩 엔진 준비됨 ($BASE)"
    exit 0
  fi
  i=$((i + 1))
  echo "준비 중... $i/$LIMIT"
  sleep 2
done

echo "✗ 아직 임베딩 엔진에 연결하지 못했어요 ($BASE)."
echo "  Docker 또는 Ollama를 켠 뒤 [다시 시도]를 눌러주세요. 기존 설정은 그대로예요."
exit 1
