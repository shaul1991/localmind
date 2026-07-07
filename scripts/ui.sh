#!/usr/bin/env bash
# specs/034 — 모니터링 UI 서버 실행(호스트, 127.0.0.1 전용 · 읽기 전용).
# 사용: make ui  (포트 변경: UI_PORT=8890 make ui)
# NOTES_DIR 등은 .env 정본 규칙(환경변수 → .env)으로 해석해 export한다(specs/019 —
# 셸 진입점이 해석을 맡아야 TS 쪽 폴더/인덱스 해석(brain.ts)이 갈라지지 않는다).
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/lib/read-env.sh"
. "$DIR/scripts/lib/notes-dir.sh"

resolved_notes="$(resolve_notes_dir "$DIR/.env")"
[ -n "$resolved_notes" ] && export NOTES_DIR="$resolved_notes"

# UI가 쓰는 나머지 설정도 같은 비실행 규칙으로 .env에서 보충(환경변수가 이기고, 빈 값은 미설정).
# 간접확장(${!k}) 사용 — eval은 env 값이 코드로 재해석되는 취성이 있어 금지(self-review 사소-1).
for k in LOCALMIND_API_KEY LOCALMIND_ALLOWED_HOSTS QUERY_LOG BRAIN_INDEX OPENMEMORY_PORT UI_PORT UI_HOST LOG_LEVEL; do
  if [ -z "${!k:-}" ]; then
    v="$(read_env_val "$k" "$DIR/.env")"
    [ -n "$v" ] && export "$k=$v"
  fi
done

if [ -z "${LOCALMIND_API_KEY:-}" ]; then
  echo "! LOCALMIND_API_KEY가 없어 인증 없이 열려요 — 이 컴퓨터 전용이지만,"
  echo "  같은 컴퓨터를 쓰는 다른 사용자 계정도 볼 수 있게 됩니다(보안 리뷰 권고)."
  echo "  키를 만들려면: make token 후 .env에 추가"
fi

port="${UI_PORT:-8788}"
url="http://127.0.0.1:$port/ui/"
echo "→ 모니터링 UI: $url  (중지: Ctrl+C)"
# 비개발자 편의(specs/039 후속): 서버가 뜬 뒤 브라우저를 자동으로 연다.
# 끄기: LOCALMIND_NO_OPEN=1 · tty가 아니면(CI/헤드리스) 자동 skip.
if [ -z "${LOCALMIND_NO_OPEN:-}" ] && [ -t 1 ]; then
  opener=""
  case "$(uname -s 2>/dev/null)" in
    Darwin) command -v open >/dev/null 2>&1 && opener="open" ;;
    Linux) command -v xdg-open >/dev/null 2>&1 && opener="xdg-open" ;;
    *) command -v start >/dev/null 2>&1 && opener="start" ;;
  esac
  [ -n "$opener" ] && ( sleep 2; "$opener" "$url" >/dev/null 2>&1 ) &
fi
exec npm run --silent --prefix "$DIR" ui
