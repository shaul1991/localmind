# Spec: 페르소나/모델 바인딩 온보딩

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `sdd-implement` 규약 5. -->

## Status

Draft. 이 문서는 구현 계약이며 아직 구현 또는 검증 완료를 표시하지 않는다.

## Terminology

- **실행 등급(execution tier)**: AGENTS.md "실행 등급 배치"의 추상 등급 3종 —
  `critical-reasoning` · `standard` · `economy`. 이 spec은 등급을 재정의하지 않고 재사용한다.
- **역할(role)**: architect·critic·worker·interviewer·designer·researcher 같은 업무 책임.
  특정 모델·특정 런타임 agent type이 아니다(044 용어 계승).
- **페르소나(persona)**: 페르소나 레지스트리(localmind 데이터 폴더 `agents/`)에 정의된
  agent 정의 문서. 격리 서브에이전트 위임의 대상이다.
- **바인딩(binding)**: (a) 실행 등급 → 구체 모델 식별자, (b) 역할 → 페르소나, 두 매핑을 담은
  설치(런타임)별 로컬 설정.
- **온보딩(onboarding)**: 바인딩을 처음 만드는 1회성 설정 인터뷰. 전용 진입점으로 실행한다.
- **페르소나 fallback**: 격리 서브에이전트 위임 능력이 없는 런타임에서 현재 세션이 해당 역할의
  체크리스트를 직접 수행하고 결과 보고에 "비독립(fallback)"임을 명시하는 것(044 capability
  fallback 방식).

## Scope

이번 작업은 다음을 만든다: ① 바인딩 설정(등급→모델, 역할→페르소나)의 스키마와 저장 규약,
② 바인딩을 만들고 고치는 전용 온보딩 진입점, ③ 워크플로 스킬이 바인딩을 소비하는 규약
(부재 시 안내, 페르소나 미지원 시 fallback). 워크플로 스킬 본문을 실제로 바인딩 참조로
치환하는 정합 작업은 후속 slice(051)의 범위다 — 050은 051이 참조할 계약까지 정의한다.

## Context

- AGENTS.md "실행 등급 배치"는 3등급 추상을 정의하고 "구체 provider·model 매핑은 별도 local
  binding 문서(optional adapter)"로 예고했다 — 이 spec이 그 adapter다.
- 소비자는 localmind 워크플로 스킬(논리 ID `goal-ready` · `sdd-implement` · `sdd-self-review`,
  및 사용자 데이터 폴더의 `goal-impl` 등)이다. 현재 데이터 정본 스킬에는 구체 모델명(예:
  Fable 5·Opus·Sonnet 계열)과 페르소나 지시가 직접 적혀 있다.
- 페르소나 레지스트리는 localmind 데이터 폴더(`~/.localmind` 아래) `agents/`의 20개다:
  analyst · android-dev · architect · auth-dev · backend-dev · critic · curator · data-platform ·
  dba · designer · frontend-dev · infra · interviewer · ios-dev · librarian · mobile-dev ·
  researcher · security-reviewer · ux-reviewer · worker.
- localmind는 TypeScript, 스킬은 Agent Skills 표준(SKILL.md), 데이터 정본은 `~/.localmind`
  (templates → 시드), 배포는 Claude / 공용(.agents) / Gemini 3타깃.
- 런타임별 가용 모델·격리 위임 능력이 다르다(예: Codex·Gemini는 페르소나 위임 미지원) —
  044가 capability/fallback 방식으로 이미 이 차이를 다룬다.

## Functional Requirements

- [ ] **FR-1 (바인딩 설정 스키마)**: 실행 등급 3종(`critical-reasoning`·`standard`·`economy`)
      → 구체 모델 식별자, 역할 → 페르소나(레지스트리의 agent 이름), 두 매핑을 담는 바인딩
      설정을 정의한다. 설정은 localmind 데이터 폴더 아래 **런타임(설치)별로 분리** 저장되고,
      백업·device-sync 등 동기화 파이프라인에서 **제외**된다. (정확한 파일 포맷·경로는 plan에서
      확정 — Open questions 참조.)  → goal: Objective / Constraint(로컬·비동기화)
- [ ] **FR-2 (전용 온보딩 진입점)**: 사용자가 명시적으로 호출하는 전용 설정 진입점을 만든다.
      진입점은 ① AI가 아는 최신 모델 티어를 근거로 **등급별 추천 초안**을 제시하되 "추천은
      낡을 수 있으며 정본은 사용자 확정 값"임을 고지하고, ② 사용자가 자신의 실제 가용 모델로
      확정·수정하게 하며, ③ 역할 → 페르소나는 레지스트리를 **나열**하고 역할별 기본 후보를
      추천한 뒤 사용자가 확정하게 한다. 완료 시 저장된 바인딩 요약을 평이한 한국어로 보여준다.
      → goal: Objective / Expected outcome / Constraints(비개발자·모델명은 낡는다)
- [ ] **FR-3 (재설정)**: 온보딩 진입점을 재실행하면 기존 바인딩 값을 보여주고, 원하는 항목만
      수정해 저장할 수 있다(나머지 항목 보존).  → goal: Success metrics(재설정 가능)
- [ ] **FR-4 (워크플로 스킬의 바인딩 소비 규약)**: 워크플로 스킬은 페르소나·모델이 필요한
      시점에 자기 런타임의 바인딩을 읽는다. 바인딩(또는 필요한 항목)이 없으면 **side-effect가
      발생하기 전에** 평이한 한국어로 온보딩 방법을 안내하고 기본적으로 진행하지 않는다.
      단, 런타임 능력 부재로 바인딩 항목이 적용 불가능한 경우(FR-5)는 fallback으로 진행하되
      그 사실을 명시한다. 이 규약은 051이 스킬 본문에 반영할 계약이다.
      → goal: Objective / Success metrics(미설정 안내 100%) / Constraints(중단 금지)
- [ ] **FR-5 (페르소나 fallback — 비독립 명시)**: 격리 서브에이전트 위임 능력이 없는 런타임
      에서는 역할 → 페르소나 바인딩 대신 **현재 세션이 그 역할의 체크리스트를 수행**하고,
      결과 보고에 "비독립(fallback)"임을 명시한다. 페르소나 바인딩의 부재·미지원이 워크플로를
      중단시키지 않는다(044 capability 방식과 동일).  → goal: Constraints(중단 금지) / Expected outcome
- [ ] **FR-6 (런타임별 격리)**: 각 런타임(Claude Code·Codex·Gemini CLI 등)의 바인딩은 서로
      독립이다 — 한 런타임에서의 설정·수정이 다른 런타임의 바인딩에 영향을 주지 않고, 다른
      런타임의 바인딩을 대신 읽지 않는다.  → goal: Constraints(로컬·비동기화) / Success metrics(격리)
- [ ] **FR-7 (입력 검증과 우아한 실패)**: 온보딩 입력을 다음과 같이 다룬다 — ① 페르소나는
      레지스트리 존재를 검증하고 없는 이름은 저장 전에 경고·재선택을 유도한다(무효 바인딩 저장
      금지). ② 모델 식별자는 자유 입력을 허용하고 가용성을 검증하지 않되(Non-goal: 프로빙),
      검증하지 않음을 고지한다. ③ 부분 설정(일부 등급·역할만 설정)은 유효하다 — 설정된 항목은
      사용하고 미설정 항목만 FR-4의 부재 규칙을 적용한다(전체 무효화 금지). ④ 레지스트리가
      비어 있으면 역할 → 페르소나 단계는 안내와 함께 건너뛰고 등급 → 모델 설정은 정상 진행한다.
      → goal: Expected outcome / Constraints(비개발자·중단 금지)

## Acceptance Criteria

유저 시나리오:

- [ ] **AC-1 (최초 설정)**: Given 바인딩이 없는 설치에서, When 사용자가 온보딩 진입점을
      실행하면, Then 등급별 모델 추천 초안(낡을 수 있음 고지 포함)과 레지스트리 기반 페르소나
      후보가 제시되고, 사용자 확정 값이 해당 런타임의 바인딩으로 저장되며, 저장된 바인딩
      요약이 평이한 한국어로 표시된다.
- [ ] **AC-2 (재설정)**: Given 기존 바인딩이 있는 설치에서, When 온보딩 진입점을 재실행하면,
      Then 현재 바인딩 값이 표시되고, 사용자가 선택한 항목만 수정 저장되며, 수정하지 않은
      항목은 보존된다.
- [ ] **AC-3 (설정 없이 워크플로 실행)**: Given 바인딩이 없는 설치에서, When 워크플로 스킬이
      페르소나·모델이 필요한 시점에 도달하면, Then 어떤 side-effect도 발생하기 전에 온보딩
      방법을 포함한 평이한 한국어 안내가 표시되고 워크플로는 기본적으로 진행하지 않는다.
- [ ] **AC-4 (페르소나 미지원 런타임)**: Given 격리 서브에이전트 위임 능력이 없는 런타임에서,
      When 워크플로가 역할(예: critic) 수행을 요구하면, Then 현재 세션이 그 역할의 체크리스트를
      직접 수행하고 결과 보고에 "비독립(fallback)"이 명시되며, 워크플로는 중단되지 않는다.
- [ ] **AC-5 (런타임 격리)**: Given 런타임 A에서 바인딩을 설정한 상태에서, When 런타임 B에서
      워크플로를 실행하면, Then B는 A의 바인딩을 읽지 않고 B 자신의 바인딩 부재 규칙(AC-3)을
      적용한다.

엣지 케이스:

- [ ] **AC-6 (엣지 — 부분 설정)**: Given 일부 등급·역할만 설정된 바인딩에서, When 워크플로가
      설정된 항목과 미설정 항목을 모두 요구하면, Then 설정된 항목은 그대로 사용되고 미설정
      항목에만 부재 규칙(안내 또는 fallback)이 적용된다 — 바인딩 전체가 무효 취급되지 않는다.
- [ ] **AC-7 (엣지 — 잘못된 페르소나명)**: Given 온보딩 중 레지스트리에 없는 페르소나 이름이
      입력되면, When 저장을 시도하면, Then 저장 전에 경고와 재선택 유도가 표시되고 무효
      바인딩은 저장되지 않는다.
- [ ] **AC-8 (엣지 — 빈 레지스트리)**: Given 페르소나 레지스트리가 비어 있는 설치에서, When
      온보딩을 실행하면, Then 역할 → 페르소나 단계는 사유 안내와 함께 건너뛰어지고 등급 → 모델
      설정은 정상 완료된다.
- [ ] **AC-9 (엣지 — 추천 밖 모델명)**: Given 사용자가 추천 초안에 없는 모델 식별자를
      입력하면, When 확정하면, Then 그 값이 그대로 저장되고 "가용성은 검증하지 않는다"는
      고지가 표시된다.

## Open questions

모두 plan에서 해소됨(→ plan Open questions 확정 D-1~D-6).

- ~~바인딩 설정의 **파일 포맷과 정확한 경로·파일명**(런타임별 분리 방식 포함).~~
  → **plan D-1**: `<데이터 폴더>/_bindings/<runtime-id>.json`(런타임당 1파일, JSON).
- ~~**온보딩 진입점의 이름과 형태**(스킬? catalog 편입? built-in 충돌).~~
  → **plan D-2**: packaged 스킬 `localmind-binding`(explicit·mutating), `localmind-` 접두로 충돌 회피.
- ~~**등급 ↔ 역할 모델의 관계**(역할 → 등급 → 모델 vs 역할별 직접 지정).~~
  → **plan D-3**: 역할은 등급을 경유(`roles.<역할> = {persona, tier}` → `tiers[tier].model`), 직접 지정 없음.
- ~~**바인딩 부재 시 기본 정책의 강도**(엄격 중단 vs "이번만" 허용).~~
  → **plan D-4**: 안내 후 중단이 기본 + 사용자 명시 시 "이번만 진행"(저장 없음·임시 명시).
- ~~**재설정 UX 세부**(전체 재인터뷰 vs 항목 선택 수정).~~
  → **plan D-6**: 항목 선택 수정이 기본(나머지 보존), 전체 재인터뷰는 요청 시.
- ~~**런타임 자기 식별 방법**.~~
  → **plan D-5**: 세션 자기보고로 runtime-id 도출·사용자 확정, 소비 시 정확 일치 파일만 읽음.
