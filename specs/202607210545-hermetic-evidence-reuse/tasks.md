---
audience: both
---

# tasks — P4: 라운드 간 hermetic evidence 조건부 승계

phase 선언 문법은 `templates/skills/goal-impl/references/tasks-format.md`를 따른다.

## Phase 1 — 판정 함수·텔레메트리 (TDD)
> depends-on: 없음 · files: `src/review-preflight.ts`, `src/review-preflight.test.ts`, `src/retro-analysis.ts`, `src/retro-analysis.test.ts`, `src/retro-note.ts`

- [x] **T1.1** AC-5 실패 테스트: `judgeEvidenceCarryOver` 5케이스({교집합∅+hermetic-costly}→승계,
  {교집합 존재}·{선언 부재}·{cheap}·{non-hermetic}→재실행+사유) 작성(red).
- [x] **T1.2** 판정 순수 함수 구현 → green. 입력·출력·규칙은 spec FR-5와 1:1.
- [x] **T1.3** AC-6 실패 테스트 + `carried-from` 집계(선택 필드·미준수 불참여)·§8 렌더(승계
  건수) 구현 → green. 기존 테스트 전부 green 유지.

## Phase 2 — 규약 개정 + 계약 테스트
> depends-on: 없음 · files: `AGENTS.md`, `templates/sdd/AGENTS.md`, `templates/sdd/self-review-evidence.template.md`, `templates/skills/sdd-self-review/SKILL.md`, `templates/skills/goal-impl/SKILL.md`, `src/agents/workflow-policy.test.ts`

- [x] **T2.1** 계약 테스트 선행 개정(red 관찰): AC-12 구 핀 2곳(sdd-self-review·goal-impl) →
  새 조건부 문구 핀 교체 + **신규 핀 추가**(루트 AGENTS.md·`templates/sdd/AGENTS.md` 스캐폴드
  — 기존 핀 없음, 3조건·보수 기본·출처 표기·저비용 재실행). AC-11·13 기존 핀은 손대지 않음.
- [x] **T2.2** 루트 AGENTS.md + `templates/sdd/AGENTS.md` critic 캐싱 절 동반 개정(FR-1) —
  verdict 관련 불릿 불변, 대상 불릿만 교체(202607181125 carve-out 문장 보존).
- [x] **T2.3** sdd-self-review 2A 승계 절차 추가(FR-2) + goal-impl §7A 정합 개정(FR-3 — §3A
  carve-out 보존) + evidence 템플릿 선택 필드 주석 3필드 갱신(FR-5).
- [x] **T2.4** Phase 2 산출 단독 검증 — workflow-policy 계약 테스트 파일만 실행해 신규·교체
  핀 green 확인(전체 스위트는 T3.0 소관 — DAG 선언과 정직하게 일치시키기 위한 분리).

## Phase 3 — dogfood·self-review·versioned closure
> depends-on: Phase 1, Phase 2 · files: `specs/202607210545-hermetic-evidence-reuse/goal.md`, `specs/202607210545-hermetic-evidence-reuse/spec.md`, `specs/202607210545-hermetic-evidence-reuse/plan.md`, `specs/202607210545-hermetic-evidence-reuse/tasks.md`, `specs/202607210545-hermetic-evidence-reuse/evidence/`

- [x] **T3.0** 전체 스위트 실행 — 양 phase 산출 통합 green + 기존 계약 비회귀(AC-4의 실행
  지점 — Phase 1·2 완료 후라 DAG 선언과 일치).
- [x] **T3.1** dogfood: preflight 실행·retro 실행으로 승계 건수 절 출현 관찰. 판정 함수를 실제
  202607202152 r1→r2 diff·evidence에 소급 적용해 "당시 승계 가능했을 행"을 산정(절감 잠재
  실증 — 참고용, 소급 개정 아님).
- [ ] **T3.2** preflight → 격리 self-review(라운드 예산 §7A) → 문서 검증 표기([x]·matrix 상태)
  → versioned closure. 이 slice에서 실제 승계가 발생하지 않으면 그 사실을 보고에 명시(실전
  관찰은 후속 텔레메트리 소관).

## External handoff — tracked checkbox 범위 밖

- feature branch push + PR 생성. PR head CI를 `gh run watch <run-id> --exit-status`(full SHA)로
  감시, 최종 보고에 링크·상태.
