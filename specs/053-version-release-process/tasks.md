# Tasks: 버전/릴리스 프로세스 규약 (CalVer)

> 모델 이력 — 작성: Fable 5 · 검토: Fable 5(critic) · 구현: Opus 4.8(fan-out worker 위임)

<!-- 근거 정본은 plan(F-1~8·D-1~3·영향 모듈·테스트 전략) — 재조사 금지, 백포인터로 인용만.
     상위: [goal](goal.md) · [spec](spec.md) · [plan](plan.md). 형식은 specs/052 tasks 규약
     (phase 헤더 직하 `depends-on`·`files` 선언)을 따른다. -->

## 불변식 (I-n) — 위반 시 배리어 불통과

- **I-1**: 규약7("PR 생성까지가 완료"·main 직접 push 금지·CI 감시) 문장을 **재서술·약화 금지**
  (→ plan F-1, spec FR-3). 신설 절은 "규약7의 PR 생성 이후"라는 **접속으로만** 연결한다 —
  기존 문장을 복사·바꿔쓰기하면 결함.
- **I-2**: goal-ready·CHANGELOG에 규칙 **본문 이중 서술 금지**(051 SSoT — → plan 리스크
  "이중 서술 슬립"). 두 파일은 AGENTS.md 신설 절로의 **참조·요약만** 담는다.
- **I-3**: goal-ready 편집분은 packaged **중립성 스캔 clean**(→ plan F-4) — provider명·구체
  모델 ID·런타임 전용 도구명 0건. `AGENTS.md` 파일명 언급은 §2 선례로 허용.
- **I-4**: AC-5 구 문구 부재 스캔은 **CHANGELOG.md·AGENTS.md·`docs/`·`templates/`로 한정,
  `specs/` 제외**(→ plan Phase 4) — specs/053 자신이 드리프트를 역사로 인용하므로 전역 검사는
  자기 오탐. 제외 사유를 테스트 주석에 고정한다.
- **I-5**: D-1(MICRO=git tag 정본)·D-2(hotfix 동일 취급)·D-3(버전 확정 커밋 경로)·월 경계
  재확정 규칙은 **AGENTS.md 신설 절 한 곳에만** 존재한다(→ plan D-1~3·영향 모듈). 다른
  파일에 규칙 본문이 나타나면 I-2 위반.
- **I-6**: 각 배리어 조건 = 전체 `npm test` green + `npm run build` clean — **기존 핀 케이스
  포함 전수 green**(`workflow-docs.test.ts`·`skill-contract.test.ts`가 AGENTS.md·goal-ready
  문구를 이미 핀 — → plan F-5·테스트 전략 "회귀"). 검증 주체는 **메인**(배리어에서), 진행
  부기(체크박스)도 메인이 배리어에서 갱신한다.

## 예상 fan-out 레이어 (→ plan "단계" 서두 — 이 구현 자체를 fan-out으로 수행 가능)

- **L1 = Phase 1 ∥ Phase 2 ∥ Phase 3** — 파일 disjoint, 내용 의존은 plan의 D-1~3·절 제목
  고정(`## 버전·릴리스 — 규약7 이후 (CalVer)`)으로 해소됨.
- **L2 = Phase 4** — L1 배리어 후(규약 문구 확정이 assert 전제).
- **L3 = Phase 5** — 전부 대기, 직렬 완주.
- Phase 0은 착수 시 1회(레이어 밖 선행 게이트).

⚠️ **착수 선행 조건**: plan D-1~3은 사용자 미확인 **권고**다 — 메인이 사용자 확인을 받은 뒤
Phase 1(및 L1 전체)에 착수한다(→ plan "Open questions 해소 매핑").

## Phase 0 — Live-Verify 게이트 (standard, 착수 시 1회)
> depends-on: 없음 · files: 없음(확인만)

- [x] **T0.1** F-7의 세션 보고 사실 재확인(→ plan Phase 0·가정 1): `gh release view 2026.07.0`
      (release 실존) · `git tag -l '2026.07.*'`(태그 실존·`v` 접두 없음 — F-6 대조) · 현재
      gh 인증 계정 1줄 확인. 결과를 self-review 보고에 1줄 명시. 실패(예: release 부재) 시
      규약 문안의 해당 실증 서술을 수정하고 사용자에게 보고.

## Phase 1 — AGENTS.md 버전·릴리스 절 신설 (critical-reasoning)
> depends-on: Phase 0 · files: `AGENTS.md`

<!-- Phase 0 depends-on: 신설 절이 F-7 릴리스 실증(release 실존)을 서술하므로 Phase 0 확인
     결과에 의존(critic 경미-4). Phase 2·3(goal-ready·CHANGELOG)은 릴리스 실증과 무관해 depends-on 없음. -->


규약 문안은 이후 모든 릴리스의 정본 — 파장 큼(→ plan Phase 1 등급).

- [x] **T1.1** F-2 위치(규약7 끝과 "구현 규율" 사이)에 절 신설, 제목은 plan 고정값
      `## 버전·릴리스 — 규약7 이후 (CalVer)`(→ plan DDD 경계). 내용은 영향 모듈 표대로:
      - FR-1 형식: `YYYY.MM.MICRO` · "릴리스(PR 머지) 시점"의 연·월 · 첫 릴리스 MICRO=0 ·
        `v` 접두 없음 · SemVer 의미 없음 — AC-1 문안.
      - FR-2 관심사 분리: 변경 내용 서술은 작업 중 PR에(버전 숫자 없이) · 버전 숫자 확정은
        PR 머지 직전 — AC-2 문안.
      - FR-5 절차 5단계(각 단계 확인 항목, 비개발자 가독): ① main 직접 push 금지 —
        규약7을 **참조만**(재서술·복제 금지, I-1 — 예: "규약7대로 머지는 사람이 PR로") →
        ② PR 머지 → ③ 머지된 main에 버전 확정 커밋 포함 확인 → ④ `git tag <CalVer>` +
        push → ⑤ `gh release create`(CHANGELOG 항목을 notes로) — AC-4 문안.
      - FR-6 안전장치 2건(→ plan F-8): (a) gh 쓰기 작업 전 권한 계정 확인, (b) 머지 판정 =
        `gh pr view` state(MERGED) **AND** main HEAD 이동 — 미머지면 tag·release 중단 — AC-4 문안.
      - D-1(MICRO 산정: **먼저 `git fetch --tags`**로 원격 태그 동기화 → `git tag -l 'YYYY.MM.*'
        --sort=-v:refname`의 최상단 **수치** +1(사전순 아님 — `2026.07.10` > `2026.07.9`),
        없으면 0, CHANGELOG와 어긋나면 태그 우선) · D-2(같은 날·hotfix 동일 취급 MICRO+1) · D-3(버전 확정 커밋 = 머지 대상 PR의
        마지막 chore(release) 커밋, 묶음 전부 머지 후엔 경량 릴리스 PR) · 월 경계 재확정
        (stamp 후 월이 바뀌면 머지 전 re-stamp — AC-7 문안). 전부 이 절 한 곳에(I-5).
- [x] **T1.2** 규약7 비재서술 자기 점검(I-1, FR-3): 신설 절에 규약7 문장의 복제·변형이
      없는지 확인 — diff가 규약7 원문(56-66행대)을 건드리지 않아야 한다.

## Phase 2 — goal-ready "버전 미정" 편입 (standard)
> depends-on: 없음 · files: `templates/skills/goal-ready/SKILL.md`

- [x] **T2.1** §6(네 문서 작성 — → plan F-4 지점)에 1~2줄 편입(FR-4): "버전은 여기서 정하지
      않는다 — 저장소 릴리스 규약(AGENTS.md 버전·릴리스 절) 참조. 작업 시작 시점에는 변경
      내용 서술만 누적한다." 규칙 본문 없이 참조만(I-2). 편집 어휘는 I-3 준수 — 편집 후
      중립성 스캔 clean 확인. `make skills-deploy` 전파는 Phase 5에서 일괄. — AC-3 문안.

## Phase 3 — CHANGELOG 모순 주석 정정 (standard)
> depends-on: 없음 · files: `CHANGELOG.md`

- [x] **T3.1** 5행 blockquote(→ plan F-3)를 교체(FR-7): "문서 작성(goal-ready) 시점 기준"
      구 서술 삭제 → "버전은 **릴리스(PR 머지) 시점** 기준 — 확정 규칙은 AGENTS.md
      버전·릴리스 절이 정본" 요약+참조만(I-2). — AC-5의 "새 문구 존재 + 구 문구 부재" 근거.

## L1 배리어 (메인 수행)

- [x] **B-L1** Phase 1∥2∥3 완료 후 메인이 전체 `npm test` green + `npm run build` clean 확인
      (I-6 — 기존 AGENTS.md·goal-ready 핀 케이스 포함 전수). 통과해야 L2 해금.

## Phase 4 — 정적 계약 테스트 (standard)
> depends-on: Phase 1, Phase 2, Phase 3 · files: `src/agents/workflow-docs.test.ts`

- [x] **T4.1** `workflow-docs.test.ts`에 describe 블록 추가(→ plan F-5② 배치 근거 — 이 파일이
      AGENTS.md 규약7 핀 선례·`read()` 헬퍼 보유. assert 스타일은 F-5① `assert.match` 계승):
      - AC-1: AGENTS.md 신설 절에 `YYYY.MM.MICRO`·"릴리스(PR 머지) 시점"·첫 릴리스 0·
        `v` 접두 없음(+ D-1 MICRO 규칙 — AC-9 정적분) assert.
      - AC-2: "변경 내용 서술은 작업 중 PR에" · "버전 … 확정은 PR 머지 직전" assert.
      - AC-3: goal-ready 정본에 "버전은 여기서 정하지 않는다"류 + 릴리스 규약 참조 assert
        (+ packaged 중립성 스캔 clean — 기존 스캔 케이스로 커버되는지 확인, 미커버 시 추가).
      - AC-4: 머지→버전 확정 확인→tag→release 순서 · gh 계정 확인 · "PR state + main HEAD
        변화" 안전장치(+ 월 경계 재확정 — AC-7 정적분, 미머지 중단 — AC-8 정적분) assert.
      - AC-5: CHANGELOG 새 문구 존재 + 구 문구("문서 작성(goal-ready) 시점"류) 부재 —
        스캔 범위는 I-4 한정(specs/ 제외, 주석에 사유 명시).
      **사후 핀** — 규약 문구 확정 후 assert를 못 박는 TDD 변형(050 T2.6·052 Phase 4 동일)임을
      보고에 명시. **RED 기대**: Phase 1~3 편집 전 트리에서 이 케이스를 돌리면 실패해야
      정상(순서상 사후이므로 1회 관찰로 갈음 가능 — 예: 구 문구 부재 assert는 정정 전
      CHANGELOG에서 red).
      검증: `node --import tsx/esm --test src/agents/workflow-docs.test.ts` green →
      `npm test` 전체 green + `npm run build` clean.

## L2 배리어 (메인 수행)

- [x] **B-L2** Phase 4 완료 후 메인이 전체 `npm test` green + `npm run build` clean 확인(I-6).
      통과해야 L3 해금.

## Phase 5 — 배포·self-review·검증 표기 (worker 실행 · 최종 판정 격리 리뷰어 critical-reasoning)
> depends-on: Phase 0, Phase 1, Phase 2, Phase 3, Phase 4 · files: `specs/053-version-release-process/goal.md`, `specs/053-version-release-process/spec.md`, `specs/053-version-release-process/plan.md`, `specs/053-version-release-process/tasks.md`

- [x] **T5.1** `make skills-deploy`(goal-ready 정본 전파 — → plan Phase 5). 배포 성공이
      중립성 clean(I-3)의 이중 확인.
- [x] **T5.2** self-review(격리 리뷰어, 점검 5범위 — AGENTS.md 규약 5) clean까지 반복 —
      특히 규약7 비약화(I-1)·이중 서술 슬립(I-2·I-5)·F-7 미검증분(Phase 0 결과) 처리를 점검.
      기계적 수정은 모아서 1라운드 배칭.
- [x] **T5.3** spec OQ-1~3 취소선 + plan D-1~3 포인터(AGENTS.md OQ 해결 표기 규약) + 결정
      노트 적재(`tags: ["decision"]`)는 사용자 확정 시점 기준으로 메인과 부기 정합 확인.
- [x] **T5.4** 검증 표기: spec FR-1~7·AC-1~5 `[x]`+근거, plan 단계·테스트 전략 체크, goal
      Success metrics 표기. **AC-6~9 도그푸드는 후속 릴리스 관찰로 승계** — 체크하지 않고
      spec 검증 결과에 미발생·승계를 정직 명시(은폐 금지, → plan 테스트 전략).
- [x] **T5.5** 커밋(self-review 요약 포함)·push·PR 생성·CI 감시
      `gh run watch <run-id> --exit-status`(전체 sha 사용 — 규약7).

## AC 매핑 요약 (→ plan 테스트 전략 표가 정본)

| AC | 정적(Phase 4) | 도그푸드 |
|---|---|---|
| AC-1 | T4.1 (문안은 T1.1) | — |
| AC-2 | T4.1 (문안은 T1.1) | — |
| AC-3 | T4.1 (문안은 T2.1) | — |
| AC-4 | T4.1 (문안은 T1.1) | — |
| AC-5 | T4.1 (정정은 T3.1, 범위 I-4) | — |
| AC-6 | — | 다음 릴리스 관찰 — **후속 승계**, T5.4 명시 |
| AC-7 | (월 경계 문구 T4.1 AC-4분) | 해당 릴리스 발생 시 — 후속 승계 |
| AC-8 | (안전장치 문구 T4.1 AC-4분) | 의도 재현 아니면 미발생 가능 — 후속 승계 |
| AC-9 | (D-1 문구 T4.1 AC-1분) | 같은 달 2번째 릴리스 발생 시 — 후속 승계 |

## 검증 명령

- 배리어마다(메인): `npm test`(전체 green — 기존 핀 케이스 포함) + `npm run build`(clean) — I-6.
- Phase 4 단건: `node --import tsx/esm --test src/agents/workflow-docs.test.ts`.
- Phase 5: `make skills-deploy` 성공.

## DoD — 완료 정의

AC-1~5 정적 green(AC-6~9 도그푸드는 후속 릴리스 승계 — spec에 정직 명시) + 전체 `npm test`
green + `npm run build` clean + `make skills-deploy` 전파 완료 + self-review clean + goal/spec/plan
세 문서 검증 표기 완료 + 커밋·push·PR·CI green(규약7).
