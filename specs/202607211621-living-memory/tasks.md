---
audience: both
---

# tasks — 살아있는 기억

phase 선언 문법은 `templates/skills/goal-impl/references/tasks-format.md`를 따른다.
경로는 great-reduction 이후 기준 — 착수 시 실경로 정합(plan 경로 전제 참조).

## Phase 0 — Decision 도메인 (TDD)
> depends-on: 없음 · files: `src/decision.ts`, `src/decision.test.ts`

- [ ] **T0.1** 실패 테스트 먼저: Decision 파싱·직렬화(AC-1 구조), 검증 실패 한국어 에러(AC-3),
  낡음 판정(high+임계 초과=신호 / 전부 low·최근 검증=무신호 / last_verified 갱신 반영 —
  AC-7·8·10 판정 로직) → 최소 구현으로 green.

## Phase 1 — capture 확장
> depends-on: Phase 0 · files: `src/mcp-server.ts`, `src/mcp-server.test.ts`

- [ ] **T1.1** capture_note 입력 스키마 확장(choice·why·assumptions 선택 파라미터) →
  decision frontmatter 저장(AC-1). 단일 호출 완결(AC-11).
- [ ] **T1.2** 비정형 경로 회귀 테스트 — 파라미터 미지정 시 현행과 동일 구조(AC-2),
  volatility 누락 시 파일 미생성 + 한국어 에러(AC-3 통합 레벨).

## Phase 2 — brief 도구
> depends-on: Phase 1 · files: `src/mcp-server.ts`, `src/mcp-server.test.ts`, `.env.example`

- [ ] **T2.1** brief 등록 — 힌트로 현행 검색 재사용, 결정 요약(선택·이유·전제 상태) 조립
  (AC-5), 무관/무결과 시 빈 브리핑 한국어 안내(AC-6).

## Phase 3 — 낡음 신호
> depends-on: Phase 2 · files: `src/mcp-server.ts`, `src/mcp-server.test.ts`

- [ ] **T3.1** search_notes·brief 응답 끝 한 줄 신호 부가(AC-7 — 본문 무변 검증 포함),
  무신호 조건(AC-8), 깨진 frontmatter 내성(AC-9), 기존 노트 전 경로 비회귀(AC-4).

## Phase 4 — docs·도그푸드·self-review
> depends-on: Phase 3 · files: `docs/usage.md`, `docs/mcp.md`, `specs/202607211621-living-memory/evidence/`

- [ ] **T4.1** AC-12 문서(결정 캡처·CLAUDE.md 한 줄 brief 연결·재검증 관례) + 전체 스위트
  green.
- [ ] **T4.2** 도그푸드: 실제 결정 노트 캡처 → brief 호출 → 신호 관찰(임계 조작으로 stale
  재현) — evidence 기록.
- [ ] **T4.3** preflight → 격리 self-review(§7A 예산) → 문서 검증 표기 → versioned closure.

## External handoff

- feature branch push + PR (great-reduction 머지 후 그 위에).
- CI 감시(full SHA) · 릴리스는 규약 CalVer 절차.
