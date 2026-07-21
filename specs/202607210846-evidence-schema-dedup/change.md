---
title: "evidence 스키마·파서 단일화 + retro 라벨 정확성 + preflight make 타깃"
audience: both
---

# Change: evidence 스키마 SSoT 단일화·retro 라운드 라벨 정확화

## 왜(why)
완성도 스윕(C1·C2·C4·C5): FR-5 필수 7필드 배열과 frontmatter 파서가 review-preflight.ts와
retro-analysis.ts에 **복사 2벌**(주석은 "동일 파서 통일"이라 주장하나 공유 아님 — 계약의 SSoT
부재), retro §8 형태 라벨 `r{i+1}`이 배열 위치 기반이라 실제 round와 어긋날 수 있음(비연속
round 시 오표기), preflight의 make 타깃 부재(§15 표준 진입점 격차).

## 무엇을(what)
- 신규 `src/evidence-schema.ts`: `REQUIRED_SELF_REVIEW_FIELDS`(7필드)·`parseEvidenceFrontmatter`
  (CRLF 정규화·`---` 탐색·yaml.parse·실패 null) 공용 추출 — 양쪽이 import(동작 불변).
- `src/retro-note.ts`(+집계): reviewModes에 실제 round 번호를 담아 `r{round} {mode}` 렌더.
- `Makefile`: `review-preflight` 타깃(npm script 위임, 기존 retro 관례).

## AC (Given-When-Then · 테스트 1:1)
- [x] **AC-1**: Given 공용 모듈 추출 후, When 전체 스위트 실행, Then green(동작 불변) + 두
  파일이 evidence-schema를 import하고 중복 정의 0(grep).
- [x] **AC-2**: Given round 2만 있는(1 미준수) evidence 픽스처, When §8 렌더, Then 라벨이
  `r2 …`로 표기(위치 아닌 실제 round). 기존 연속 케이스 표기 불변.
- [x] **AC-3**: Given `make review-preflight SPEC=specs/<dir>`, When 실행, Then npm script와
  동일 동작(exit code 전달).

## 티어 근거
**Tier 1.** 리팩터+표시 정확화+빌드 타깃 — 하드 신호 무해당, 결정적 테스트 전체 커버·가역.
Tier 0 아님: C4는 출력 행동 변화, C1·C2는 모듈 경계 이동(테스트 필요).
