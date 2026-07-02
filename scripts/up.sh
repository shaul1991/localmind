#!/usr/bin/env bash
# localmind 켜기 — 메모리·AI 엔진(Docker 스택)을 띄우는 비개발자용 단계별 가이드.
# 호출: make up
# 흐름: 준비물 점검(Docker·.env) → 시작 → 준비 대기(헬스). 터미널/비대화 모두 안전.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export COMPOSE_PROFILES="gateway,memory"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

DC() { docker compose -f "$PROJECT_DIR/docker-compose.yml" "$@"; }

say ""
say "$(b 'localmind 켜기')를 시작합니다 — 메모리 저장소와 AI 엔진을 띄워요."
say "총 3단계입니다. $(b '처음 켤 땐 AI 모델 내려받기로 몇 분') 걸릴 수 있어요(정상)."
say ""

# ── 1/3 : 준비물 점검 ───────────────────────────────────────────
say "$(b '[1/3] 준비물 점검')"
command -v docker >/dev/null 2>&1 || { err "Docker가 없어요. https://www.docker.com/products/docker-desktop 에서 설치 후 다시 실행해 주세요."; exit 1; }
if ! docker info >/dev/null 2>&1; then
  err "Docker가 아직 실행 중이 아니에요. $(b 'Docker Desktop')을 켠 뒤 다시 '$(b 'make up')'을 실행해 주세요."
  exit 1
fi
ok "Docker 실행 중"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  warn ".env(설정 파일)가 없어 예시에서 새로 만들어요."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  ok ".env 생성됨 — 기본값으로도 켜져요. (claude 연동 토큰 등은 'make secrets'로 점검)"
  bash "$PROJECT_DIR/scripts/ensure-master-key.sh" "$PROJECT_DIR/.env" # 새 설치 — 키 자동 생성(014)
  chmod 600 "$PROJECT_DIR/.env" # OAuth 토큰·키가 담기므로 소유자 전용(specs/015 FR-9)
else
  ok ".env 있음"
fi
# 게이트웨이 키가 없으면 추측 가능한 기본 키로 뜨는 대신 여기서 멈춘다(specs/014 AC-7).
if ! grep -qE '^LITELLM_MASTER_KEY=.+' "$PROJECT_DIR/.env"; then
  err "게이트웨이 키(LITELLM_MASTER_KEY)가 .env에 없어요 — '$(b 'make init-env')'가 자동 생성해 줘요. 실행 후 다시 '$(b 'make up')'."
  exit 1
fi

# ── 2/3 : 시작 ──────────────────────────────────────────────────
say "$(b '[2/3] 엔진 시작')"
say "  → 컨테이너를 빌드·시작하는 중... (처음엔 몇 분 걸려요. 기다려 주세요.)"
DC up -d --build >/dev/null 2>&1 || {
  err "시작 실패 — '$(b 'make logs')'로 원인을 확인해 주세요."
  say "  (빌드 자체가 실패했다면 로그에 안 남아요 — '$(b 'docker compose up -d --build')'를 직접 실행하면 에러가 보여요.)"
  exit 1
}
ok "컨테이너 시작됨"

# ── 3/3 : 준비 대기 ─────────────────────────────────────────────
# 채팅(:8787)까지 확인해야 "준비 완료"가 실제 상태와 일치한다(specs/015 FR-8, BACKLOG B4).
# curl 타임아웃: 응답이 지연되는 비정상 상태에서 폴링이 행 걸리지 않게.
say "$(b '[3/3] 준비 상태 확인')"
probe() { curl -s -o /dev/null --connect-timeout 2 --max-time 5 -w "%{http_code}" "$1" 2>/dev/null || echo 000; }
ready=0
for i in $(seq 1 120); do
  c="$(probe http://127.0.0.1:8787/health)"
  m="$(probe http://127.0.0.1:8767/docs)"
  g="$(probe http://127.0.0.1:4000/health/liveliness)"
  if [ "$c" = "200" ] && [ "$m" = "200" ] && [ "$g" = "200" ]; then ready=1; break; fi
  printf '\r  준비 중... %s/120 (채팅=%s 메모리=%s AI엔진=%s)   ' "$i" "$c" "$m" "$g"
  sleep 5
done
printf '\r%*s\r' 70 ''
if [ "$ready" != "1" ]; then
  warn "엔진이 아직 준비되지 않았어요(처음 모델 내려받기가 더 걸릴 수 있어요)."
  say "  안 뜬 포트 — 채팅 :8787=$c · 메모리 :8767=$m · AI엔진 :4000=$g"
  say "  잠시 후 '$(b 'make health')'로 다시 확인하거나, '$(b 'make logs')'로 진행 상황을 보세요."
  say "  (빌드 자체가 실패했다면 로그에 없어요 — '$(b 'docker compose up -d --build')'를 직접 실행하면 에러가 보여요.)"
  exit 1
fi
ok "준비 완료 (채팅 :8787 · 메모리 :8767 · AI :4000)"

say ""
say "$(b '🎉 localmind가 켜졌어요!')"
say "  • 상태 확인     : $(b 'make health')"
say "  • Claude 연동   : $(b 'make mcp-install')"
say "  • 끄기          : $(b 'make down')   (데이터는 유지돼요)"
say ""
