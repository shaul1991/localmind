#!/usr/bin/env bash
# 한 구현을 고정 오라클로 채점한다.
# 사용: bash grade.sh <구현 notes-connect.sh 경로>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL="${1:?사용법: grade.sh <notes-connect.sh 경로>}"
[ -f "$IMPL" ] || { echo "구현 파일 없음: $IMPL"; exit 2; }
echo "== 채점 대상: $IMPL =="
NC_SCRIPT="$(cd "$(dirname "$IMPL")" && pwd)/$(basename "$IMPL")" bash "$HERE/oracle.test.sh"
