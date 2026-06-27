# 서버별 원격 MCP로 인프라 운영

**한 인스턴스 = 한 서버.** 서버마다 localmind를 독립으로 띄우고 `MCP_INSTANCE`로 식별하면,
그 서버의 **자원 정보·장애 이력·메모리·노트가 서버별로 격리**됩니다. 노트북의 클라이언트에서
서버별 원격 MCP를 골라 접속해 "그 서버의 두뇌"에 질문합니다. 중앙 서버·공유 계정 의존 0.

## 1) 각 서버에서 (예: db-server)
```bash
# .env
MCP_HTTP_TOKEN=<랜덤-긴-토큰>
MCP_INSTANCE=db-server          # 서버마다 다르게 → 메모리/노트 격리
NOTES_DIR=/srv/runbooks/db      # 이 서버의 런북/스펙 노트(.md)

make up-mcp                      # → http://db-server:8788/mcp (Streamable HTTP)
```
app-server에선 `MCP_INSTANCE=app-server`, `NOTES_DIR=/srv/runbooks/app` 로 동일하게.

> tailnet 등 신뢰 네트워크에만 8788을 노출하세요. 토큰 없으면 기동 거부됩니다.

## 2) 노트북 클라이언트에 서버별로 등록
```bash
# Claude Code — 서버마다 하나씩
claude mcp add --transport http db  https://db-server:8788/mcp  --header "Authorization: Bearer <토큰>"
claude mcp add --transport http app https://app-server:8788/mcp --header "Authorization: Bearer <토큰>"
```
```jsonc
// Cursor .cursor/mcp.json
{ "mcpServers": {
  "db":  { "url": "http://db-server:8788/mcp",  "headers": { "Authorization": "Bearer <토큰>" } },
  "app": { "url": "http://app-server:8788/mcp", "headers": { "Authorization": "Bearer <토큰>" } }
}}
```

## 3) 운영 흐름 (도구로)
- **어느 서버인지 확인**: `whoami` → `instance: db-server`, 그 서버의 메모리/노트 경로
- **스펙/구성 적재**: "이 DB는 pg16, 32GB RAM, 일일 백업 02:00 라고 `capture_note`" → `/srv/runbooks/db`에 .md로 남음
- **장애 기록**: "오늘 03:12 커넥션 풀 고갈로 5분 장애. 원인·조치 `remember`" → 진화하는 기억에
- **런북 질의(RAG)**: "이 서버 백업 정책과 최근 장애 이력 정리해줘 `ask_brain`" → 그 서버 노트만 근거로 출처 인용
- **회상**: "최근에 이 서버에서 무슨 장애 있었지? `recall`"

→ 각 서버가 자기 자원 정보를 **그 서버 로컬에서** 관리하고, 추론도 **그 서버 자신의 CLI 로그인**으로
수행합니다. 한 서버가 다른 서버의 계정/스택에 의존하지 않습니다.

## 운영 팁
- 서버별 기억 백업: 그 서버에서 `OPENMEMORY_USER=db-server make memory-export FILE=/srv/runbooks/db/memory.md` → git
- 노트는 이미 `.md` 파일이라 `/srv/runbooks/*`를 git repo로 두면 push가 곧 백업입니다.
