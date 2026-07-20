---
title: 변경 등급 티어링과 critic 콜드리드 캐싱 — 사양
audience: both
---

# Spec: 변경 등급 티어링 + verification matrix 기반 critic 캐싱

> **요약** — 세 개의 변경 등급 티어(트리비얼/작음/실질적)를 객관적 트리거로 정의하고, 각 티어별
> 문서·critic 강도를 규약·워크플로 계약에 고정한다. critic의 콜드리드 비용은 verification matrix를
> **AC↔코드 대응 지도(map)로 재사용**해 낮춘다. **OQ-5는 보수형으로 확정** — 라운드마다 전량
> 재검증하고 map만 물려주므로 per-round 독립성을 완전 보존한다(verdict 승계·무효화-스킵 없음).
> 독립성·map 재사용 범위(within-run) 가드레일을 계약으로 강제한다. 202607181125의 확정과 Tier 2
> 품질 규율은 불변으로 둔다.

이 사양은 코드 로직이 아니라 **규약·워크플로 계약 텍스트**를 주 대상으로 한다. **티어 판정·무효화·
escalate는 런타임 분류기 코드가 아니라 워크플로가 규약 텍스트를 읽어 수행**한다(기존 fan-out 판정이
tasks 선언을 읽는 방식과 동일). 따라서 AC 검증은 (a) 규약·계약 텍스트의 **무모호성·완결성** 대조와
(b) 규약에 담긴 **worked-example**(대표 입력→기대 판정)의 내부 정합성 검사로 이뤄진다. 이 규칙들은
instruction-level이며 런타임 강제가 아님을 정직히 표기한다(R-6). 구체 검증 레벨·증거는 plan의
verification matrix가 확정한다.

---

## FR — 기능 요구 (각 FR은 goal 항목을 지지)

### FR-1 — 세 티어의 객관적 트리거 정의 (→ O-1, C-7, R-1, R-4)

변경을 **Tier 0(트리비얼) / Tier 1(작음) / Tier 2(실질적)** 로 가르는 객관적 트리거를 규약 정본에
정의하고, 각 티어를 예시하는 **worked-example 표**(대표 변경→티어→근거)를 함께 둔다.

- **Tier 0** — **행동 불변이 자명한** 변경으로 한정: 주석·문서 문구·포매팅·도구 지원 rename.
  **config/설정 값 변경은 Tier 0에서 제외**한다(값이 타임아웃·feature flag·모델명·토큰 TTL·rate
  limit 등 행동을 바꿀 수 있으므로). 기존 테스트가 커버하며 새 테스트가 불필요하다.
- **Tier 1** — 국소적 행동 변경으로 **다음이 모두 아님**: 신규 도메인 개념, 계약(API/스키마/이벤트)
  변경, 인증·보안 표면, 마이그레이션, 데이터 모델 변경, 크로스커팅 변경, 전역 상태·직렬화 형식
  변경. blast-radius가 한정적이다. config 값 변경은 **행동 영향이 없음이 확인되면 Tier 1**,
  확인 안 되면 상위로 escalate.
- **Tier 2** — 위 배제 목록(하드 신호) 중 **하나라도 해당**하거나 blast-radius가 넓은 변경. 크기가
  작아 보여도 무조건 Tier 2다.
- **escalate-on-doubt (모든 경계에 적용)** — 판정이 불확실하면 **한 단계 위 티어**로 올린다. 이는
  Tier 0↔1, Tier 1↔2 **양 경계 모두**에 적용된다. 하향 추측은 금지한다.

### FR-2 — 티어별 의식(문서·critic) 매핑 (→ O-1, O-5)

각 티어가 요구하는 문서·critic 강도를 명문화한다.

| Tier | 문서 | critic |
|---|---|---|
| 0 트리비얼 | 없음(기존 트리비얼 예외) | 없음 |
| 1 작음 | 경량 단일 문서(why·what·how·AC 한 파일) | **in-session** 적대적 자기검증 1라운드, diff 스코프 |
| 2 실질적 | 현행 goal/spec/plan/tasks 4문서 | **격리** 적대 critic, 202607181125의 2라운드 자동 상한 |

Tier 1 문서·구현도 TDD(AC↔테스트 1:1)를 유지한다. Tier 0만 문서·critic·새 테스트를 생략한다.

### FR-3 — 티어 판정 기록·중간 재평가 (→ O-1, O-5, R-1)

- 진입에서 티어를 판정하고 그 근거(어느 트리거로 어느 티어인지)를 산출물에 **기록**한다
  (Tier 1의 경량 문서 또는 Tier 2의 goal/spec, self-review 보고).
- 구현 중 상위 티어 하드 신호(신규 계약·보안·마이그레이션·전역 상태 등)가 드러나면 **상위 티어로
  승격**하고, 승격 사실과 그에 따른 의식 추가를 보고한다. 하향 재분류는 하지 않는다.

### FR-4 — critic 조사 지도: matrix-as-map (→ O-2, C-2 ①, R-3)

critic 계약(sdd-self-review·critic 페르소나)의 읽기 대상을 명확히 한다.

- 현행 계약이 이미 `FR/AC + diff + 테스트 근거`로 스코프하는 위에, verification matrix 각 행이
  가리키는 **AC↔코드·evidence 대응**을 critic의 조사 지도(map)로 제공한다.
- **독립성 보존(가드레일 ①):** matrix는 "어디를 보라"만 정한다. critic은 검토하는 각 행을 **실제
  코드로 검증**하며, matrix 주장(구현자가 채운 상태 셀)만 믿고 통과시키지 않는다. 읽기 *효율*을
  높이되 검증 *깊이*는 줄이지 않는다.
- map은 최소 조사선이지 상한이 아니다 — 스코프 밖에서 결함 단서가 보이면 critic은 범위를 넓힌다.

### FR-5 — 라운드 간 전량 재검증(보수형 확정) (→ O-3, C-5, R-7)

**OQ-5 사용자 결정(2026-07-20): 보수형.** self-review 라운드가 전환될 때(blocker 수정으로 새
candidate 생성) **모든 matrix 행을 전량 재검증**한다.

- **verdict 승계·행 스킵 없음** — round 2 격리 리뷰어는 round 1 verdict를 물려받지 않고 각 행을
  독립 재검증한다. per-round 독립성을 완전 보존한다(202607181125의 라운드 독립성과 정합).
- **재사용되는 것은 검증 결과가 아니라 map뿐** — frozen matrix의 AC↔코드·evidence 대응(map, FR-4)을
  물려줘 그 대응을 매번 재구성하는 비용만 없앤다. map은 조사 지도이지 통과 근거가 아니다.
- **round-to-round 무효화-스킵(적극형)은 도입하지 않는다.** blast-radius 무효화 개념은 202607181125가
  base 통합에 정의한 "영향 행 재평가"의 정본 소관으로 남고, 이 slice는 그것을 재정의하지 않는다.
  (적극형으로의 향후 escalate가 필요하면 별도 slice에서 무효화 건전성 가드레일과 함께 다룬다.)

### FR-6 — map 재사용 범위 한정: within-run only (→ O-4, C-2 ③)

- matrix map(AC↔코드·evidence 대응)의 라운드 간 재사용은 **한 goal-impl 실행 내**로만 유효하다.
- **세션·실행 간(cross-session) map 재사용은 금지**한다 — 다른 실행에서 만든 map을 새 실행의 조사
  지도로 쓰지 않는다(base·의존성 이동으로 map이 낡을 수 있다). 검증 결과 재사용은 애초에 없다(보수형).

### FR-7 — 품질 게이트 보존 (→ O-5, C-3, C-5)

- 202607181125의 확정(self-review 자동 2라운드 상한, matrix 동결, 두 시점 base freshness, 외부 완료
  상태 SSoT)을 **문구·의미상 약화하지 않는다**. 티어·캐싱은 그 위에 얹힌다.
- Tier 2의 기존 규율(전 AC green·필수 도그푸드·격리 적대 critic·PR 게이트·Live-Verify)은 불변이다.
- 캐싱은 검증 깊이를 줄이지 않는다 — 재검 대상 행 수만 (선택된 옵션에 따라) 줄인다.

### FR-8 — SSoT 정본·배포 정합 (→ C-3, C-4, SM-5, R-5)

- 티어 정의·티어별 의식·critic 캐싱 규칙의 정본을 정한다: 저장소 규약은 `AGENTS.md`, 워크플로
  행동은 `templates/skills/{goal-ready,goal-impl,sdd-self-review}/SKILL.md` + `templates/agents/critic.md`.
- 배포 파이프라인(`skills-deploy` → 데이터 폴더 정본 → Claude/Codex/Gemini)이 변경된 계약을
  드리프트 없이 실어 나른다. 소비 surface 간 의미 드리프트 0.

### FR-9 — 사용자 대면 문서 정합 (→ O-6, R-1)

- 티어링은 사용자 대면 흐름 변경이므로 `docs/`(예 `docs/workflows.md`)에 세 티어 lane과 각 lane의
  문서·검증 요구를 **비개발자가 이해할 평이한 한국어**로 설명한다.
- `docs/`도 소비 surface이므로 AGENTS.md 정본과 의미 드리프트가 없어야 한다(human-doc parity).

---

## Acceptance Criteria (Given-When-Then · 테스트와 1:1)

> AC-1~4는 "런타임 분류기의 출력"이 아니라 **규약 텍스트가 해당 입력에 대해 모호성 없이 티어를
> 지정하는가**(worked-example 내부 정합 + 트리거 완결성)를 검증한다(중대-1 반영).

### AC-1 (FR-1) — Tier 0 트리거 완결성
- **Given** 규약의 Tier 0 트리거와 worked-example 표를
- **When** 주석/문서 문구/포매팅 같은 행동불변 자명 변경 예시로 대조하면
- **Then** 그 예시가 Tier 0("문서·critic·새 테스트 없음")으로 모호성 없이 지정되고, **config 값은
  Tier 0 예시에 포함되지 않는다**.

### AC-2 (FR-1) — Tier 1 트리거 완결성
- **Given** Tier 1 트리거와 worked-example을
- **When** 신규 도메인/계약/보안/마이그레이션/데이터 모델/크로스커팅/전역상태 어디에도 없는 국소
  변경 예시로 대조하면
- **Then** Tier 1("경량 단일 문서 + in-session 1라운드")으로 모호성 없이 지정된다.

### AC-3 (FR-1) — Tier 2 하드 신호
- **Given** 하드 신호 목록과 worked-example을
- **When** 계약(API/스키마) 변경·인증/보안 표면·마이그레이션·전역상태 예시로 대조하면
- **Then** 크기가 작아 보여도 무조건 Tier 2로 지정된다.

### AC-4 (FR-1) — escalate-on-doubt 양 경계
- **Given** escalate-on-doubt 규칙과 경계 worked-example을
- **When** Tier 0↔1, Tier 1↔2 각 경계의 모호 예시로 대조하면
- **Then** 두 경계 모두에서 한 단계 위 티어로 올라가며, 하향 지정 예시가 존재하지 않는다.

### AC-5 (FR-2) — 티어별 의식 매핑 정합
- **Given** 규약 정본(AGENTS.md)과 세 워크플로 계약을 대조할 때(AGENTS.md 로더 포함)
- **When** 각 티어의 문서·critic 요구를 조회하면
- **Then** FR-2 표와 동일한 매핑이 모든 surface에서 같은 의미로 나타난다.

### AC-6 (FR-2) — Tier 1도 TDD 유지
- **Given** Tier 1 변경을 구현할 때
- **When** 구현 규율을 적용하면
- **Then** AC↔테스트 1:1(TDD)이 요구되고, 테스트 생략은 Tier 0에만 허용된다.

### AC-7 (FR-3) — 티어 판정 기록
- **Given** 어떤 티어로 작업이 진행될 때
- **When** 산출물(경량 문서/goal·spec/self-review 보고)을 확인하면
- **Then** 판정된 티어와 그 근거 트리거가 기록되어 있다.

### AC-8 (FR-3) — 중간 승격
- **Given** Tier 1로 시작한 작업이 구현 중 계약/전역상태 변경 필요가 드러나고
- **When** 재평가 규칙을 적용하면
- **Then** Tier 2로 승격되고 승격 사실·추가 의식이 보고되며, 하향 재분류는 일어나지 않는다.

### AC-9 (FR-4) — critic 조사 지도 스코프
- **Given** self-review·critic 계약 텍스트를 검사할 때
- **When** 읽기 대상 정의를 조회하면
- **Then** `FR/AC + diff + 테스트 근거`에 더해 **matrix 행이 AC↔코드·evidence 지도**로 명시된다.

### AC-10 (FR-4) — 독립성 가드레일 문구
- **Given** critic·self-review 계약 텍스트를 검사할 때
- **When** matrix 활용 규칙을 조회하면
- **Then** "각 행을 실제 코드로 검증, matrix 주장(상태 셀)만으로 통과 금지"가 명시되어 있다.

### AC-11 (FR-5) — 보수형 전량 재검증
- **Given** self-review·goal-impl 계약 텍스트를 검사할 때
- **When** 라운드 전환 시 검증 범위를 조회하면
- **Then** "라운드마다 모든 matrix 행을 전량 재검증, verdict 승계·행 스킵 없음"이 명시되어 있다.

### AC-12 (FR-5) — per-round 독립성 보존 + map은 통과근거 아님
- **Given** 계약 텍스트를
- **When** round 2 리뷰어의 근거 재사용 규칙을 조회하면
- **Then** round 2는 round 1 verdict를 물려받지 않고, **재사용되는 것은 검증 결과가 아니라 map뿐**
  (map은 조사 지도이지 통과 근거 아님)이며, round-to-round 무효화-스킵(적극형)은 도입하지 않는다고
  명시된다.

### AC-13 (FR-6) — map 재사용 범위 한정
- **Given** map 재사용 규칙 텍스트를 검사할 때
- **When** 유효 범위를 조회하면
- **Then** within-run 라운드 간만 유효하고 cross-session map 재사용 금지가 명시되어 있다.

### AC-14 (FR-7) — 기존 확정 불약화
- **Given** 이번 변경 적용 후의 규약·계약을
- **When** 202607181125의 bounded-verification 계약 테스트(핀된 앵커 문장 포함)로 검증하면
- **Then** 그 테스트가 모두 green으로 유지된다(2라운드 상한·matrix 동결·base freshness·외부 SSoT
  문구·의미 불변).

### AC-15 (FR-7) — Tier 2 품질 규율 불변
- **Given** Tier 2 경로를
- **When** 규율을 조회하면
- **Then** 전 AC green·필수 도그푸드·격리 적대 critic·PR 게이트·Live-Verify가 그대로 요구된다.

### AC-16 (FR-8) — 배포 드리프트 0
- **Given** 변경된 정본 계약을
- **When** `skills-deploy`로 배포하면
- **Then** 데이터 폴더·Claude/Codex/Gemini surface에 같은 계약이 실리고 드리프트가 0이다(멱등).

### AC-17 (FR-9) — 사용자 대면 문서 parity
- **Given** `docs/`의 티어 설명과 AGENTS.md 정본을 대조할 때
- **When** 세 티어 lane·문서·검증 요구를 조회하면
- **Then** 평이한 한국어로 설명되어 있고 AGENTS.md와 의미 드리프트가 없다.

---

## Open questions

- ~~**OQ-1** — Tier 1 경량 문서 위치·파일명·최소 섹션.~~ → **plan에서 확정**: `change.md` 단일 파일
  (why·what·AC(GWT)·티어 근거) + `templates/sdd/change.template.md`.
- ~~**OQ-2** — 티어 판정의 입구(goal-ready vs 별도 triage).~~ → **plan에서 확정**: AGENTS.md 최상위
  lane 결정 + goal-ready 진입에서 Tier 0/1이면 4문서 미강제·lane 안내(새 엔진 없음).
- ~~**OQ-3** — blast-radius 인접 판정 근거.~~ → **plan에서 확정 + 정정**: tasks `files:`/`depends-on:`
  은 write-disjoint 판정용이라 blast-radius 근거로 **불충분**; 모듈·계약·전역상태 경계 기준, 계약/
  전역상태 수정은 자동 인접, 불확실=재검(중대-3 반영).
- ~~**OQ-4** — 계약 테스트 하네스 위치.~~ → **plan에서 확정**: 문구 대조는 `workflow-policy.test.ts`,
  분류/무효화 worked-example은 신규 `tier-classification.test.ts`.
- ~~**OQ-5** — 라운드 간 무영향 행 verdict 승계 여부(보수형 vs 적극형).~~ → **사용자 확정
  (2026-07-20): 보수형.** 라운드마다 전량 재검증하고 map만 재사용 → per-round 독립성 완전 보존.
  적극형(verdict 승계·무효화-스킵)은 도입하지 않는다. FR-5·6·AC-11·12·13에 반영 완료.
