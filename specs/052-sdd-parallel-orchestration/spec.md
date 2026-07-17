# Spec: SDD 병렬 오케스트레이션 규약

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `sdd-implement` 규약 5. -->

## Status

Draft. 이 문서는 구현 계약이며 아직 구현 또는 검증 완료를 표시하지 않는다.

## Terminology

- **SDD 구현 스킬(goal-impl)**: specs 문서(goal/spec/plan/tasks)를 구현으로 옮기는 워크플로
  스킬. 이름·정체는 선행 slice(051)에서 정합되므로 이 spec은 이름 무관하게 지칭한다.
- **문서 작성 스킬(goal-ready)**: 요구를 goal→spec→plan→tasks 문서로 만드는 워크플로 스킬.
- **노드(node)**: 병렬화 판정의 단위 — 구현 스킬에서는 plan/tasks의 phase 또는 task, 문서 작성
  스킬에서는 곁가지 작업 1건.
- **의존 DAG**: 각 노드의 `depends-on` 선언이 이루는 방향 비순환 그래프. 의존이 모두 완료된
  노드만 실행 가능하다.
- **files 선언**: 노드가 생성·수정하는 파일(경로) 목록의 사전 선언. 자동 감지가 아니라 tasks
  설계 시점의 선언이다(goal Non-goal).
- **파일 disjoint**: 두 노드의 files 선언 교집합이 빈 것. 병렬 spawn의 필요조건.
- **fan-out**: 의존 충족 + 파일 disjoint + 유의미한 크기 조건을 모두 만족하는 노드들을 메인이
  한 메시지에 동시 spawn하는 것.
- **배리어(barrier)**: 동시 spawn된 worker들이 모두 끝난 뒤 메인이 결과를 통합 검증(테스트·
  정합 확인·phase 커밋)하는 지점. 통과해야 다음 레이어가 해금된다.
- **곁가지(side-branch)**: 문서 작성 스킬에서 하드 체인(goal→spec→plan→tasks)의 진행을 막지
  않고 병렬로 수행 가능한 보조 작업 — 예: 사실수집(researcher), 디자인 정의(designer).
- **잔task**: 단독 worker로 위임하기에 유의미한 크기에 못 미치는 작은 task. worker 결과가 메인
  컨텍스트로 돌아오는 고정 비용 때문에 병렬화 대상에서 제외한다.

## Scope

이번 작업은 다음을 만든다: ① tasks 산출물의 병렬화 메타데이터(depends-on·files) 선언 규약,
② SDD 구현 스킬의 fan-out DAG 규칙(동시 spawn·배리어 검증·커밋·해금), ③ 문서 작성 스킬의
곁가지 병렬 규칙(크리틱 최종 배리어 포함), ④ 파일 충돌 정책(직렬 기본·worktree 옵션),
⑤ 과병렬 비용 가드. 산출물은 코드가 아니라 **governance 스킬 정본(산문 규약)과 tasks 메타데이터
규약의 개정**이다 — 검증은 정적 점검(규칙 존재)과 행동 도그푸드(규약대로 병렬이 실제 발생)의
2층으로 한다(specs/050의 지침 수준 검증 방식 계승).

## Context

- SDD 구현 스킬의 **repo 정본**(`templates/skills/sdd-implement/SKILL.md`)에는 "phase별 서브
  에이전트 위임" 절이 **아직 없다**(배포된 goal-impl 스킬에만 존재 — 051 정합 대상, plan F-2).
  따라서 052는 fan-out DAG §를 **신설**한다. tasks 설계 규약도 성문 정본 없이 de-facto `[P]`
  표기만 존재 → `depends-on`·`files` 선언 규약을 **신설 성문화**한다.
- 이 규약은 실증됐다: 2026-07-17 specs/050 구현에서 파일 disjoint한 두 phase(에이전트 바인딩
  소스 ∥ 백업 스크립트)를 실제로 병렬 실행했다. 052는 그 ad-hoc 관행의 규약 승격이다.
- **두 스킬의 병렬 체제가 다르다(핵심)**: goal-impl은 **공유 코드트리**라 병렬 worker가 같은
  파일을 덮어쓸 수 있어 파일 disjoint 판정·직렬/worktree가 필요하다. 반면 goal-ready는 각
  spec이 **자기 폴더(`specs/NNN/`)** 이고 저작 페르소나가 전부 **Read 전용(마크다운만 반환,
  파일 쓰기는 메인이 직렬화)** 이라 **동시 쓰기 충돌 자체가 없다** — 독립 슬라이스/spec 간
  goal-ready는 기본 병렬 안전이고, 한계는 파일이 아니라 **내용·결정 의존**뿐이다. 규약은 이
  차이를 명시해 goal-impl 체제(파일 충돌 정책)와 goal-ready 체제(내용/결정 의존)를 구분한다.
- 대상 스킬은 Agent Skills 표준(SKILL.md)으로 배포되며 중립성 스캔 체계가 있으나,
  goal-ready/goal-impl은 governance 스킬로 분류되어(역할·페르소나 이름은 사용 가능, 구체
  모델명·provider명은 스캔 금지) 044 중립화 대상과 별개로 알려져 있다 — 정확한 스캔 적용
  실태는 plan에서 확인한다(단정 금지).
- 스킬 정본 편집은 예고된 선행 slice 051(SDD 구현 스킬 이름·본문 정합) 이후가 자연스럽다
  (goal Constraints). 051 폴더는 이 spec 작성 시점에 아직 존재하지 않는다.

## Functional Requirements

- [ ] **FR-1 (tasks 병렬화 메타데이터 선언 규약)**: tasks 설계 규약을 확장해, 산출되는 tasks
      문서의 각 task/phase가 ① `depends-on`(선행 노드) ② `files`(생성·수정 파일)를 선언하게
      한다. 기존 `[P]` 표기의 "독립이라는 결론"을 "판정 가능한 근거(의존·파일)"로 대체·보강
      한다. 선언은 tasks 설계 시점의 명시이며 자동 감지하지 않는다. (정확한 표기 문법은 plan
      에서 확정 — Open questions 참조.)
      → goal: Objective / Constraints(산문+메타) / Non-goal(자동 감지 제외)
- [ ] **FR-2 (구현 스킬 fan-out DAG 규칙)**: SDD 구현 스킬 정본에 다음 규칙을 명문화한다 —
      메인은 tasks의 depends-on·files가 이루는 의존 DAG를 읽어, **의존이 모두 완료되고 서로
      파일 disjoint하며 각각 유의미한 크기인 노드들을 한 메시지에 동시 spawn**한다. 각
      배리어에서 메인이 worker 결과를 통합 검증(테스트·정합 확인)하고 phase 커밋한 뒤 다음
      레이어를 해금한다. worker끼리는 직접 통신하지 않고 메인이 유일한 조율자다.
      → goal: Objective / Expected outcome(벽시계 단축·충돌 차단)
- [ ] **FR-3 (문서 작성 스킬 곁가지·슬라이스 병렬 규칙)**: 문서 작성 스킬 정본에 다음을 명문화
      한다 — (a) **한 슬라이스 안**: 하드 체인(goal→spec→plan→tasks)은 직렬 유지하되 곁가지는
      병렬 허용(사실수집 ∥ goal/spec 초안, design.md ∥ plan, 독립 research 질문 N개 동시 위임),
      **크리틱은 항상 모든 산출물이 모인 마지막 배리어**. (b) **독립 슬라이스/spec 간**: 폴더
      disjoint + Read-only 저작이라 파일 충돌이 없으므로 **기본 병렬 안전** — 여러 goal-ready를
      동시에 돌릴 수 있고 한계는 내용·결정 의존뿐(Context의 체제 구분). goal-impl의 파일 충돌
      정책(FR-4)은 이 체제엔 대체로 적용되지 않음을 규약에 명시한다.
      → goal: Objective(양 스킬 적용) / Constraints(두 체제 구분) / Expected outcome
- [ ] **FR-4 (파일 충돌 정책 — 직렬 기본·worktree 옵션)**: 두 노드의 files 선언이 교차하면
      **직렬 실행이 기본**이다(의존이 없어도 순차). worktree 격리(각 worker에 저장소 복제본을
      주고 병합)는 큰 이득이 명확할 때만 **명시적으로 선택하는 옵션**으로 언급하며, 기본
      경로에서는 발동하지 않는다. (이 정책은 주로 공유 코드트리를 쓰는 goal-impl 체제에 적용 —
      FR-3(b).)
      → goal: Constraints(직렬화 기본) / Risks(파일 충돌) / Non-goal(worktree 표준화 제외)
- [ ] **FR-5 (과병렬 비용 가드)**: 병렬 spawn은 ① genuinely 독립(의존 없음) ② 파일 disjoint
      ③ 각 노드가 유의미한 크기 — 세 조건을 **모두** 만족할 때만 한다. 잔task 여러 개는
      병렬화하지 않고 직렬 처리하거나 하나의 worker로 묶는다. 병렬 여지가 없는 단순 슬라이스는
      기존 직렬 흐름 그대로 완주한다(규약이 병렬을 강제하지 않는다).
      → goal: Constraints(과병렬 금지) / Risks(과병렬 손해) / Expected outcome(단순한 작업은 단순하게)
- [ ] **FR-6 (오케스트레이션 위상 — hub-and-spoke)**: 병렬 실행의 위상을 규약에 명문화한다 —
      **메인 세션이 유일한 오케스트레이터(hub)**로 조율·배리어·통합 검증·커밋을 소유하고,
      서브에이전트는 **leaf 워커**(작업만 — 서로·하위와 통신하지 않음)다. 방법은 노드 크기로
      가른다: **무거운 작업은 서브에이전트 fan-out(A — 새 컨텍스트로 오프로드)**, **값싼 독립
      조회·검증은 메인이 도구를 직접 병렬(B)** — 잔task는 B 또는 단일 워커로 묶는다(FR-5).
      **중첩 위임(C — 서브에이전트가 하위 워커를 spawn)은 기본 금지이며, 사용자가 특정 사안에
      명시적으로 허용한 경우에만 1단계까지 가능**하다(기본 hub-and-spoke 보존 — 조율 권위 분산·
      중복 컨텍스트 방지). → goal: Objective / Constraints(과병렬 금지·양 스킬) / Expected outcome

## Acceptance Criteria

정적 — 규약이 존재하는가:

- [ ] **AC-1 (구현 스킬 규칙 명문화)**: Given 개정된 SDD 구현 스킬 정본에서, When fan-out
      규칙을 점검하면, Then "의존 충족 + 파일 disjoint + 유의미한 크기 → 한 메시지 동시
      spawn"과 "배리어에서 메인 통합 검증·phase 커밋 후 다음 레이어 해금"이 명문으로 존재한다.
- [ ] **AC-2 (tasks 메타 규약 명문화)**: Given 개정된 tasks 설계 규약에서, When 산출 형식을
      점검하면, Then 각 task/phase에 depends-on·files 선언을 요구하는 규칙이 존재하고, 규약
      개정 후 산출된 tasks 문서가 실제로 두 선언을 포함한다.
- [ ] **AC-3 (문서 작성 스킬 규칙 명문화)**: Given 개정된 문서 작성 스킬 정본에서, When 병렬
      규칙을 점검하면, Then 하드 체인 직렬 유지 + 곁가지 병렬 허용(사실수집∥초안, 디자인∥plan,
      독립 research N개) + "크리틱은 항상 마지막 배리어" + 슬라이스 간 병렬 안전(체제 구분)이
      명문으로 존재한다.
- [ ] **AC-9 (위상 명문화)**: Given 개정된 SDD 구현 스킬 정본에서, When 오케스트레이션 위상을
      점검하면, Then "메인 = 유일 오케스트레이터·서브에이전트 = leaf", "A(무거운 작업 fan-out)/
      B(값싼 조회 메인 직접)를 크기로 가름", "C(중첩 위임)는 사용자 명시 허용 시에만 1단계"가
      명문으로 존재한다.

행동 — 규약을 따르면 병렬이 실제로 일어나는가(도그푸드):

- [ ] **AC-4 (fan-out 실행)**: Given depends-on·files가 선언된 tasks에서 의존이 풀리고 파일
      disjoint하며 유의미한 크기인 노드가 2개 이상일 때, When SDD 구현 스킬을 실행하면, Then
      그 노드들이 한 메시지에 동시 spawn되고, 모두 완료된 배리어에서 메인이 통합 검증·커밋을
      수행한 뒤 다음 레이어가 진행된다.

엣지 케이스:

- [ ] **AC-5 (엣지 — 파일 겹침은 직렬)**: Given 두 노드의 files 선언에 공통 파일이 있을 때,
      When 두 노드의 의존이 모두 풀려 있어도, Then 두 노드는 동시 spawn되지 않고 직렬로
      실행된다(worktree 옵션은 명시적 선택 없이는 발동하지 않는다).
- [ ] **AC-6 (엣지 — 의존 미충족은 대기)**: Given depends-on에 선언된 선행 노드가 아직 배리어를
      통과하지 못했을 때, When fan-out 판정이 일어나면, Then 그 노드는 spawn되지 않고 선행
      배리어 통과 후에야 실행 대상이 된다.
- [ ] **AC-7 (엣지 — 단순 슬라이스는 직렬 그대로)**: Given 곁가지·병렬 가능 노드가 없는 단순한
      작업에서, When 두 스킬을 실행하면, Then 불필요한 병렬 spawn 없이 기존 직렬 흐름 그대로
      완주한다.
- [ ] **AC-8 (엣지 — 잔task 병렬화 금지)**: Given 유의미한 크기에 못 미치는 작은 task 여러 개가
      서로 독립·파일 disjoint일 때, When fan-out 판정이 일어나면, Then 각각 병렬 spawn하지 않고
      직렬 처리 또는 단일 worker로 묶어 수행한다.

## Open questions

- **메타데이터의 정확한 문법**: `depends-on`·`files`를 tasks 문서에 어떻게 적는가 — task 라인
  인라인 표기? phase 헤더 블록? YAML frontmatter? → plan에서 확정(기존 tasks 형식·`[P]`
  표기와의 호환 포함).
- **파일 disjoint 판정 방법**: 메인이 disjoint를 어떻게 판정하는가 — 선언된 files의 문자열
  교집합이 기본 후보이나, 디렉토리/글롭 선언·선언 누락 시의 보수적 기본값(겹침 간주?)을
  어떻게 두는가 → plan에서 확정.
- **worktree 격리 발동 임계**: "큰 이득이 명확할 때"의 판단 기준과 발동 절차(사용자 명시 전제
  여부)를 어디까지 규약에 적는가 → plan에서 확정(이번 범위는 옵션 언급까지가 기본).
- **선행 slice 051과의 순서 확정**: 051(SDD 구현 스킬 이름·본문 정합)이 아직 문서화되지 않았다
  — 052 구현 착수 시점에 051 완료를 전제할지, 051 부재 시 현행 스킬 정본에 바로 반영할지
  → plan에서 확정.
- **동시 spawn 상한**: 한 배리어 레이어에서 동시 spawn하는 worker 수에 상한을 둘 것인가
  (컨텍스트 회수 비용 관리) → plan에서 확정(과병렬 가드로 충분하면 상한 없음도 가능).
