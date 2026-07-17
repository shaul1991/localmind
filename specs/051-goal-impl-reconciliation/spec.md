# Spec: SDD 구현 스킬 정합 — goal-impl 통일

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md 구현 워크플로 규약 5. -->

## Terminology

- **goal-impl**: 이 spec이 확립하는 SDD 구현 워크플로의 단일 논리 ID이자 배포 스킬 이름.
- **sdd-implement**: 044가 신설한 기존 논리 ID — 이 spec에서 은퇴한다.
- **base 본문**: 사용자 데이터 폴더에 배포돼 있던 goal-impl 122줄 구조(끊김 방어·TDD/RED·
  중단 규율·DoD·보고) — 병합의 뼈대.
- **활성화 게이트(execution grant)**: 044 sdd-implement의 도입부 — 런타임 provenance 보증 +
  정확히 3자리 인자, 또는 provenance 부재 시 일회용 확인 문구(challenge)에 대한 바로 다음
  턴의 정확 일치 응답이 있어야만 side effect를 내는 판정.
- **중립성 스캔**: packaged 스킬 본문에서 provider명·구체 모델 ID·런타임 전용 도구명·런타임
  placeholder 등 금지 토큰을 기계 검출하는 검증(044 도입, 코드에 금지 토큰 목록 존재).
- **바인딩**: 실행 등급→모델, 역할→페르소나 매핑의 설치별 로컬 설정(specs/050, 머지 완료).

## Scope

① `sdd-implement` → `goal-impl` 개명(전 활성 참조 + catalog + AGENTS.md 규약 절),
② `sdd-implement` 논리 ID 은퇴(배포 표면 정리 포함), ③ goal-impl 정본 본문 확정 —
base 본문 + 044 활성화 게이트 병합 + 완료 규칙 AGENTS.md 위임 + 완전 중립화(050 바인딩
참조), ④ packaged 스킬로 지원 3개 런타임 타깃 배포. fan-out 병렬 규약은 052의 몫(goal
Non-goals).

## Context

- 코드 템플릿에는 sdd-implement(69줄, 중립, 게이트+위임)가, 사용자 데이터 폴더에는
  goal-impl(122줄, 특화, 풍부한 오케스트레이션)이 있다 — 이름·내용 이중 정본 상태.
- catalog는 `sdd-implement`를 `activation: explicit / sideEffects: mutating`으로 등록하고
  있다. AGENTS.md는 "`sdd-implement {NNN}` 처리 방법" 절을 완료 규칙 SSoT로 두고 있다.
- 중립성 스캔의 금지 토큰(provider·모델·런타임 도구명) 때문에 현행 goal-impl 122줄 본문은
  그대로 packaged 배포가 불가하다 — 051 중립화가 배포의 전제.
- 050 바인딩이 main에 머지되어 등급·역할 해석 계약이 존재한다. 050 spec은 "워크플로 스킬
  본문의 바인딩 참조 치환은 후속 slice(051)"로 명시했다.
- 배포·정리(retirement)는 기존 reconcile primitive(managed 판별·백업·retired rename)를
  사용한다 — 새 기제를 만들지 않는다.

## Functional Requirements

- [ ] **FR-1 (개명)**: SDD 구현 워크플로의 논리 ID·스킬 이름·규약 호칭을 `sdd-implement`에서
      `goal-impl`로 바꾼다 — 코드·테스트·catalog·루트 AGENTS.md·templates의 AGENTS.md·docs
      등 활성 표면의 전 참조. 역사 기록(과거 specs 문서·개정 이력 서술)은 개명 대상이 아니다.
      → goal: Objective / Constraint(개명 완전성)
- [ ] **FR-2 (sdd-implement 은퇴)**: `sdd-implement` ID를 catalog와 배포 표면에서 제거하고,
      배포된 스킬 디렉토리는 044가 확립한 reconcile retirement 기제로 정리한다. 은퇴한
      이름이 활성 표면에 재유입되지 않도록 기계 검증을 남긴다.
      → goal: Objective / Risks(개명 누락)
- [ ] **FR-3 (본문 병합 — base + 활성화 게이트)**: goal-impl 정본 본문은 base 본문(끊김
      방어·입력 확정·TDD/RED·중단 규율·DoD 순서·보고)을 유지하면서, 044의 활성화 게이트를
      병합한다 — 실행 권한 없이는 side effect 0, provenance/3자리/새-확인 challenge 판정,
      지침 수준(instruction-level) 가드임의 정직한 표기 포함.
      → goal: Objective / Expected outcome(한 본문에 두 강점)
- [ ] **FR-4 (완료 규칙 AGENTS.md 위임)**: goal-impl 본문은 commit/push/CI·self-review 완료
      규칙을 자체 서술하지 않고 저장소 AGENTS.md를 최종 정본으로 참조한다. 본문은
      오케스트레이션 지침(끊김 방어·TDD·DoD 흐름)에 집중한다. 스킬이 AGENTS.md보다 약하거나
      강한 완료 규칙을 따로 두지 않는다.
      → goal: Constraint(AGENTS.md = SSoT)
- [ ] **FR-5 (완전 중립화 — 050 바인딩 참조)**: 본문의 하드코딩 — 페르소나 고유명(architect·
      worker·critic 등), 구체 모델명, provider 토큰, 특정 벤더 문서 URL, 내장 명령과의
      런타임 특화 구분 서술 — 을 "실행 등급·역할" 서술로 대체하고, 구체 해석(모델·페르소나)은
      050 바인딩이 담당함을 명시한다. 바인딩 미설정 시 050 소비 규약(안내/fallback)을 따른다.
      결과 본문은 중립성 스캔을 결함 0으로 통과한다.
      → goal: Objective / Constraint(중립성 스캔·050 바인딩 참조)
- [ ] **FR-6 (배포본 대체)**: 사용자 데이터 폴더의 기존 goal-impl(특화 122줄)을 신 코드
      템플릿 정본(중립)으로 대체한다. 대체는 managed 판별·백업을 거치는 기존 배포 기제로
      수행하고, 사용자가 수정한 unmanaged 사본은 덮어쓰지 않고 보고한다.
      → goal: Expected outcome / Risks(배포본 대체로 사용자 혼란)
- [ ] **FR-7 (packaged 3타깃 배포)**: 중립화된 goal-impl을 packaged 스킬로 지원 3개 런타임
      타깃 전부에 배포한다 — 044의 provider-neutral 배포 목표를 이 워크플로에 대해 완성한다.
      → goal: Objective / Success metrics(3타깃 배포)

## Acceptance Criteria

정적 검증(테스트·스캔)과 도그푸드(실배포 관찰)의 2층 구조(050 계승).

### 정적

- [ ] **AC-1 (개명 완전성)**: Given 개명 완료된 저장소, When 활성 표면(코드·테스트·catalog·
      AGENTS.md·templates·docs)에서 `sdd-implement`를 검색하면, Then 매치 0건이다 — 역사
      기록(과거 specs 폴더·개정 이력 서술)만 예외로 남는다.
- [ ] **AC-2 (중립성 스캔)**: Given packaged goal-impl 스킬 본문, When 중립성 스캔을
      실행하면, Then 금지 토큰 결함 0으로 통과한다.
- [ ] **AC-3 (활성화 게이트)**: Given 런타임 provenance 보증 + 정확히 3자리 인자, When
      goal-impl이 호출되면, Then 실행 권한으로 판정된다. Given provenance 부재 또는 3자리가
      아닌 인자, When 호출되면, Then side effect 없이 challenge만 발화하고 멈춘다.
- [ ] **AC-4 (AGENTS.md 위임 정합)**: Given goal-impl 본문과 AGENTS.md, When 완료 규칙
      서술을 비교하면, Then 본문에는 commit/push/CI·self-review 완료 규칙의 자체 정의가
      없고 AGENTS.md 참조만 있으며, AGENTS.md 규약 절 제목·호출 문법이 goal-impl로 갱신돼
      있다.
- [ ] **AC-5 (본문 강점 보존)**: Given 신 goal-impl 본문, When base 본문의 핵심 절(끊김
      방어, tasks 재사용·재분해 금지, TDD/RED 확인, 중단 규율, DoD 순서, 보고)과 대조하면,
      Then 각 절의 규율이 중립 표현으로 보존돼 있다(누락 없음).

### 정적 — 엣지

- [ ] **AC-6 (엣지 — 은퇴 ID 재유입 차단)**: Given 은퇴 완료 상태, When 활성 표면에
      `sdd-implement` 참조가 다시 추가되면, Then 자동 테스트가 실패한다.
- [ ] **AC-7 (엣지 — 금지 토큰 재유입 차단)**: Given goal-impl packaged 본문, When 금지
      토큰(provider명·구체 모델명·런타임 도구명)이 편집으로 재유입되면, Then 스캔 테스트가
      실패한다.
- [ ] **AC-8 (엣지 — 기존 테스트 회귀 0)**: Given 개명·병합·은퇴가 완료된 저장소, When
      전체 테스트 스위트를 실행하면, Then 기존 테스트 전부 green이다(개명으로 인한 실패 0).

### 도그푸드

- [ ] **AC-9 (3타깃 배포 관찰)**: Given 신 정본, When 배포를 실행하면, Then 지원 3개
      런타임 타깃 각각에 goal-impl이 배포되고 sdd-implement 배포물은 retirement 기제로
      제거된 것이 관찰된다.
- [ ] **AC-10 (바인딩 참조 동작)**: Given 바인딩이 설정된 환경과 미설정 환경, When
      goal-impl이 등급·역할 해석 지점에 도달하면, Then 설정 환경에서는 바인딩 해석을
      따르고 미설정 환경에서는 050 소비 규약대로 안내/fallback을 표명하는 것이 관찰된다.
- [ ] **AC-11 (엣지 — 사용자 fork 보존)**: Given 사용자가 데이터 폴더의 goal-impl을 직접
      수정해 unmanaged 상태인 환경, When 배포가 실행되면, Then 해당 사본은 덮어쓰이지 않고
      그 사실이 보고된다.

## Open questions

- **OQ-1 (§0 내장 명령 구분의 중립화 방식)**: base 본문 §0(내장 `/goal`과의 구분 —
  "이 절을 지우지 마라" 명시)은 특정 런타임 문서 URL·내장 명령 서술이라 스캔을 통과하지
  못한다. "런타임 내장 기능과의 일반화된 구분 서술"로 재작성할지, packaged 본문에서
  삭제하고 런타임별 주의는 다른 채널(governance/바인딩 문서)에 둘지 미결.
- **OQ-2 (은퇴 기제 상세)**: catalog에서 `sdd-implement` 항목을 제거하면 기존 reconcile이
  배포본을 자동 retire하는지, 아니면 명시적 은퇴 목록/마이그레이션 단계가 필요한지 —
  plan에서 044 retirement 경로를 실측해 확정한다.
- **OQ-3 (AGENTS.md 절 개명 범위)**: AGENTS.md의 "`sdd-implement {NNN}` 처리 방법" 절
  제목·논리 command ID 서술 외에, 044 결정을 서술한 문장("044가 sdd-implement를 신설")류를
  역사 기록으로 보존할지 함께 갱신할지의 경계.
- **OQ-4 (052 문서 정합)**: specs/052(SDD 병렬 규약) 문서가 sdd-implement 이름을 전제로
  쓰였다면, 그 갱신을 051이 개명의 일부로 수행하는지 052 착수 시점에 맡기는지 미결.
- **OQ-5 (배포본 대체 안내)**: FR-6 대체 시 기존 사용자에게 변경 사실(특화 본문 → 중립
  본문, 백업 위치)을 어떤 표면(배포 로그·보고 문구)으로 알릴지 세부 미결.
