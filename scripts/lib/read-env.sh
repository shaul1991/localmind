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

# C0/DEL control character가 하나라도 있는지 byte 기준으로 검사한다. Bash 변수는 NUL을
# 보존할 수 없으므로 표현 가능한 0x01-0x1f·0x7f를 대상으로 하며, 정상 UTF-8 bytes는 유지한다.
has_control_chars() {
  local raw="${1:-}" printable
  printable="$(printf '%s' "$raw" | LC_ALL=C command tr -d '\001-\037\177')"
  [ "$printable" != "$raw" ]
}

# 공개 HTTP(S) endpoint인지 검증한다. raw 값은 argv가 아니라 stdin으로만 Node parser에
# 전달하며, userinfo/query/fragment/C0/DEL은 network 경계 전에 거부한다.
public_http_url() {
  [ -n "${1:-}" ] && command -v node >/dev/null 2>&1 || return 1
  has_control_chars "$1" && return 1
  printf '%s' "$1" | node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    try {
      const u = new URL(raw);
      if (raw !== raw.trim() || !["http:", "https:"].includes(u.protocol) ||
          u.username || u.password || u.search || u.hash) process.exit(1);
    } catch { process.exit(1); }
  ' >/dev/null 2>&1
}

# URL의 자격증명(userinfo)과 query/fragment를 마스킹한다.
# query key 이름은 provider마다 달라 allowlist할 수 없으므로 ?/# 이후 비공백 전체를 제거한다.
# 요약·에러 출력에 토큰이 평문으로 새지 않게(FR-12). 여러 URL이 섞인 문자열도 처리.
# C0/DEL 제어문자는 line/whitespace 경계를 분할해 sed 마스킹을 우회할 수 있으므로, 원문을
# 부분 처리하지 않고 로그 경계 전에 값 전체를 안전 sentinel로 축약한다.
mask_url() {
  local raw="$1"
  if has_control_chars "$raw"; then
    printf '%s' '[REDACTED]'
    return 0
  fi
  printf '%s' "$raw" | sed -E 's|(://)[^/?#[:space:]]*@|\1***@|g; s|[?#][^[:space:]]*||g'
}
