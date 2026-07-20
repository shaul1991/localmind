---
audience: both
---

# tasks — 거버넌스 재보정

phase 선언 문법은 `templates/skills/goal-impl/references/tasks-format.md`를 따른다.
주의: Phase 2는 **repo 밖(데이터 폴더)** 파일을 다룬다 — files 선언은 관찰용이며 repo 커밋
대상이 아니다.

## Phase 1 — 조사 보고서 보존
> depends-on: 없음 · files: `specs/202607202152-governance-recalibration/evidence/research-report.md`

- [x] **T1.1** deep research 결과 전문(요약·25 claims·caveats·OQ·출처 등급)을 두괄식 human/both
  형식으로 `evidence/research-report.md`에 저장한다.

## Phase 2 — rules base 개정 (데이터 폴더 트랙)
> depends-on: 없음 · files: 없음

<!-- files: 없음은 "repo 파일을 건드리지 않음"의 의미로 쓴다 — 실제 산출물은 repo 밖
     ~/.localmind/rules/base/ 3개 파일. 배리어 검증은 git diff가 아니라 **파일 내용 grep**으로
     관찰한다(tasks-format의 repo-상대 경로 한계에 대한 명시 처리, critic D-4). -->

- [x] **T2.1** `~/.localmind/rules/base/interview-protocol.md` 개정(FR-1): 고위험 분기 한정
  검수 대기 + 저위험 decision-by-exception(요약 생략 불가) + 결정 로그 유지 + 개정 이력.
- [x] **T2.2** `~/.localmind/rules/base/deep-interview-elicitation.md` 개정(FR-2): 권장 기본값
  동반·일괄 제시+예외 교정 모드·기존 종료/한도 유지 + 개정 이력.
- [x] **T2.3** `~/.localmind/rules/base/governance-recalibration.md` 신설(FR-5): 컷포인트 이동
  원칙·재보정 트리거·사람 결정+ADR·검증 계층 비대상.

## Phase 3 — repo 개정 + 계약 테스트
> depends-on: 없음 · files: `templates/skills/goal-impl/SKILL.md`, `AGENTS.md`, `docs/workflows.md`, `src/agents/workflow-policy.test.ts`

- [x] **T3.1** 신규 문구 계약 테스트 작성(AC-3·5) — red 확인(TDD: 개정 전 문구 부재로 실패).
- [x] **T3.2** goal-impl SKILL §4·§4A·§5 재서술(FR-3): 불변식 1급 + 권장 기본 강등 + 재량 문구.
  구역 내 핀 4개 정확 문자열 보존 — `끊김 방어`·`TDD 강제`·`RED 확인 생략 금지`·
  `실패 테스트 먼저(red)`. 구역 밖 불변식은 §5 요약 소절에서 참조 연결만(FR-3 배치 규칙).
- [x] **T3.3** AGENTS.md 티어 절 정교화(FR-4): 비가역성 하드 신호·검증가능성 보조 축·예시 행.
  **동반 갱신(AC-17 parity)**: 새 신호는 단일 `·`-구분 토큰(괄호 내부는 `/` — 예:
  `비가역성(외부 발행/데이터 파괴/비가역 마이그레이션)`), `workflow-policy.test.ts`의
  `DOCS_EQUIVALENT` 배열 **정확히 +1** + `docs/workflows.md` 사람말 설명 추가 — 같은 변경에서
  함께.
- [x] **T3.4** 전체 스위트 실행 — 신규 계약 green + 기존 계약 비회귀(AC-4).

## Phase 4 — 배포·도그푸드·결정 기록
> depends-on: Phase 2, Phase 3 · files: 없음

- [ ] **T4.1** `make rules-deploy` 실행 → `~/.claude/localmind-rules.md`에 개정 문구 grep 관찰
  (AC-7).
- [ ] **T4.2** 개정 결정 노트(층별 유지/완화 결정·근거·출처)를 second-brain에 capture(AC-8,
  tags: decision).

## Phase 5 — self-review·versioned closure
> depends-on: Phase 1, Phase 4 · files: `specs/202607202152-governance-recalibration/goal.md`, `specs/202607202152-governance-recalibration/spec.md`, `specs/202607202152-governance-recalibration/plan.md`, `specs/202607202152-governance-recalibration/tasks.md`, `specs/202607202152-governance-recalibration/evidence/`

- [ ] **T5.1** preflight 실행 후 **렌즈 병렬 fan-out self-review**(5렌즈 격리 critic 동시 —
  첫 실전, merged report 하나 = round 1개, evidence `lenses`·`duration-minutes` 기록).
- [ ] **T5.2** AC-1·2·6(수동 검사 대상)을 리뷰어가 실파일 대조로 판정했는지 확인하고, 세 문서
  검증 표기([x]·matrix 상태)를 채워 versioned closure 준비.

## External handoff — tracked checkbox 범위 밖

- repo 트랙 feature branch push + PR 생성(rules 트랙은 데이터 폴더 백업 리듬 소관 — PR 없음).
- PR head CI를 `gh run watch <run-id> --exit-status`(full SHA)로 감시, 최종 보고에 링크·상태.
