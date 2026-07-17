# Spec: 버전/릴리스 프로세스 규약 (CalVer)

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `goal-impl` 규약 5. -->

## Terminology

- **CalVer `YYYY.MM.MICRO`**: localmind의 버전 형식. `YYYY.MM` = 릴리스(PR 머지) 시점의
  연·월(월은 2자리, 예 `07`), `MICRO` = 그 달의 릴리스 순번(첫 릴리스 = `0`, 이후 +1).
  예: `2026.07.0`, `2026.07.1`, `2026.08.0`.
- **변경 내용 서술(release notes 재료)**: CHANGELOG 항목 초안과 PR 설명 — 무엇이 왜
  바뀌었는지의 산문. 버전 숫자를 포함하지 않는다.
- **버전 확정(version stamping)**: package.json 버전 bump + CHANGELOG 버전 헤더 기입 +
  git tag 생성. 셋은 항상 같은 버전 문자열을 쓴다.
- **릴리스**: PR 머지 → git tag(`v` 접두 없이 CalVer 그대로) → GitHub release 생성의 연쇄.

## Scope

만드는 것: ① CalVer 형식 규약, ② 내용/버전 관심사 분리 규칙, ③ AGENTS.md 버전/릴리스 절
신설(규약7의 연장), ④ goal-ready 스킬의 "버전 미정" 명시, ⑤ 릴리스 절차(머지→tag→release)
성문화, ⑥ gh 계정·머지 검증 안전장치, ⑦ 기존 문서(CHANGELOG 상단 주석)의 모순 문구 정정.
산출물은 governance 산문 규약이 중심이며, 검증은 **정적(규약 문구 존재 — specs/052의
skill-contract.test.ts 패턴 계승) + 도그푸드(다음 릴리스가 규약대로)** 2층으로 한다.

## Context

- 첫 CalVer 릴리스 `2026.07.0`(2026-07-17)이 규약 없이 도그푸드로 수행됐다. package.json은
  이미 `2026.07.0`, CHANGELOG에 해당 릴리스 항목 존재.
- AGENTS.md 규약7 현행: "self-review clean이면 feature 브랜치 커밋·push + **PR 생성까지가
  완료**"(specs/051 D-6). PR 머지 이후(tag·release·버전)는 공백.
- **드리프트(이번에 정정)**: CHANGELOG 상단 주석이 "버전은 릴리스 시점이 아니라 **문서
  작성(goal-ready) 시점** 기준으로 부여한다"고 서술 — 확정 결정(버전은 머지 직전 확정,
  월 = 릴리스 시점 월)과 정면 모순. 릴리스 당일 즉석 서술의 잔재다.
- 도그푸드에서 발견된 함정 2건: (a) gh CLI PR 작업(머지 등)은 collaborator 권한 한계로
  저장소 소유자 계정 전환이 필요했다. (b) "머지했다"는 판단은 `gh pr view`의 state와 main
  HEAD 변화로 검증해야 한다 — 미머지 상태에서 태그를 만들면 변경이 반영되지 않은 main
  커밋에 빈 태그가 붙는다.
- 이 spec의 tasks는 specs/052의 병렬 규약(`depends-on`·`files` 선언)을 따른다.

## Functional Requirements
<!-- 각 FR 끝에 (goal의 어느 목표/제약을 지지하는지) 표기. 연결 없으면 scope creep. -->

- [ ] **FR-1 (CalVer 형식 규약)**: 버전 형식을 `YYYY.MM.MICRO`로 성문화한다 — `YYYY.MM` =
      릴리스(PR 머지) 시점의 연·월, `MICRO` = 그 달의 릴리스 순번(첫 릴리스 = 0, 같은 달
      추가 릴리스마다 +1). git tag는 `v` 접두 없이 버전 문자열 그대로 쓴다. SemVer 의미
      (호환성 시그널)는 부여하지 않는다.
      → goal: Objective / Non-goal(SemVer 복귀 없음)
- [ ] **FR-2 (관심사 분리 — 내용은 작업 중, 버전은 머지 직전)**: (a) 변경 내용 서술
      (CHANGELOG 항목 초안·PR 설명)은 **작업 중 작성해 PR에 포함**한다 — 버전 숫자 없이.
      (b) 버전 숫자 확정(package.json bump + CHANGELOG 버전 헤더 + git tag)은 **PR 머지
      직전**에 수행한다. 작업이 달을 넘겨도 버전은 항상 실제 릴리스 시점의 연·월을 따른다.
      → goal: Objective(관심사 분리) / Problem 1(버전 시점 부정확)
- [ ] **FR-3 (AGENTS.md 버전/릴리스 절 신설)**: AGENTS.md에 버전/릴리스 절을 신설해 FR-1·2·
      5·6의 규칙을 담는다. 규약7("PR 생성까지가 완료")을 약화·재서술하지 않고 그 **이후
      단계**(머지 → tag → release)의 연장으로 서술한다. 스킬 정본에는 이중 서술 없이 참조만
      둔다(051 SSoT 원칙).
      → goal: Expected outcome / Constraints(규약7 정합·이중 서술 금지)
- [ ] **FR-4 (goal-ready "버전 미정" 편입)**: goal-ready 스킬 정본에 "버전은 여기서 정하지
      않는다 — 버전/릴리스 규약(AGENTS.md) 참조. 작업 시작 시점에는 변경 내용 서술만
      누적한다"를 명시한다.
      → goal: Objective(관심사 분리) / Constraints(스킬 정합)
- [ ] **FR-5 (릴리스 절차 성문화)**: 릴리스 절차를 순서로 성문화한다 — ① main 직접 push
      금지(규약7 계승), ② PR 머지, ③ 머지된 main에서 버전 확정 커밋이 포함됐는지 확인,
      ④ `git tag <CalVer>`(v 접두 없음) + push, ⑤ `gh release create`(CHANGELOG 해당 항목을
      release notes로). 비개발자도 따라 할 수 있게 각 단계에 무엇을 확인해야 하는지를 쓴다.
      → goal: Expected outcome(재질문 없는 릴리스) / Problem 2(절차 암묵)
- [ ] **FR-6 (gh 계정·머지 검증 안전장치)**: 규약에 안전장치 2건을 편입한다 — (a) gh CLI로
      PR 머지 등 쓰기 작업을 할 때는 해당 권한이 있는 계정인지 먼저 확인한다(권한 부족 시
      계정 전환 안내). (b) "머지 완료" 판정은 보고 문장이 아니라 `gh pr view`의 state(MERGED)
      **와** main HEAD 변화(머지 전 대비 이동)로 검증한다 — main이 그대로면 미머지이며,
      이 상태에서 tag·release를 진행하지 않는다(빈 main 태그 방지).
      → goal: Problem 3(도그푸드 함정) / Expected outcome(빈 태그 차단)
- [ ] **FR-7 (기존 문서 정합 — 모순 문구 정정)**: CHANGELOG 상단의 버전 체계 주석("문서
      작성(goal-ready) 시점 기준")을 새 규약(릴리스 시점 기준·머지 직전 확정)과 일치하게
      정정한다. 저장소 내 버전 확정 시점 서술은 AGENTS.md 신설 절을 단일 정본으로 하고
      나머지는 참조·요약만 둔다.
      → goal: Success metrics(모순 문구 0건) / Constraints(이중 서술 금지)

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. 검증 2층: 정적(규약 문구 존재 테스트) + 도그푸드. -->

- [ ] **AC-1 (정적 — CalVer 형식 규약 존재)**: Given 이 spec 구현이 완료된 저장소, When
      정적 계약 테스트가 AGENTS.md를 읽으면, Then 버전/릴리스 절에 `YYYY.MM.MICRO` 형식·
      "릴리스(PR 머지) 시점" 기준·MICRO 순번(첫 릴리스 0)·`v` 접두 없음이 모두 검출된다.
- [ ] **AC-2 (정적 — 관심사 분리 규칙 존재)**: Given 같은 저장소, When 테스트가 AGENTS.md를
      읽으면, Then "변경 내용 서술은 작업 중 PR에 포함"과 "버전 숫자 확정은 PR 머지 직전"
      두 규칙이 모두 검출된다.
- [ ] **AC-3 (정적 — goal-ready 버전 미정 명시)**: Given goal-ready 스킬 정본, When 테스트가
      본문을 읽으면, Then "버전은 여기서 정하지 않는다"류의 명시와 릴리스 규약으로의 참조가
      검출된다.
- [ ] **AC-4 (정적 — 릴리스 절차·안전장치 존재)**: Given AGENTS.md 신설 절, When 테스트가
      절차를 검사하면, Then 머지→버전 확정 확인→tag→release 순서, gh 계정 확인, 그리고
      "머지 검증 = PR state + main HEAD 변화" 안전장치가 모두 검출된다.
- [ ] **AC-5 (정적 — 모순 문구 0건)**: Given 추적 문서(**범위: `CHANGELOG.md`·`AGENTS.md`·
      `docs/`·`templates/` — `specs/`는 역사 인용이라 제외, plan Phase 4/tasks I-4**), When 버전
      확정 시점 서술을 검색하면, Then "문서 작성 시점 기준으로 버전을 부여한다"류의 구 규약
      서술이 0건이다(CHANGELOG 상단 주석 정정 포함).
- [ ] **AC-6 (유저 시나리오 — 릴리스 수행, 도그푸드)**: Given 머지 대기 중인 feature PR과
      이 규약, When 다음 릴리스를 규약 문서만 보고 수행하면, Then 추가 질문 없이
      머지→tag→release가 완료되고 버전의 연·월이 머지 시점과 일치하며 MICRO가 그 달 직전
      릴리스 +1(그 달 첫 릴리스면 0)이다.
- [ ] **AC-7 (엣지 — 달을 넘긴 작업)**: Given 어느 달에 시작해 다음 달에 머지되는 작업,
      When 규약대로 버전을 확정하면, Then 버전의 `YYYY.MM`은 시작 월이 아니라 **머지 시점의
      월**이고, 작업 중 산출물(goal/spec/PR 설명·CHANGELOG 항목 초안)에는 버전 숫자가
      존재하지 않는다.
- [ ] **AC-8 (엣지 — 미머지 상태 태그 시도 차단)**: Given PR이 실제로는 머지되지 않은 상태
      (main HEAD 미변화), When 규약대로 머지 검증 단계를 수행하면, Then 미머지가 감지되어
      tag·release 진행이 중단되고 그 사유가 보고된다 — 변경 없는 main에 태그가 생성되지
      않는다.
- [ ] **AC-9 (엣지 — 같은 달 두 번째 릴리스)**: Given 그 달에 이미 릴리스가 1건 존재
      (예 `2026.07.0`), When 같은 달에 추가 릴리스를 확정하면, Then MICRO만 +1 된 버전
      (예 `2026.07.1`)이 부여되고 기존 태그와 충돌하지 않는다.

## Open questions
<!-- 미결정 사항. 숨기지 말 것. plan/구현 전에 해소하거나 명시 진행. -->

> 3건 모두 plan D-1~D-3에서 확정(사용자 확인 2026-07-17) — 취소선 = 결정적 해결 신호.

- ~~**OQ-1 (MICRO 산정의 결정적 기준)**: git tag vs CHANGELOG 중 정본?~~
  → **해소(plan D-1)**: `git fetch --tags` 후 `git tag -l 'YYYY.MM.*' --sort=-v:refname` 최상단 수치+1(없으면 0). CHANGELOG와 어긋나면 태그 우선.
- ~~**OQ-2 (같은 날 복수 릴리스·hotfix)**: 동일 취급인가 별도 표기인가?~~
  → **해소(plan D-2)**: 구분 없이 동일 취급(MICRO+1) — 채널·접미 없음.
- ~~**OQ-3 (버전 확정 커밋의 경로)**: feature PR 마지막 vs 별도 릴리스 PR?~~
  → **해소(plan D-3)**: 머지 대상 PR의 마지막 chore(release) 커밋. 묶음 전부 머지 후엔 경량 릴리스 PR. 월 경계 넘으면 머지 전 re-stamp.
