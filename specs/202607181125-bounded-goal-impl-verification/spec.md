---
title: Bounded goal-impl verification specification
audience: both
---

# Spec: bounded goal-impl verification

> 상위 목표: [goal.md](goal.md) · 구현 접근: [plan.md](plan.md)

## Status

Confirmed — 2026-07-18 구현·도그푸드·merged self-review round 3 clean으로 검증됐다.

## Terminology

- **review round:** 동일한 구현 상태를 대상으로 생성된 self-review 결과 묶음 1개. 여러 격리 reviewer를
  같은 시점에 실행해도 findings를 병합한 보고 하나를 한 라운드로 센다.
- **review candidate:** review 대상인 코드·계약·필수 evidence의 한 세대. finding 수정으로 의미가
  바뀌면 다음 candidate가 되지만, clean 판정 뒤 체크박스·링크 같은 기계적 완료 표기만 더한 것은 새
  candidate로 세지 않는다.
- **automatic round budget:** 사용자에게 추가 승인을 묻지 않고 `goal-impl`이 실행할 수 있는 self-review
  라운드 수. 최초 review가 round 1, 그 findings 수정 후 재검이 round 2이며 최대값은 2다.
- **fresh round approval:** 현재 남은 blocker와 직전 라운드 결과를 보고받은 사용자가 이후에 명시적으로
  허용한 추가 review 1회. 과거 승인·포괄 승인·침묵은 재사용할 수 없다.
- **blocker:** 치명·중대 결함, 미충족 AC, 실패한 필수 테스트 또는 완료를 금지하는 검증 결함.
- **verification matrix:** 모든 AC를 검증 방법·필요 evidence·stop condition에 연결하는 `plan.md`의 표.
- **matrix freeze:** 첫 dogfood 전에 matrix의 각 행이 실행 가능한 상태인지 확인하고 이후 증거 범위를
  완료 계약으로 고정하는 gate. 실제 제품·보안 결함을 무시하는 면제는 아니다.
- **base freshness gate:** 원격 기본 브랜치의 최신 전체 SHA를 확인해 작업 기준과 비교하고 필요한
  정합·영향 테스트를 수행하는 gate.
- **versioned completion state:** repository 문서·코드에 commit되는 완료 상태. 최종 commit 전에 확정할
  수 있는 구현·테스트·문서 상태만 포함한다.
- **external completion state:** push 이후 PR 번호·review·CI 실행·성공/실패처럼 원격 PR/CI 시스템이
  소유하는 상태. repository 문서에 되쓰기 위한 후속 commit을 만들지 않는다.
- **external postcondition:** versioned acceptance와 최종 commit 뒤 원격에서 확인하는 PR/CI 완료 조건.
  `goal-impl` 최종 보고 전에는 확인하지만 tracked AC checkbox나 status mirror로 되쓰지 않는다.

## Scope

이번 slice는 LocalMind의 `goal-ready → goal-impl → sdd-self-review → PR/CI` 규약을 유한하고 증거 중심인
완료 흐름으로 정렬한다. 구현 self-review는 자동 두 라운드까지만 허용하고 추가 라운드는 사용자 fresh
승인 1회당 한 번만 실행한다. `goal-ready`가 만드는 plan에는 모든 AC의 verification matrix가 있으며,
`goal-impl`은 첫 dogfood 전에 이를 동결한다. 작업 시작과 최종 self-review 직전에 base freshness를
확인한다. 최종 versioned commit 이후 PR·CI 결과는 원격 시스템과 최종 보고가 소유한다.

변경 대상은 repository 완료 정본, 새 프로젝트 scaffold, 세 workflow skill, plan/tasks 형식, 계약 테스트,
사람용 workflow 문서다. 실행 엔진·새 자동화 서비스·CI provider 일반화는 추가하지 않는다.

## User scenarios

### US-1 — 첫 review가 clean인 일상 작업

사용자가 확인한 SDD 문서로 구현을 시작한다. agent는 최신 base를 확인하고 matrix대로 테스트·dogfood를
수행한다. 첫 isolated review에서 blocker가 없으면 두 번째 review를 의무적으로 소비하지 않고 문서 검증
표기, 최종 commit, PR/CI로 진행한다.

### US-2 — 두 라운드 뒤 blocker가 남는 작업

round 1 findings를 수정한 뒤 round 2에서도 blocker가 남는다. agent는 성공으로 보고하거나 자동으로
round 3을 시작하지 않고, 남은 blocker·수정 내용·테스트 상태·다음 review의 목적을 보고한다. 사용자가
새로 승인하면 round 3 한 번만 실행하며 이후에도 같은 규칙을 반복한다.

### US-3 — dogfood 뒤 증거 선호가 추가되는 작업

matrix에 명시된 테스트·evidence·stop condition을 모두 충족한 뒤 reviewer가 더 풍부한 transcript나
새 형식의 감사 artifact를 선호한다. 재현된 제품·보안 결함이 아니고 사용자가 scope 변경을 승인하지
않았다면 이는 advisory 또는 후속 과제이며 현재 완료 blocker가 되지 않는다.

### US-4 — 작업 중 base가 이동한 작업

작업 시작 시 기록한 원격 기본 브랜치 SHA가 최종 review 직전 달라졌다. agent는 최신 base를 repository
정책에 맞게 통합하고 영향받은 테스트를 다시 통과시킨 뒤에만 최종 review를 시작한다. remote를 확인할
수 없거나 dirty 파일과 충돌하면 fresh라고 단정하지 않고 사용자에게 상태와 선택을 보고한다.

### US-5 — PR CI가 성공한 작업

최종 versioned commit을 push해 PR을 만들고 CI를 감시한다. 성공 상태는 PR/CI와 최종 보고에서 확인하며,
단지 `tasks.md`에 PR 번호나 green 체크를 쓰기 위한 commit은 만들지 않는다. CI가 실제 결함을 발견하면
그 수정은 새 versioned commit이 될 수 있고 새 CI를 정상적으로 다시 실행한다.

## Functional Requirements

- [x] **FR-1 — 결정적인 round 계산:** `goal-impl`과 `sdd-self-review`는 review round를 동일 구현 상태에
      대한 병합 보고 1개로 정의한다. 병렬 reviewer 수, findings 수, 그 라운드 안의 테스트·수정 횟수는
      round 수를 늘리지 않는다. finding 수정으로 candidate가 바뀐 뒤 새 병합 review 보고가 생성될 때만
      다음 round다. clean 뒤 의미를 바꾸지 않는 기계적 완료 표기는 새 candidate가 아니다.
      검증: candidate/merged-report contract + round 1~3 실제 병합 보고.
      → goal O-1·O-5 / C-1·C-3

- [x] **FR-2 — 자동 2회 상한과 승인:** 최초 review와 한 번의 자동 재검만 허용한다. round 2 뒤 blocker가
      남으면 중단·보고하고 fresh 사용자 승인 1회로 정확히 다음 round 1개만 해제한다. 승인 없는 세 번째
      review, 승인 재사용, blocker 잔존 상태의 완료 보고는 금지한다.
      검증: round 2 자동 중단 후 fresh 승인 1회로 round 3 한 번만 실행.
      → goal O-1·O-5 / C-1·C-3 / Non-goals

- [x] **FR-3 — verification matrix 생성·readiness:** `goal-ready` plan의 테스트 전략은 모든 AC에 대해
      검증 방법/레벨, 필요한 evidence, stop condition, 상태를 한 행에 둔다. `goal-impl`은 누락·중복·
      검증 불가능 행이 있으면 dogfood 전에 readiness 미충족으로 보고한다. 필수 검증 capability가 없으면
      `skipped/degraded`를 green으로 간주하지 않고 미충족 blocker로 보고한다.
      검증: matrix 11행·5열 readiness audit와 scaffold/skill contract.
      → goal O-2·O-5 / C-1·C-2

- [x] **FR-4 — dogfood 전 freeze와 예외:** 첫 dogfood 직전에 matrix를 재확인해 동결한다. 동결 후 새
      evidence 형식이나 reviewer 선호는 자동 blocker가 아니다. 단 재현된 제품·보안 결함은 즉시 blocker로
      다룬다. 잘못된 stop condition이 구체적으로 입증되면 변경 이유·영향 AC·무효화할 기존 evidence를
      기록하고 영향 범위만 다시 실행한다. 새로운 요구/AC는 사용자 승인 후 spec-first로 변경한다.
      검증: 2026-07-18T03:46:02.369Z freeze + amendment A-1 + 영향 evidence 재실행.
      → goal O-2·O-5 / C-1·C-3 / R-2

- [x] **FR-5 — 시작 freshness gate:** repository 변경 전에 원격 기본 브랜치를 조회하고 전체 SHA를
      기준으로 기록한다. LocalMind 구현은 최신 `origin/main`에서 분리된 feature branch로 시작하며,
      기존 dirty·unmanaged 자산은 보존하고 겹침이 있으면 중단·보고한다.
      검증: 시작 base `9f023da…`, feature branch, package-lock hash/stage 불변.
      → goal O-3·O-5 / C-5·C-7

- [x] **FR-6 — 최종 review 전 freshness gate:** 최종 self-review 직전에 원격 기본 브랜치를 다시
      조회한다. 기준 SHA가 이동했으면 repository 정책에 따라 정합하고 영향 테스트를 재실행한 뒤에만
      review를 시작한다. remote 조회 실패·remote 부재·정합 불가를 fresh로 표기하지 않는다.
      검증: round 직전 실제 fetch + advanced/unavailable synthetic 시나리오.
      → goal O-3·O-5 / C-3·C-5·C-7

- [x] **FR-7 — versioned/external 완료 상태 분리:** 최종 versioned commit 전까지 검증 가능한 구현·테스트·
      문서와 publish handoff readiness checkbox를 닫는다. push 이후 PR 번호·CI 상태는 원격 PR/CI와 최종
      보고에서만 기록한다. 외부 상태만 repository에 되쓰기 위한 commit을 금지하되, CI 실패가 요구한
      실제 코드·문서 수정은 새 candidate로 허용하고 관련 테스트·review gate를 다시 적용한다.
      검증: tasks-format external handoff와 status-only negative contract.
      → goal O-4·O-5 / C-1·C-2·C-3

- [x] **FR-8 — 정본·scaffold·workflow 의미 동기화:** root `AGENTS.md`, `templates/sdd/AGENTS.md`,
      `goal-ready`, `goal-impl`, `sdd-self-review`, plan template, tasks format이 각자의 소유 경계를 유지하면서
      round·matrix·freshness·external state에 같은 의미를 갖는다. generic skill은 repository가 정한
      base/remote/CI policy를 따르고 LocalMind 정본만 `origin/main`·GitHub 세부를 소유한다.
      검증: root/scaffold/workflow bounded contract와 docs parity test.
      → goal O-1~O-5 / C-2·C-4·C-6

- [x] **FR-9 — 계약·문서·배포 drift 방지:** 자동 테스트가 두 라운드 상한, 승인 1회성, matrix schema,
      두 freshness gate, post-push 재커밋 금지, 기존 품질 gate 보존을 검증한다. 사람용 문서는 새 흐름과
      중단 상태를 평이하게 설명하고 packaged workflow 배포본은 canonical source와 일치한다.
      검증: dogfood 삭제 mutation RED, 전체 935/935, build, packaged/managed deploy.
      → goal O-1~O-5 / C-2·C-3·C-4 / SM-1~SM-6

## Acceptance Criteria

- [x] **AC-1 — round identity (FR-1):** Given 동일 review candidate를 여러 isolated reviewer가 병렬 검수할 때,
      When findings를 하나의 review report로 병합하면, Then reviewer 수와 findings 수와 무관하게 round
      count는 1이고 수정 후 새 병합 report가 생성될 때만 2가 된다. 검증: candidate contract + 각 round의
      두 isolated critic merged report.

- [x] **AC-2 — automatic stop (FR-2):** Given round 2 report에 blocker가 남았을 때, When
      `goal-impl`이 다음 행동을 결정하면, Then 완료·commit 단계나 round 3으로 진행하지 않고 blocker,
      수정·테스트 상태, 다음 review 목적을 보고한 뒤 fresh 사용자 승인을 기다린다. 검증: round 2에서
      실제 중단 후 사용자 fresh 승인 전 mutation 0건.

- [x] **AC-3 — one approval, one round (FR-2):** Given 사용자가 round 2 결과를 본 뒤 추가 review를
      명시 승인했을 때, When review를 재개하면, Then 다음 round 정확히 1개만 실행하고 blocker가 다시
      남으면 새 승인을 요구한다. 이전·포괄·암묵 승인은 추가 round를 해제하지 않는다. 검증: 상태표
      regression + fresh 승인 1개를 round 3에서 1회 소비.

- [x] **AC-4 — complete matrix (FR-3):** Given `goal-ready`가 plan을 작성했을 때, When 모든 spec AC를
      matrix와 대조하면, Then 각 AC가 정확히 한 행에 매핑되고 검증 방법/레벨, evidence, stop condition,
      상태가 비어 있지 않으며 `goal-impl`이 dogfood 전에 이를 readiness gate로 검사한다. 필수 capability
      부재나 `skipped/degraded` 상태는 green이 아니라 미충족 blocker로 판정된다. 검증: 11행 uniqueness,
      5열 non-empty, capability gate audit.

- [x] **AC-5 — frozen evidence scope (FR-4):** Given matrix가 동결되고 dogfood가 시작된 뒤, When
      reviewer가 matrix 밖의 새 evidence 형식을 요청하면, Then 재현된 제품·보안 결함이 아니고 사용자가
      spec-first scope 변경을 승인하지 않은 요청은 advisory/후속 과제로 분류되어 현재 blocker 수를
      늘리지 않는다. 잘못된 stop condition을 수정할 때는 이유·영향 AC·무효화 evidence가 기록되고 그
      영향 범위만 재실행된다. 검증: freeze scenario audit + amendment A-1 + AC-7·10 재검증.

- [x] **AC-6 — start freshness and asset safety (FR-5):** Given implementation을 시작할 때, When 원격
      base와 worktree를 확인하면, Then latest base full SHA와 feature branch가 기록되고 변경은 그 base의
      분리 브랜치에서 시작하며 기존 dirty·unmanaged 파일의 byte 변경·stage는 0건이다. 검증: 시작
      `9f023da…`; package-lock SHA-256 `c79f421a…ffc6c8`, stage 0.

- [x] **AC-7 — moved base before final review (FR-6):** Given 시작 SHA 이후 원격 base가 이동했을 때,
      When final self-review gate를 통과하려 하면, Then latest base를 repository 정책대로 정합하고
      영향받은 필수 테스트가 green이 된 뒤에만 round 1을 시작한다. 검증: amended advanced-base synthetic
      start `e753cf0…` → advanced `b99ba75…` → integrated `9d441c…`, test/dogfood/deploy 재실행.

- [x] **AC-8 — truthful unavailable path (FR-5·6):** Given remote 조회가 실패하거나 base 정합이 dirty
      충돌로 불가능할 때, When gate 결과를 보고하면, Then `freshness unverified`와 기준 SHA·원인·영향을
      명시하고 사용자의 방향 없이 fresh/complete라고 단정하지 않는다. 검증: synthetic unavailable fetch
      exit 128 → `freshness-unverified`; 실제 sandbox fetch 실패도 캐시 fresh로 오표기하지 않음.

- [x] **AC-9 — external completion SSoT (FR-7):** Given 최종 versioned candidate와 publish handoff
      task를 준비했을 때, When tracked task·문서와 대표 PR/CI handoff를 검토하면, Then post-push 상태를
      되쓰기 위한 checkbox·필수 follow-up commit 계획은 0건이고 실제 CI 결함 수정만 새 commit을
      허용한다. 그 수정은 새 candidate로서 관련 테스트와 남은 round/fresh-approval review를 다시 통과해야
      한다. 원격 상태 자체는 아래 external postcondition으로 확인한다. 검증: unchecked External handoff +
      status-only commit 금지/CI defect candidate contract.

- [x] **AC-10 — semantic parity and preserved gates (FR-8·9):** Given root/scaffold/canonical skill과
      문서를 검증할 때, When 계약 테스트와 packaged deploy verification을 실행하면, Then 네 개선안의
      의미가 일치하고 기존 TDD, 필수 dogfood, critic 독립성/강도, 전 AC·테스트 green, feature PR gate는
      하나도 완화되지 않는다. 검증: bounded 13/13, full 935/935, build pass, deploy unchanged.

- [x] **AC-11 — workflow dogfood (FR-1~9):** Given 이 slice 자체가 publish handoff readiness에 도달할 때,
      When versioned acceptance evidence를 검토하면, Then dogfood 직전 matrix가 동결돼 있고 승인 없는
      round 3은 0건이며, matrix 밖 선호로 인한 blocker 증가, stale base 최종 재작업, 외부 상태를 되쓰기
      위한 tracked task가 모두 0건이다. 검증: fresh-approved round 3 clean; scope/stale/external mirror 0.

## External postconditions — versioned AC 밖의 원격 완료 조건

- 최종 versioned commit 뒤 repository 완료 정책에 따라 feature branch를 push하고 PR을 만든다.
- PR head의 CI 상태를 원격 시스템에서 확인한 뒤 최종 사용자 보고에 link·상태를 포함한다.
- CI가 실제 결함을 발견하면 수정은 새 versioned candidate가 된다. 관련 테스트와 남은 round/추가 승인
  규칙에 따른 self-review를 다시 통과한 뒤 새 commit을 만들고 새 head CI를 확인한다.
- CI green·PR 번호·run ID만 tracked 문서에 mirror하거나 checkbox로 되쓰기 위한 commit은 만들지 않는다.
- 이 조건은 최종 보고 전에 확인하지만 AC/SM 체크를 위해 repository에 사후 commit하지 않는다.

## Open questions

- Blocking open question은 없다. 사용자가 채택한 네 규칙의 의미를 위 FR/AC로 고정했다.
- 향후 실제 운영 데이터가 충분해지면 시간·evidence 양의 수치 예산을 별도 SDD로 검토할 수 있으나,
  이번 slice의 성공 조건은 아니다.
