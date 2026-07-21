---
title: M5 로컬 두뇌 복원 실행 기록 (restore-log)
audience: both
date: 2026-07-21
---

# M5 복원 실행 기록 — 복귀 절차와 1:1 대응 (AC-3)

## 단계 ① — http 모드 해제 확인
- `.env` grep: `MCP_TRANSPORT`·`MCP_AUTH_TOKEN`·`MCP_HTTP_*` **0건** — 이 기기는 원격을
  Claude Code의 `localmind-remote`(http 등록)로만 썼고 자기 `.env`는 stdio 기본 그대로였다.
  → 이 단계는 M5에선 no-op(절차상 "제거할 것 없으면 넘어감" — 문서에 반영).

## 단계 ② — 임베딩 엔진 기동 (U-5 실증)
- 10:37 `brew services start ollama` → started. `ollama list`: **bge-m3:latest 보존 확인**
  (qwen3-embedding:0.6b도 존치 — 기기 노트 기록과 일치).
- U-5 실증: `curl http://localhost:11434/v1/embeddings` (model=bge-m3, Bearer dummy-local)
  → **성공, 1024차원 임베딩 반환**. litellm(:4000) 게이트웨이 **불필요 확정** — Ollama /v1
  직결 성립.

## 단계 ③ — .env 구성·빌드
- `.env` 백업(`.env.bak-local-first-<epoch>`) 후 `EMBEDDINGS_URL=http://localhost:11434/v1`·
  `EMBEDDINGS_MODEL=bge-m3`·`EMBEDDINGS_KEY=dummy-local-ollama` 3줄 추가(기존 항목 무변경).
- NOTES_DIR은 기존 구성 그대로(무라벨 쉼표 3폴더: ~/.localmind·벌트 shared·private) — 외과적.
- 기존 색인: `.brain-index.json` 66B·파일 0건(빈 껍데기 — 기기 노트 "삭제됨"과 실질 일치).
- `npm run build` → dist/mcp.js 갱신(stdio 진입점).

## 단계 ③ 잔여 — 재색인 (U-4 실증)
- `make reindex` → **13분 26초**, "임베딩 모델이 바뀌어(text-embedding-3-small → **bge-m3**)
  처음부터 다시 색인" 안내와 함께 **1200파일·8537청크** 색인(18MB). U-4 확정: EMBEDDINGS_MODEL
  =bge-m3가 자식 프로세스에 전달·실동작(Phase 0 배선의 첫 실전 작동 증명).

## 단계 ④ — MCP 등록
- `make mcp-install` → Claude Code에 `localmind`(stdio) 등록, `claude mcp list`에서
  **✔ Connected** (원격 `localmind-remote`도 병행 Connected — OQ-2대로 유지).
- `make mcp-desktop` → Desktop config에 localmind 항목 + env에 **EMBEDDINGS_URL/MODEL 포함**
  실확인(AC-5·AC-7 실전). EMBEDDINGS_KEY는 스크립트 패스스루 스코프 밖(spec대로) —
  LITELLM_MASTER_KEY 폴백으로 가드 통과함을 아래 검증이 실증.

## 단계 ⑤ — 검증 (AC-4)
- Desktop config env 등가로 dist/mcp.js stdio 직접 호출(JSON-RPC):
  - `whoami` → `🧠 memory_user: localmind` ✓
  - `search_notes "거버넌스 재보정 확정"` → 로컬 색인에서 회수(0.573,
    governance-recalibration.md) ✓ — **검색 = 쿼리 임베딩 필수이므로 Ollama 직결 실작동 증명**
  - `capture_note` → 노트 저장 + **로컬 query-log.jsonl 40→41줄 기록**(측정 루프 복원) ✓

## 단계 ⑥ — 원격 등록 정리
- OQ-2대로 **병행 유지**(제거 여부는 사용자 확인 항목).

## 기기 노트 갱신 (T1.5)
- devices/shaulm5local.md — "홈서버 두뇌만" 절을 "로컬 두뇌 기본 + 원격 옵션(2026-07-21)"로
  갱신: Ollama 기동·인덱스 재생성·Desktop 재등록·Claude Code 병행을 실상대로(취소선 보존).
