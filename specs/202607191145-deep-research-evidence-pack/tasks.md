---
title: Deep Research evidence pack 보강 작업
audience: ai
---

# Tasks: Deep Research evidence pack 보강

## Phase 0 — baseline·freshness
> depends-on: 없음 · files: `specs/202607191145-deep-research-evidence-pack/`

- [x] origin/main full SHA와 작업트리 상태를 기록한다.
- [x] 기존 deep-research focused test와 전체 baseline을 실행한다.
- [x] verification matrix를 첫 dogfood 직전에 freeze할 준비가 됐는지 확인한다.

## Phase 1 — TDD RED
> depends-on: Phase 0 · files: `src/agents/skill-contract.test.ts`, `src/agents/workflow-policy.test.ts`, `src/agents/skills.test.ts`, `src/agents/commands.test.ts`, `src/agents/workflow-docs.test.ts`, `tests/fixtures/research-evidence-pack/`

- [x] AC-1~5·10의 canonical/policy/lifecycle 실패 테스트를 추가한다.
- [x] AC-6~9의 valid/invalid/security fixture와 validator 실패 테스트를 추가한다.
- [x] 새 package·contract·validator가 없어서 기대한 이유로 RED인지 확인한다.

## Phase 2 — canonical package GREEN
> depends-on: Phase 1 · files: `templates/skills/deep-research/`, `templates/skills/research-evidence-pack/`, `templates/skills/catalog.json`

- [x] deep-research에 ID·적응형 충분성·checkpoint·handoff 계약을 최소 추가한다.
- [x] research-evidence-pack SKILL/reference를 explicit path gate와 함께 작성한다.
- [x] Python 3.9+ 표준 라이브러리 validator를 구현하고 focused test를 GREEN으로 만든다.

## Phase 3 — distribution·문서
> depends-on: Phase 2 · files: `README.md`, `docs/agents.md`, `docs/workflows.md`, `CHANGELOG.md`, `src/agents/commands.test.ts`, `src/agents/skills.test.ts`, `src/agents/workflow-docs.test.ts`

- [x] runtime별 호출, 두 workflow의 side-effect 경계, evidence pack 파일 구성을 문서화한다.
- [x] packaged workflow 목록과 lifecycle 기대값을 7개 정본에 맞춘다.
- [x] 문서·배포 focused tests를 GREEN으로 만든다.

## Phase 4 — 통합·도그푸드
> depends-on: Phase 3 · files: `specs/202607191145-deep-research-evidence-pack/evidence/`

- [ ] 전체 test/build/diff-check를 실행한다.
- [ ] temp roots에서 seed→deploy→redeploy와 unmanaged 보호를 검증한다.
- [ ] matrix를 freeze하고 Innerview 구현 전 조사 brief로 report-only dogfood를 수행한다.
- [ ] 명시적 임시 프로젝트 경로에 evidence pack을 만들고 validator green을 확인한다.

## Phase 5 — self-review·versioned closure
> depends-on: Phase 4 · files: `specs/202607191145-deep-research-evidence-pack/goal.md`, `specs/202607191145-deep-research-evidence-pack/spec.md`, `specs/202607191145-deep-research-evidence-pack/plan.md`, `specs/202607191145-deep-research-evidence-pack/tasks.md`, `specs/202607191145-deep-research-evidence-pack/evidence/`

- [ ] FR/AC 1:1, 테스트, 정확성, 단순성, 보안·저작권, Live-Verify를 적대적으로 검수한다.
- [ ] 명백 결함을 수정·재검하고 AC matrix와 goal/spec/plan/tasks 검증 표기를 갱신한다.
- [ ] clean candidate의 PR 본문용 변경·검증 요약을 준비한다.

## External handoff — tracked checkbox 범위 밖

- feature branch를 push하고 PR을 만든다.
- PR head의 CI를 원격에서 확인하고 최종 보고에 링크와 상태를 남긴다.
- 사용자 runtime에 managed workflows를 배포하고, 외부 unmanaged 동명 skill 충돌은 삭제하지 않고 정확히 보고한다.
