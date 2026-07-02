#!/usr/bin/env bash
# specs/011 FR-5 — 휴지통(.trash/) 관리. 사용: trash.sh [list|empty]
# 대상: NOTES_DIR("라벨=경로,..." 또는 "경로")의 각 노트 폴더 하위 .trash/.
# 완전 삭제(empty)는 비가역이라 사람 전용 — MCP 도구로는 불가(soft-delete만 제공).
# 이식성: BSD/GNU 공통(find -printf 등 GNU 전용 옵션 미사용).
set -uo pipefail

CMD="${1:-list}"
NOTES_DIR="${NOTES_DIR:-$HOME/.localmind}"

# NOTES_DIR 파싱 → 폴더 경로 배열
folders=()
IFS=',' read -r -a items <<< "$NOTES_DIR"
for it in "${items[@]}"; do
  it="$(printf '%s' "$it" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [ -z "$it" ] && continue
  case "$it" in *=*) p="${it#*=}";; *) p="$it";; esac
  p="${p/#\~/$HOME}"
  folders+=("$p")
done

# 빈/malformed NOTES_DIR(예: ",")로 폴더가 하나도 없으면 안내 후 종료.
# (bash 3.2 + set -u 에서 빈 배열 "${arr[@]}" 확장은 오류를 내므로 여기서 차단.)
if [ "${#folders[@]}" -eq 0 ]; then
  echo "휴지통이 비어 있습니다."
  exit 0
fi

trash_files() { find "$1" -type f 2>/dev/null; }

case "$CMD" in
  list)
    any=0
    for d in "${folders[@]}"; do
      t="$d/.trash"
      [ -d "$t" ] || continue
      files="$(trash_files "$t")"
      [ -z "$files" ] && continue
      any=1
      printf '📁 %s\n' "$t"
      printf '%s\n' "$files" | sed 's/^/   /'
    done
    [ "$any" -eq 0 ] && echo "휴지통이 비어 있습니다."
    ;;
  empty)
    total=0
    for d in "${folders[@]}"; do
      t="$d/.trash"; [ -d "$t" ] || continue
      n="$(trash_files "$t" | wc -l | tr -d ' ')"; total=$((total + n))
    done
    if [ "$total" -eq 0 ]; then echo "휴지통이 이미 비어 있습니다."; exit 0; fi
    echo "휴지통의 파일 ${total}개를 완전 삭제합니다(비가역 — 복구 불가)."
    if [ -t 0 ]; then
      read -r -p "정말 비울까요? [y/N] " ans || ans=""
      [[ "$ans" =~ ^[Yy] ]] || { echo "취소했습니다."; exit 0; }
    elif [ "${FORCE:-}" != "1" ]; then
      echo "비대화 환경이라 취소했습니다. 강제하려면 FORCE=1 을 지정하세요."; exit 1
    fi
    for d in "${folders[@]}"; do
      t="$d/.trash"; [ -d "$t" ] || continue
      rm -rf "$t" && printf '비움: %s\n' "$t"
    done
    ;;
  *)
    echo "사용법: trash.sh [list|empty]"; exit 2
    ;;
esac
