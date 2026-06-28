# MCP 도구로 쓰기 — Cursor / Claude Desktop / Codex

localmind를 MCP 서버로 붙이면, 각 클라이언트가 **자기 모델로 코딩하면서** localmind의 도구
(`ask`·`remember`·`recall`·`capture_note`·`search_notes`·`ask_brain`·`whoami`)를 끌어 씁니다.

전제: `make up` (스택 기동) + `make build` (`dist/mcp.js` 생성).

## Cursor — `.cursor/mcp.json`
```jsonc
{ "mcpServers": { "localmind": {
  "command": "node",
  "args": ["/절대경로/localmind/dist/mcp.js"],
  "env": {
    "NOTES_DIR": "/내/노트/폴더",      // 내 .md 노트로 RAG (Obsidian 등)
    "OPENMEMORY_USER": "내이름"        // 내 기억 네임스페이스
  }
}}}
```

## Claude Desktop — `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) — 구조 동일:
```jsonc
{ "mcpServers": { "localmind": {
  "command": "node",
  "args": ["/절대경로/localmind/dist/mcp.js"],
  "env": { "NOTES_DIR": "/내/노트/폴더", "OPENMEMORY_USER": "내이름" }
}}}
```

## Codex CLI — `~/.codex/config.toml`
```toml
[mcp_servers.localmind]
command = "node"
args = ["/절대경로/localmind/dist/mcp.js"]
env = { NOTES_DIR = "/내/노트/폴더", OPENMEMORY_USER = "내이름" }
```

## 붙인 뒤 이렇게 말해보세요 (도구가 자동 호출됨)
- **교차 모델 상담**: "이 설계를 `ask`로 opus한테도 물어봐줘" → 다른 모델 의견을 받아 비교
- **기억 저장**: "우리 배포는 매주 목요일이라고 `remember`해줘" → 다음 세션에도 유지
- **회상**: "배포 언제였지? `recall`해봐" → 의미로 찾아옴
- **노트 적재**: "방금 결정한 캐싱 전략을 `capture_note`로 남겨줘"
- **노트 RAG**: "내 노트 기준으로 우리 retrieval 원칙이 뭐야? `ask_brain`" → 출처 인용 답변
- **정체 확인**: "`whoami`" → 지금 어떤 메모리/노트(인스턴스)를 쓰는지

> 같은 머신에 여러 노트 폴더/기억을 쓰고 싶으면 항목을 복제하고 `NOTES_DIR`/`OPENMEMORY_USER`만 다르게.
