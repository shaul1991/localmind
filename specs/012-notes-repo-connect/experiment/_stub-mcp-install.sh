#!/usr/bin/env bash
# mcp-install.sh 스텁 — 실험 오라클이 MCP_INSTALL_CMD로 지정한다.
# 전달받은 NOTES_DIR(환경변수)를 STUB_OUT 파일에 기록하고 STUB_RC(기본 0)로 종료한다.
# 이 파일 존재 여부로 "등록이 호출됐는가"를 판정한다.
printf '%s\n' "${NOTES_DIR:-<none>}" > "${STUB_OUT:-/dev/null}"
exit "${STUB_RC:-0}"
