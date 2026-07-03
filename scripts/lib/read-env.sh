#!/usr/bin/env bash
# specs/012 공용 헬퍼 — notes-connect.sh·setup.sh가 공유(FR-16 불변식을 한 곳에서 강제).
# source 해서 함수를 쓴다: . "$(dirname "$0")/lib/read-env.sh"
#
# 두 사이트의 규칙이 갈라지면(따옴표·공백·빈값 처리) 분기와 게이트가 어긋나므로 여기서 고정한다.

# .env에서 키 값을 **비실행**으로 읽는다(grep|cut — source/eval 금지, 복원된 .env의 RCE 차단).
# 감싼 따옴표(""/'')는 벗긴다(NOTES_REPOS 값은 =·쉼표를 포함해 .env에서 자연히 인용됨).
# 사용: read_env_val <KEY> <ENV_FILE>
read_env_val() {
  local key="$1" file="$2" val
  [ -f "$file" ] || return 0
  # command 접두 — 이 lib은 여러 스크립트에 source되므로, 호출측이 같은 이름의 셸 함수
  # (예: doctor.sh의 head())를 정의해도 외부 바이너리를 쓰게 고정한다(019에서 실제 충돌).
  val="$(command grep -E "^${key}=" "$file" 2>/dev/null | command head -1 | command cut -d= -f2- || true)"
  # 앞뒤 공백 제거 후 감싼 따옴표 1쌍 제거
  val="$(printf '%s' "$val" | command sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"
  printf '%s' "$val"
}

# URL의 자격증명(userinfo)을 마스킹한다: https://user:token@host → https://***@host.
# 요약·에러 출력에 토큰이 평문으로 새지 않게(FR-12). 여러 URL이 섞인 문자열도 처리.
mask_url() {
  printf '%s' "$1" | sed -E 's#(://)[^/@[:space:]]*@#\1***@#g'
}
