#!/usr/bin/env bash
# 백그라운드로 켠 모니터링 UI(make ui-bg)를 끈다. 포그라운드(make ui)는 Ctrl+C로 끈다.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
pidfile="$DIR/.localmind-ui.pid"

if [ ! -f "$pidfile" ]; then
  echo "→ 백그라운드 UI 기록이 없어요(이미 꺼졌거나 make ui-bg로 켠 적이 없어요)."
  echo "  포그라운드로 켠 UI(make ui)는 그 터미널에서 Ctrl+C로 끄면 됩니다."
  exit 0
fi

pid="$(cat "$pidfile" 2>/dev/null)"
if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
  echo "→ 이미 꺼져 있어요."
  rm -f "$pidfile"
  exit 0
fi

# 신원 확인 — 재부팅 등으로 이 PID가 무관한 프로세스에 재할당됐을 수 있다. 우리 서버
# (npm run ui)가 맞을 때만 손을 댄다. 아니면 건드리지 않고 스테일 파일만 지운다.
if ! ps -p "$pid" -o command= 2>/dev/null | grep -q 'npm run ui'; then
  echo "→ 기록된 PID($pid)가 우리 대시보드가 아니에요(재사용된 것 같아요) — 건드리지 않고 기록만 정리해요."
  rm -f "$pidfile"
  exit 0
fi

# 실제 포트를 쥔 건 자식(npm→tsx→node)이다. npm의 신호 전달에만 의존하지 않도록
# 자손까지 모아 함께 끈다(부모 먼저 죽어 고아 node가 포트를 물고 남는 경우 방지).
descendants() {
  local p="$1" kids k
  kids="$(pgrep -P "$p" 2>/dev/null)"
  for k in $kids; do echo "$k"; descendants "$k"; done
}
targets="$pid $(descendants "$pid")"

kill $targets 2>/dev/null
# 정상 종료 대기, 안 되면 강제.
for _ in 1 2 3 4 5; do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.3
done
for t in $targets; do kill -0 "$t" 2>/dev/null && kill -9 "$t" 2>/dev/null; done
echo "✓ 모니터링 UI를 껐어요 (pid $pid)."
rm -f "$pidfile"
