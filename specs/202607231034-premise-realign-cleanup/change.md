# change.md — 최상위 전제 정렬 + 재개편 후 문서·스모크 드리프트 정리

## Why

2026-07-23 최상위 전제 확정(AGENTS.md — "AI에게 작업을 위임하기 위해 AI를 잘 사용한다;
localmind의 1차 소비자는 임무를 수행하는 AI")에 따라 프로젝트 전반을 재점검한 결과:

1. `make smoke`(smoke:mcp)가 도구 표면을 3종으로 기대하나 서버는 4종(brief 포함) — **확정 결함**
   (living-memory #44에서 스모크 갱신 누락, CI는 smoke를 안 돌려 미검출).
2. README·concepts·faq·reference에 "도구 3종" 표기 잔존(5곳) — `docs/mcp.md`(4종)와 모순.
3. README에 living-memory 대표 기능(brief·결정 3층·낡음 신호)과 새 전제(1차 사용자 = AI) 미반영.
4. `reference.md` 환경변수 표의 `EMBEDDINGS_URL` 기본값이 `:4000`(LiteLLM 잔재) — 코드 기본값은
   `:11434`(brain.ts).
5. AGENTS.md가 저장소에 없는 경로 5건 참조(docs/workflows.md·templates/* 4건 — sdd-toolkit 이관분).
6. product-vision.md가 draft 상태(2026-07-21 검토 대기) — 전제 확정으로 확정 조건 충족.
7. MCP 서버 버전 하드코딩 "0.2.0" vs 패키지 2026.07.9.
8. home-server.md 보안 체크리스트가 소멸한 구 스택 포트(8787/4000/8767)·변수(LITELLM_MASTER_KEY) 기준.

## What

- `scripts/smoke-mcp.ts`: 기대 도구 표면 3→4종(brief 추가). 무전제(임베딩 불필요) 성질 유지 —
  brief 호출 검증은 기존 테스트 스위트가 담당.
- `README.md`: 새 전제 반영 재작성(위임자 = 모든 사람, 1차 사용자 = AI) + brief·결정 3층·낡음
  신호 소개 + "3종"→"4종".
- `docs/concepts.md`·`docs/faq.md`·`docs/reference.md`: "3종"→"4종", EMBEDDINGS_URL 기본값 정정.
- `docs/home-server.md`: 보안 체크리스트를 현 스택(Ollama·mcp-http) 기준으로 정정.
- `docs/product-vision.md`: status 확정 + §0 최상위 전제 승격.
- `AGENTS.md`: 죽은 참조 5건 → sdd-toolkit 저장소 경로로 교체.
- `src/mcp-server.ts`: 서버 버전을 package.json에서 동적으로 읽기(폴백 포함).

## AC

- [x] AC-1: `npm run smoke:mcp`가 4종 표면에서 green. — 실측: 수정 전 실패 상태 확인 →
      수정 후 direct(tsx)·npm 경로·dist 재빌드 후 3회 모두 "MCP 도구 표면 통과".
- [x] AC-2: README·docs(역사 문서 rebuild-plan·audit 제외)에 "도구 3종" 표기 0건. — grep 실측 0건.
- [x] AC-3: `reference.md` 환경변수 기본값 = 코드 기본값(brain.ts —
      `http://localhost:11434/v1`). — brain.ts:80과 대조 확인.
- [x] AC-4: README에 brief·결정 3층 캡처·낡음 신호·"1차 사용자 = AI" 전제가 드러남. —
      hero·기능 목록(🧭·⏳ 추가)·"누구를 위한 건가요" 반영.
- [x] AC-5: AGENTS.md에 저장소에 존재하지 않는 로컬 경로 참조 0건. — 5건 전부 sdd-toolkit
      저장소 참조로 교체(grep으로 로컬 링크·`cp templates/` 0건 확인). **사용자 지적으로 정정
      (2026-07-23)**: sdd-toolkit은 repo째 아카이브(동결·참고 소스, 2026-07-23 결정 노트) —
      참조 5건을 "아카이브 — 참고 소스" 위상으로 재표기하고, 신규 메타 제작처는
      `localmind-addons`(07-24 회고 후 구현)임을 AGENTS.md에 명시.
- [x] AC-6: product-vision.md status가 확정(confirmed 2026-07-23)이고 §0 최상위 전제 포함.
- [x] AC-7: MCP 서버가 보고하는 버전 = package.json version. — 실측: 재빌드 dist에 MCP
      클라이언트로 접속, `server version: 2026.07.9` 확인. `tsc --noEmit` OK · 스위트 255/255 green
      (이 change 검증 시점 기준 — 이후 같은 PR의 src 정리(specs/202607231049)로 최종 177/177).

**self-review (Tier 1 — in-session 적대 자기검증 1라운드, 비독립)**: diff 스코프 재검토 —
smoke 기대값 정렬(실행 실측), faq "삭제 도구 없음" 주장 유지 검증(4종 전부 추가 쓰기/읽기 전용),
PKG_VERSION의 src(tsx)·dist 양 경로 해석 확인, README brief 서술의 배선 전제(지침 한 줄)는
mcp.md가 정본으로 커버. blocker 0.

## 티어 근거

**Tier 1** — 문서 정정 + 국소 스크립트/서버 메타 수정. 하드 신호 없음: MCP 도구 표면(계약)
자체는 무변(스모크의 낡은 기대값을 실제 표면에 맞춤), 스키마·보안·마이그레이션·전역 상태
무관. config 값 변경 아님(문서의 기술 오류 정정). 검증은 결정적(스모크·스위트·grep)이고 가역적.
