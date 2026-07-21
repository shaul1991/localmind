# T4.2 도그푸드 — 2026-07-21 17:34 (M5 실환경)

- `npm run build` → dist 재생성 OK.
- `npm run smoke:mcp` (stdio 실기동, 공식 MCP 클라이언트): tools/list == 정확히
  [capture_note, search_notes, whoami] 단언 통과 + whoami 실호출 → **"MCP 도구 표면 통과"**.
- `npm run smoke:brain` (.env의 실 EMBEDDINGS_URL=Ollama 직결): 임시 노트 폴더에
  capture_note(태그 호출자 공급) → 실제 임베딩 색인(watcher done 로그) → search_notes 회수
  → **"모든 second-brain 도구 통과"**. 임베딩 스택 무변경 실증(사용자 게이트 준수).
- `~/.localmind/query-log.jsonl`: 43줄 → 46줄 (+3 — 측정 루프 동작, AC-6 충족).

## r1 blocker 수정 후 도그푸드 (self-review round 1 반영 — 2026-07-21)

- **B3 `make report` 경로**: `npx tsx scripts/brain-report.ts` → exit 0, 리포트 노트 발행
  확인(페르소나 해석부 절단 — 집계-only). r1 이전엔 ERR_MODULE_NOT_FOUND exit 1이었다.
- **B2 `make setup` 경로**: `HOME=<격리> DRY_RUN=1 bash scripts/setup.sh` → 전 단계 완주,
  exit 127 없음, 삭제 스크립트(embed/ensure-master-key/claude-token/ui)·유령 :4000·죽은
  make 타깃 언급 0 (grep 재확인). 4단계 재편(게이트웨이 백엔드 인증 절 제거 — 소비자 0 실측).
- **B4 무키 경로**: EMBEDDINGS_KEY·LITELLM_MASTER_KEY 모두 빈 자식 프로세스에서 capture →
  "임베딩 키(EMBEDDINGS_KEY)가 설정되지 않았어요…"로 실패(결정적 테스트로 영구 편입 —
  src/brain.test.ts "임베딩 키 미설정 에러 안내"). mcp-install 패스스루는
  scripts/mcp-install.test.sh B4 케이스 3건(전달·URL/MODEL 동반·미설정 바이트 동일)으로 검증.
- **재검증 스위트**: 단위 233/233 green(+2: buildNoteFrontmatter 이관·B4 무키) · 셸 19파일
  전수 green · typecheck OK · `npm run smoke:mcp` 통과(도구 3종 표면).
- desktop 쪽 EMBEDDINGS_KEY 패스스루는 동일 관용구(`${VAR:+…}`+`if(LM_EMB_KEY)`)로 배선 —
  단 mcp-desktop.sh는 .env 격리 훅이 없어 결정적 테스트는 install 쪽만(정직 기록).

## r2 도그푸드 (2026-07-22, B-NEW 수정 검증)
- `bash scripts/embedding-up.sh` → `✓ 임베딩 엔진이 이미 켜져 있어요 (http://localhost:11434)` · exit 0 (기존 Ollama 감지 — 비파괴 통과 경로).
- 헤드리스 위저드: `LOCALMIND_NO_OPEN=1 GUIDE_PORT=8931 node scripts/install-wizard.mjs` → `POST /api/run {"id":"up"}` 스트림 종료 센티넬 `__STATUS__:{"ok":true,"code":0}` · `GET /` 200. **exit 127 재현 소멸**(r2 이전: 삭제된 up.sh spawn 실패).
- 재발 방지: install-wizard.test.mjs에 COMMANDS 스크립트 실존 단언 추가(RED 관찰 후 GREEN — 18/18).
