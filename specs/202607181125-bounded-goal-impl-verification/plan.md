---
title: Bounded goal-impl verification implementation plan
audience: both
---

# Plan: bounded goal-impl verification

> 상위 목표: [goal.md](goal.md) · 요구사항: [spec.md](spec.md)

## 1. 접근 요약

새 실행 엔진을 만들지 않고 LocalMind의 instruction contract를 정합한다. 먼저 정적 계약 테스트를 RED로
추가해 자동 review 2회 상한, 1회성 추가 승인, AC verification matrix, 두 base freshness gate,
post-push external state 경계를 고정한다. 그다음 repository 정본·scaffold·canonical workflow skill·SDD
template을 최소 변경해 GREEN으로 만들고 사람용 문서와 CHANGELOG를 동기화한다.

이 slice 자체가 새 규칙의 첫 dogfood다. 구현은 최신 `origin/main` 전체 SHA에서 새 feature branch로
시작하고 user-owned dirty `package-lock.json`을 보존한다. 아래 AC matrix를 사용자 확인으로 1차 확정하고
Phase 0에서는 readiness만 확인한 뒤, 첫 dogfood 직전에 completeness와 실행 가능성을 재검증해 freeze한다. 최종 self-review 직전 다시
base를 확인하고, 자동 review는 최대 두 라운드까지만 실행한다. 최종 versioned commit 이후 PR·CI 상태는
GitHub와 최종 보고가 소유하며 상태 기록만을 위한 commit은 만들지 않는다.

## 2. 확인된 내부 사실

이번 변경은 LocalMind 내부 규약·문서에 한정되며 시간에 따라 바뀌는 외부 API·가격·모델 사실을
설계 근거로 사용하지 않는다. 아래 사실은 2026-07-18 현재 repository source를 직접 읽어 확인했다.

| ID | 내부 사실 | 설계 영향 |
|---|---|---|
| F-1 | root와 scaffold `AGENTS.md`는 명백 결함을 `clean까지` 수정·재검하도록 규정한다. | 무제한 문구를 자동 2회 + fresh 승인 규칙으로 교체하고 품질 완료 조건은 유지한다. |
| F-2 | `goal-impl` §8도 `clean까지`를 말하고 completion 세부는 repository `AGENTS.md`에 위임한다. | generic orchestration은 round/승인 계약을 소유하고 PR/CI provider 세부는 계속 위임한다. |
| F-3 | `sdd-self-review`는 여러 reviewer findings를 병합하지만 round 번호·예산·추가 승인 metadata가 없다. | merged report에 candidate/round/blocker/approval-needed 정보를 추가한다. |
| F-4 | `goal-ready`의 `clean까지`는 구현 self-review가 아닌 문서 critic loop다. | 이번 2회 상한을 그 loop로 확장하지 않고 matrix 작성 책임만 추가한다. |
| F-5 | plan template의 테스트 표는 `AC / 테스트 레벨 / 방법 / 상태` 네 열이다. | evidence와 stop condition을 포함하는 새 matrix schema로 확장한다. |
| F-6 | `goal-impl`은 `tasks.md` checkbox를 진행 SSoT로 두고 PR/CI 완료는 AGENTS에 위임한다. | task checkbox 범위를 최종 versioned commit 전 상태로 좁히고 post-push 상태는 외부 handoff로 분리한다. |
| F-7 | 계약은 `skill-contract.test.ts`, repository 문서는 `workflow-docs.test.ts`, scaffold 산출물은 `scaffold.test.ts`에서 검증된다. | 세 테스트 층에 의미 parity와 negative guard를 먼저 추가한다. |
| F-8 | 현재 branch는 종료된 Deep Research feature를 가리키고 `package-lock.json`에 사용자 변경이 남아 있다. | 문서 준비는 현재 worktree에서 하되 실제 구현은 latest `origin/main` 기반 새 branch에서 시작하고 dirty 파일을 건드리지 않는다. |

## 3. 도메인 경계와 유비쿼터스 언어

### Bounded context A — SDD Preparation Contract

- **소유:** goal/spec/plan/tasks의 필수 구조, AC traceability, verification matrix schema.
- **정본:** `goal-ready`, `templates/sdd/plan.template.md`, tasks format reference.
- **이번 변경:** 모든 AC가 방법·evidence·stop condition에 1:1 연결되도록 준비 산출물을 강화한다.
- **비소유:** 구현 self-review round 실행과 remote PR/CI 상태.

### Bounded context B — Implementation Verification Orchestration

- **소유:** matrix readiness/freeze, review candidate와 round, automatic budget, fresh round approval,
  blocker의 중단·보고 상태.
- **정본:** `goal-impl`이 순서를 조율하고 `sdd-self-review`가 병합 finding report를 산출한다.
- **이번 변경:** 자동 round 1~2와 승인 기반 round 3+를 결정적으로 구분한다.
- **불변식:** review 횟수 제한은 품질 기준 면제가 아니다. blocker가 있으면 완료 불가다.

### Bounded context C — Repository Completion Governance

- **소유:** 기본 브랜치, feature branch, commit/push/PR/CI 완료 정책, dirty asset 보호.
- **정본:** repository root `AGENTS.md`; `templates/sdd/AGENTS.md`는 새 프로젝트 기본 계약이다.
- **이번 변경:** 시작·pre-review freshness gate와 versioned/external completion state 경계를 둔다.
- **비소유:** 특정 runtime model 선택과 review 내부 finding 판단.

### Bounded context D — Remote Delivery Status

- **소유:** push 이후 PR 번호, head SHA, review와 CI run/result.
- **adapter:** LocalMind는 GitHub/`gh`; generic skill은 repository가 정한 remote/CI 정책에 위임한다.
- **불변식:** 외부 동적 상태를 mirror하기 위한 tracked status-only commit을 만들지 않는다.

## 4. 설계 결정

- **D-1 — self-review만 두 라운드:** 상한 대상은 `goal-impl` 구현 후 `sdd-self-review`다.
  `goal-ready` 문서 critic과 제품 기능 내부 critic은 별도 loop이며 범위를 확장하지 않는다.

- **D-2 — candidate 기반 round 계산:** 동일 candidate의 병렬 reviewer 결과를 병합한 보고 하나가 한
  round다. finding 수정으로 candidate 의미가 바뀌고 새 병합 보고를 만들 때 다음 round가 된다. clean
  뒤 기계적 checkbox·link 표기는 새 candidate가 아니지만 규범·코드·테스트 의미 변경은 새 candidate다.

- **D-3 — 승인 토큰은 1회성:** round 2 이후에는 goal ID, 요청 round 번호, 잔여 blockers, 예상
  수정·검증 범위를 보여준 뒤 받은 새 명시 승인만 유효하다. 승인 하나가 round 하나만 해제한다.

- **D-4 — matrix SSoT는 plan:** `plan.md` 테스트 전략을 `AC / 검증 방법·레벨 / 최소 evidence /
  통과·종료 조건 / 상태`로 표준화한다. 별도 evidence database나 중복 문서를 만들지 않는다.

- **D-5 — 확인 후 재검증·freeze:** user가 goal-ready 산출물을 확인하면 matrix가 구현 계약이 된다.
  `goal-impl`은 dogfood 직전에 completeness·capability·종료 조건을 재검증하고 freeze한다. 탐색 spike는
  freeze 전에 가능하지만 성공 evidence로 재사용하지 않는다. 동결 변경은 이유·영향 AC·무효 evidence를
  남기며 실제 결함은 숨기지 않는다.

- **D-6 — freshness gate 2회:** 구현/baseline/RED 전에 repository upstream default branch를 fetch해
  full SHA·확인 시각·ancestry를 기록하고, 첫 final self-review 직전에 다시 확인한다. LocalMind binding은
  `origin/main`이다. 원격 전진 시 repository 정책에 맞게 통합하고 전체 회귀를 다시 통과시킨다.

- **D-7 — 정직한 freshness fallback:** remote/네트워크 부재, dirty overlap, 통합 충돌이면 최신이라고
  주장하지 않는다. 상태·기준 SHA·영향을 보고하고 사용자 방향을 기다린다. main 직접 push나 파괴적
  rebase 권한을 새로 만들지 않는다.

- **D-8 — task와 external state 분리:** versioned checkbox는 구현·테스트·문서·publish handoff 준비까지만
  둔다. push/PR/CI는 tracked checkbox가 아니라 별도 external handoff 절과 remote 상태로 확인한다.
  상태 기록만을 위한 commit은 금지한다. 실제 CI 결함 수정은 새 candidate로 허용하되 test/review gate를
  다시 통과한 뒤 새 commit을 만든다.

- **D-9 — instruction contract 우선:** production TypeScript engine, hook, bot, DAG runner를 바꾸지 않는다.
  정적 계약 테스트와 synthetic git remote dogfood로 지시의 존재·정합과 실제 수행 가능성을 분리 검증한다.

- **D-10 — provider/model 중립 유지:** canonical skills는 role/capability와 abstract execution tier만
  사용한다. 최종 critic 강도·독립성 fallback은 유지하며 concrete model binding은 건드리지 않는다.

## 5. 불변식

- **I-1:** 자동 self-review round ≤ 2. round 3+는 fresh 승인 1개당 1회다.
- **I-2:** blocker > 0이면 완료·commit/push 단계로 진행하지 않는다.
- **I-3:** 모든 AC는 frozen matrix의 정확히 한 행에 매핑된다.
- **I-4:** 동결은 재현된 제품·보안 결함이나 잘못된 stop condition을 은폐하지 않는다.
- **I-5:** 시작과 final review 전 base full SHA 확인 없이 freshness를 주장하지 않는다.
- **I-6:** user-owned dirty/unmanaged asset의 byte 변경·stage = 0.
- **I-7:** PR/CI status-only tracked commit = 0. 실제 defect fix commit은 허용한다.
- **I-8:** 기존 TDD, dogfood, critic 강도·독립성, 전 AC/test green, feature PR gate는 유지한다.
- **I-9:** `goal-ready` 자체 critic과 Deep Research 내부 critic의 round 정책은 바꾸지 않는다.
- **I-10:** production workflow engine과 provider/model binding은 변경하지 않는다.

## 6. 영향 모듈

### 수정

| 파일 | 변경 |
|---|---|
| `AGENTS.md` | LocalMind의 자동 2-round, matrix freeze, `origin/main` 2회 확인, GitHub external-state SSoT 정본 |
| `templates/sdd/AGENTS.md` | 새 프로젝트가 물려받는 provider-neutral 동일 규칙 |
| `templates/sdd/plan.template.md` | 5열 AC verification matrix와 freeze/amendment 안내 |
| `templates/skills/goal-ready/SKILL.md` | plan matrix 작성·사용자 확인 책임, external-state checkbox 생성 금지 |
| `templates/skills/goal-impl/SKILL.md` | start/pre-review gate, matrix readiness/freeze, round budget·approval, task 범위 |
| `templates/skills/goal-impl/references/tasks-format.md` | versioned phase와 post-push external handoff 표기 경계 |
| `templates/skills/sdd-self-review/SKILL.md` | candidate/round metadata, merged round report, blocker/approval-needed 판정 |
| `src/agents/skill-contract.test.ts` | canonical skill·tasks format의 새 정적 계약 RED/GREEN |
| `src/agents/workflow-docs.test.ts` | root/scaffold 규칙 parity, 무제한 문구·status-only commit negative guard |
| `src/scaffold.test.ts` | 생성된 AGENTS와 plan template의 round/matrix 계약 검증 |
| `docs/agents.md` | self-review round·독립성·중단 상태 설명 |
| `docs/workflows.md` | 비개발자용 matrix→dogfood→review→external completion 흐름 |
| `CHANGELOG.md` | 아직 버전 없는 변경 내역에 유한 검증 규약 추가 |

### 구현 중 검증 표기

| 파일 | 변경 |
|---|---|
| `specs/202607181125-bounded-goal-impl-verification/{goal,spec,plan,tasks}.md` | self-review clean 뒤 SM·FR·AC·phase와 근거 체크. PR/CI 결과는 되쓰지 않음 |

### 변경하지 않음

- `src/agents/*.ts`: instruction contract와 기존 deploy/scaffold 흐름을 재사용한다.
- 이전 `specs/202607172313-provider-neutral-deep-research/`: 회고 근거일 뿐 역사를 수정하지 않는다.
- `package-lock.json`: 사용자 소유 dirty 변경을 byte-for-byte 보존한다.
- model/runtime binding: 이번 규칙은 provider/model 중립이다.

## 7. 구현 단계

### [x] Phase 0 — 실행 권한·base·matrix readiness

1. user confirmation으로 `$goal-impl 202607181125` 실행 권한을 확인한다.
2. dirty/unmanaged 자산을 기록하고 `package-lock.json` hash를 보존 기준으로 잡는다.
3. `origin/main`을 fetch해 full SHA·확인 시각·현재 ancestry를 기록하고 latest base에서 새 feature branch를
   만든다. 충돌·overlap이면 중단·보고한다.
4. baseline test/build를 기록한다.
5. 아래 matrix의 모든 행을 readiness 관점에서 확인한다. 구현 중 생긴 변경을 반영한 최종 freeze는 첫
   dogfood 직전에 수행한다. 확인 SHA·baseline·readiness는 tracked 파일이 아닌 session run note에
   기록하고 Phase 6에서 필요한 evidence pointer만 versioned 문서에 반영한다.

### [x] Phase 1 — TDD RED: instruction·scaffold 계약

1. `skill-contract.test.ts`에 round identity/budget/approval, matrix readiness/freeze, external handoff
   계약과 기존 품질 gate 보존 assertion을 먼저 추가한다.
2. `workflow-docs.test.ts`에 root/scaffold semantic parity, `clean까지` 무제한 재검 금지, 두 freshness
   gate, status-only commit 금지 assertion을 추가한다.
3. `scaffold.test.ts`에 생성된 AGENTS와 plan template 5열 matrix 검증을 추가한다.
4. source가 아직 바뀌지 않아 새 테스트가 기대한 이유로 실패하는 RED를 확인한다.

### [x] Phase 2 — canonical governance GREEN

1. root와 scaffold AGENTS를 같은 의미로 갱신하되 LocalMind의 `origin/main`·GitHub 세부와 generic
   repository policy를 분리한다.
2. plan template을 5열 matrix로 바꾸고 freeze/amendment 규칙을 안내한다.
3. `goal-ready`에 matrix 작성 책임만 추가하고 자신의 document critic loop는 유지한다.
4. `goal-impl`에 two freshness gate, matrix readiness/freeze, max-two automatic round, fresh approval,
   blocker stop, versioned/external state 분리를 추가한다.
5. tasks format에 post-push external handoff는 checkbox phase가 아님을 명시한다.
6. `sdd-self-review` report에 candidate/round/independence/blocker/approval-needed를 포함한다.
7. Phase 1 계약 테스트를 GREEN으로 만든다.

### [x] Phase 3 — 사람용 문서·변경 이력

1. `docs/agents.md`에 두 라운드와 독립 reviewer 관계, 중단 상태, 승인 1회성을 설명한다.
2. `docs/workflows.md`에 matrix 확인→freeze→dogfood→freshness→review→remote completion 흐름을
   비개발자도 이해할 수 있게 추가한다.
3. CHANGELOG의 미버전 영역에 네 개선안과 품질 gate 보존을 기록한다.
4. docs/scaffold drift 테스트를 GREEN으로 만든다.

### [x] Phase 4 — 통합 검증·dogfood

1. 관련 unit/contract/scaffold 테스트, 전체 test와 build를 실행한다.
2. 첫 dogfood 직전에 matrix 11행을 최종 재검증해 freeze하고 시각·candidate·변경 여부를 session run
   note에 기록한다. 필수 capability가 없거나 행이 불완전하면 green으로 강등하지 않고 중단한다.
3. temporary local bare remote를 사용해 (a) up-to-date base와 (b) start 이후 base 전진 시나리오를
   수행하고 full SHA·integration·regression-before-review 흐름을 관찰한다.
4. matrix freeze 뒤 단순 추가 evidence 선호는 advisory가 되고, 구체적 stop-condition 결함은 영향 AC와
   evidence invalidation을 남겨 개정되는지 시뮬레이션한다.
5. status-only PR/CI 후속 commit이 tasks 형식과 규약에서 금지되고 실제 defect fix는 허용되는지
   대표 handoff를 검토한다.
6. `package-lock.json` hash와 stage 상태가 시작 기준과 같은지 확인한다.

### [x] Phase 5 — pre-review freshness·bounded self-review

1. `origin/main`을 다시 fetch해 full SHA를 Phase 0과 비교한다. 전진했으면 정책대로 통합하고 전체
   regression을 다시 통과시킨 뒤에만 round 1을 시작한다.
2. 격리 critic이 FR/AC traceability, test/dogfood evidence, correctness, simplicity/security,
   Live-Verify를 한 merged report로 검수한다.
3. round 1이 clean이면 종료한다. blocker를 수정했다면 changed candidate로 round 2를 실행한다.
4. round 2에도 blocker가 남으면 자동 중단하고 잔여 findings·수정·테스트·round 3 목적을 보고해 fresh
   승인 1회를 요청한다. 승인 없이는 문서 완료 표기·commit/push로 가지 않는다.

### [x] Phase 6 — versioned closure·publish handoff readiness

1. clean 판정 뒤 goal/spec/plan/tasks에 SM·FR·AC·phase evidence를 기계적으로 표기한다. 의미가 바뀌면
   새 candidate로 보아 남은 review budget/승인 규칙을 다시 적용한다.
2. 전체 diff·테스트·build·packaged deploy hash와 dirty asset 보존을 최종 확인한다.
3. 모든 versioned checkbox와 evidence pointer를 닫고 최종 commit·PR 본문에 필요한 self-review 요약을
   준비한다. post-push 동적 상태를 tracked 문서에 되쓸 task가 없음을 확인한다.

### External postconditions — tracked phase 밖

- repository AGENTS 정본에 따라 최종 versioned commit을 만들고 feature branch push·PR 생성·CI 감시를
  수행한다.
- PR/CI 링크와 상태는 remote와 최종 보고에만 남긴다. 그 상태만 반영하는 tracked commit은 만들지 않는다.
- 실제 CI 결함 수정은 새 candidate로 허용한다. 관련 테스트와 남은 round/추가 승인 규칙에 따른
  self-review를 다시 통과한 뒤 새 commit을 만들고 새 head의 CI를 원격 정본으로 삼는다.

## 8. 검증 matrix — AC 1:1

이 표는 사용자 확인으로 1차 확정되고 Phase 0에서 readiness를 확인한 뒤 Phase 4의 첫 dogfood 직전에
최종 재검증해 freeze한다.
상태는 구현 전 `Pending`, 통과 후 `[x]`와 evidence pointer로 갱신한다. PR/CI의 동적 성공 상태는 이 표에
사후 commit하지 않고 remote 링크와 최종 보고에서 확인한다.

### Matrix amendment A-1 — round 2 finding (2026-07-18)

- **변경 이유:** pre-review base 통합으로 candidate가 바뀌어도 기존 AC-7 종료 조건은 regression green만
  요구해, 이전 candidate의 dogfood·배포 evidence가 여전히 유효한지 보장하지 못했다.
- **영향 AC:** AC-7·AC-10.
- **무효 evidence:** candidate `5ac55279f7cd3c9bcf1b78fdd783e4c5b5aaa028`에서 만든 regression-only
  advanced-base synthetic evidence와, 그 결과만으로 기존 dogfood·배포 evidence를 새 candidate에도
  유효하다고 본 판단. 아래 amended 행에 따라 영향 행 재평가와 테스트·dogfood·배포를 다시 실행한다.

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 정적 계약 + review-report simulation | skill 문구 assertion, 동일 candidate의 다중 reviewer 병합 fixture | 병합 report 1개가 round 1이고 candidate 변경 후 report만 round 2 | [x] bounded contract + round 1~3 merged reports |
| AC-2 | 정적 negative contract + orchestrator 시뮬레이션 | round 2 blockers와 `approval-needed` 결과 | round 3·완료·commit 전환 0건, 잔여 상태 보고 1건 | [x] round 2 stop + approval-needed true |
| AC-3 | 승인 state-table 시뮬레이션 | goal/round/finding 이후 fresh approval 사례와 stale·포괄·암묵 반례 | fresh 승인 1개가 다음 round 1개만 허용하고 모든 반례는 거부 | [x] state table + fresh-approved round 3 1회 |
| AC-4 | goal-ready/plan contract + scaffold 통합 | spec AC 목록과 생성 plan matrix 행 비교, capability 부재 반례 | 모든 AC 정확히 1행, 5열 non-empty; 필수 capability 부재·skipped/degraded는 blocker | [x] 11행·5열 readiness audit |
| AC-5 | frozen-matrix 시나리오 검토 | 단순 evidence 선호, 제품/보안 결함, 잘못된 stop condition 세 fixture | 선호는 advisory; 실제 결함은 blocker; 개정은 이유·영향 AC·무효 evidence 포함 | [x] freeze audit + amendment A-1 |
| AC-6 | synthetic git remote dogfood + worktree audit | start fetch full SHA/시각/ancestry, 새 branch, dirty file 전후 hash/stage | latest base 분리 branch이고 dirty/unmanaged byte·stage 변화 0건 | [x] base 9f023da… + lock hash/stage 불변 |
| AC-7 | advanced-base synthetic git remote dogfood | start SHA, advanced SHA, integration record, frozen matrix 영향 행 재평가, 현재 candidate의 테스트·dogfood·배포 재실행 log | 최신 base 정합 뒤 무효화된 테스트·dogfood·배포 evidence가 모두 green일 때만 review 시작 | [x] e753cf0…→b99ba75…→9d441c… + 935/935/deploy |
| AC-8 | failure-path contract + synthetic unavailable/conflict case | `freshness unverified`, 기준 SHA·원인·영향·사용자 결정 요청 | silent fallback/`fresh`/`complete` 오표기 0건 | [x] unavailable exit 128 + real sandbox retry |
| AC-9 | task-format negative contract + representative handoff audit | final candidate, tracked task, status-only 반례, CI defect fix candidate | external-state mirror task 0건; CI fix는 test + 남은 round/fresh-approval review 뒤 commit | [x] external mirror task 0 + negative contract |
| AC-10 | contract/docs/scaffold tests + full test/build/deploy hash | 세 테스트 suite 결과, 전체 test/build, amendment 영향 배포, canonical↔installed hash | 네 규칙 parity, forbidden weakening 0건, 현재 candidate 재검증 전체 green | [x] bounded 13/13, full 935/935, build/deploy green |
| AC-11 | 이 slice의 publish-readiness run record | frozen matrix, base SHA 2회, merged review report(s), versioned task/history | 무승인 round 3·scope-creep blocker·stale 재작업·external-state tracked task 모두 0건 | [x] round 3 clean + four scope metrics 0 |

## 9. Open questions

- Blocking open question은 없다.
- 실제 구현 중 remote 접근이 불가능하거나 `package-lock.json` dirty 변경과 latest base가 충돌하면
  FR-6/AC-8에 따라 그 시점에 사용자 결정을 요청한다. 이는 숨은 설계 미결정이 아니라 명시된 실패 경로다.
