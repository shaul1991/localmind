# T4.2 도그푸드 — 2026-07-21 17:34 (M5 실환경)

- `npm run build` → dist 재생성 OK.
- `npm run smoke:mcp` (stdio 실기동, 공식 MCP 클라이언트): tools/list == 정확히
  [capture_note, search_notes, whoami] 단언 통과 + whoami 실호출 → **"MCP 도구 표면 통과"**.
- `npm run smoke:brain` (.env의 실 EMBEDDINGS_URL=Ollama 직결): 임시 노트 폴더에
  capture_note(태그 호출자 공급) → 실제 임베딩 색인(watcher done 로그) → search_notes 회수
  → **"모든 second-brain 도구 통과"**. 임베딩 스택 무변경 실증(사용자 게이트 준수).
- `~/.localmind/query-log.jsonl`: 43줄 → 46줄 (+3 — 측정 루프 동작, AC-6 충족).
