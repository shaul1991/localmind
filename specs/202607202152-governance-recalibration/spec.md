---
audience: both
---

# spec — 거버넌스 재보정: 확인 루프 완화 · 결과 불변식 전환 · 티어 정교화

## FR (Functional Requirements)

각 FR은 goal Objective 4요소((1) 확인 루프 완화, (2) 결과 불변식 전환, (3) 티어 정교화,
(4) 재보정 규칙) 중 하나를 지지한다. 대상 정본이 둘로 갈린다: **[R]** = rules base
(`~/.localmind/rules/base/`, 데이터 폴더 git), **[L]** = localmind repo.

### FR-1 [R] — interview-protocol: 위험 보정형 재확인 (Objective 1)

`interview-protocol.md`를 개정한다.

- 5단계 사이클의 **3단계(의도 재확인 → 검수 대기)를 고위험 분기에만 강제**한다. 고위험 분기 =
  AGENTS.md 하드 신호 해당 · 비가역 행동(외부 발행·삭제·배포) · 합의된 범위의 변경 · 해석이
  실제로 갈리는 설계 갈림.
- 그 외(저위험 분기)는 **decision-by-exception**: AI가 "이해 요약 + 권고안 + 근거"를 제시하고
  **검수 대기 없이 진행**한다. 이해 요약 제시는 생략 불가(의도 어긋남을 조기 노출하는 장치는
  유지) — 사용자는 어긋남을 발견하면 그 시점에 교정한다.
- 결정 로그 의무(트레이드오프 결정의 second-brain 적재)는 밀도와 무관하게 유지한다.
- 개정 이력(ADR 인라인): 날짜·근거(93% 승인률·자발 명확화 2배·decision-by-exception 수렴)·출처.

### FR-2 [R] — deep-interview-elicitation: 권고 동반 일괄 제시 모드 (Objective 1)

`deep-interview-elicitation.md`를 개정한다.

- 꼬리물기 인터뷰 자체는 유지하되, **모든 질문에 권장 기본값(+근거)을 동반**하는 것을 규칙화
  하고, 결정 공간이 좁거나 상호 독립적인 분기들은 **권고안 일괄 제시 + 사용자 전체 승인/예외
  교정** 모드를 허용한다(질문 1개씩 왕복 강제 폐지).
- 종료 규칙(사용자가 "그만 묻고 진행" 시 Open questions로 기록)·한도(겉돌면 멈춤)는 유지.
- 개정 이력 인라인 동반.

### FR-3 [L] — goal-impl SKILL: 결과 불변식 1급 + 절차는 권장 기본 (Objective 2)

`templates/skills/goal-impl/SKILL.md`를 재서술한다(§4 끊김 방어·§4A fan-out·§5 구현 규율의
수단 서술 대상).

- 각 절을 **불변식(무엇이 참이어야 하는가) 우선**으로 재서술하고, 현행 수단 세목(phase 커밋
  시점·spawn 규칙 상세 등)은 **"권장 기본(default recipe)"**으로 명시 강등한다 — §15 "도구 무관
  원칙·권장 기본" 패턴과 동형. 실행자는 불변식을 지키는 한 수단 재량을 갖는다.
- **불변식으로 유지(재량 불가)**: TDD·RED 실제 관찰·회귀 핀 유효성·base freshness 2게이트·
  EEXIST 생성 규약·round 예산·preflight 게이트·DoD 순서·PR 게이트·Live-Verify·정직 보고.
- **불변식 요약 목록의 배치**: 재서술 구역(§4·§4A·§5) 밖에 사는 불변식(base freshness §3A·
  round 예산 §7A·preflight/DoD/PR §8·Live-Verify §8)은 재서술하지 않고, §5에 신설하는 불변식
  요약 소절에서 **참조로 연결**만 한다(구역 밖 절 본문은 이 FR의 변경 대상이 아님).
  ~~EEXIST §3~~ → **정정(2026-07-20 self-review r1, 렌즈③)**: EEXIST 생성 규약은 goal-impl
  §3이 아니라 AGENTS.md "SDD 흐름" 절 소재이며, 폴더 생성은 goal-impl 소관이 아니므로 요약
  목록에서 제외한다(영향 AC: AC-3 목록 문언 — 무효화 evidence 없음, 문언 정정).
- 기존 문구 계약 테스트가 핀한 문구는 깨지 않는다(깨야 하면 테스트와 함께 개정하되 의미 유지).
  재서술 구역 내 살아있는 핀 4개 — `끊김 방어`(§4)·`TDD 강제`·`RED 확인 생략 금지`·
  `실패 테스트 먼저(red)`(§5) — 는 정확 문자열로 보존한다.

### FR-4 [L] — AGENTS.md 티어 트리거: 가역성·검증가능성 축 명시 (Objective 3)

"변경 등급 티어" 절을 정교화한다.

- 하드 신호에 **비가역성**을 명시 추가한다(현행 신호들의 암묵 축을 표면화 — 기존 신호 삭제
  없음). **토큰 규칙(AC-17 parity)**: 새 신호는 **단일 `·`-구분 토큰 하나**로 추가하고 괄호
  내부 나열은 기존 관례대로 **`/`를 쓴다** — 예: `비가역성(외부 발행/데이터 파괴/비가역
  마이그레이션)`. AC-17 테스트가 하드 신호 줄을 `split("·")`로 세므로 괄호 안에 `·`를 쓰면
  토큰이 쪼개져 parity가 깨진다. **동반 갱신 필수**: `DOCS_EQUIVALENT` 배열과
  `docs/workflows.md` 사람말 설명을 **정확히 +1**로 같은 변경에서 함께 갱신한다.
- **검증가능성**을 판정 보조 축으로 명시한다: 결정적 테스트로 전체 커버 가능하고 가역적인
  변경은 Tier 1 판정을 지지하는 요소(단 하드 신호 해당 시 무효 — 상향 우선 불변).
- escalate-on-doubt·하향 금지·worked-example 표는 유지하고, 새 축의 예시 행을 추가한다.

### FR-5 [R] — 재보정 리듬 규칙 신설 (Objective 4)

rules base에 경량 규칙 `governance-recalibration.md`를 신설한다.

- **컷포인트는 이동한다**: 확인 루프 밀도·티어 경계·round 상한 같은 거버넌스 파라미터는 모델
  능력에 따라 이동하는 값이며 고정 진리가 아니다.
- **재보정 트리거**: retro(self-review 라운드 집계 등 텔레메트리) 검토 시, 또는 주요 모델 세대
  교체 시 — 파라미터 재검토를 **제안**한다(자동 변경 아님, 사람 결정 + 정본 개정 + ADR).
- **비대상 명시**: 검증 계층의 존재 자체(격리 리뷰·결정적 게이트·Live-Verify)는 재보정 대상이
  아니다 — 파라미터만 움직인다.

### FR-6 [양쪽] — 유지 계층 무손상 + 근거 기록 (Objective 전제)

- 이 개정이 격리 self-review·round 예산·결정적 게이트·TDD·Live-Verify의 **문구·의미를 약화하지
  않음**을 기존 계약 테스트 green으로 기계 확인한다.
- 유지 결정의 근거(과신 실증·36.8% 게이트 우회·reasoning-blind)와 open question(matrix-as-map
  vs reasoning-blind 긴장)을 조사 보고서(`evidence/research-report.md`)와 결정 노트로 남긴다.
- `make rules-deploy` 실행으로 개정 rules가 소비 표면에 반영됨을 관찰한다(드리프트 0).

## Acceptance Criteria

### AC-1 (FR-1) 위험 보정형 재확인
- Given 개정된 `~/.localmind/rules/base/interview-protocol.md`
- When 텍스트를 검사하면
- Then 고위험 분기 목록(하드 신호·비가역·범위 변경·설계 갈림)에만 검수 대기를 강제하고,
  저위험 분기는 "이해 요약+권고안 제시 후 진행"(요약 생략 불가)·결정 로그 유지·개정 이력이
  존재한다.

### AC-2 (FR-2) 권고 동반 일괄 제시
- Given 개정된 `deep-interview-elicitation.md`
- When 텍스트를 검사하면
- Then 권장 기본값 동반 규칙·일괄 제시+예외 교정 모드·기존 종료 규칙/한도 유지·개정 이력이
  존재한다.

### AC-3 (FR-3) 불변식/권장 기본 2층 구조
- Given 개정된 `templates/skills/goal-impl/SKILL.md`
- When 텍스트를 검사하면
- Then 불변식 목록(TDD red 관찰·base freshness·round 예산·preflight·DoD·PR·Live-Verify)이
  재량 불가로 명시되고, 수단 세목이 "권장 기본"으로 표기되며, 실행자 재량 문구가 존재한다.
  (~~EEXIST~~ — r1 렌즈③ 정정으로 목록에서 제외, FR-3 배치 규칙 참조)

### AC-4 (FR-3·FR-6) 기존 계약 비회귀
- Given 개정된 SKILL·AGENTS.md
- When localmind 전체 테스트 스위트를 실행하면
- Then 기존 문구 계약(전량 재검증·도장찍기 금지·within-run·round 예산·preflight 게이트·렌즈
  병렬)이 전부 green이다.

### AC-5 (FR-4) 티어 축 명시
- Given 개정된 AGENTS.md 티어 절
- When 텍스트를 검사하면
- Then 비가역성 하드 신호·검증가능성 보조 축(하드 신호 우선 불변)·기존 신호 전부 보존·
  worked-example 신규 행이 존재한다.

### AC-6 (FR-5) 재보정 규칙 신설
- Given 신설 `~/.localmind/rules/base/governance-recalibration.md`
- When 텍스트를 검사하면
- Then 컷포인트 이동 원칙·재보정 트리거(retro/모델 세대)·사람 결정+ADR 절차·검증 계층 비대상
  명시가 존재한다.

### AC-7 (FR-6) 배포 반영
- Given 개정 완료된 rules base
- When `make rules-deploy`를 실행하면
- Then `~/.claude/localmind-rules.md`에 개정 문구(위험 보정형 재확인·재보정 규칙)가 나타나고
  실행이 성공(exit 0)한다.

### AC-8 (FR-6) 근거 기록
- Given 이 spec 폴더
- When 산출물을 검사하면
- Then `evidence/research-report.md`(조사 전문)·개정 rule별 인라인 개정 이력·second-brain 결정
  노트(적재 확인 출력)가 존재한다.

## Open questions

- **OQ-1 (reasoning-blind 긴장)**: matrix-as-map(구현자가 만든 지도를 리뷰어에 제공)과
  reasoning-blind 검증(자기 서사 차단이 검증 성능을 높임 — Anthropic 분류기 실측)의 긴장.
  이번 개정 비대상 — 후속 슬라이스에서 "map은 위치 포인터만·구현자 주장 셀 제거" 실험 후보.
- **OQ-2 (완화 효과 측정)**: 저위험 분기 왕복 감소를 정량 측정할 텔레메트리(질문 수·왕복 수)가
  없다 — 재보정 리듬의 첫 retro에서 필요성 판단.
- **OQ-3 (overlay 연동)**: 이 base 개정이 기존 프로젝트 overlay와 충돌하는 사례가 있는지 —
  배포 후 각 프로젝트 첫 세션에서 관찰(충돌 시 overlay 우선 원칙 그대로).

## 검증 결과 (2026-07-20, self-review round 2 clean)

- [x] FR-1/AC-1 — 위험 보정형 재확인(고위험 강제·저위험 진행·요약 불가생략·결정로그·개정 이력) — r2 실파일 대조 충족
- [x] FR-2/AC-2 — 권고 동반·일괄 모드·종료/한도 유지·개정 이력 — r2 실파일 대조 충족
- [x] FR-3/AC-3·4 — 불변식/권장 기본 2층(핀 4 보존·EEXIST 정정·Live-Verify 포함), 스위트 1019 green — 계약 테스트 + r2 대조
- [x] FR-4/AC-5 — 비가역성 단일 토큰(parity 10=10)·검증가능성 보조 축·예시 행 — 계약 green
- [x] FR-5/AC-6 — 재보정 리듬 규칙 신설 — r2 실파일 대조 충족
- [x] FR-6/AC-7·8 — rules-deploy exit 0·drift 0·개정 문구 배포 반영, 근거 3종(report·개정 이력·결정노트 receipt) — 실행 관찰
- self-review: **round 1 렌즈 병렬 fan-out 첫 실전**(5렌즈, blocker 2·advisory 7, 렌즈 간 중복 0) → 수정 → round 2 전량 재검증 clean. advisory 3건(A-1 §4A 중복·A-3 핀 강도·A-4 AC-17 설계) 후속 이월 — evidence/self-review-round{1,2}.md
