---
title: 변경 등급 티어링과 critic 콜드리드 캐싱 — 계획
audience: both
---

# Plan: 티어링 + matrix 기반 critic 캐싱 구현

> **요약** — 이 변경은 런타임 도메인 코드가 아니라 **SDD 프로세스 거버넌스 계약**을 바꾼다. 정본
> `AGENTS.md`에 티어·캐싱 규칙과 worked-example을 정의하고, 세 워크플로 skill 계약 + critic 페르소나 +
> 사용자 문서(`docs/`)를 티어·캐싱 인지형으로 개정한 뒤, 계약 텍스트 완결성·worked-example 정합·배포
> 드리프트 테스트로 고정한다. **티어 판정은 런타임 분류기 코드가 아니라 워크플로가 규약을
> 읽어 수행**하므로(Non-goal), 테스트는 SUT-분류기가 아니라 **규약 텍스트의 무모호성·worked-example
> 내부 정합**을 검증한다. **OQ-5는 보수형 확정** — critic 캐싱은 map 재사용까지이고 round-to-round
> verdict 승계·무효화-스킵은 도입하지 않는다(설계 단순화, 독립성 완전 보존).

## 도메인 경계 (DDD)

- **바운디드 컨텍스트: SDD Process Governance (프로세스 거버넌스/계약 층).** 인덱싱·검색·MCP 같은
  제품 도메인 코드는 건드리지 않는다.
- **유비쿼터스 언어 추가:** `변경 등급(Change Tier)` · `Tier 0/1/2` · `matrix-as-map`(critic 조사 지도) ·
  `map 재사용(within-run)` · `전량 재검증(보수형)` · `escalate-on-doubt`. (적극형 용어 `verdict 승계`·
  `무효화-스킵`은 미채택 — 도입하지 않는다.)
- **정본(SSoT) 경계:**
  - 티어 정의·티어별 의식·critic 캐싱 규칙·worked-example의 **저장소 정본 = `AGENTS.md`**.
  - 워크플로 행동 정본 = `templates/skills/{goal-ready,goal-impl,sdd-self-review}/SKILL.md`.
  - critic 자세 정본 = `templates/agents/critic.md`.
  - 사용자 문서 = `docs/workflows.md`(파생 아님 — 사람용 정본, AGENTS.md와 parity).
  - skill·agent 정본은 `skills-deploy`/`agents-deploy`로 데이터 폴더 → Claude/Codex/Gemini에 배포(파생).
- **인접 정본 존중:** `202607181125`가 self-review 2라운드 상한·matrix 동결·base freshness·외부 완료
  SSoT의 정본이다. 이 slice는 그 규칙을 **참조·확장**하며 재정의하지 않는다.

## 영향 모듈

| 파일 | 변경 | 관련 FR |
|---|---|---|
| `AGENTS.md` | "변경 등급 티어" 절 + worked-example 표 + critic 캐싱 규칙(map 재사용·전량 재검증, 가드레일 2) | FR-1·2·4·5·6·7·8 |
| `templates/sdd/AGENTS.md` | 위 규칙의 **generic 전파**(새 프로젝트 scaffold — localmind 고유 문구 금지). 202607181125 전파 선례. | FR-1·2·5·8 |
| `templates/skills/goal-ready/SKILL.md` | 진입 티어 판정, Tier 0/1은 4문서 미강제, Tier 1 경량 문서 경로 | FR-1·2·3 |
| `templates/skills/goal-impl/SKILL.md` | 티어 인지 의식, 라운드 전량 재검증·map 재사용(§7A 인근 — 핀 문장 보존) | FR-3·5·6·7 |
| `templates/skills/sdd-self-review/SKILL.md` | critic 조사 지도(matrix-as-map), 전량 재검증, within-run map 재사용, 독립성 문구 | FR-4·5·6 |
| `templates/agents/critic.md` | matrix 지도 읽기 + "행마다 실제 코드 검증, 도장찍기 금지" | FR-4 |
| `templates/sdd/change.template.md` (신규) | Tier 1 경량 단일 문서 스켈레톤 | FR-2 |
| `docs/workflows.md` | 세 티어 lane 사용자 설명(비개발자 한국어, AGENTS.md parity) | FR-9 |
| `src/agents/tier-classification.test.ts` (신규) | 규약 worked-example 내부정합(AC-1~4) | AC-1·2·3·4 |
| `src/agents/workflow-policy.test.ts` | 티어·캐싱·가드레일 문구 대조(AGENTS.md 로더 추가) | AC-5·6·7·8·9·10·11·12·13·15·17 |
| `src/agents/deploy.test.ts` | 변경 계약 멱등 배포·드리프트 0 | AC-16 |
| (검증만) 기존 bounded-verification 계약 테스트(`skill-contract.test.ts` 등) | 회귀 green 유지 | AC-14 |

## OQ 해소 (plan에서 확정 — spec OQ 취소선 반영)

- **OQ-1 → 확정:** Tier 1 경량 문서 = `specs/{timestamp}-{slug}/change.md` **단일 파일**. 최소 섹션:
  `왜(3~5줄)` · `무엇을(변경 범위)` · `AC(Given-When-Then, 테스트 1:1)` · `티어 근거`. 템플릿
  `templates/sdd/change.template.md`로 시드.
- **OQ-2 → 확정:** 티어 판정 입구 = **AGENTS.md 최상위 lane 결정**. goal-ready는 Tier 2 문서 준비
  전용으로 남기되 진입에서 Tier 0/1이면 4문서를 짓지 않고 lane 안내(Tier 0 직접 / Tier 1 change.md).
  **새 triage 스킬·엔진 없음**(Non-goal).
- **OQ-3 → 무효(보수형으로 소멸):** blast-radius 무효화는 round-to-round 스킵을 위한 것이었으나
  보수형은 라운드마다 전량 재검증하므로 **round-to-round 무효화 판정 자체를 도입하지 않는다.**
  (base-통합 재평가의 무효화는 202607181125 정본 소관으로 불변 — 이 slice가 재정의하지 않는다.)
- **OQ-4 → 확정:** 문구 대조 = `workflow-policy.test.ts`(AGENTS.md 로더 추가) — 캐싱 문구(AC-11·12·13)
  도 여기서 대조한다. tier 트리거 worked-example 정합 = 신규 `tier-classification.test.ts`(AC-1~4).
  배포 = `deploy.test.ts`.
- ~~**OQ-5** — 라운드 간 verdict 승계 여부.~~ → **사용자 확정(2026-07-20): 보수형.** 라운드마다 전량
  재검증·map만 재사용. 적극형(승계·무효화-스킵) 미채택. FR-5·6·AC-11·12·13에 반영 완료.

## 단계 (Phase)

## Phase 1 — AGENTS.md 티어·캐싱 정본 + worked-example (+ scaffold 전파)
> depends-on: 없음 · files: `AGENTS.md`, `templates/sdd/AGENTS.md`

- [x] "변경 등급 티어" 절: Tier 0/1/2 객관적 트리거(하드 신호 목록, config 값 Tier0 제외) + **worked-example 표** (FR-1)
- [x] 티어별 문서·critic 매핑 표 + Tier 1 TDD 유지·Tier 0만 테스트 생략 (FR-2, AC-6)
- [x] 티어 판정 기록·중간 승격(하향 금지)·escalate-on-doubt(양 경계) (FR-3, AC-4·7·8)
- [x] critic 캐싱 규칙 절: matrix-as-map(FR-4)·라운드 전량 재검증(FR-5, 보수형: 승계·스킵 없음)·within-run map 재사용(FR-6)
- [x] 가드레일 2(독립성·map 재사용 범위) + instruction-level 정직 표기 (C-2, R-6, AC-10·11·12·13)
- [x] `202607181125` 확정 참조 + 불약화 명시 + Tier 2 규율 불변 (FR-7, AC-15)
- [x] **scaffold 전파**: `templates/sdd/AGENTS.md`에 티어·캐싱 규칙 generic 버전 반영(localmind 고유 문구 금지 — scaffold.test AC-5) (FR-8)
- RED 기대: Phase 5의 텍스트 완결성·worked-example 테스트가 이 문구 부재로 먼저 실패한다.

## Phase 2 — goal-ready 티어 인지 + Tier 1 경량 문서 + 사용자 문서
> depends-on: Phase 1 · files: `templates/skills/goal-ready/SKILL.md`, `templates/sdd/change.template.md`, `docs/workflows.md`

- [x] goal-ready 활성화 판정에 티어 확인 추가: Tier 0/1이면 4문서 미강제, lane 안내 (FR-2·3, AC-5)
- [x] Tier 1 `change.md` 경로·최소 섹션 명문화, Tier 1도 TDD (OQ-1, AC-6·7)
- [x] `templates/sdd/change.template.md` 스켈레톤 신설(GWT AC 힌트)
- [x] `docs/workflows.md`에 세 티어 lane 사용자 설명(비개발자 한국어, AGENTS.md parity) (FR-9, AC-17)

## Phase 3 — self-review·critic: matrix-as-map + within-run + 독립성
> depends-on: Phase 1 · files: `templates/skills/sdd-self-review/SKILL.md`, `templates/agents/critic.md`

- [x] self-review 읽기 대상에 `matrix 행 = AC↔코드·evidence 지도` 추가(기존 diff 스코프 위에) (FR-4, AC-9)
- [x] 독립성 가드레일 문구: "각 행 실제 코드 검증, matrix 상태 셀만으로 통과 금지" (FR-4, AC-10)
- [x] 라운드 전량 재검증(승계·스킵 없음, per-round 독립성 보존) + within-run map 재사용·cross-session 금지 (FR-5·6, AC-11·12·13)
- [x] critic.md에 matrix 지도 읽기 + 도장찍기 금지 반영 (FR-4, AC-10)
- ⚠️ `skill-contract.test.ts`가 bounded-gap regex로 핀한 앵커 문장을 분해하지 말고 별도 절·불릿으로 추가(AC-14 보호)

## Phase 4 — goal-impl: 티어 인지 의식 + 라운드 전량 재검증·map 재사용
> depends-on: Phase 1 · files: `templates/skills/goal-impl/SKILL.md`

- [x] 티어 인지 실행: Tier 1 in-session 1라운드, Tier 2 현행 격리 2라운드 (FR-3)
- [x] 라운드 전환 시 전량 재검증(map만 재사용, verdict 승계·무효화-스킵 없음)을 §7A 인근 명문화 (FR-5, AC-11·12)
- [x] round-to-round 무효화 판정 미도입 명시 + `202607181125` base-통합 재평가는 그 정본 소관으로 불변 (FR-5·7)
- [x] 중간 티어 승격(하향 금지) (FR-3, AC-8)
- ⚠️ §7A/§7B의 round budget·상태표 핀 문장 보존 — 별도 절·불릿으로 추가(AC-14 보호)

## Phase 5 — 계약·worked-example·드리프트 테스트 (TDD 게이트)
> depends-on: Phase 2, Phase 3, Phase 4 · files: `src/agents/tier-classification.test.ts`, `src/agents/workflow-policy.test.ts`, `src/agents/deploy.test.ts`

- [x] (RED 먼저) `tier-classification.test.ts`: AGENTS.md worked-example의 내부 정합·무모호성(AC-1~4)
- [x] (RED 먼저) `workflow-policy.test.ts`: AC-5~13·15·17 문구 대조 + **AGENTS.md 로더 추가**(AC-5 대조 가능화)
- [x] 배포 드리프트 0 확인 — `deploy.test.ts` 멱등 재배포 (AC-16)
- [x] 기존 bounded-verification 계약 테스트 green 재확인 (AC-14) + 전체 스위트 회귀
- [x] 도그푸드 — 각 티어 1건씩 실제 흐름 관찰(Tier 0 직접 / Tier 1 change.md / Tier 2 4문서)

## Phase 6 — versioned closure·publish handoff 준비
> depends-on: Phase 5 · files: `specs/202607201059-change-tiers-and-critic-cache/goal.md`, `specs/202607201059-change-tiers-and-critic-cache/spec.md`, `specs/202607201059-change-tiers-and-critic-cache/plan.md`, `specs/202607201059-change-tiers-and-critic-cache/tasks.md`

- [x] self-review clean 후 세 문서 검증 표기(`[x]` + 근거), 미충족은 사유 부기
- [x] PR 본문 요약(두 축 + 202607181125 불약화 근거 + OQ-5 결정) 준비

## External handoff — tracked checkbox 범위 밖

- feature branch를 push하고 PR을 만든다(main 직접 push 금지 — AGENTS.md 규약7).
- PR head의 CI를 remote에서 확인하고 최종 보고에 링크·상태를 남긴다.

## 테스트 전략 & Verification Matrix

- **레벨:** 규약 텍스트 완결성·문구 대조(unit), worked-example 내부 정합(unit), 배포 멱등·드리프트
  (unit/통합). **런타임 분류기 SUT는 없다**(Non-goal) — 따라서 AC-1~4는 "분류기 출력"이 아니라
  "규약 worked-example의 무모호성·정합"을 검증한다. **도그푸드**는 각 티어 1건씩 실제 흐름 관찰.
- **TDD:** Phase 5 테스트를 먼저 써서 RED(문구·example 부재) 확인 후 Phase 1~4로 GREEN.
- **정직 표기(R-6):** 티어·escalate·전량 재검증은 instruction-level 규칙이라 worked-example·문구
  대조로 규약의 무모호성을 검증할 뿐 런타임 강제가 아님을 spec·보고에 밝힌다(문구 존재=규칙 작동으로 과장 금지).
- 필수 검증 capability(node test runner) 존재. skipped/degraded 없음.

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | worked-example 정합(unit): Tier 0 예시 | AGENTS.md Tier0 트리거·예시 + 테스트 | Tier0 지정·config 제외 무모호, green | 충족(self-review r1) |
| AC-2 | worked-example 정합(unit): Tier 1 예시 | 트리거·예시 + 테스트 | Tier1 지정 무모호, green | 충족(self-review r1) |
| AC-3 | worked-example 정합(unit): 하드 신호 예시 | 하드신호 목록·예시 + 테스트 | 무조건 Tier2 지정, green | 충족(self-review r1) |
| AC-4 | worked-example 정합(unit): 양 경계 모호 예시 | escalate 규칙·경계 예시 + 테스트 | 양 경계 상향·하향 예시 없음, green | 충족(self-review r1) |
| AC-5 | 계약 대조(unit, AGENTS.md 로더 포함) | `has()`+AGENTS.md 로더 assertion | 티어 의식 매핑 전 surface 동일, green | 충족(self-review r1) |
| AC-6 | 계약 대조(unit): goal-ready/goal-impl | Tier1 TDD·테스트 생략 Tier0만 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-7 | 계약 대조(unit): 티어 기록 규칙 | 티어·근거 기록 요구 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-8 | 계약 대조(unit): goal-impl 승격 규율 | 중간 승격·하향 금지 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-9 | 계약 대조(unit): self-review·critic | `matrix 행=AC↔코드 지도` 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-10 | 계약 대조(unit): critic.md·self-review | "행마다 실제 코드 검증·도장찍기 금지" 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-11 | 계약 대조(unit): 전량 재검증 | "라운드마다 전량 재검증·승계/스킵 없음" 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-12 | 계약 대조(unit): 독립성·map은 통과근거 아님 | "verdict 미승계·map만 재사용·적극형 미도입" 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-13 | 계약 대조(unit): map 재사용 범위 | within-run·cross-session map 금지 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-14 | 회귀(unit): bounded-verification 테스트 실행 | 기존 스위트 결과(핀 문장 보존) | 전부 green 유지 | 충족(self-review r1) |
| AC-15 | 계약 대조(unit): Tier 2 규율 | 전 AC green·도그푸드·격리 critic·PR·Live-Verify 문구 | 문구 존재, green | 충족(self-review r1) |
| AC-16 | 배포(unit/통합): `deploy.test.ts` 멱등 | 배포 diff·드리프트 0 | 재배포 idempotent·드리프트 0, green | 충족(self-review r1) |
| AC-17 | 계약 대조(unit): `docs/workflows.md`↔AGENTS.md | human-doc parity assertion | 티어 설명 존재·드리프트 0, green | 충족(self-review r1) |

- **동결:** 이 matrix는 사용자 확인 대상이며, 구현 워크플로가 첫 도그푸드 직전에 readiness를
  재확인하고 freeze한다. 이후 개정은 변경 이유·영향 AC·무효화할 evidence를 기록한다(`202607181125` 규칙).
- **OQ-5 확정:** 보수형으로 확정돼(2026-07-20) FR-5·6·AC-11·12·13이 전량 재검증·map-only로 반영됐다.
  적극형(승계·무효화-스킵)은 미도입 — matrix는 이 상태로 freeze 가능하다.
