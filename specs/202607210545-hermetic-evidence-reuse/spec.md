---
audience: both
---

# spec — P4: 라운드 간 hermetic evidence 조건부 승계

## FR (Functional Requirements)

각 FR은 goal Objective의 요소(조건부 승계 규약·판정 절차·불변 보존)를 지지한다.

### FR-1 — 규약 개정: "적극형 미도입" → 조건부 승계 허용 (AGENTS.md)

AGENTS.md "critic 캐싱" 절의 해당 불릿을 개정한다.

- **verdict 전량 재검증·승계 금지는 문구 그대로 유지**(전 불릿 불변).
- "round-to-round 무효화-스킵(적극형)은 도입하지 않는다" 불릿을 다음 의미로 개정: **일부 행만
  재검증하는 verification skip(verdict 스킵)은 여전히 금지** — 이것과 **evidence 실행 결과의
  승계는 별개**임을 개정 문구가 명시적으로 가른다(§3A "한해서만" carve-out과의 워딩 충돌 방지).
  **hermetic·고비용·의존 교집합 공집합**(3조건 전부)인 evidence **실행 결과의 승계**는 허용한다 — 출처 라운드 표기 의무·선언 누락 시 재실행 보수 기본·
  cross-session 금지 불변·base 통합 재평가(202607181125) 소관 불변을 함께 명시.
- 근거 spec 포인터(specs/202607210545) 부기.
- **스캐폴드 동반 개정(필수)**: `templates/sdd/AGENTS.md`(신규 프로젝트 복사용 user-facing
  스캐폴드)에도 같은 취지의 불릿이 존재한다 — 루트만 고치면 같은 repo 안에 상반된 거버넌스가
  남고 다운스트림이 낡은 금지 정책을 상속하며, **어떤 기존 테스트도 이 드리프트를 잡지 않는다**
  (파리티 테스트는 goal-impl 처리 절만 대조). 루트와 같은 변경에서 동일 취지로 개정하고,
  스캐폴드의 조건부 승계 문구 존재를 신규 핀으로 추가한다.

### FR-2 — 승계 판정 절차 (sdd-self-review SKILL)

2A절(critic 조사 지도)에 승계 절차를 추가한다.

- **선언**: plan verification matrix의 행은 선택적으로 `의존: \`파일1\`, \`파일2\``를 evidence
  셀에 병기할 수 있다(tasks-format의 files 선언과 같은 백틱·쉼표 문법).
- **판정(라운드 전환 시)**: 직전 candidate→새 candidate의 수정 diff 파일 목록과 행의 선언
  의존을 대조 — ① 교집합 = ∅ ② 산출이 hermetic(스크립트 실행·배포 관찰 등 결정적) ③ 고비용
  (전체 스위트 실행 대비 유의미하게 비쌈) 3조건 전부 충족 시 그 행의 **실행 evidence를 승계
  가능**. 하나라도 미충족·애매·선언 부재면 재실행.
- **표기**: 승계 시 새 라운드 merged report·evidence에 `승계: rN@<candidate 7자 SHA>` 형식(frontmatter `carried-from`과 동일 표기)으로
  출처를 명시한다 — 무표기 승계 금지.
- **critic 검증**: 승계된 행도 critic이 검토를 생략하지 않는다 — verdict는 새로 내리고, 승계
  타당성(선언이 실제 의존을 덮는지)을 행 검토에 포함한다(도장찍기 금지 연장).
- 저비용 유형(전체 스위트·typecheck·preflight)은 항상 재실행함을 명시.

### FR-3 — goal-impl §7A 정합 개정

"라운드 전환 시 전량 재검증" 소절의 "적극형 미도입" 문장을 FR-1과 같은 의미로 개정한다 —
verdict 전량 재검증 문구·map만 재사용 문구는 불변, evidence 실행 승계의 조건·출처 표기를
sdd-self-review 정본 참조로 연결. **같은 문단의 §3A base-통합 재평가 carve-out 문구
("blast-radius 무효화 판정은 §3A … 한해서만 적용")는 그대로 보존한다**(FR-1의 202607181125
소관 불변 명시와 대칭).

### FR-4 — 계약 테스트 핀 동반 개정

`src/agents/workflow-policy.test.ts`:

- **불변 핀 유지 확인**: AC-11(전량 재검증·verdict 승계 금지)·AC-13(within-run 한정) 기존 핀은
  그대로 green이어야 한다.
- **AC-12 핀 교체(2표면)**: 실측상 "적극형 미도입" 기존 핀은 **sdd-self-review·goal-impl 2곳
  뿐**이다(AGENTS.md는 현재 미핀). 이 2핀을 새 조건부 문구(3조건·출처 표기·verdict 스킵 금지
  유지)로 교체한다.
- **신규 핀(AC-1 소속)**: 루트 AGENTS.md와 `templates/sdd/AGENTS.md` 스캐폴드의 조건부 승계
  문구는 기존 핀이 없으므로 **신규 추가**한다 — 승계 3조건·보수 기본(선언 부재=재실행)·출처
  표기 의무·저비용 항상 재실행 포함.

### FR-5 — 승계 판정 순수 함수 + 텔레메트리 필드

- `src/review-preflight.ts`(또는 인접 순수 모듈)에 승계 판정 함수 신설: 입력 = {행의 선언 의존
  파일 목록(또는 없음), diff 파일 목록, evidence 유형(hermetic-costly | cheap | non-hermetic)}
  → 출력 = {승계 가능 여부, 사유}. 판정 규칙은 FR-2와 1:1(결정적 — LLM 판단 없음). **유형
  분류는 실행자 판단**(애매하면 cheap/non-hermetic으로 — 재실행 방향)이며 함수는 라벨을
  결정적으로 소비한다. **지위 명시(dead-code 방지)**: 이 함수는 instruction-level 승계 절차의
  **결정적 참조 구현(reference implementation)**으로, 초기에는 production 호출부 없이 규칙
  인코딩+테스트로 존재한다 — 이 사실을 함수 주석에 명기한다(§7 죽은 코드 판정 예방, 호출부는
  후속 preflight 통합 후보).
- evidence frontmatter 선택 필드 `carried-from`(예: `"r1@5fc57b6"`) 추가 — FR-5(202607201808)
  스키마의 선택 필드 확장(필수 7필드 검사와 무충돌 — 선택 필드는 preflight 검사 불참여). retro
  집계가 spec별 승계 건수를 집계·표기한다(미준수 판정 불참여). **템플릿 주석 갱신 동반**:
  `templates/sdd/self-review-evidence.template.md`의 "선택 2필드" 문구를 3필드로 갱신.

## Acceptance Criteria

### AC-1 (FR-1) AGENTS.md 조건부 개정
- Given 개정된 AGENTS.md critic 캐싱 절
- When 계약 테스트가 텍스트를 검사하면
- Then verdict 전량 재검증·승계 금지 기존 핀이 유지되고, 조건부 승계(3조건·출처 표기·보수
  기본·cross-session 금지 불변) 문구가 **루트 AGENTS.md와 `templates/sdd/AGENTS.md` 스캐폴드
  양쪽에** 존재하며(신규 핀), 구 "적극형은 도입하지 않는다" 무조건 문구는 양쪽에서 제거돼
  있다.

### AC-2 (FR-2) 승계 절차 명문화
- Given 개정된 sdd-self-review SKILL
- When 계약 테스트가 텍스트를 검사하면
- Then 의존 선언 문법·3조건 판정·승계 표기 형식·critic의 승계 타당성 검증·저비용 항상 재실행
  문구가 존재하고, **구 "적극형은 도입하지 않는다" 무조건 문구는 부재**한다(존재+부재 대칭
  검사 — 자기모순 병기 방지).

### AC-3 (FR-3) goal-impl 정합
- Given 개정된 goal-impl SKILL §7A
- When 계약 테스트가 텍스트를 검사하면
- Then verdict 전량 재검증·map만 재사용 기존 핀이 유지되고, evidence 승계 조건이
  sdd-self-review 정본 참조로 연결돼 있으며, **구 무조건 문구는 부재**한다(AC-2와 대칭).

### AC-4 (FR-4) 계약 비회귀 + 신규 핀
- Given 개정된 3표면 + 개정·신규 계약 테스트
- When 전체 스위트를 실행하면
- Then AC-11·AC-13 기존 핀 green, AC-12 새 문구 핀 green, 신규 핀 green — 전체 green(회귀 0).

### AC-5 (FR-5) 승계 판정 함수
- Given 판정 함수와 픽스처들
- When {교집합 ∅ + hermetic-costly}, {교집합 존재}, {선언 부재}, {cheap 유형}, {non-hermetic
  유형}을 각각 판정하면
- Then 첫 케이스만 승계 가능이고 나머지는 전부 재실행(각 사유 문자열 포함) — 단위 테스트 green.

### AC-6 (FR-5) carried-from 텔레메트리
- Given `carried-from` 필드가 있는 evidence 픽스처와 없는 픽스처
- When retro 집계·렌더를 실행하면
- Then spec별 승계 건수가 집계·표기되고, 필드 부재는 기존 집계에 영향 없다(미준수 불참여,
  기존 테스트 green 유지).

## Open questions

- **OQ-1 (고비용 경계)**: "고비용"의 정량 기준(예: 재실행 N분 이상)을 규약에 박을지, 실행자
  판단(애매하면 재실행)에 둘지 — 이번은 후자로 시작(escalate-on-doubt와 동일 결), 텔레메트리
  축적 후 재보정.
- **OQ-2 (되돌림 관찰)**: goal Risks의 되돌림 신호(승계 결함 1건 또는 3회 retro 승계 0건)를
  retro가 자동 감지·제안할지 — 재보정 리듬 규칙의 일반 절차에 맡기고 이번 범위 제외.
