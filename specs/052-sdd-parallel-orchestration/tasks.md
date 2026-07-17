# Tasks: SDD 병렬 오케스트레이션 규약

> 모델 이력 — 작성: Fable 5 · 검토: 미정 · 구현(예상): 미정

<!-- 근거 정본은 plan(F-1~12·D-1~7·영향 모듈·테스트 전략) — 재조사 금지, 백포인터로 인용만.
     이 문서 자체가 D-1 문법의 첫 산출물(AC-2 도그푸드): 각 phase 헤더 직하 선언 줄이 그것이다. -->

## 불변식 (I-n) — 위반 시 배리어 불통과

- **I-1**: sdd-implement의 fan-out §는 기존 절 확장이 아니라 **신설**이다(→ plan F-2 — repo 정본에
  "phase별 서브에이전트 위임" 절 없음). "기존 절에 추가" 식 서술·편집 금지.
- **I-2**: 신설·수정 문구는 중립성 스캔 0위반(→ plan F-6·D-6) — provider·구체 모델·런타임 전용
  도구명 금지. 역할명(worker·critic 등)·"격리 위임"·"배리어" 어휘는 허용.
- **I-3**: 무선언 phase = 모든 노드와 겹침 간주 → 직렬 보수 기본(→ plan D-2). 규약 문안에 이
  기본값이 빠지면 결함.
- **I-4**: C(중첩 위임)는 기본 금지 — 사용자가 특정 사안에 명시 허용한 경우에만 1단계(→ plan
  D-7, spec FR-6). 이번 구현 자체도 C 미사용으로 수행한다.
- **I-5**: 051을 **대기하지 않는다**(→ plan D-4). Phase 2 착수 시점에 `specs/051-*` 완료로 정본이
  개편돼 있으면 편집 대상만 치환하고 보고에 명시 — 그 외 분기 없음.
- **I-6**: 각 배리어 조건 = 전체 `npm test` green + `npm run build` clean(기존 `skills.test.ts`·
  `commands.test.ts`·`workflow-docs.test.ts` 등 회귀 포함 — → plan 테스트 전략 "회귀", F-7 인접).
  **배리어 조건의 검증 주체 = 메인**(전 worker 완료 후) — leaf worker는 자기 파일 작업만 하고
  배리어 전체 검증을 수행하지 않는다(spec FR-2, plan D-7).

## 예상 fan-out 레이어 — 아래 선언에서 도출 (→ plan "단계" 서두)

- **L1 = Phase 1 ∥ Phase 3** (둘 다 depends-on 없음, files disjoint — AC-4 시연 1)
- **L2 = Phase 2** (Phase 1 배리어 대기 — AC-6 시연)
- **L3 = Phase 4 ∥ Phase 5** (files disjoint — AC-4 시연 2 · Phase 5는 잔task 묶음 — AC-8 시연)
- **L4 = Phase 6** (전부 대기, 직렬 완주 — AC-7 시연)

## Phase 0 — Live-Verify 게이트 확인 (worker, 착수 시 1회)
> depends-on: 없음 · files: 없음(확인만)

- [ ] **T0.1** 이 slice 산출물이 산문 규약뿐이라 낡을 수 있는 외부 사실이 없음 + Agent Skills
      frontmatter·구조 불변경임을 확인만 하고 self-review 보고에 1줄 명시(→ plan Phase 0).

## Phase 1 — tasks-format 규약 정본 신설 (worker)
> depends-on: 없음 · files: `templates/skills/sdd-implement/references/tasks-format.md`

- [ ] **T1.1** `templates/skills/sdd-implement/references/tasks-format.md` **신규 작성**(→ plan
      영향 모듈·F-8 관행): D-1 선언 문법(phase 헤더 직하 blockquote, `depends-on:`·`files:`,
      `[P]`는 파생 힌트, task 인라인은 선택 확장) · D-2 disjoint 판정(경로 정규화·디렉토리
      접두·글롭 보수 확장·**무선언=겹침→직렬** I-3) · D-3 worktree 1문장(명시 선택 옵션) ·
      D-5 소프트 권고(레이어당 권장 2~3) · FR-5 비용 가드(독립+disjoint+유의미한 크기 셋 다) ·
      레거시(무선언 tasks 유효, 직렬 취급). 어휘는 I-2 준수. — AC-2 정적 근거.

## Phase 2 — 구현 스킬 fan-out 절 (worker)
> depends-on: Phase 1 · files: `templates/skills/sdd-implement/SKILL.md`

- [ ] **T2.1** I-5 분기 확인: 착수 시점 `specs/051-*` 존재·완료 여부 조회 — 미완(현행, → plan
      F-10)이면 아래 경로 그대로, 완료면 051 결과 정본으로 치환 후 보고 명시(→ plan D-4).
- [ ] **T2.2** `templates/skills/sdd-implement/SKILL.md`에 fan-out DAG § **신설**(I-1, → plan
      영향 모듈, spec FR-2): "의존 충족 + 파일 disjoint + 유의미한 크기인 노드들을 **한 메시지에
      동시 spawn**" · "배리어에서 메인 통합 검증(테스트·정합)·phase 커밋 후 다음 레이어 해금" ·
      worker 간 직접 통신 금지 · 파일 겹침→직렬 기본(worktree는 명시 선택, → plan D-3) ·
      의존 미충족 노드 보류 · "병렬 여지 없으면 직렬 완주(병렬 강제 아님)"(spec FR-5) ·
      `references/tasks-format.md` 지시. — AC-1·(AC-5·6·7 정적 문안) 근거.
- [ ] **T2.3** 같은 §에 위상 명문(→ plan D-7, spec FR-6): 메인 = 유일 오케스트레이터(hub) ·
      서브에이전트 = leaf(작업만) · A(무거운 작업 fan-out)/B(값싼 조회 메인 직접)를 노드 크기로
      가름 · 잔task = B 또는 단일 worker 묶음 · **C(중첩)는 사용자 명시 허용 시에만 1단계**(I-4).
      — AC-9 정적 근거. Phase 1 확정 문법 참조(내용 의존)라 L2 배치 — AC-6 시연점.

## Phase 3 — 문서 작성 스킬 곁가지 병렬 절 (worker)
> depends-on: 없음 · files: `templates/skills/goal-ready/SKILL.md`

- [ ] **T3.1** `templates/skills/goal-ready/SKILL.md`에 곁가지 병렬 § **신설**(→ plan 영향 모듈,
      spec FR-3): (a) 한 슬라이스 안 — 하드 체인(goal→spec→plan→tasks) 직렬 유지 + 곁가지
      병렬(사실수집 ∥ 초안, design ∥ plan, 독립 research N개 동시 위임) + **크리틱은 항상 모든
      산출물이 모인 마지막 배리어**. (b) 슬라이스/spec 간 — 폴더 disjoint + Read 전용 저작이라
      **기본 병렬 안전**, 한계는 내용·결정 의존뿐이며 goal-impl 파일 충돌 정책은 이 체제에
      대체로 비적용(두 체제 구분 명문). 어휘는 I-2 준수. — AC-3 정적 근거. Phase 1과 disjoint·
      의존 없음 — AC-4 시연점(L1에서 Phase 1과 동시 spawn).

## Phase 4 — 정적 계약 테스트 (worker)
> depends-on: Phase 1, Phase 2, Phase 3 · files: `src/agents/skill-contract.test.ts`

- [ ] **T4.1** F-7 패턴(packaged 문서 직접 읽어 문구 assert, → plan F-7)으로 케이스 추가:
      AC-1(fan-out·배리어) · AC-2(tasks-format의 depends-on·files 요구) · AC-3(하드 체인 직렬·
      곁가지·크리틱 최종 배리어·체제 구분) · AC-9(hub·leaf·A/B·C 조건) + AC-5·6·7·8 문안
      (겹침→직렬·보류·직렬 완주·잔task 묶음) 존재 assert. **사후 핀** — 규약 문구 확정 후
      assert 문자열을 못 박는 TDD 변형(050 T2.6 동일)임을 보고에 명시. RED 기대: Phase 1~3
      완료 전에 이 케이스를 돌리면 실패해야 정상(순서상 사후이므로 1회 관찰로 갈음 가능).
- [ ] **T4.2** packaged 전수 중립성 스캔에 신설 `references/tasks-format.md` 포함 clean 확인
      (→ plan F-6, T4.1의 전수 스캔 케이스로 커버). **스캔이 살아있음의 RED 검증은 실파일이
      아니라 인메모리 fixture로 한다**(`src/agents/skills.test.ts:180` 선례처럼 fixture 기반
      스킬 구성): 임시 in-memory `SkillPackage`에 구체 모델 토큰을 포함한 본문을 주입하고
      `scanPackagedNeutrality`를 직접 호출 → findings가 비어 있지 않음(RED)을 확인한다.
      **`references/tasks-format.md` 실파일은 건드리지 않는다** — Phase 4 files 선언(신규
      파일 없음)과 정합.

## Phase 5 — 포인터·사람용 문서 — 잔task 묶음 (worker)
> depends-on: Phase 1, Phase 2, Phase 3 · files: `AGENTS.md`, `docs/workflows.md`

두 task는 각각 잔task라 **의도적으로 단일 worker로 묶는다**(spec FR-5의 자기 적용 — AC-8 시연점).
Phase 4와 files disjoint — AC-4 두 번째 시연점(L3에서 Phase 4와 동시 spawn).

- [ ] **T5.1** `AGENTS.md`에 tasks 형식 규약 포인터 1~2줄(외과적 — → plan 영향 모듈).
- [ ] **T5.2** `docs/workflows.md`에 사람용 병렬 오케스트레이션 설명·구체 예시 — 스캔 밖 채널
      이라 구체 예시 허용(→ plan F-12).

## L3 배리어 (메인 수행)

배리어 검증은 leaf worker가 아니라 **메인**이 수행한다(spec FR-2, plan D-7, I-6). Phase 4와
Phase 5가 모두 끝난 뒤 메인이 통합 검증한다 — leaf worker 안에서 전체 `npm test`를 도는 것은
I-6 위반(회귀).

- [ ] **B-L3** L3(Phase 4 ∥ Phase 5) 완료 후 **메인이** 전체 `npm test` green + `npm run build`
      clean을 확인한다(I-6). 통과해야 L4(Phase 6)를 해금한다.

## Phase 6 — 배포·도그푸드 기록·self-review·검증 표기 (worker 실행 · 최종 판정 격리 리뷰어)
> depends-on: Phase 0, Phase 1, Phase 2, Phase 3, Phase 4, Phase 5 · files: `specs/052-sdd-parallel-orchestration/goal.md`, `specs/052-sdd-parallel-orchestration/spec.md`, `specs/052-sdd-parallel-orchestration/plan.md`, `specs/052-sdd-parallel-orchestration/tasks.md`

곁가지 없는 이 phase 자체가 직렬 완주 — AC-7 시연점.

- [ ] **T6.1** `make skills-deploy`로 전파(→ plan F-9) — 배포 성공이 중립성 clean의 이중 확인.
- [ ] **T6.2** 도그푸드 기록: 구현 중 관찰한 fan-out(P1∥P3, P4∥P5)·배리어 통합 검증·커밋·
      보류(P2)·묶음(P5)·직렬 완주(P6)를 AC-4~9별로 정리(→ plan 테스트 전략 표 우측 열).
      AC-5 양성 사례(겹침 쌍) 미발생 시 그 사실을 명시하고 후속 slice 관찰로 승계(은폐 금지).
      AC-7도 동일하게 처리: P6 완주는 보조 증거일 뿐, 후속 단순 작업 1건의 직렬 관찰은 052
      DoD 이후에만 가능하므로 미발생을 명시하고 **후속 slice 관찰로 승계**(은폐 금지).
- [ ] **T6.3** self-review(격리 리뷰어, 점검 5범위 — AGENTS.md 규약 5) clean까지 반복.
      기계적 수정은 모아서 1라운드 배칭.
- [ ] **T6.4** 검증 표기: spec FR-1~6·AC-1~9 `[x]`+근거, plan 단계·테스트 전략 체크, goal
      Success metrics 표기, spec Open questions 5건 취소선 + plan D-n 포인터(AGENTS.md OQ 규약).
- [ ] **T6.5** 커밋(self-review 요약 포함)·push·CI 감시 `gh run watch <run-id> --exit-status`
      (전체 sha 사용 — AGENTS.md 규약 7).

## AC 매핑 요약 (→ plan 테스트 전략 표가 정본)

| AC | 정적(Phase 4) | 도그푸드(Phase 6 기록) |
|---|---|---|
| AC-1 | T4.1 | — |
| AC-2 | T4.1 | 이 tasks.md 자체(전 phase 선언 포함) |
| AC-3 | T4.1 | — |
| AC-4 | — | T6.2 (P1∥P3, P4∥P5) |
| AC-5 | T4.1 | T6.2 (겹침 병렬 0건 — 양성 미발생 시 명시) |
| AC-6 | T4.1 | T6.2 (P2가 P1 배리어 전 미spawn) |
| AC-7 | T4.1 | T6.2 (P6 직렬 완주는 보조 증거. 후속 단순 작업 1건은 AC-5와 동일하게 **후속 slice 관찰로 승계** — 미발생 시 명시) |
| AC-8 | T4.1 | T6.2 (P5 단일 worker 묶음) |
| AC-9 | T4.1 | T6.2 (이번 slice가 hub-and-spoke·C 미사용으로 수행) |

## 검증 명령

- 배리어마다: `npm test` (전체 green) + `npm run build` (clean) — I-6.
- Phase 6: `make skills-deploy` 성공.

## DoD — 완료 정의

AC-1~9 정적+도그푸드 충족(미충족·미발생은 명시 보고) + 전체 `npm test` green + `npm run build`
clean + `make skills-deploy` 전파 완료 + self-review clean + goal/spec/plan 세 문서 검증 표기
완료 + 커밋·push·CI green.
