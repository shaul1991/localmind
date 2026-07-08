#!/usr/bin/env bash
# specs/034 — 모니터링 UI 서버 실행(호스트, 127.0.0.1 전용 · 읽기 전용).
# 사용: make ui  (포트 변경: UI_PORT=8890 make ui)
# NOTES_DIR 등은 .env 정본 규칙(환경변수 → .env)으로 해석해 export한다(specs/019 —
# 셸 진입점이 해석을 맡아야 TS 쪽 폴더/인덱스 해석(brain.ts)이 갈라지지 않는다).
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 대시보드는 Node 서버(tsx src/ui-server.ts)라 Node/npm이 필수다. 없으면 날것의
# "npm/node: command not found" 대신 설치 방법을 친절히 안내하고 멈춘다(make ui·setup 양쪽 경로 커버).
# npm·node 둘 다 확인 — npm만 있고 node가 없으면 exec 시 "node: command not found"로 새는 걸 막는다.
if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "✗ 웹 대시보드를 열려면 Node.js가 필요해요 — 아직 설치돼 있지 않아요(node/npm을 찾지 못했어요)."
  echo ""
  echo "  Node.js(LTS · 버전 20 이상)를 설치한 뒤 다시 'make ui':"
  case "$(uname -s 2>/dev/null)" in
    Darwin)
      echo "    • 설치 파일:  https://nodejs.org 에서 LTS 다운로드 후 실행"
      echo "    • 또는 Homebrew:  brew install node"
      ;;
    Linux)
      echo "    • nvm 권장:  https://github.com/nvm-sh/nvm 설치 후  nvm install --lts"
      echo "    • 또는 배포판 패키지(예: sudo apt install nodejs npm) / https://nodejs.org"
      ;;
    *)
      echo "    • https://nodejs.org 에서 LTS 설치"
      ;;
  esac
  echo ""
  echo "  설치되면  node -v && npm -v  로 확인한 뒤  'make ui' 로 다시 열어요."
  exit 1
fi

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

# 서버가 뜬 뒤 브라우저를 자동으로 연다(비개발자 편의 · specs/039 후속).
# 끄기: LOCALMIND_NO_OPEN=1 · tty가 아니면(CI/헤드리스) 자동 skip.
open_browser_later() {
  [ -n "${LOCALMIND_NO_OPEN:-}" ] && return 0
  [ -t 1 ] || return 0
  local opener=""
  case "$(uname -s 2>/dev/null)" in
    Darwin) command -v open >/dev/null 2>&1 && opener="open" ;;
    Linux) command -v xdg-open >/dev/null 2>&1 && opener="xdg-open" ;;
    *) command -v start >/dev/null 2>&1 && opener="start" ;;
  esac
  [ -n "$opener" ] && ( sleep 2; "$opener" "$url" >/dev/null 2>&1 ) &
}

# 백그라운드 모드(make ui-bg): 서버를 떼어내 돌리고 터미널을 즉시 돌려준다 —
# 터미널 창을 하나 더 열 필요 없이 대시보드를 켠 채로 다른 명령을 계속 쓸 수 있다.
if [ -n "${LOCALMIND_UI_BG:-}" ]; then
  log="$DIR/.localmind-ui.log"
  pidfile="$DIR/.localmind-ui.pid"
  # 이미 떠 있으면 중복 기동 방지 — 단, 재부팅 등으로 PID가 무관한 프로세스에 재할당된
  # 스테일 파일을 "실행 중"으로 오인하지 않도록 프로세스 신원(npm run ui)까지 확인한다.
  if [ -f "$pidfile" ]; then
    oldpid="$(cat "$pidfile" 2>/dev/null)"
    if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null \
       && ps -p "$oldpid" -o command= 2>/dev/null | grep -q 'npm run ui'; then
      echo "→ 모니터링 UI가 이미 백그라운드에서 돌고 있어요: $url"
      echo "  끄기: make ui-stop   (로그: $log)"
      open_browser_later
      exit 0
    fi
  fi
  nohup npm run --silent --prefix "$DIR" ui >"$log" 2>&1 &
  pid=$!
  echo "$pid" > "$pidfile"
  # 제대로 떴는지 확인한다. 서버는 포트 바인드에 성공해야만 로그에 "모니터링 UI: http"를
  # 남긴다(ui-server.ts의 listen 콜백) — 이건 우리 프로세스 자신의 출력이라, 남이 이미 쥔
  # 포트(EADDRINUSE)를 성공으로 오인하지 않는다. 최대 5초 폴링: 마커=성공, 프로세스 사망=실패.
  # (고정 sleep은 느린 콜드스타트에서 거짓 성공을 내므로 폴링으로 대체.)
  ok=""
  for _ in $(seq 1 10); do
    grep -q '모니터링 UI: http' "$log" 2>/dev/null && { ok=1; break; }
    kill -0 "$pid" 2>/dev/null || break            # 준비 로그 전에 죽었으면 실패
    sleep 0.5
  done
  if [ -z "$ok" ]; then
    kill "$pid" 2>/dev/null   # 안 뜬 채 살아만 있는 경우(고아) 방지
    rm -f "$pidfile"
    echo "✗ 대시보드가 제대로 뜨지 못했어요(포트 $port 사용 중이거나 시작 오류)."
    echo "  마지막 로그:"
    tail -n 5 "$log" 2>/dev/null | sed 's/^/    /'
    echo "  다른 포트로: UI_PORT=8890 make ui-bg"
    exit 1
  fi
  echo "→ 모니터링 UI(백그라운드): $url"
  echo "  이 터미널은 계속 쓸 수 있어요. 끄기: make ui-stop"
  echo "  로그 보기: tail -f $log"
  open_browser_later
  exit 0
fi

echo "→ 모니터링 UI: $url  (중지: Ctrl+C)"
open_browser_later
exec npm run --silent --prefix "$DIR" ui
