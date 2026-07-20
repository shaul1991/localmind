---
title: "critic 효율화 advisory 3건 정리 (A1 tie-break · A2 파서 통일 · A3 정규식 스코프)"
audience: both
---

# Change: critic 효율화 advisory 3건 정리

## 왜(why)

specs/202607201808(2026.07.2 릴리스)의 self-review round 1이 남긴 advisory 3건을 해소한다.
셋 다 완료 비차단이었지만 — A1은 유효 데이터 밖 엣지에서 집계 결정성 주장과 코드가 어긋날 수
있고, A2는 같은 FR-5 스키마를 두 파서(yaml.parse vs 정규식)가 달리 해석할 여지, A3은 preflight가
spec 산문의 인라인 `**AC-N**` 언급을 과검출해 false-positive 위반을 낼 수 있다. 형식 게이트·
텔레메트리의 신뢰도를 지키는 소규모 정리다.

## 무엇을(what)

국소적 행동 변경 2파일(+각 테스트). 계약(FR-5 스키마)·API·데이터 모델 불변.

- **A1** `src/retro-analysis.ts` — `aggregateSelfReviewEvidence`의 최종 completion 선정에서
  같은 `round` 값이 복수일 때 **filename 사전순 마지막**을 결정적 tie-break로 채택(readdir
  순서 의존 제거). 유효 데이터(라운드당 1파일)의 기존 거동 불변.
- **A2** `src/retro-analysis.ts` — frontmatter 파싱을 정규식 라인 파서에서 **`yaml` 패키지
  `parse`로 통일**(preflight와 동일 — 기존 repo 의존성). 템플릿 준수 스칼라 값의 집계 결과
  불변, 복합 YAML(`round: 1 # comment` 등)에서 두 검사기의 판정 일치 확보.
- **A3** `src/review-preflight.ts` — `checkMatrixCoverage`의 spec측 AC-id 추출에서 인라인
  `**AC-N**` 패턴을 **`## Acceptance Criteria` 절 범위 내로 한정**(헤딩 `### AC-N`은 현행
  유지). 산문 언급(예: 검증 결과 절의 `**AC-1**` 회고 서술)이 matrix 대응 요구로 오검출되지
  않게 한다.

## AC (Given-When-Then · 테스트 1:1)

- [ ] **AC-1 (A1)**: Given 같은 spec에 `round: 2` evidence 2개(completion 상이·filename 상이)
  픽스처, When 집계 함수를 입력 순서를 뒤집어 2회 호출하면, Then 두 호출 모두 filename
  사전순 마지막 파일의 completion을 반환한다(순서 비의존).
- [ ] **AC-2 (A2)**: Given `round: 1 # 주석`·따옴표 값 등 복합 YAML frontmatter 픽스처,
  When 집계 함수를 호출하면, Then preflight의 yaml.parse 해석과 동일하게 필드가 인식되고
  기존 정상·레거시 픽스처 집계 결과는 불변이다(기존 테스트 green 유지).
- [ ] **AC-3 (A3)**: Given `## Acceptance Criteria` 절에는 AC-1·2만 있고 그 밖 절(검증 결과
  등)에 `**AC-9**` 인라인 언급이 있는 spec.md + AC-1·2만 담은 plan.md matrix 픽스처,
  When `checkMatrixCoverage`를 실행하면, Then AC-9는 위반으로 보고되지 않고 통과한다.
  (역방향 보존: AC 절 안의 인라인·헤딩 AC는 현행대로 검출 — 기존 테스트 green 유지.)

## 티어 근거

**Tier 1(작음).** 국소적 행동 변경 — 하드 신호(신규 도메인 개념·계약 변경·인증/보안·
마이그레이션·데이터 모델·전역 상태·직렬화·크로스커팅) 전부 비해당: FR-5 스키마 계약은
불변이고 파싱 구현·판정 스코프만 바뀌며, blast-radius가 순수 모듈 2개 + 테스트로 한정된다.
Tier 0이 아닌 이유: 행동 불변이 자명하지 않다(동률 tie-break·복합 YAML·정규식 스코프 모두
행동 변화) — 테스트 필수. Tier 2가 아닌 이유: 상기 하드 신호 부재 + 판정 불확실성 없음
(escalate-on-doubt 비적용, 2026-07-20 사용자 lane 확정 — 렌즈 병렬 critic 테스트는 다음
Tier 2 슬라이스로 이월).
