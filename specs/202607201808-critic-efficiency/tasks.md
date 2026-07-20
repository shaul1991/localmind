---
audience: both
---

# tasks — critic 효율화: 렌즈 병렬 fan-out + 결정적 사전 게이트 + 텔레메트리

plan의 5단계를 실행 task로 분해한다. phase 선언 문법은 `templates/skills/goal-impl/references/tasks-format.md`를 따른다.

## Phase 1 — preflight 검사 모듈 (TDD)
> depends-on: 없음 · files: `src/review-preflight.ts`, `src/review-preflight.test.ts`

- [ ] **T1.1** AC-3(임시경로 evidence)·AC-4(diff --check 출력 판정 순수 함수)·AC-5(merged
  report 필드)·AC-6(matrix 전수 대응) 실패 테스트를 인라인 픽스처로 작성한다(red).
- [ ] **T1.2** `src/review-preflight.ts` 순수 검사 모듈을 구현해 green. diff 검사(FR-3b)는
  `git diff --check` 출력 텍스트를 입력받아 판정하는 순수 함수로 둔다.
- [ ] **T1.3** 경계 케이스 보강: versioned 사본 병기 pass, 빈 evidence 디렉토리, AC 식별자
  형식 변형(`### AC-N` 헤딩/인라인) — 실패 테스트로 재현 후 커버.

## Phase 2 — preflight 진입점·배선
> depends-on: Phase 1 · files: `scripts/review-preflight.ts`, `scripts/review-preflight.test.mjs`, `package.json`

- [ ] **T2.1** `scripts/review-preflight.ts` 얇은 IO 진입점(spec 경로 인자 → 파일 읽기·
  `git diff --check` 실행 → 순수 모듈 호출 → 위반 목록 출력·exit code).
- [ ] **T2.2** `package.json`에 `review:preflight` script 추가.
- [ ] **T2.3** `scripts/review-preflight.test.mjs` 통합 테스트 작성(AC-4·AC-7): 일회용 픽스처
  디렉토리/저장소에서 진입점을 실제 실행해 위반 시 비0·clean 시 0을 검증한다(테스트 러너의
  `scripts/*.test.mjs` glob에 포착되는 자동 회귀로 남긴다).

## Phase 3 — 텔레메트리 (TDD)
> depends-on: 없음 · files: `src/retro-analysis.ts`, `src/retro-analysis.test.ts`, `src/retro-note.ts`, `scripts/retro-report.ts`, `templates/sdd/self-review-evidence.template.md`

- [ ] **T3.1** AC-10(집계 정확성)·AC-11(레거시 내성 — 필드 누락·frontmatter 부재 2종) 실패
  테스트 작성(red).
- [ ] **T3.2** `retro-analysis.ts`에 self-review evidence frontmatter 집계 함수 추가(순수 —
  `completion` 정규화·미준수 구분 포함) → green.
- [ ] **T3.3** `retro-note.ts`에 "self-review 라운드 집계" 절 렌더 추가(AC-12, 미준수 건수
  표기, 테스트 포함).
- [ ] **T3.4** `templates/sdd/self-review-evidence.template.md` 작성(FR-5 필수 7·선택 2필드 —
  FR-2와 단일 필드셋).
- [ ] **T3.5** `scripts/retro-report.ts`에 evidence 파일(`specs/*/evidence/self-review-round*.md`)
  glob·읽기 배선을 추가하고 순수 집계 함수에 텍스트로 전달(RetroAggregate 확장 포함).

## Phase 4 — 스킬·규약 문구 + 계약 테스트
> depends-on: Phase 1, Phase 2, Phase 3 · files: `templates/skills/sdd-self-review/SKILL.md`, `templates/skills/goal-impl/SKILL.md`, `src/agents/workflow-policy.test.ts`, `AGENTS.md`

- [ ] **T4.1** sdd-self-review SKILL 개정: 렌즈 병렬 절차(FR-1)·병합 규칙(FR-2 — **§5 필수
  필드 목록에 `completion` 추가, FR-5와 단일 필드셋으로 정합**)·preflight 게이트(FR-4)·
  frontmatter 스키마 준수(FR-5).
- [ ] **T4.2** goal-impl SKILL 개정: self-review 위임 직전 preflight 실행 게이트(FR-4).
- [ ] **T4.3** AGENTS.md critic 캐싱 절에 최소 포인터(렌즈 병렬 round 불변·preflight 게이트) —
  OQ-3 확정 반영.
- [ ] **T4.4** workflow-policy 계약 테스트 추가(AC-1·2·8·9) 후 전체 스위트 실행으로 기존 계약
  green 확인(AC-13).

## Phase 5 — dogfood·versioned closure
> depends-on: Phase 4 · files: `specs/202607201808-critic-efficiency/goal.md`, `specs/202607201808-critic-efficiency/spec.md`, `specs/202607201808-critic-efficiency/plan.md`, `specs/202607201808-critic-efficiency/tasks.md`, `specs/202607201808-critic-efficiency/evidence/`

- [ ] **T5.1** 이 spec 자체를 대상으로 `npm run review:preflight` 실제 실행·관찰(자기 적용
  dogfood — 위반 검출·clean 양쪽 시나리오).
- [ ] **T5.2** retro 진입점 실행으로 집계 절 출현 확인(dogfood).
- [ ] **T5.3** self-review evidence를 FR-5 스키마로 저장하고, 세 문서 검증 표기([x]·근거)와
  matrix 상태 열을 채워 versioned closure를 준비한다.

## External handoff — tracked checkbox 범위 밖

- feature branch를 push하고 PR을 만든다.
- PR head의 CI를 remote에서 확인하고(`gh run watch <run-id> --exit-status`, full SHA) 최종
  보고에 링크·상태를 남긴다.
