---
audience: both
tier: 2
tier-rationale: >
  하드 신호 2건 — self-review/critic 워크플로 계약 변경(sdd-self-review·goal-impl 스킬 절차),
  크로스커팅(이후 모든 Tier 1/2 구현의 검증 단계에 영향). escalate 불필요, 직접 Tier 2.
---

# goal — critic 효율화: 렌즈 병렬 fan-out + 결정적 사전 게이트 + 텔레메트리

## Background

같은 세션(2026-07-20)의 실측 조사와 외부 조사가 배경이다.

- **실측(이 저장소 specs 전수)**: critic 라운드는 시간에 따라 단조 증가하지 않았고, spec 044에서
  5라운드 런어웨이로 정점을 찍은 뒤 2라운드 상한(`202607181125`) 도입으로 수렴했다(최신
  `202607201059`는 round 1 clean). 그러나 **라운드 2+까지 간 사례의 blocker를 분해하면 초기
  라운드는 진짜 결함, 후반 라운드(3~5)는 대부분 증거 형식·계약 문구·거짓 양성**이었다
  (예: `202607191145` r1 "AC 증거가 /tmp에만 있음", r2 "`git diff --check` EOF·critic 원문
  미보존"). 또한 critic 검토는 5개 점검 축을 한 리뷰어가 직렬 수행하며, 라운드/blocker/소요
  시간을 기록하는 텔레메트리가 전무해 효율 추이를 측정할 수 없다.
- **외부 조사(T1/T2)**: (a) 상용 LLM 리뷰 도구들은 검증을 "넓게 병렬 탐색 → 좁게 확정"으로
  나눠 wall-clock을 압축하고, 렌즈(관점) 다양성이 서로 다른 결함 유형을 잡는다. (b) "안 닿은 것
  스킵"은 hermetic(결정적) 검증에만 sound하다(Bazel/Infer) — LLM verdict는 non-hermetic이므로
  verdict 재사용은 위험하고, 현 규약의 "라운드 전량 재검증(보수형)"이 이론적으로 옳다.
  (c) 리뷰 시간의 지배 변수는 repo 크기가 아니라 diff 크기다.

## Problem

1. **wall-clock**: 격리 critic이 5개 점검 축을 직렬로 수행해 라운드당 소요 시간이 길다.
   기존 규약(sdd-self-review 5단계)은 "여러 격리 reviewer의 병합 report = round 1개"를 이미
   허용하지만, 병렬 실행 절차가 스킬에 없어 실무에서 활용되지 않는다.
2. **형식 blocker의 라운드 소모**: 기계적으로 검사 가능한 항목(evidence versioned 보존,
   `git diff --check`, merged report 필드 누락)이 critic 라운드에서야 발견되어 추가 라운드를
   만든다 — critic의 고비용 판단력이 기계 검사에 소모된다.
3. **측정 불가**: 라운드 수·blocker 수·소요 시간을 구조적으로 기록하지 않아, "critic이
   비효율적으로 변하는가"라는 질문에 데이터로 답할 수 없다(이번 실측도 spec 산문을 손으로
   재구성했다).

## Objective

critic의 **검증 깊이를 유지한 채** — (1) 렌즈별 병렬 fan-out으로 라운드 wall-clock을 압축하고,
(2) 결정적(hermetic) 사전 게이트로 형식 blocker를 critic 라운드 앞에서 제거하며, (3) 라운드
텔레메트리를 구조화해 효율 추이를 측정 가능하게 만든다.

## Expected outcome

- sdd-self-review가 격리 위임 능력이 있을 때 5개 점검 축을 렌즈별 격리 리뷰어로 동시 실행하고
  하나의 merged report(= round 1개)로 병합하는 절차를 갖는다.
- critic 착수 전 `review-preflight` 스크립트가 형식 항목을 결정적으로 검사해, 실패 시 critic을
  시작하지 않고 기계 수정을 먼저 하게 된다.
- self-review evidence의 frontmatter가 표준 스키마를 갖고, retro 리포트가 spec별 라운드·blocker
  집계를 표시한다. **텔레메트리는 스키마 도입 이후 신규 evidence부터 유효**하다 — 기존 레거시
  evidence(본문 bullet 관례)는 소급 개정하지 않고 "스키마 미준수"로 구분 집계되므로, 도입
  직후의 소급 집계 값은 0에 가깝다(은폐하지 않고 리포트에 미준수 건수로 표기).

## Success metrics

- 실측에서 후반 라운드를 만든 형식 blocker 3유형(evidence 비보존 경로 참조, `git diff --check`
  실패, merged report 필수 필드 누락)이 preflight에서 기계적으로 검출된다(테스트로 실증).
- 렌즈 병렬 절차가 스킬 정본에 명문화되고, merged report 규약(round 산정·필수 필드)이 그대로
  유지됨을 계약 테스트가 확인한다.
- `make retro`(또는 동등 진입점) 리포트에 spec별 self-review 라운드·blocker 집계 절이 나타난다.

## Non-goals

- **verdict 승계·hermetic evidence 재사용(P4)** — 라운드 간 무효화-스킵은 규약 개정이 필요한
  별도 슬라이스로 보류한다. 이 슬라이스는 "라운드 전량 재검증(보수형)"을 그대로 유지한다.
- 자동 self-review 2라운드 상한·fresh approval 규칙 변경.
- 도장찍기 금지(독립성 가드레일)·cross-session map 재사용 금지의 완화.
- Tier 1 in-session 자기검증 lane의 변경(preflight는 Tier 2 evidence 체계 전용).
- 렌즈 리뷰어의 provider/model 바인딩(실행 등급 배치 규약이 이미 소관).

## Constraints

- 검증 깊이 불가침: 병렬화·게이트·텔레메트리 어느 것도 critic의 검증 범위·깊이를 줄이지 않는다.
- 렌즈 병렬은 기존 규약(여러 격리 reviewer의 병합 report = round 1개)의 실행 절차화이며 round
  산정 규칙을 바꾸지 않는다.
- preflight는 hermetic(같은 입력 → 같은 판정)이어야 한다 — LLM 판단을 포함하지 않는다.
- 격리 위임 능력이 없는 런타임에서는 기존 직렬 fallback이 그대로 동작해야 한다(provider 중립).
- instruction-level 규칙과 runtime-enforced 검사를 과장 없이 구분해 표기한다(기존
  workflow-policy 관례).

## Stakeholders

단일 사용자(설치한 개인 누구나 — 비개발자 포함). SDD 워크플로를 쓰는 모든 에이전트 런타임.

## Risks

- 렌즈 간 중복 finding으로 병합 비용 증가 → 병합 규칙(dedup)으로 완화.
- preflight 검사 항목 과다 시 마찰 → 실측된 3유형 + 최소 형식 검사로 시작(확장은 후속).
- duration 기록의 정확성 한계(에이전트 수동 기록) → duration은 선택 필드로 두고 필수화하지
  않는다(Open question으로 표면화).
- 병렬 리뷰어 수만큼 토큰 비용 증가(wall-clock↓, 총 토큰↑) → 격리 능력·비용 여건이 없으면
  직렬 fallback이 기본이므로 강제되지 않는다.
