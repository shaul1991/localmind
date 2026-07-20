---
title: 변경 등급 티어링과 critic 콜드리드 캐싱 — tasks
audience: ai
---

# Tasks: 티어링 + matrix 기반 critic 캐싱

병렬 판정은 각 phase 헤더 직하의 `depends-on:`·`files:` 선언으로 한다(정본:
`templates/skills/goal-impl/references/tasks-format.md`). Phase 2·3·4는 Phase 1에만 의존하고 서로
파일 disjoint라 동시 fan-out 대상이다. Phase 5는 2·3·4의 배리어 뒤에 온다.

> **OQ-5 확정(2026-07-20): 보수형.** critic 캐싱은 matrix-as-map 재사용까지이고, 라운드마다 전량
> 재검증한다(verdict 승계·무효화-스킵 없음 → per-round 독립성 완전 보존). 적극형은 미도입.

## Phase 1 — AGENTS.md 티어·캐싱 정본 + worked-example
> depends-on: 없음 · files: `AGENTS.md`

- [ ] **T1.1** "변경 등급 티어" 절 — Tier 0/1/2 객관적 트리거(하드 신호 목록, **config 값 Tier0 제외**) (FR-1)
- [ ] **T1.2** 대표 변경→티어→근거 **worked-example 표** 신설(AC-1~4 검증 대상) (FR-1)
- [ ] **T1.3** 티어별 문서·critic 매핑 표 + Tier 1 TDD 유지·Tier 0만 테스트 생략 (FR-2, AC-6)
- [ ] **T1.4** 티어 판정 기록·중간 승격(하향 금지)·**escalate-on-doubt 양 경계(0↔1·1↔2)** (FR-3, AC-4·7·8)
- [ ] **T1.5** critic 캐싱 규칙 절 — matrix-as-map(FR-4)·**라운드 전량 재검증(보수형: 승계·스킵 없음)**(FR-5)·within-run map 재사용(FR-6) (AC-11·12·13)
- [ ] **T1.6** round-to-round 무효화-스킵 미도입 명시 + base-통합 재평가는 202607181125 정본 소관 불변 (FR-5)
- [ ] **T1.7** 가드레일 2(독립성·map 재사용 범위) + instruction-level 정직 표기(문구 존재=작동 과장 금지) (C-2, R-6, AC-10·13)
- [ ] **T1.8** `202607181125` 확정 참조 + 불약화 명시 + Tier 2 규율 불변 (FR-7, AC-15)

## Phase 2 — goal-ready 티어 인지 + Tier 1 경량 문서 + 사용자 문서
> depends-on: Phase 1 · files: `templates/skills/goal-ready/SKILL.md`, `templates/sdd/change.template.md`, `docs/workflows.md`

- [ ] **T2.1** 활성화 판정에 티어 확인 추가 — Tier 0/1이면 4문서 미강제, lane 안내 (FR-2·3, AC-5)
- [ ] **T2.2** Tier 1 경량 문서 `change.md` 경로·최소 섹션(why·what·AC·티어 근거) 명문화 (OQ-1, AC-7)
- [ ] **T2.3** `templates/sdd/change.template.md` 스켈레톤 신설 (Given-When-Then AC 힌트)
- [ ] **T2.4** `docs/workflows.md`에 세 티어 lane 사용자 설명(비개발자 한국어, AGENTS.md parity) (FR-9, AC-17)

## Phase 3 — self-review·critic: matrix-as-map + within-run + 독립성
> depends-on: Phase 1 · files: `templates/skills/sdd-self-review/SKILL.md`, `templates/agents/critic.md`

- [ ] **T3.1** self-review 읽기 대상에 `matrix 행 = AC↔코드·evidence 지도` 추가(기존 diff 스코프 위에) (FR-4, AC-9)
- [ ] **T3.2** 독립성 가드레일 문구 — "각 행 실제 코드 검증, matrix 상태 셀만으로 통과 금지" (FR-4, AC-10)
- [ ] **T3.3** 라운드 전량 재검증(verdict 승계·스킵 없음, per-round 독립성 보존) + within-run map 재사용·cross-session 금지 (FR-5·6, AC-11·12·13)
- [ ] **T3.4** critic.md에 matrix 지도 읽기 + 도장찍기 금지 반영 (FR-4, AC-10)
- [ ] **T3.5** ⚠️ `skill-contract.test.ts`가 bounded-gap regex로 핀한 앵커 문장을 분해하지 말고 별도 절·불릿으로 추가 (AC-14 보호)

## Phase 4 — goal-impl: 티어 인지 의식 + 라운드 전량 재검증·map 재사용
> depends-on: Phase 1 · files: `templates/skills/goal-impl/SKILL.md`

- [ ] **T4.1** 티어 인지 실행 — Tier 1 in-session 1라운드, Tier 2 현행 격리 2라운드 (FR-3)
- [ ] **T4.2** 라운드 전환 시 전량 재검증(map만 재사용, 승계·무효화-스킵 없음)을 §7A 인근 명문화 (FR-5, AC-11·12)
- [ ] **T4.3** round-to-round 무효화 판정 미도입 명시 + base-통합 재평가는 202607181125 정본 소관 불변 (FR-5·7)
- [ ] **T4.4** 중간 티어 승격(하향 금지) (FR-3, AC-8)
- [ ] **T4.5** ⚠️ §7A/§7B round budget·상태표 핀 문장 보존 — 별도 절·불릿으로 추가 (AC-14 보호)

## Phase 5 — 계약·worked-example·드리프트 테스트 (TDD 게이트)
> depends-on: Phase 2, Phase 3, Phase 4 · files: `src/agents/tier-classification.test.ts`, `src/agents/workflow-policy.test.ts`, `src/agents/deploy.test.ts`

- [ ] **T5.1** (RED 먼저) `tier-classification.test.ts` — AGENTS.md worked-example 내부정합·무모호(AC-1~4)
- [ ] **T5.2** (RED 먼저) `workflow-policy.test.ts`에 AC-5~13·15·17 문구 대조 + **AGENTS.md 로더 추가**(AC-5)
- [ ] **T5.3** 배포 드리프트 0 확인 — `deploy.test.ts` 멱등 재배포 (AC-16)
- [ ] **T5.4** 기존 bounded-verification 계약 테스트 green 재확인 (AC-14) + 전체 스위트 회귀
- [ ] **T5.5** 도그푸드 — 각 티어 1건씩 실제 흐름 관찰(Tier 0 직접 / Tier 1 change.md / Tier 2 4문서)

## Phase 6 — versioned closure·publish handoff 준비
> depends-on: Phase 5 · files: `specs/202607201059-change-tiers-and-critic-cache/goal.md`, `specs/202607201059-change-tiers-and-critic-cache/spec.md`, `specs/202607201059-change-tiers-and-critic-cache/plan.md`, `specs/202607201059-change-tiers-and-critic-cache/tasks.md`

- [ ] **T6.1** self-review clean 후 세 문서에 검증 표기(`[x]` + 근거), 미충족은 사유 부기
- [ ] **T6.2** PR 본문 요약(두 축 + 202607181125 불약화 근거 + OQ-5 결정) 준비

## External handoff — tracked checkbox 범위 밖

- feature branch를 push하고 PR을 만든다(main 직접 push 금지 — AGENTS.md 규약7).
- PR head의 CI를 remote에서 확인하고 최종 보고에 링크·상태를 남긴다.
