# Tasks: SDD 구현 스킬 정합 — goal-impl 통일

> 모델 이력 — 작성: Fable 5 · 검토: Fable 5(critic) · 구현(예상): 미정(하위 모델 위임 가능)

<!-- 무엇을 실행하는가. 상위: [goal](goal.md) · [spec](spec.md) · [plan](plan.md).
     audience: ai — 구현 모델이 추측 없이 결정적으로 소화하는 지시서. 배경·근거는 plan 백포인터로만. -->

> **확정 사실 표(F-1~F-18)·OQ 해소 결정(D-1~D-5)은 plan이 정본** — 재조사 금지, 인용만.
> 파일:행 근거가 필요하면 plan F표를 참조하라. 코드 시그니처는 해당 소스 파일이 정본이다.

## 불변식 (구현 중 항상 유지 — 위반 = 결함)

- **I-1 개명 원자성**: P2·P3은 **한 커밋 그룹**으로 닫는다. `sdd-implement`와 `goal-impl`이
  활성 표면에 공존하는 커밋을 main 이력에 남기지 않는다. → plan 단계 서두, goal Constraint
- **I-2 은퇴 sweep = 이름 무관(generic) + 마커 결합 + registry-clean 가드**: sweep에
  `sdd-implement` 리터럴을 넣지 않는다. 판정은 "관리 마커 보유 ∧ template 집합에 이름 부재"
  뿐이며, template registry problem 시 sweep은 실행되지 않는다(부재 기반 오삭제 방지). → plan D-2, F-18
- **I-3 unmanaged 불가침**: 마커 없는 사본·개명된 fork는 어떤 경로로도 삭제·덮어쓰기하지
  않는다 — 보존 + 보고만. → plan D-2, F-6, 가정·리스크
- **I-4 grep-0 허용 목록은 정확히 2종**: `specs/**` + 가드 테스트 자신. 그 외 활성 표면에
  구명 리터럴 0건. 활성 표면의 역사 언급은 "(specs/051에서 개명)"처럼 **구명 리터럴 없는
  포인터**만 허용. → plan D-3
- **I-5 완료 규칙 자체 서술 금지 + PR 게이트는 AGENTS.md에 명문화**: 신 SKILL.md에 commit/
  push/CI·self-review·PR 규칙을 자체 정의하지 않는다 — AGENTS.md 참조만. **단 base §6-4의 PR
  게이트(main 직접 push 금지 → PR 생성, 머지는 사람)는 소멸시키지 않고 AGENTS.md 규약7에
  명문화한다**(D-6, 사용자 결정). SKILL은 그 규약7을 참조. → plan F-12, D-6, spec FR-4
- **I-6 금지 토큰 재유입 금지**: 신 SKILL.md 편집 시 provider명·구체 모델 ID·런타임 도구명·
  런타임 URL을 쓰지 않는다(실측 위반 2토큰 포함). 페르소나 고유명·개인 예시도 제거 대상. → plan F-9, F-10
- **I-7 불가침 경로**: `specs/044-*`·`specs/050-*` 내부 문서는 편집 금지, `specs/052-*`는
  main에 없음 — 생성·편집 금지. → plan D-3, D-4, F-14

## 커밋 경계

- **C1** = P1 (독립 — 이름 무관이라 개명 전 검증 가능) · **C2** = P2 + P3 (I-1 원자 그룹) ·
  **C3** = P4 · **C4** = P5 검증 표기. 각 커밋 전 `npm test` green.

---

## P1 — 은퇴 기제 (generic source-absence 정리)

- depends-on: 없음 · **[P] P2와 병렬 가**(파일 배타) · 담당: 쓰기 실행 역할(standard)
- files: `src/agents/skills.ts` · `src/agents/commands.ts` · `src/agents/skills.test.ts` · `src/agents/commands.test.ts`

- [x] **T1.1 (RED) seed sweep 테스트** — `src/agents/skills.test.ts`에 추가: ① 데이터 폴더에
      마커 결합(managed) 디렉토리가 있고 template 집합에 그 이름이 없으면 → seed 후 pruned
      (reason "packaged 정본에서 은퇴됨"), ② 마커 없는(unmanaged) 동조건 디렉토리 → 보존 + 보고,
      ③ template registry problem 시 → sweep 미실행(어떤 삭제도 없음, F-18 가드).
      **RED 기대**: ①이 실패해야 한다 — 현행 seed는 prune이 없어(→ plan F-4) stale 디렉토리가
      잔존하므로 "pruned" 단언이 깨진다. ②·③은 현행에서도 green일 수 있는 **경계 핀**이다 —
      T1.3 구현 후에도 green 유지가 "과잉 삭제 없음"을 잡는다(구현이 이름 무관 삭제를 넓히면 실패).
      검증: `node --import tsx/esm --test src/agents/skills.test.ts` → AC-11(단위면), AC-9 전제
- [x] **T1.2 (RED) Gemini wrapper sweep 테스트** — `src/agents/commands.test.ts`에 추가:
      ① commandsDir의 이름 결합 managed `.toml` 중 template 집합에 없는 이름 → pruned,
      ② unmanaged `.toml` → 보존, ③ `pruneSuppressed`(타깃 불가용 등) 시 → 보류(삭제 없음).
      **RED 기대**: ①이 실패해야 한다 — 현행 `syncGeminiCommands`는 absence sweep이 없다(→ plan F-5b).
      검증: `node --import tsx/esm --test src/agents/commands.test.ts`
- [x] **T1.3 구현 (D-2①②)** — depends on T1.1, T1.2. ① `seedWorkflows`(`src/agents/skills.ts`)에
      마커 결합 source-absence 정리 추가 — `pruneManagedDirectory` 재사용(→ plan F-8), 기존
      registry-clean early return 아래에서만(→ plan F-18), reason "packaged 정본에서 은퇴됨"(→ plan D-5a).
      ② `syncGeminiCommands`(`src/agents/commands.ts`)에 동일 규율의 `pruneManagedFile` sweep 추가 —
      `available && !pruneSuppressed`일 때만(skill-dir sweep과 동일 조건, → plan F-5a).
      reconcile primitive 신설·변경 금지(→ plan DDD 경계).
      **green 기대**: T1.1·T1.2 전 케이스 + 기존 테스트 무회귀.
      검증: `node --import tsx/esm --test src/agents/skills.test.ts src/agents/commands.test.ts` 후 `npm test`

## P2 — 신 정본 본문 (병합·중립화)

- depends-on: 없음 · **[P] P1과 병렬 가** · 담당: 쓰기 실행 역할(critical-reasoning — 신규 본문 판단)
- files: `templates/skills/goal-impl/SKILL.md`(신규) · `templates/skills/sdd-implement/`(삭제) · `templates/skills/catalog.json`

- [x] **T2.1 신 SKILL.md 작성** — `templates/skills/goal-impl/SKILL.md` 신규, 마커 `skill: goal-impl`.
      구성은 **plan "본문 병합 매핑" 표를 절 단위로 그대로 따른다**(§1 게이트 이식 = AC-3,
      §7 등급·바인딩 참조 + F-13 소비 규약 = AC-10 전제, §8-4 삭제·AGENTS.md 위임 = AC-4/I-5,
      §0 삭제 + 중립 잔존 1줄 = plan D-1, base 핵심 절 규율 보존 = AC-5). I-6 준수.
      구 template 디렉토리 `templates/skills/sdd-implement/`는 삭제한다(FR-2 표면 정리).
- [x] **T2.2 catalog 키 개명** — `templates/skills/catalog.json`: 키를 `goal-impl`로,
      `activation: explicit`·`sideEffects: mutating` 유지(→ plan F-2). `retired` 필드류 추가 금지(→ plan F-17, D-2 기각 대안).
- [x] **T2.3 중립성 자가 검증** — depends on T2.1. `scanPackagedNeutrality`
      (`src/agents/skill-contract.ts` — 시그니처는 소스가 정본)를 신 본문에 대해 로컬 실행
      (스크래치 tsx 호출 또는 P4 T4.2 특성화 테스트 초안 선작성) → **위반 0건**(AC-2).
      1건이라도 나오면 T2.1로 돌아가 해당 토큰 제거 — 스캔 목록 완화 금지.

## P3 — 개명 전파 (코드·테스트·규약·docs)

- depends-on: P1, P2(테스트 파일 공유 + 산출물 경로 참조) · 담당: 쓰기 실행 역할(standard — 기계적 치환)
- files: `AGENTS.md` · `templates/sdd/AGENTS.md` · `templates/sdd/spec.template.md` · `docs/agents.md` · `docs/workflows.md` · `README.md` · `src/agents/workflow-policy.ts` · `src/agents/cross-review-cli.ts` · F-16의 테스트 9파일

- [x] **T3.1 (RED-first) 테스트 개명** — plan F-16이 열거한 9파일(skills.test.ts ·
      commands.test.ts · workflow-policy.test.ts · skill-contract.test.ts · verify-targets.test.ts ·
      workflow-docs.test.ts · scaffold.test.ts · execution-policy.test.ts ·
      scripts/workflow-lifecycle.test.mjs)의 픽스처·단언·이름 목록·template 경로 하드코딩
      (workflow-docs.test.ts:83류)을 `goal-impl` 기대로 치환.
      **RED 기대**: P2 산출물 적용 전 트리에서는 이 테스트들이 실패한다(구명 template·catalog 기대) —
      P2와 합류해야 green. I-1에 따라 P2와 같은 커밋 그룹.
- [x] **T3.2 규범 문서 개명 + §0 이관** — ① plan F-15의 행들: `AGENTS.md`(절 제목·호출 문법·
      규약 7·구현 규율), `templates/sdd/AGENTS.md`, `templates/sdd/spec.template.md`,
      `docs/agents.md`, `docs/workflows.md`, `README.md` — 현재형 규범 서술 전부 `goal-impl`로
      (D-3 경계: specs/044·050 불가침 = I-7, AGENTS.md의 "specs/044" 포인터 문장은 구명 리터럴이
      없으므로 유지). ② `docs/agents.md`에 base §0의 런타임 특화 주의(내장 명령 구분·겹쳐 쓰기)
      이관 — 기존 :167-172 갱신(→ plan D-1, F-9: docs는 스캔 대상 아님) + 구명 없는 051 포인터(→ plan D-5d, I-4).
      ③ 코드 주석 2건: `src/agents/workflow-policy.ts:55` · `src/agents/cross-review-cli.ts:9`(→ plan F-1).
- [x] **T3.2b AGENTS.md 규약7 PR 게이트 명문화** — `AGENTS.md` 규약7(:56)의 "self-review clean이면
      커밋·push까지가 완료 정의"를 **"feature 브랜치 커밋·push + PR 생성까지가 완료(main 직접 push
      금지, 머지는 사람)"로 정합**(→ plan D-6). `templates/sdd/AGENTS.md`도 동조. 이로써 F-12 상충
      해소 + base PR 규율이 SSoT에 살아있음(**AC-4**, I-5). CI 감시 등 나머지 완료 규칙 문면은 유지.
- [x] **T3.3 전체 스위트 green** — depends on T3.1, T3.2, P2. 검증: `npm test` — 기존 테스트
      전부 green, 개명 기인 실패 0(**AC-8**). green 확인 후 P2+P3을 한 커밋(C2)으로 닫는다(I-1).

## P4 — 가드·특성화 테스트 (AC-1~7 정적 잠금)

- depends-on: P3 · 담당: 쓰기 실행 역할(standard)
- files: `src/agents/workflow-docs.test.ts`(또는 신규 가드 테스트 파일) · `src/agents/workflow-policy.test.ts` · `src/execution-policy.test.ts` · `scripts/workflow-lifecycle.test.mjs`

- [ ] **T4.1 재유입 가드(walk grep-0)** — 활성 표면(`src/` · `docs/` · `templates/` · `scripts/` ·
      `AGENTS.md` · `README.md`)을 walk하며 구명 리터럴 검색, 허용 = I-4의 2종만 → 0건 단언(**AC-1·AC-6**).
      **RED 기대(핀 실증)**: 임의 활성 파일에 리터럴을 일시 삽입해 테스트가 **실제로 실패**하는지
      확인 후 원복 — "그냥 통과"하는 가드 금지. 수동 교차 확인:
      `grep -rn "sdd-implement" --exclude-dir={node_modules,dist,specs,.git} .` → 가드 테스트 자신만.
- [ ] **T4.2 중립성 특성화** — goal-impl 본문 `scanPackagedNeutrality` 결과 `[]` 단언(**AC-2**).
      **RED 기대(핀 실증)**: 본문에 금지 토큰 1개를 일시 삽입 → 이 테스트 실패 + 기존 packaged
      강제(→ plan F-9: 위반 = source problem → seed/deploy 전역 실패)가 함께 잡는지 확인 후 원복(**AC-7**).
- [ ] **T4.3 게이트·위임·강점 특성화** — 신 본문 텍스트 단언 3종:
      ① 게이트 문구 존재 — provenance·`^[0-9]{3}$`·challenge·instruction-level 정직 표기(**AC-3**;
      workflow-policy grant 판정 테스트는 T3.1 개명본 유지),
      ② AGENTS.md 절 제목·호출 문법 = goal-impl ∧ 본문에 commit/push/CI 자체 규칙 **부재** ∧
      AGENTS.md 참조 **존재** ∧ **AGENTS.md 규약7에 PR 게이트(main 직접 push 금지 → PR 생성)
      명문 존재**(**AC-4**, I-5, D-6),
      ③ 핵심 절 앵커 존재 — 끊김 방어·tasks 재사용(재분해 금지)·TDD/RED·중단 규율·DoD·보고(**AC-5**).
      **RED 기대(핀 실증)**: 앵커 1개를 일시 제거 → ③ 실패 확인 후 원복.
- [ ] **T4.4 lifecycle 은퇴 관찰** — `scripts/workflow-lifecycle.test.mjs`: WORKFLOWS 배열
      개명(T3.1) 위에, "구 이름 잔재(데이터 정본·wrapper)가 seed→deploy 후 정리됨" 시나리오 추가
      (**AC-9의 통합 레벨**). 검증: `node --import tsx/esm --test scripts/workflow-lifecycle.test.mjs` 후 `npm test`.

## P5 — 도그푸드·검증 표기·self-review

- depends-on: P4 · 담당: 현재 세션(조율) + 독립 리뷰(critical-reasoning — 다운시프트 금지)
- files: `specs/051-goal-impl-reconciliation/{goal,spec,plan,tasks}.md`(검증 표기)

- [ ] **T5.1 실배포 관찰** — `make update`(seed+deploy) 실행 → 각 런타임 타깃에 goal-impl
      배포 관찰(**AC-9**). **환경 실측(→ plan F-19)**: (a) `sdd-implement` 잔재가 3타깃 모두
      부재하므로 "은퇴 관찰"은 T4.4 lifecycle 합성 시나리오가 정본 증거 — 도그푸드에서 실잔재가
      없으면 "정리 대상 0(이미 부재)"로 보고. (b) `~/.gemini/commands` 부재 → gemini 타깃은
      `skipped-unavailable`로 보고됨이 정상(3타깃 중 실배포는 가용 타깃 한정). 관찰 결과를 그대로 보고.
- [ ] **T5.2 데이터 폴더 분기 관찰** — 이 세션 사본은 **managed 확정(→ plan F-19)** → 백업
      스왑 갱신(→ plan F-7) 관찰, **덮어쓰기 0**(I-3). unmanaged 분기(reserved-fork 보고·rename
      안내, F-6)는 **이 환경에 없어 도그푸드 생략** — AC-11 증거는 P1 단위(T1.1 ②)가 담당(생략 사유 보고에 명시).
- [ ] **T5.3 바인딩 분기 관찰** — `~/.localmind/_bindings` **부재(→ plan F-19)** → 미설정
      환경만 자연 관찰 가능: 스킬 §7(등급·역할) 도달 시 안내→기본 미진행·비독립 fallback 명시(→ plan F-13)
      표명을 관찰(**AC-10** 미설정 분기). 설정 분기는 임시 바인딩을 깔아 관찰하거나(선택),
      바인딩 계약 단위 검증으로 대체하고 도그푸드 생략을 명시.
- [ ] **T5.4 검증 표기 + self-review + 완료** — 관찰 evidence로 spec FR·AC / plan 단계 /
      goal Success metrics 체크 표기(미충족은 미체크 + 사유 부기). 독립 self-review clean까지
      반복 후 커밋·push·CI 감시 — **완료 규칙은 AGENTS.md 규약 7이 정본**(이 문서는 재서술하지
      않는다, I-5 자기적용).

---

## Dependencies & Execution Order

- P1 ∥ P2 (파일 배타, 둘 다 depends-on 없음) → P3(depends on P1, P2) → P4 → P5.
- P1 내부: T1.1 [P] T1.2(다른 테스트 파일) → T1.3. P2 내부: T2.1 [P] T2.2 → T2.3.
- P3 내부: T3.1 [P] T3.2(파일 배타) → T3.3. P4 내부: T4.1 [P] T4.2 [P] T4.3(단, 같은 가드
  파일에 모으면 [P] 해제하고 직렬) → T4.4.
- 커밋 경계: C1(P1) → C2(P2+P3, I-1 원자) → C3(P4) → C4(P5).

## DoD

전 AC(1~11) 실환경 테스트·관찰 green + `npm test` 전체 green(회귀 0) + 3타깃 배포·은퇴 관찰 +
세 문서 검증 표기 + 독립 self-review clean + AGENTS.md 규약 7에 따른 커밋·push·CI green.
