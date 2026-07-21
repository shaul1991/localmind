# evidence — T1.1·T1.2 sdd-toolkit 추출·스위트 (AC-4 toolkit 절반)

- repo: `~/personal/shaul1991/sdd-toolkit` (git init, 2026-07-21)
- 이전: inventory Extract 전수 — src(agents 28파일 디렉토리 통이전·rules 9·루트 메타 14) +
  scripts 11 + templates/ 48 + docs 5(agents·personas·workflows·flow gif 2) + AGENTS.md·
  CLAUDE.md·GEMINI.md·CHANGELOG.md 사본 + 하네스(package.json·tsconfig·Makefile·README·.gitignore)
- **코어 의존 shim 3** (verbatim 발췌 — 로직 무변): `src/brain.ts`(NoteFolder·parseFolders·
  listFolders·buildNoteFrontmatter만), `src/backends/router.ts`(detectBackend만),
  `src/query-analysis.ts`(파일 통사본 — node:fs만 의존). `scripts/brain-report.ts` 통사본.
- **스냅샷 사본**: specs/027-design-tool-verification·202607191145-deep-research-evidence-pack·
  202607201808-critic-efficiency, tests/fixtures/ (문서 계약 테스트의 참조 대상)

## 스위트 결과 (npm test)
**tests 635 · pass 629 · fail 0 · skipped 6** + typecheck 통과.

## 수선 목록 — 경로 수준 (로직 무변)
1. seed.test AC-12 위생 파일 목록에서 `src/mcp-server.ts` 제외(레이아웃 적응 — localmind 잔존).
2. workflow-docs 044 경계 존재 확인 목록에서 `src/server.ts` 제외(동일 사유).
3. README에 localmind README의 workflow 절(deep-research logical ID·호출표) 이식.

## 은퇴(retire) — 경로 수선 범위 초과, 사유 명시 (지시의 "어길 상황 보고" 항목)
- **`src/delegation.test.ts` 삭제(20 테스트)** — specs/017 brain 페르소나 위임(사서 합성·크리틱
  검증·큐레이터 태깅) 통합 테스트: brain 자식 프로세스+스텁 게이트웨이 실행. 검증 대상 자체가
  great-reduction Phase 2에서 소멸(게이트웨이 제거와 함께 페르소나 훅 제거 — spec FR-4).
- **workflow-lifecycle 6건 `it.skip`** — localmind 코어 스크립트(backup*/restore*/recover/
  asset-dirs) 파이프라인 통합: 데이터 폴더 백업 책임·테스트는 localmind 잔존.
- **skills.test 1건 `describe.skip`** — 스킬 정본의 노트 색인 제외 회귀: brain 색인(코어)
  통합. 색인 제외 동작 검증 책임은 localmind 스위트에 남음.
