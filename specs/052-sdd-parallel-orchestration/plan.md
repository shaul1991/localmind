# Plan: SDD 병렬 오케스트레이션 규약

> 모델 이력 — 작성: Fable 5 · 검토: 미정 · 구현(예상): 미정

<!-- 어떻게(how). 상위: [goal](goal.md) · [spec](spec.md) -->
<!-- 검증 표기: self-review clean 시 단계·테스트 전략 항목을 [x] + 근거로 표기한다(AGENTS.md 규약 5). -->

## 확정 사실 표 (F-n) — 하위(tasks 분해·구현·크리틱)의 유일 사실 출처 [R1]

> 재조사 금지·인용만. 근거는 파일:행(행번호는 밀릴 수 있음 — 심볼·문구로 재검증). 확인일 2026-07-17.

| # | 사실 | 근거 |
|---|---|---|
| **F-1** | SDD 구현 스킬의 repo 정본은 `templates/skills/sdd-implement/SKILL.md`(69행, §1 활성화~§8 + 정직한 보고). 완료 규칙 정본은 저장소 `AGENTS.md`로 위임한다(본문 9-11행) | `templates/skills/sdd-implement/SKILL.md:1-69` |
| **F-2** | **repo 정본에는 "phase별 서브에이전트 위임(각자 새 컨텍스트), 메인은 조율·검증만" 절이 없다.** goal/spec Background의 "이미 있다"는 repo 정본 기준으로는 사실이 아니다(개인 환경의 goal-impl 스킬 기준 서술로 추정 — 050이 예고한 051 정합 문제의 실체). **052는 fan-out 절을 기존 절 확장이 아니라 신설**한다 | `templates/skills/sdd-implement/SKILL.md` 전문에 해당 문구 부재(2026-07-17 grep `phase별`·`서브에이전트 위임` — specs/ 문서에만 존재) |
| **F-3** | 문서 작성 스킬 정본은 `templates/skills/goal-ready/SKILL.md`(85행, §1~§13). §6은 **goal/spec/plan 3문서만** 산출(tasks 산출 규정 없음), §9 역할 위임, §10 크리틱, §12 보고·확인 | `templates/skills/goal-ready/SKILL.md:43-49(§6)·61-69(§9·10)` |
| **F-4** | **tasks 설계 규약의 성문 정본은 repo에 없다** — de-facto 형식만 존재: `## Phase N — 제목 (담당)` 헤더 + `- [ ] **Tn.m**` task 라인 + phase 헤더 뒤 `` `[P]` `` 주석("Phase 1·2와 독립, 병렬 가능"), task 라인 `[P]`(041). FR-1은 확장이 아니라 **신설 성문화**다 | `specs/050-persona-model-binding/tasks.md:126` · `specs/041-agent-rules-central/tasks.md:44,137` |
| **F-5** | packaged 스킬은 5종(`goal-ready` intent/docs-only · `sdd-implement` explicit/mutating · `sdd-self-review` · `localmind-rules` · `localmind-binding`), manifest 1:1 바인딩 | `templates/skills/catalog.json:3-9` |
| **F-6** | **중립성 스캔은 packaged 전 스킬에 예외 없이 적용**된다(governance 스킬 면제 없음 — spec Context의 "plan에서 확인" 해소). 금지 토큰 = provider·구체 모델·런타임 전용 도구·placeholder(`NEUTRALITY_FORBIDDEN_TOKENS`) + "agent tool/type/도구/서브에이전트" 패턴. **페르소나 역할명(worker·critic 등)은 금지 목록에 없어 사용 가능**. 한글 "서브에이전트" 단독은 매칭 안 되나 기존 본문 관례("격리 위임"·"worker")를 따른다 | `src/agents/skill-contract.ts:485-518(NEUTRALITY_FORBIDDEN_TOKENS·AGENT_TOOL_RE)·556-575(scanPackagedNeutrality)·714-737(packaged 루프)` |
| **F-7** | 정적 AC 검증 패턴 존재: packaged SKILL.md·`references/*.md`를 직접 읽어 문구 존재를 assert(specs/050 T2.6) — 052 정적 검증은 이 패턴 재사용 | `src/agents/skill-contract.test.ts:487-497` |
| **F-8** | 스킬 계약 상세를 `references/` 동봉 문서로 두고 정적 테스트로 핀하는 관행 존재(050 `binding-contract.md`) — tasks-format 규약 정본 배치의 선례 | `templates/skills/localmind-binding/references/binding-contract.md`(존재) · `specs/050-persona-model-binding/tasks.md:107-112(T2.4)` |
| **F-9** | 배포 파이프라인: `templates/skills`(패키지 동봉 정본) → seed → 데이터 폴더 `<노트 폴더>/skills/`(prune 없음·사용자 fork 보존) → 런타임 타깃. 정본 편집 후 전파는 `make skills-deploy`/`make update` | `src/agents/skills.ts:49-52(skillsDir)·488-507(seed)` |
| **F-10** | `specs/051` 폴더는 **존재하지 않는다**(2026-07-17 specs/ 전수 조회 — 최대 052). 051은 050이 "워크플로 스킬 본문 정합(goal-impl↔sdd-implement 이름·본문)"으로 예고만 한 상태 | `specs/` glob 결과 · `specs/050-persona-model-binding/goal.md:68-69,100` |
| **F-11** | 050 실증 병렬의 선언 관행은 **phase 단위**다(Phase 3 `[P]` — "Phase 1·2와 독립") — 노드 기본 입도의 근거 | `specs/050-persona-model-binding/tasks.md:126` |
| **F-12** | 사람용 문서 `docs/workflows.md`는 중립성 스캔 밖 — 구체 예시 허용 채널(050 T4.1 선례) | `specs/050-persona-model-binding/tasks.md:142-147` |

## 결정 (D-n) — spec Open questions 해소

### D-1. 메타데이터 문법 — **phase 헤더 직하 선언 줄** (OQ-1 해소)

**권고: phase 헤더 바로 아래 blockquote 선언 줄 1개.** 노드 기본 입도는 phase다(F-11 — spawn 단위와 판정 단위 일치).

```markdown
## Phase 3 — 백업 격리 배선 (worker)
> depends-on: 없음 · files: `scripts/backup.sh`, `scripts/backup-init.sh`, `scripts/backup.test.sh`
```

- `depends-on:` — `없음` 또는 선행 phase 참조(쉼표 구분, 예 `Phase 1, Phase 2`).
- `files:` — 저장소 상대 경로(백틱, 쉼표 구분). 디렉토리는 `/` 접미, 글롭 허용(판정은 D-2).
- 기존 `[P]` 표기는 **파생 힌트로 유지 가능**(선언에서 도출되는 결론 — 있으면 사람 스캔용, 판정 근거는 선언). 기존 tasks 문서(무선언)는 레거시로 유효 — 선언 없는 phase는 D-2 보수 기본으로 직렬.
- task 라인 인라인 선언(`[files: …]`)은 한 phase 안에서 task 단위 병렬이 필요할 때의 **선택 확장**으로만 규약에 언급.

기각 대안: ① YAML frontmatter 집중 선언 — 선언과 본문이 분리돼 드리프트 위험, 파서도 없음. ② task별 전수 인라인 — 노이즈 크고 spawn 단위(phase)와 불일치.

### D-2. 파일 disjoint 판정 (OQ-2 해소)

메인이 선언 텍스트만으로 기계적으로 판정한다(도구 도입 없음 — goal Constraints "산문+메타"):

1. 경로를 저장소 상대로 정규화한 뒤, 두 노드의 files 쌍에 대해 **(a) 동일 경로 또는 (b) 한쪽이 다른 쪽의 디렉토리 접두**(`src/rules/` vs `src/rules/deploy.ts`)이면 겹침.
2. 글롭(`*` 포함)은 **고정 접두 디렉토리로 보수 확장**해 (b)로 판정(`src/rules/*.ts` → `src/rules/`).
3. **선언 누락 phase는 모든 노드와 겹침으로 간주 → 직렬**(보수 기본 — goal Risks "선언 부정확" 1차 방어).
4. 2차 방어는 배리어의 메인 통합 검증(테스트·diff 정합)이다 — 선언 품질 오류를 여기서 잡는다.

기각 대안: 정확 문자열 일치만 — 디렉토리 선언과 개별 파일 선언의 충돌을 놓친다(과소 판정).

### D-3. worktree 발동 임계 (OQ-3 해소)

규약에는 **1문장까지만** 적는다: "files가 겹치면 직렬이 기본이며, worktree 격리(worker별 저장소 복제 후 병합)는 **사용자가 명시적으로 선택했을 때만** 쓰는 옵션이다." 임계 수치·절차는 적지 않는다(goal Non-goal — 표준화·자동화 제외).

### D-4. 051 순서 — **대기하지 않는다** (OQ-4 해소)

052는 **현행 repo 정본**(`templates/skills/sdd-implement/SKILL.md` · `templates/skills/goal-ready/SKILL.md`)에 바로 반영한다. 근거: ① 051은 아직 문서화 전(F-10)이라 대기는 표류 위험(goal Risks), ② 052가 추가하는 규칙은 자기완결 §라 스킬 이름·본문 정합(051)과 독립 — 051이 뒤에 오면 절 단위로 보존·이식하면 된다. **분기**: 052 구현 착수 시점에 051이 완료돼 정본 파일명·구조가 바뀌어 있으면, 이 plan의 F표 경로 대신 051 결과 정본에 같은 절을 반영한다(F표는 "051 미반영 현행" 기준임을 명시).

### D-5. 동시 spawn 상한 — 하드 상한 없음, 소프트 권고 (OQ-5 해소)

하드 상한은 두지 않는다. 대신 규약에 권고 1문장: "한 배리어 레이어의 동시 worker는 메인이 결과를 통합·검증할 수 있는 수(권장 2~3)를 넘기지 않는다." 근거: 실질 제어는 FR-5 비용 가드(유의미한 크기)가 하고, 050 실증도 2개였다. 기각 대안: 하드 상한(런타임 능력 차를 무시하는 과잉 규제) · 무언급(과병렬 리스크 방치).

### D-6. 규약 정본 배치

- **tasks 병렬 메타데이터 규약(D-1·D-2)의 상세 정본** = `templates/skills/sdd-implement/references/tasks-format.md` **신설**(F-8 관행 — 소비자(fan-out 판정) 옆이 정본, 정적 테스트로 핀 가능, 배포 파이프라인으로 새 설치에 전파(goal Problem 1 "교육")).
- `sdd-implement/SKILL.md` 본문엔 fan-out 핵심 규칙 §(요약 + reference 지시), `goal-ready/SKILL.md`엔 곁가지·슬라이스 병렬 §.
- repo `AGENTS.md`에 포인터 1~2줄(localmind 자체 tasks 저작이 이 형식을 따르도록), `docs/workflows.md`에 사람용 구체 예시(스캔 밖 — F-12).
- **중립성 준수(F-6)**: 신설 문구는 "worker/서브에이전트(한글 단독은 스캔 통과)/격리 위임/동시 위임/배리어" 어휘 사용 — provider·모델·런타임 도구명 0건. 스캔이 위반을 기계적으로 배포 실패시킨다.

### D-7. 오케스트레이션 위상 (FR-6 — 사용자 결정 2026-07-17)

fan-out §에 위상을 명문화한다: **메인 = 유일 오케스트레이터(hub)**, 서브에이전트 = leaf(작업만, 서로·하위와 통신 없음). 방법은 노드 크기로: **무거운 작업 = 서브에이전트 fan-out(A, 새 컨텍스트 오프로드)** · **값싼 독립 조회·검증 = 메인 도구 직접 병렬(B)** · 잔task = B 또는 단일 워커 묶음(FR-5). **중첩 위임(C, 서브에이전트가 하위 워커 spawn)은 기본 금지 — 사용자가 특정 사안에 명시 허용한 경우에만 1단계 가능.** 근거: 컨텍스트 경제 + 단일 조율 권위. `sdd-implement/SKILL.md` fan-out §에 배치.

## DDD 경계 · 유비쿼터스 언어

- bounded context: **에이전트 자산 배포**(agents/skills) 컨텍스트의 문서면 — 새 코드 모듈 없음, 산출물은 packaged 마크다운 + 정적 테스트 케이스.
- 용어는 spec Terminology를 그대로 쓴다(노드·의존 DAG·files 선언·disjoint·fan-out·배리어·곁가지·잔task·hub-and-spoke·leaf). 새 코드 용어 없음.

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `templates/skills/sdd-implement/references/tasks-format.md` | **신규** | tasks 병렬 메타데이터 규약 정본: D-1 문법·D-2 판정·D-3 worktree 1문장·D-5 권고·FR-5 비용 가드·레거시(무선언=직렬) (FR-1·4·5) |
| `templates/skills/sdd-implement/SKILL.md` | 수정(절 신설) | fan-out DAG §: 의존 충족+파일 disjoint+유의미한 크기 → 한 메시지 동시 spawn / 배리어에서 메인 통합 검증·phase 커밋 후 해금 / **위상(D-7): 메인=유일 조율자·leaf worker·A(fan-out)/B(직접)·C(중첩)는 사용자 명시 허용 시만** / 병렬 여지 없으면 직렬 완주 (FR-2·5·6, F-2: 신설임) |
| `templates/skills/goal-ready/SKILL.md` | 수정(절 신설) | 곁가지 병렬 §: 하드 체인 직렬 유지 + 곁가지(사실수집∥초안, design∥plan, 독립 research N개) 병렬 / 크리틱은 항상 마지막 배리어 / 슬라이스 간 기본 병렬 안전(Read 전용 저작·폴더 disjoint — 한계는 내용·결정 의존, 파일 충돌 정책은 이 체제에 비적용) (FR-3) |
| `src/agents/skill-contract.test.ts` | 수정(케이스 추가) | AC-1~3·9 문구 존재 정적 검증(F-7 패턴) + 신설 문서 포함 packaged 전수 스캔 clean 확인 |
| `AGENTS.md` | 수정(1~2줄) | tasks 형식 규약 포인터(외과적) |
| `docs/workflows.md` | 수정 | 사람용 병렬 오케스트레이션 설명·구체 예시(스캔 밖) |
| `specs/052-*/tasks.md` | 신규(구현 시) | **자기 시연**: 모든 phase에 depends-on·files 선언(AC-2의 첫 산출물) |

## 단계 (phase) — 의존 순서 · 자기 시연 선언 포함

각 phase의 선언이 D-1 문법의 도그푸드다. 예상 fan-out: **레이어 1 = Phase 1 ∥ Phase 3**, **레이어 2 = Phase 2**, **레이어 3 = Phase 4 ∥ Phase 5**, **레이어 4 = Phase 6**.

- [ ] **Phase 0 — Live-Verify 게이트 확인** (worker, 착수 시 1회)
  > depends-on: 없음 · files: 없음(확인만)
  이 slice의 산출물은 산문 규약이라 낡을 수 있는 외부 사실이 없다. Agent Skills 표준 준수는 044에서 검증됐고 이번에 frontmatter·구조를 바꾸지 않음을 확인만 하고 self-review 보고에 1줄 명시.

- [ ] **Phase 1 — tasks-format 규약 정본 신설** (worker)
  > depends-on: 없음 · files: `templates/skills/sdd-implement/references/tasks-format.md`
  D-1 문법·D-2 판정·D-3·D-5·비용 가드(FR-5)·레거시 규정을 중립 어휘(D-6)로 성문화.

- [ ] **Phase 2 — 구현 스킬 fan-out 절** (worker)
  > depends-on: Phase 1 · files: `templates/skills/sdd-implement/SKILL.md`
  FR-2·6 규칙 § 신설(F-2 — 기존 절 확장 아님) + tasks-format reference 지시 + 위상(D-7). Phase 1의 확정 문법을 참조하므로 내용 의존 — **AC-6 시연점**(Phase 1 배리어 전 spawn 보류).

- [ ] **Phase 3 — 문서 작성 스킬 곁가지 병렬 절** (worker)
  > depends-on: 없음 · files: `templates/skills/goal-ready/SKILL.md`
  FR-3(a)(b) § 신설 — 크리틱 최종 배리어·두 체제 구분 명문화. Phase 1과 파일 disjoint·의존 없음 — **AC-4 시연점**(Phase 1 ∥ Phase 3 동시 spawn).

- [ ] **Phase 4 — 정적 계약 테스트** (worker)
  > depends-on: Phase 1, Phase 2, Phase 3 · files: `src/agents/skill-contract.test.ts`
  F-7 패턴으로 AC-1~3·9 문구 존재 assert + packaged 전수 스캔에 신설 reference 포함·clean 확인. 규약 문구가 확정돼야 assert 문자열을 못 박을 수 있어 사후 핀 성격(050 T2.6과 동일 — TDD 변형임을 보고에 명시). 검증: `npm test` green + `npm run build` clean.

- [ ] **Phase 5 — 포인터·사람용 문서 (잔task 묶음 — AC-8 시연)** (worker)
  > depends-on: Phase 1, Phase 2, Phase 3 · files: `AGENTS.md`, `docs/workflows.md`
  AGENTS.md 1~2줄 + workflows.md 예시는 각각 잔task라 **의도적으로 단일 worker로 묶는다**(FR-5 규약의 자기 적용). Phase 4와 파일 disjoint — **AC-4 두 번째 시연점**(Phase 4 ∥ Phase 5).

- [ ] **Phase 6 — 배포·도그푸드 기록·self-review·검증 표기** (worker 실행 · 최종 판정 격리 리뷰어)
  > depends-on: Phase 0~5 전부 · files: `specs/052-sdd-parallel-orchestration/goal.md`, `spec.md`, `plan.md`, `tasks.md`
  `make skills-deploy`로 전파(F-9) → 구현 중 관찰한 fan-out/배리어/보류/묶음 기록을 AC별로 정리(아래 표) → self-review(점검 5범위) clean → 세 문서 `[x]` + 근거 표기 → 커밋·push·CI 감시(AGENTS.md 규약 7). 곁가지 없는 이 phase 자체가 직렬 완주 — **AC-7 시연점**.

**051 분기(D-4)**: Phase 2 착수 시점에 `specs/051-*`이 완료돼 스킬 정본이 개명·개편돼 있으면 편집 대상을 051 결과 정본으로 치환하고 그 사실을 보고에 명시한다. 051 미완(현재 상태, F-10)이면 위 경로 그대로 진행 — 대기하지 않는다.

## 테스트 전략 — AC 1:1 (정적 / 도그푸드 2층, specs/050 계승)

| AC | 정적(규칙 존재 — Phase 4) | 행동 도그푸드(Phase 6 기록) |
|---|---|---|
| AC-1 fan-out·배리어 명문 | `sdd-implement/SKILL.md`에 "의존 충족+파일 disjoint+유의미한 크기 → 한 메시지 동시 spawn"·"배리어 통합 검증·커밋·해금" assert | — |
| AC-2 tasks 메타 규약 | `tasks-format.md`에 depends-on·files 요구 규칙 assert | 052 자기 `tasks.md`가 전 phase 선언 포함(개정 후 첫 산출물) |
| AC-3 곁가지·슬라이스 병렬 | `goal-ready/SKILL.md`에 하드 체인 직렬·곁가지 병렬·크리틱 최종 배리어·체제 구분 assert | — |
| AC-4 fan-out 실행 | — | Phase 1∥3, Phase 4∥5 동시 spawn + 각 배리어에서 메인 통합 검증·커밋 관찰 기록 |
| AC-5 파일 겹침 직렬 | 겹침→직렬·worktree 명시 선택 규칙 assert | 도그푸드 전체에서 겹침 노드 병렬 spawn 0건 확인. 052 tasks엔 겹침 쌍이 없어 양성 사례 미발생 가능 — 미발생이면 그 사실을 보고에 명시(은폐 금지)하고 후속 slice 관찰로 승계 |
| AC-6 의존 미충족 대기 | 의존 미충족 노드 보류 규칙 assert | Phase 2가 Phase 1 배리어 통과 전 spawn되지 않음 관찰 |
| AC-7 단순 작업 직렬 | "병렬 여지 없으면 직렬 완주(병렬 강제 아님)" assert | Phase 6 직렬 완주는 보조 증거. 후속 단순 작업 1건의 직렬 관찰은 052 DoD 이후에만 가능해 AC-5와 동일하게 **후속 slice 관찰로 승계**(미발생 시 명시, 은폐 금지) |
| AC-8 잔task 묶음 | 잔task 병렬화 금지·묶음 규칙 assert | Phase 5를 단일 worker 묶음으로 수행 관찰 |
| AC-9 위상 명문 (FR-6) | `sdd-implement/SKILL.md`에 "메인=유일 조율자·leaf·A/B 크기로·C는 사용자 명시 허용 시만" assert | Phase 6에서 이번 slice가 위상대로(hub-and-spoke, C 미사용) 수행됐음 기록 |

회귀: `npm test` 전체 + `npm run build`. 주의 — 기존 테스트(`skills.test.ts`·`commands.test.ts`·`workflow-docs.test.ts` 등 참조, F-7 인접)가 두 스킬의 배포 기제·문구를 핀하고 있을 수 있으므로 본문 편집 후 전수 green 확인이 배리어 조건이다.

## 리스크 · 완화

- **선언 부정확(과소 files)** → D-2 보수 기본(누락=겹침) + 배리어 통합 검증 이중 방어(goal Risks 그대로).
- **중립성 스캔 위반으로 배포 실패** → D-6 어휘 규율 + Phase 4 전수 스캔 케이스가 커밋 전 기계 검출(F-6).
- **051과의 정합 충돌** → D-4 분기 + 자기완결 § 설계(절 단위 이식 가능).
- **규약 형해화** → 정적 문구 핀(Phase 4) + 052 자기 시연 + goal Success metrics의 "위반 0건" 관찰.

## Open questions 해소 매핑

spec OQ 5건 전부 이 plan에서 확정: 문법=D-1, disjoint 판정=D-2, worktree 임계=D-3, 051 순서=D-4, spawn 상한=D-5. FR-6 위상=D-7. (구현 완료 시 spec OQ 항목에 취소선 + 본 절 포인터를 남긴다 — AGENTS.md OQ 해결 표기 규약.)
