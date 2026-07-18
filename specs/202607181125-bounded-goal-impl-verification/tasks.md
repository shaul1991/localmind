---
title: Bounded goal-impl verification implementation tasks
audience: both
---

# Tasks: bounded goal-impl verification

> 상위 문서: [goal.md](goal.md) · [spec.md](spec.md) · [plan.md](plan.md)
>
> 구현 시작 호출: `$goal-impl 202607181125`

## 실행 불변식

- 자동 self-review는 최대 두 round이며 round 3+는 사용자 fresh 승인 1개당 1회다.
- blocker가 남으면 완료·publish handoff로 진행하지 않는다.
- dogfood 전 [plan verification matrix](plan.md#8-검증-matrix--ac-11)을 freeze한다.
- 시작과 final review 직전 base full SHA를 확인한다.
- `package-lock.json`의 기존 사용자 변경을 수정·stage하지 않는다.
- PR/CI 상태만 기록하는 tracked follow-up commit을 만들지 않는다.
- TDD·dogfood·critic 강도·전 AC/test green·feature PR gate를 약화하지 않는다.

## Phase 0 — 실행 권한·base·matrix readiness
> depends-on: 없음 · files: 없음

이 phase의 SHA·baseline·readiness 기록은 session run note 또는 ignored 임시 evidence에만 남긴다.
tracked evidence pointer 갱신은 Phase 6이 소유하므로 `files: 없음`과 충돌하지 않는다.

- [x] **T0.1 (AC-6·8):** 사용자 확인과 `$goal-impl 202607181125` 실행 provenance를 확인한다.
- [x] **T0.2 (AC-6·8):** worktree/branch/remote를 기록하고 user-owned dirty·unmanaged 파일 목록과
      `package-lock.json` hash/stage 상태를 보존 기준으로 남긴다.
- [x] **T0.3 (AC-6):** `origin/main`을 fetch해 확인 시각·full SHA·현재 ancestry를 기록하고 latest base에서
      새 feature branch를 만든다. overlap·충돌이면 수정하지 말고 중단·보고한다.
- [x] **T0.4 (AC-10):** baseline 관련 테스트·전체 테스트·build 상태를 기록해 기존 실패와 이번 RED를
      구분한다.
- [x] **T0.5 (AC-4·5):** plan matrix 11행의 방법·evidence·stop condition·capability를 readiness 관점에서
      확인한다. 불완전 행은 dogfood 전 해결 대상으로 남기고 아직 freeze했다고 표기하지 않는다.

## Phase 1 — TDD RED: workflow·repository·scaffold 계약
> depends-on: Phase 0 · files: `src/agents/skill-contract.test.ts`, `src/agents/workflow-docs.test.ts`, `src/scaffold.test.ts`

- [x] **T1.1 (AC-1~5·9·10):** `skill-contract.test.ts`에 candidate/merged round, automatic budget,
      fresh approval, matrix readiness/freeze/amendment, external handoff 계약을 먼저 추가한다.
- [x] **T1.2 (AC-2·6~10):** `workflow-docs.test.ts`에 root/scaffold semantic parity, automatic max 2,
      두 freshness gate, status-only commit 금지, 기존 품질 gate 보존 negative assertion을 추가한다.
- [x] **T1.3 (AC-4·10):** `scaffold.test.ts`에 생성 AGENTS의 새 규칙과 plan template 5열 matrix assertion을
      추가한다.
- [x] **T1.4:** source가 아직 구 규칙이라 새 테스트가 기대한 이유로 실패하는 RED를 확인하고 실패
      메시지를 evidence로 보존한다.

## Phase 2A — repository governance·SDD template GREEN
> depends-on: Phase 1 · files: `AGENTS.md`, `templates/sdd/AGENTS.md`, `templates/sdd/plan.template.md`

- [x] **T2A.1 (AC-2·3·6~10):** root `AGENTS.md`의 무제한 재검을 candidate 기반 automatic max 2,
      fresh one-round approval, blocker stop으로 교체하고 `origin/main`·GitHub 완료 경계를 추가한다.
- [x] **T2A.2 (AC-2·3·6~10):** scaffold `AGENTS.md`에 provider-neutral 동일 의미를 반영하되 특정 remote나
      CI provider를 강제하지 않는다.
- [x] **T2A.3 (AC-4·5):** plan template의 테스트 전략을 `AC / 검증 방법·레벨 / 최소 evidence /
      통과·종료 조건 / 상태`로 바꾸고 확인→dogfood 전 freeze→제한적 개정 규칙을 넣는다.
- [x] **T2A.4:** 맡은 계약 테스트를 GREEN으로 만들고 두 AGENTS의 의미 drift를 diff로 점검한다.

## Phase 2B — canonical workflow·task format GREEN
> depends-on: Phase 1 · files: `templates/skills/goal-ready/SKILL.md`, `templates/skills/goal-impl/SKILL.md`, `templates/skills/goal-impl/references/tasks-format.md`, `templates/skills/sdd-self-review/SKILL.md`

- [x] **T2B.1 (AC-4·5):** `goal-ready`에 5열 matrix 작성·확인 책임과 post-push checkbox 생성 금지를
      추가하되 document critic의 기존 clean loop는 바꾸지 않는다.
- [x] **T2B.2 (AC-1~9):** `goal-impl`에 start/pre-review freshness, matrix readiness/freeze,
      candidate/round budget, fresh approval, blocker stop, versioned/external state 분리를 추가한다.
- [x] **T2B.3 (AC-9):** tasks format에 tracked phase는 publish handoff 준비까지만 두고 post-push
      PR/CI는 checkbox 없는 external handoff로 다루는 형식을 추가한다.
- [x] **T2B.4 (AC-1~3):** `sdd-self-review` merged report에 candidate identity, round number,
      independence, blockers/advisories, approval-needed를 포함하고 completion ownership은 넓히지 않는다.
- [x] **T2B.5 (AC-10):** canonical neutrality와 기존 TDD·dogfood·critical review 계약을 재검사하고
      맡은 계약 테스트를 GREEN으로 만든다.

## Phase 2 barrier — GREEN 통합
> depends-on: Phase 2A, Phase 2B · files: 없음

- [x] **T2C.1 (AC-1~10):** Phase 2A/2B diff를 통합 검토해 용어·round semantics·matrix ownership·remote
      위임 경계가 일치하는지 확인한다.
- [x] **T2C.2:** Phase 1의 세 테스트 파일을 함께 실행해 GREEN을 확인한다.

## Phase 3 — 사람용 문서·CHANGELOG
> depends-on: Phase 2 barrier · files: `docs/agents.md`, `docs/workflows.md`, `CHANGELOG.md`

- [x] **T3.1 (AC-1~3·10):** `docs/agents.md`에 candidate/round, 구현·review 독립성, 두 round 뒤 중단과
      fresh 승인 1회성을 평이하게 설명한다.
- [x] **T3.2 (AC-4~9):** `docs/workflows.md`에 matrix 확인→freeze→dogfood→두 base gate→bounded review→
      remote completion 흐름과 실패 경로를 설명한다.
- [x] **T3.3 (AC-10):** CHANGELOG 미버전 영역에 네 개선안과 기존 품질 gate 불변을 기록하고 버전 숫자는
      넣지 않는다.
- [x] **T3.4:** docs contract 테스트를 재실행해 문서와 정본의 drift 0을 확인한다.

## Phase 4 — 통합 검증·dogfood
> depends-on: Phase 3 · files: 없음

- [x] **T4.1 (AC-10):** 관련 contract/scaffold 테스트, 전체 test와 build를 실행해 green을 확인한다.
- [x] **T4.2 (AC-4·5):** 첫 dogfood 직전에 matrix 11행을 최종 재검증해 candidate·시각·변경 여부와 함께
      freeze한다. 필수 capability 부재·불완전 행은 green/skipped로 우회하지 않고 중단한다.
- [x] **T4.3 (AC-10):** temporary HOME/target에 packaged workflows를 배포해 canonical↔installed hash와
      unmanaged 보호를 확인한다. 필요 시 repository 표준 deploy 명령으로 managed target을 갱신한다.
- [x] **T4.4 (AC-6·7):** temporary bare remote에서 up-to-date와 base-advanced 두 시나리오를 수행해
      full SHA 기록, 통합, regression-before-review를 관찰한다.
- [x] **T4.5 (AC-5):** frozen matrix 뒤 evidence 선호·실제 제품/보안 결함·잘못된 stop condition을 각각
      판정하고 개정 시 reason/affected AC/invalid evidence가 남는지 확인한다.
- [x] **T4.6 (AC-9):** status-only PR/CI 기록은 tracked task가 아니고 실제 CI defect fix는 허용되는
      representative handoff를 검토한다. 실제 fix는 새 candidate로 관련 테스트와 남은 round/추가 승인
      review를 통과해야 commit할 수 있음을 함께 확인한다.
- [x] **T4.7 (AC-6·11):** `package-lock.json`의 byte hash/stage와 이 slice의 scope-creep 지표를 확인한다.

## Phase 5 — pre-review freshness·bounded self-review
> depends-on: Phase 4 · files: `AGENTS.md`, `templates/sdd/AGENTS.md`, `templates/sdd/plan.template.md`, `templates/skills/goal-ready/SKILL.md`, `templates/skills/goal-impl/SKILL.md`, `templates/skills/goal-impl/references/tasks-format.md`, `templates/skills/sdd-self-review/SKILL.md`, `src/agents/skill-contract.test.ts`, `src/agents/workflow-docs.test.ts`, `src/scaffold.test.ts`, `docs/agents.md`, `docs/workflows.md`, `CHANGELOG.md`

- [x] **T5.1 (AC-7·8):** `origin/main`을 다시 fetch해 full SHA를 비교한다. 전진했다면 repository 정책대로
      통합하고 전체 regression을 재실행한다. 실패·dirty 충돌이면 review 전에 중단·보고한다.
- [x] **T5.2 (AC-1·2·10):** isolated critic(s)의 findings를 같은 candidate 기준 merged round 1 report로
      만들고 FR/AC·evidence·정확성·단순성/보안·Live-Verify를 검수한다.
- [x] **T5.3 (AC-1·2):** round 1 blocker를 수정해 candidate가 바뀐 경우에만 merged round 2를 실행한다.
- [x] **T5.4 (AC-2·3):** round 2 blocker가 남으면 자동 중단하고 goal/next round/findings/fix·verification
      scope를 보고해 fresh approval 1회를 요청한다. 승인 전 완료 task를 체크하지 않는다.
- [x] **T5.5 (AC-10·11):** blocker 0, 전 AC green, required evidence 충족과 실제 independence를 확인한다.

## Phase 6 — versioned closure·publish handoff 준비
> depends-on: Phase 5 · files: `specs/202607181125-bounded-goal-impl-verification/goal.md`, `specs/202607181125-bounded-goal-impl-verification/spec.md`, `specs/202607181125-bounded-goal-impl-verification/plan.md`, `specs/202607181125-bounded-goal-impl-verification/tasks.md`

- [x] **T6.1 (AC-1~11):** clean report 근거로 goal SM, spec FR/AC, plan phase/matrix, tasks 완료 항목을
      체크한다. 의미 변경이 생기면 기계적 표기로 가장하지 않고 candidate 변경으로 처리한다.
- [x] **T6.2 (AC-10·11):** 최종 diff/check, 전체 test/build, packaged hash, dirty asset 보존을 재확인한다.
- [x] **T6.3 (AC-9):** 모든 versioned 변경과 PR 본문용 self-review 요약·evidence pointer가 준비됐고
      post-push 동적 상태를 tracked 문서에 되쓸 필요가 없음을 확인한다.

## External handoff — tracked checkbox 범위 밖

아래는 최종 versioned commit 이후 원격 시스템이 소유하는 동적 상태다. 이 절을 `[x]`로 바꾸기 위한
후속 commit을 만들지 않는다.

- repository `AGENTS.md`에 따라 feature branch commit·push와 PR 생성을 수행한다.
- PR head SHA의 CI를 원격에서 감시하고 링크·상태를 최종 보고한다.
- CI 실패가 실제 결함을 요구하면 새 candidate로 수정하고 관련 테스트와 남은 round/추가 승인 규칙의
  self-review를 통과한 뒤 commit한다. 새 head CI를 다시 원격 SSoT로 삼는다.
- CI 성공·PR 번호·run ID만 기록하려는 goal/spec/plan/tasks commit은 만들지 않는다.
