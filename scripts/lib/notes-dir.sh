#!/usr/bin/env bash
# specs/019 FR-6 공용 헬퍼 — NOTES_DIR 정본(.env) 해석·기록·MCP 발산 감지.
# source 해서 쓴다(read-env.sh를 먼저 source): . lib/read-env.sh; . lib/notes-dir.sh
#
# 정본 우선순위: 환경변수 NOTES_DIR → .env → 빈 값(호출부가 기본값/폴백 적용).
# 이 해석이 셸 진입점(reindex·restore 재색인·backup/restore 자산 단계)과 mcp-install에서
# 갈라지면 "조용한 부분 색인"(019 goal)이 재발하므로 여기서 한 곳에 고정한다.

resolve_notes_dir() { # <env_file> → stdout: 해석된 NOTES_DIR(빈 값 가능)
  local file="$1"
  if [ -n "${NOTES_DIR:-}" ]; then printf '%s' "$NOTES_DIR"; return 0; fi
  read_env_val NOTES_DIR "$file"
}

# MCP 등록(user 스코프)의 NOTES_DIR를 읽는다. 조회 불가(설정 파일·node 부재, 파싱 실패)면
# 빈 값 — 경고·가드가 오탐하지 않도록 조용히 건너뛴다(FR-5·FR-6 공통 전제).
# 테스트는 LOCALMIND_MCP_CONFIG로 스텁 설정 파일을 주입한다.
mcp_notes_dir() {
  local cfg="${LOCALMIND_MCP_CONFIG:-$HOME/.claude.json}"
  [ -f "$cfg" ] || return 0
  command -v node >/dev/null 2>&1 || return 0
  node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=c&&c.mcpServers&&c.mcpServers.localmind&&c.mcpServers.localmind.env&&c.mcpServers.localmind.env.NOTES_DIR;if(v)process.stdout.write(String(v));}catch(e){}' "$cfg" 2>/dev/null || true
}

# 존재하지 않을 수 있는 경로의 정규화 — 존재하는 조상까지 물리 경로(심링크 해소)로 푼다.
# backup/restore 자산 단계와 진단(doctor)의 경로 비교가 같은 규칙을 쓰도록 여기 고정한다.
canon_path() {
  local p="$1" suffix=""
  case "$p" in "~") p="$HOME";; "~/"*) p="$HOME${p#\~}";; esac  # ~ 확장 — TS expandHome과 동일 규칙(오탐 방지)
  while [ ! -d "$p" ] && [ "$p" != "/" ] && [ -n "$p" ]; do
    suffix="/$(basename "$p")$suffix"; p="$(dirname "$p")"
  done
  printf '%s%s' "$(cd "$p" 2>/dev/null && pwd -P || printf '%s' "$p")" "$suffix"
}

# NOTES_DIR 값("라벨=경로,..." 또는 "경로,...")을 줄 단위의 정규화된 경로 목록으로 푼다.
# 라벨 규칙은 TS(firstNotesDir)와 동일 — 첫 '='까지가 라벨.
notes_dir_paths() {
  local value="$1" item path
  # printf '%s'는 마지막 항목 뒤 개행이 없어 read가 EOF에서 본문을 건너뛴다 — || [ -n ] 가드 필수.
  printf '%s' "$value" | tr ',' '\n' | while IFS= read -r item || [ -n "$item" ]; do
    item="$(printf '%s' "$item" | command sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$item" ] && continue
    case "$item" in *=*) path="${item#*=}";; *) path="$item";; esac
    canon_path "$path"; printf '\n'
  done
}

# 후퇴 상태(환경변수·.env 모두 부재)에서 MCP 등록이 기본값과 다르면 stderr로 경고한다.
# 진행을 막지 않는다(색인은 계속) — 파괴적 반영의 차단은 자산 단계의 가드 소관(spec 공통 가드 원칙).
warn_notes_dir_divergence() {
  local mcp; mcp="$(mcp_notes_dir)"
  [ -z "$mcp" ] && return 0
  # 라벨·심링크 표기만 다른 동일 폴더(예: "main=~/.localmind")는 발산이 아니다 — 오탐 방지.
  [ "$(notes_dir_paths "$mcp")" = "$(canon_path "$HOME/.localmind")" ] && return 0
  {
    printf '  \033[33m!\033[0m 노트 폴더 설정(NOTES_DIR)이 이 셸에 없어 기본 폴더(~/.localmind)만 사용해요.\n'
    printf '    Claude Code(MCP) 등록은 다른 폴더 목록을 쓰고 있어요: %s\n' "$mcp"
    printf '    이대로 진행하면 일부 노트가 빠질 수 있어요 — .env에 NOTES_DIR를 추가하거나\n'
    printf "    'make mcp-install NOTES_DIR=<폴더 목록>'을 다시 실행하면 맞춰져요.\n"
  } >&2
}

# NOTES_DIR를 .env에 기록한다(정본 갱신). .env가 없으면 .env.example 복사(없으면 빈 파일)로
# 생성하고 권한 600을 준다(015 FR-9 계승). 기존 키는 중복 없이 교체(멱등), 다른 키는 보존.
record_notes_dir() { # <value> <env_file> [example_file]
  local value="$1" file="$2" example="${3:-}"
  if [ ! -f "$file" ]; then
    if [ -n "$example" ] && [ -f "$example" ]; then cp "$example" "$file"; else : > "$file"; fi
    chmod 600 "$file"
  fi
  if grep -qE '^NOTES_DIR=' "$file"; then
    local tmp; tmp="$(mktemp)"
    # 값은 ENVIRON으로 전달(awk -v는 백슬래시를 해석해 경로를 훼손할 수 있음).
    _LM_NOTES_DIR="$value" awk 'BEGIN{done=0} /^NOTES_DIR=/{if(!done){print "NOTES_DIR=" ENVIRON["_LM_NOTES_DIR"]; done=1}; next} {print}' "$file" > "$tmp"
    cat "$tmp" > "$file"; rm -f "$tmp"  # cat> 로 원본 권한 보존
  else
    printf 'NOTES_DIR=%s\n' "$value" >> "$file"
  fi
}
