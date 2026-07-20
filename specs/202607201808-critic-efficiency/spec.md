---
audience: both
---

# spec — critic 효율화: 렌즈 병렬 fan-out + 결정적 사전 게이트 + 텔레메트리

## FR (Functional Requirements)

각 FR은 goal의 Objective 3요소((1) 병렬, (2) 게이트, (3) 텔레메트리) 중 하나를 지지한다.

### FR-1 — 렌즈별 병렬 fan-out 절차 (Objective 1)

`templates/skills/sdd-self-review/SKILL.md`에 렌즈 병렬 실행 절차를 추가한다.

- 격리 위임 능력이 있으면, 5개 점검 축(① 추적성 ② 커버리지 ③ 정확성 ④ 단순성·보안
  ⑤ 사실 정확성)을 **렌즈별 격리 리뷰어로 동시 실행**할 수 있다. 각 리뷰어는 전체 diff +
  matrix map을 입력으로 받되 자기 렌즈의 점검 축에 집중한다.
- 병렬 실행은 **선택 가능한 실행 형태**이며 의무가 아니다 — 격리 능력이 없거나 비용 여건이
  맞지 않으면 기존 단일 리뷰어(5축 직렬) 절차가 그대로 기본 fallback이고, 어떤 형태로
  실행했는지 보고에 명시한다.
- 렌즈 병렬이든 단일 리뷰어든 **round 산정 규칙은 불변**: 같은 candidate에 대한 모든 리뷰어의
  findings를 병합한 merged report 하나 = round 1개.

### FR-2 — merged report 병합 규칙 (Objective 1)

렌즈 병렬 실행 시 병합 규칙을 스킬에 명문화한다.

- **dedup**: 서로 다른 렌즈가 같은 결함(같은 파일:줄 + 동일 결함 서술)을 보고하면 하나로
  합치고 발견 렌즈를 병기한다.
- **심각도 보수 병합**: 같은 결함에 렌즈 간 심각도가 갈리면 높은 쪽을 채택한다.
- 각 finding에 발견 렌즈(축)를 표기한다(기존 "축을 함께 표기한다" 규칙의 구체화).
- merged report 필수 필드는 기존 규약의 `candidate-id`, `round`, `independence`, `blockers`,
  `advisories`, `approval-needed`를 유지하고, 이 슬라이스가 `completion`을 **추가**한다 —
  FR-5와 **단일 필드셋**이며, sdd-self-review SKILL §5의 필드 목록도 동시에 같은 셋으로
  개정한다(두 정의가 갈리면 preflight가 SKILL 산출물을 거부하는 모순이 생기므로 금지).

### FR-3 — review-preflight 스크립트 (Objective 2)

결정적(hermetic) 사전 검사 스크립트를 신설한다 — 순수 검사 모듈(`src/review-preflight.ts`) +
얇은 IO 진입점(`scripts/review-preflight.ts`) + `package.json` script(`review:preflight`)의
기존 3분할 관례.

검사 항목(모두 결정적 — LLM 판단 없음):

- **(a) evidence 보존 경로**: 대상 spec의 evidence 파일들(`specs/{spec}/evidence/*.md`) 본문이
  참조하는 로컬 절대경로 중 **저장소 밖 임시 경로**(`/tmp/…`, `/private/tmp/…`, `$TMPDIR` 류)를
  검출한다. 판정 규칙(결정적): 임시 경로 참조가 있는 파일의 본문에 **해당 spec의 versioned
  evidence 경로 문자열(`specs/{spec}/evidence/` 하위 경로)이 하나도 등장하지 않으면** 위반이다.
  한계 명시: 이 규칙은 형식 게이트일 뿐이며 versioned 언급의 **내용 충실성은 검증하지 않는다**
  (false-negative 가능 — 내용 검증은 critic의 몫, 도장찍기 금지와 동일 결).
- **(b) diff 형식**: `git diff --check`(공백 오류·EOF 개행)가 clean인지 확인한다.
- **(c) merged report 필드**: self-review evidence 파일(파일명 `self-review-round*.md`)의
  frontmatter에 FR-5 표준 스키마 필수 필드가 모두 존재하는지 검사한다.
- **(d) matrix 전수 대응**: 대상 spec의 `plan.md` verification matrix 행에 등장하는 AC 식별자
  집합과 `spec.md`의 AC 식별자 집합이 일치하는지(모든 AC가 정확히 한 행) 검사한다.

출력: 위반 목록(파일·항목·사유)과 함께 비0 exit code. 위반 없으면 0.

### FR-4 — 스킬 통합: preflight를 critic 앞의 게이트로 (Objective 2)

- `templates/skills/goal-impl/SKILL.md`와 `templates/skills/sdd-self-review/SKILL.md`에
  "critic 착수 전 preflight 실행 → 실패 시 critic을 시작하지 않고 기계 수정 먼저"를 명문화한다.
- preflight 통과는 critic 시작의 전제일 뿐 **어떤 AC의 green 근거도 아니다**(도장찍기 금지와
  동일 결 — 형식 통과 ≠ 내용 검증).
- 이 게이트는 instruction-level이며 런타임이 기술적으로 강제하지 않음을 과장 없이 표기한다
  (스크립트 자체는 결정적이지만, 실행 여부는 워크플로 instruction이 담당).

### FR-5 — evidence frontmatter 표준 스키마 (Objective 3)

self-review evidence 파일(`self-review-round*.md`)의 frontmatter 표준을 정의한다.

- **관례 전환(명시)**: 기존 evidence는 필드를 **본문 bullet**(`- candidate: ...`)로 적어 왔다
  (예: `202607191145` evidence — 파일 간 필드명도 불일치). 이 FR은 필드를 **frontmatter로
  표준화**해 본문 bullet 관례를 대체한다. **forward-only** — 소급 개정하지 않으며, 레거시
  파일은 FR-6에서 "스키마 미준수"로 구분 집계된다(텔레메트리는 신규 evidence부터 유효).
- 필수(7 — FR-2와 **단일 필드셋**): `candidate-id`(full SHA 또는 결정적 식별자), `round`(정수),
  `independence`(`isolated-context`/`cross-runtime`/`main-session-fallback`), `blockers`(정수),
  `advisories`(정수), `approval-needed`(boolean), `completion`(`clean`/`blocked`).
- 선택(2): `duration-minutes`(정수 — 라운드 소요 시간, 기록 정확성 한계로 선택), `lenses`
  (병렬 실행 시 렌즈 목록).
- 템플릿(`templates/sdd/self-review-evidence.template.md`)을 추가하고, sdd-self-review 스킬이
  merged report 저장 시 이 스키마를 따르도록 명문화한다(SKILL §5 필드 목록 개정 포함 — FR-2).

### FR-6 — retro 집계기 (Objective 3)

`src/retro-analysis.ts`에 self-review 텔레메트리 집계를 추가한다.

- 입력: `specs/*/evidence/self-review-round*.md`의 frontmatter(FR-5 스키마) — 기존 관례대로
  순수 집계 모듈(IO 없음, 텍스트/객체 입력)로 구현하고, **evidence 파일의 glob·읽기는 진입점
  `scripts/retro-report.ts`가 담당**한다(현행 진입점은 spec.md만 읽으므로 evidence 읽기 배선을
  추가한다).
- 집계: spec별 라운드 수·총 blocker·최종 completion·(있으면) duration 합. **"최종" =
  최대 `round` 값을 가진 evidence의 completion**(파일 읽기 순서 비의존 — 결정성 보장).
- `completion` 정규화(결정적): 값에 `clean`이 포함되면 `clean`, `blocked`가 포함되면 `blocked`,
  그 외·부재는 "스키마 미준수"(레거시 실사용값 `complete-clean` 흡수).
- 렌더: retro 리포트(`src/retro-note.ts`)에 "self-review 라운드 집계" 절을 추가한다.
- FR-5 이전의 레거시 evidence(frontmatter 자체 부재 포함)는 파싱 실패로 죽지 않고 "스키마
  미준수"로 구분 집계한다. **소급 값은 0이어도 은폐하지 않는다** — 집계 절에 미준수 건수를
  함께 표기한다.

## Acceptance Criteria

### AC-1 (FR-1) 렌즈 병렬 절차 명문화
- Given 배포된 sdd-self-review 스킬 텍스트
- When 계약 테스트가 스킬 본문을 검사하면
- Then 렌즈별 병렬 실행 절차(5축 렌즈, 격리 능력 조건, fallback 명시, 실행 형태 보고)와
  "merged report 하나 = round 1개" 불변 문구가 존재한다.

### AC-2 (FR-2) 병합 규칙 명문화
- Given 배포된 sdd-self-review 스킬 텍스트
- When 계약 테스트가 스킬 본문을 검사하면
- Then dedup(파일:줄+결함 동일성)·심각도 보수 병합·발견 렌즈 표기·필수 필드 유지 문구가
  존재한다.

### AC-3 (FR-3a) 임시 경로 evidence 검출
- Given `/tmp/...` 절대경로를 참조하고 본문에 `specs/{spec}/evidence/` 하위 경로 문자열이
  전혀 없는 evidence 픽스처
- When preflight 검사 모듈을 실행하면
- Then 해당 파일·경로가 위반으로 보고되고 결과가 fail이다. 같은 본문에
  `specs/{spec}/evidence/` 하위 경로를 병기한 픽스처는 통과한다(FR-3a 판정 규칙 그대로).

### AC-4 (FR-3b) diff 형식 검사
- Given `git diff --check` 위반 출력 텍스트(EOF 개행 누락·trailing whitespace) / 빈 출력
- When 순수 판정 함수(단위)와 일회용 저장소에서의 진입점 실행(통합,
  `scripts/review-preflight.test.mjs`)을 각각 실행하면
- Then 위반 출력에서 fail·빈 출력에서 pass가 판정되고(단위), 실제 위반 트리에서 진입점이
  비0 exit·정상 트리에서 0을 반환한다(통합).

### AC-5 (FR-3c) merged report 필드 검사
- Given FR-5 필수 7필드(`candidate-id`·`round`·`independence`·`blockers`·`advisories`·
  `approval-needed`·`completion`) 중 하나가 frontmatter에서 누락된 self-review evidence 픽스처
- When preflight 검사 모듈을 실행하면
- Then 누락 필드명이 위반으로 보고되고 fail, 7필드 전부 존재하는 픽스처는 통과한다.

### AC-6 (FR-3d) matrix 전수 대응 검사
- Given spec.md에 AC-1..N이 있으나 plan.md matrix에 한 AC 행이 빠진 픽스처
- When preflight 검사 모듈을 실행하면
- Then 누락 AC 식별자가 위반으로 보고되고 fail, 전수 대응 픽스처는 통과한다.

### AC-7 (FR-3) 진입점 배선
- Given 저장소 체크아웃
- When `npm run review:preflight -- <spec-경로>`(동등 진입점)를 실행하면
- Then 검사 모듈이 해당 spec을 대상으로 실행되고 위반 목록·exit code가 규정대로 나온다
  (위반 시 비0, clean 시 0).

### AC-8 (FR-4) 게이트 문구 계약
- Given 배포된 goal-impl·sdd-self-review 스킬 텍스트
- When 계약 테스트가 본문을 검사하면
- Then "critic 착수 전 preflight 실행·실패 시 critic 미시작", "preflight 통과는 AC green 근거
  아님", instruction-level 명시 문구가 존재한다.

### AC-9 (FR-5) frontmatter 스키마·템플릿
- Given 신설 템플릿 `templates/sdd/self-review-evidence.template.md`
- When 계약 테스트가 템플릿과 스킬 본문을 검사하면
- Then 필수 7필드·선택 2필드(FR-5 단일 필드셋)가 템플릿에 있고, 스킬 §5 필드 목록이 같은
  셋으로 개정돼 있으며, merged report 저장 시 이 스키마를 따른다는 문구가 존재한다.

### AC-10 (FR-6) 집계 정확성
- Given FR-5 스키마 evidence 텍스트 픽스처(2개 spec × 라운드 1~2, blocker 수 상이)
- When 집계 함수를 호출하면
- Then spec별 라운드 수·총 blocker·최종 completion이 픽스처 값과 정확히 일치한다.

### AC-11 (FR-6) 레거시 내성
- Given 스키마 불완전 레거시 evidence 픽스처 2종 — (a) frontmatter에 self-review 필드 누락·
  본문 bullet로만 기재(실측 `202607191145` 관례 — frontmatter에는 `title`/`audience`만 존재),
  (b) frontmatter 자체가 없는 합성 케이스
- When 집계 함수를 호출하면
- Then 두 경우 모두 예외 없이 "스키마 미준수"로 구분 집계되고(미준수 건수 표기 포함),
  나머지 정상 파일 집계는 유지된다.

### AC-12 (FR-6) 리포트 렌더
- Given 집계 결과 객체
- When retro 리포트 렌더를 호출하면
- Then "self-review 라운드 집계" 절이 spec별 행으로 렌더된다.

### AC-13 (전체) 규약 정합 — 기존 계약 비회귀
- Given 변경된 스킬·에이전트 템플릿
- When 기존 workflow-policy 계약 테스트 전체를 실행하면
- Then 기존 문구 계약(라운드 전량 재검증·도장찍기 금지·within-run 한정·round 예산)이 모두
  green으로 유지된다 — 이 슬라이스가 보수 원칙을 약화하지 않았음을 기계적으로 확인한다.

## Open questions

- **OQ-1 (duration)**: `duration-minutes`를 에이전트 수동 기록 이상으로 자동화할 수단(래퍼
  스크립트의 시각 기록 등)을 도입할지 — 이번 슬라이스는 선택 필드로만 두고 보류.
- **OQ-2 (preflight 확장)**: critic 원문(리뷰어 출력 원문) 보존 검사를 preflight에 추가할지 —
  원문 파일 위치 규약이 아직 없어 이번 범위에서 제외. 규약 신설과 함께 후속 판단.
- ~~**OQ-3 (AGENTS.md 반영 범위)**: 렌즈 병렬·preflight를 AGENTS.md 본문에 절로 추가할지,
  스킬 정본 참조로 둘지.~~ → **확정(2026-07-20 문서 준비 critic 라운드에서 해소)**: 최소
  반영 — AGENTS.md critic 캐싱 절에 1~2문장 포인터(렌즈 병렬은 round 산정 불변·preflight는
  critic 전 게이트)만 추가하고 절차 상세는 스킬 정본에 둔다. plan·tasks(T4.3)와 정합.
