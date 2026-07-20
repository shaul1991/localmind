---
audience: both
---

# plan — P4: 라운드 간 hermetic evidence 조건부 승계

## 도메인 경계

- **워크플로 계약(instruction)** — AGENTS.md critic 캐싱 절·sdd-self-review 2A·goal-impl §7A.
  승계는 instruction-level 절차(런타임 강제 아님 — 과장 금지 관례 유지). 정본 위계: 승계 절차
  상세 = sdd-self-review, 원칙 = AGENTS.md, goal-impl은 참조.
- **결정적 판정·집계(코드)** — 승계 판정 순수 함수(FR-5)·retro carried-from 집계. LLM 판단
  불포함(hermetic).
- **불변 계약** — verdict 전량 재검증·도장찍기 금지·within-run 한정·round 예산·2라운드 상한은
  변경 대상이 아니며 기존 핀 green으로 기계 확인(AC-4).

용어: **evidence 실행 승계** = 직전 라운드의 결정적 실행 산출(도그푸드 관찰 등)을 새 라운드
evidence로 출처 표기와 함께 인계하는 것 — critic의 행 검토(verdict)와 구분된다(후자는 항상
전 행 수행).

## 영향 모듈

| 구분 | 경로 | 변경 |
|---|---|---|
| 수정 | `AGENTS.md` | critic 캐싱 절 "적극형 미도입" 불릿 → 조건부 승계(FR-1). 다른 불릿 불변 |
| 수정 | `templates/sdd/AGENTS.md` | 스캐폴드의 동일 불릿 동반 개정(FR-1 — user-facing 모순 방지, 신규 핀 대상) |
| 수정 | `templates/sdd/self-review-evidence.template.md` | 선택 필드 주석 2→3필드(carried-from) 갱신(FR-5) |
| 수정 | `templates/skills/sdd-self-review/SKILL.md` | 2A절에 승계 절차(선언 문법·3조건·표기·critic 검증·저비용 예외)(FR-2) |
| 수정 | `templates/skills/goal-impl/SKILL.md` | §7A 해당 문장 정합 개정 + 정본 참조(FR-3) |
| 수정 | `src/agents/workflow-policy.test.ts` | AC-12 핀 교체 + 신규 핀, AC-11·13 불변 확인(FR-4) |
| 수정 | `src/review-preflight.ts` | 승계 판정 순수 함수 `judgeEvidenceCarryOver`(FR-5) |
| 수정 | `src/review-preflight.test.ts` | AC-5 단위 테스트(5 케이스) |
| 수정 | `src/retro-analysis.ts` | carried-from 집계(선택 필드 — 미준수 불참여)(FR-5) |
| 수정 | `src/retro-analysis.test.ts` | AC-6 단위 테스트 |
| 수정 | `src/retro-note.ts` | §8 표 승계 건수 표기(FR-5) |

## 단계

1. **Phase 1 — 판정 함수·텔레메트리(TDD)**: AC-5·6 실패 테스트 → `judgeEvidenceCarryOver`·
   carried-from 집계·렌더 구현 → green.
2. **Phase 2 — 규약 개정 + 계약 테스트**: AC-1~4 — 신규·개정 핀 테스트 작성(red: 개정 전 문구
   부재/구 문구 잔존으로 실패) → 3표면 개정 → 전체 스위트 green. AC-12 구 핀은 같은 변경에서
   교체(드리프트 창 금지).
3. **Phase 3 — dogfood·closure**: preflight → self-review(격리) → 문서 검증 표기 → 커밋·push·
   PR. 실제 승계 발생은 다음 Tier 2 라운드 전환에서 관찰(이 slice 자체는 규약·도구 정비라
   승계 발생 조건이 없을 수 있음 — 그 경우 판정 함수 단위 실증 + 절차 문구 게이트로 완료,
   실전 관찰은 후속 텔레메트리 소관임을 보고에 명시).

## 테스트 전략

- 단위(순수): AC-5(판정 5케이스)·AC-6(집계) — 인라인 픽스처.
- 계약(문구): AC-1~4 — workflow-policy 관례(`has`/`hasIn`), 기존 핀 비회귀 포함.
- 도그푸드: preflight·retro 실행 관찰 + 자기 spec self-review.

## Verification matrix

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 계약(unit) — AGENTS.md 텍스트 | 테스트 로그 | 기존 핀 유지 + 조건부 문구 존재 + 구 무조건 문구 제거, green | ✅ r1 clean |
| AC-2 | 계약(unit) — SKILL 텍스트 | 테스트 로그 | 선언 문법·3조건·표기·critic 검증·저비용 예외 문구, green | ✅ r1 clean |
| AC-3 | 계약(unit) — SKILL 텍스트 | 테스트 로그 | 기존 핀 유지 + 정본 참조 연결, green | ✅ r1 clean |
| AC-4 | 계약(unit) — 전체 스위트 | 전체 실행 로그 | AC-11·13 불변·AC-12 교체·신규 핀 전부 green | ✅ r1 clean |
| AC-5 | 단위 — 판정 함수 5케이스 | 테스트 로그 | 승계 1·재실행 4(사유 포함), green | ✅ r1 clean |
| AC-6 | 단위 — 집계·렌더 | 테스트 로그 | 승계 건수 집계·부재 무영향, 기존 green 유지 | ✅ r1 clean |

모든 AC가 정확히 한 행. 전부 로컬 테스트로 검증 가능(capability 결손 없음). 첫 dogfood 직전
freeze 대상.
