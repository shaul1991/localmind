#!/usr/bin/env bash
# Claude 구독 토큰 발급 — 브라우저로 1회 인증하고, 받은 토큰을 .env 에 자동으로 적어 주는 비개발자용 가이드.
# 호출: make claude-token
# 결과: .env 의 CLAUDE_CODE_OAUTH_TOKEN 갱신. 적용은 'make up'(컨테이너 recreate).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

b()    { printf '\033[1m%s\033[0m' "$1"; }
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }

say ""
say "$(b 'Claude 구독 연결')을 시작합니다 — localmind가 내 Claude 구독으로 동작하도록 토큰을 발급해요."
say "총 3단계입니다. (토큰은 약 1년간 유효해요.)"
say ""

# ── 1/3 : 준비물 점검 ───────────────────────────────────────────
say "$(b '[1/3] 준비물 점검')"
if ! command -v claude >/dev/null 2>&1; then
  err "Claude Code(claude 명령)가 없어요. 설치·로그인 후 다시 → https://claude.com/claude-code"
  exit 1
fi
ok "claude CLI 있음"
if [ ! -f "$ENV_FILE" ]; then
  cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
  ok ".env 새로 만듦(.env.example에서)"
else
  ok ".env 있음"
fi
if ! [ -t 0 ]; then
  err "이 단계는 브라우저 인증이 필요해 직접 실행해야 해요. 터미널에서 '$(b 'make claude-token')'을 실행해 주세요."
  exit 1
fi

# ── 2/3 : 발급(브라우저 1회) ────────────────────────────────────
say "$(b '[2/3] 브라우저로 1회 인증')"
say "  곧 브라우저가 열립니다. 안내를 따라 로그인/허용하면 토큰이 화면에 나와요."
say ""
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# 사용자에게 그대로 보여주면서(tee) 출력도 캡처
claude setup-token | tee "$TMP" || { err "토큰 발급이 취소/실패됐어요. 다시 시도해 주세요."; exit 1; }

# 출력에서 토큰 추출: sk-ant- 로 시작하는 토큰 우선, 없으면 긴 토큰형 한 줄.
TOKEN="$(grep -oE 'sk-ant-[A-Za-z0-9_-]+' "$TMP" | tail -1 || true)"
[ -z "$TOKEN" ] && TOKEN="$(grep -oE '[A-Za-z0-9_-]{40,}' "$TMP" | tail -1 || true)"

# ── 3/3 : .env 에 기록 ──────────────────────────────────────────
say ""
say "$(b '[3/3] .env 에 저장')"
if [ -z "$TOKEN" ]; then
  warn "출력에서 토큰을 자동으로 찾지 못했어요. 위에 표시된 토큰을 직접 .env 에 넣어 주세요:"
  say "    CLAUDE_CODE_OAUTH_TOKEN=<위 토큰>"
  exit 1
fi
if grep -qE '^CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE"; then
  tmp="$(mktemp)"
  grep -vE '^CLAUDE_CODE_OAUTH_TOKEN=' "$ENV_FILE" > "$tmp" || true  # 토큰 줄만 있을 때 grep exit 1 → set -e 중단 방지
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$TOKEN" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi
ok ".env 에 저장됨 (앞 8자: ${TOKEN:0:8}…, 길이 ${#TOKEN})"

say ""
say "$(b '🎉 연결 토큰 저장 완료!')"
say "  • 적용하기 : $(b 'make up')   (설정을 반영하려면 컨테이너를 다시 만들어요)"
say "  • 확인하기 : $(b 'make secrets')"
say ""
