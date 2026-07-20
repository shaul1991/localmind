---
title: "retro self-review 집계에 리뷰 형태(lenses) 컬럼 추가"
audience: both
---

# Change: retro self-review 집계에 리뷰 형태(lenses) 컬럼 추가

## 왜(why)

self-review evidence의 선택 필드 `lenses`(FR-5, specs/202607201808)가 기록되기 시작했는데
(202607202152 r1이 첫 데이터), retro 집계 표에는 표기되지 않아 **렌즈 병렬 vs 단일 리뷰어의
효율 비교**(재보정 리듬 규칙의 판단 근거)를 표에서 읽을 수 없다. 라운드별 리뷰 형태를 집계에
표면화한다.

## 무엇을(what)

국소적 행동 변경 — 순수 집계 모듈·렌더 2파일(+테스트). FR-5 스키마 계약 불변(선택 필드 소비만).

- `src/retro-analysis.ts` — `aggregateSelfReviewEvidence`: 각 evidence의 `lenses`(선택, 문자열
  배열)를 읽어 spec 집계에 라운드 순서대로 리뷰 형태 목록 추가 — 배열이면 `병렬(N)`, 부재·
  비배열이면 `단일`. 미준수 판정에는 불참여(선택 필드).
- `src/retro-note.ts` — §8 집계 표에 "형태" 컬럼 추가(예: `r1 병렬(5) · r2 단일`).

## AC (Given-When-Then · 테스트 1:1)

- [x] **AC-1**: Given r1에 `lenses` 5개·r2에 lenses 부재인 evidence 픽스처, When 집계·렌더하면,
  Then spec 행의 형태가 라운드 순서대로 `병렬(5)`·`단일`로 표기된다.
- [x] **AC-2 (엣지)**: Given lenses가 비배열(문자열/숫자)이거나 빈 배열인 픽스처, When 집계하면,
  Then 단일로 취급되고 기존 집계 값·미준수 판정은 불변이다(기존 테스트 전부 green 유지).

## 티어 근거

**Tier 1(작음).** 하드 신호(신규 도메인 개념·계약·인증/보안·마이그레이션·데이터 모델·전역
상태·직렬화·크로스커팅·비가역) 전부 비해당 — FR-5 스키마는 불변(이미 정의된 선택 필드의 소비),
blast-radius 순수 모듈 2개, 가역적, 결정적 테스트로 전체 커버 가능(검증가능성 보조 축이 Tier 1
지지). Tier 0 아님: 행동 변화(집계 출력) 있음 — 테스트 필수.
