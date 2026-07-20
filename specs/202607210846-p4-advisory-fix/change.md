---
title: "P4 이월 advisory 2건 — 경로 정규화·빈 배열 보수 처리"
audience: both
---

# Change: judgeEvidenceCarryOver 경계 강건화

## 왜(why)
specs/202607210545 self-review r1 advisory 2건 — 둘 다 오류 방향이 **false CARRY(unsafe)**로
"애매하면 재실행" 원칙과 상충: A-1 `./`·중복 슬래시 미정규화로 같은 파일을 다른 경로로 봐
승계 허용, A-2 `declaredDeps: []`가 null(재실행)과 달리 무조건 승계. reference impl이라
실질 위험은 낮지만 후속 preflight 통합 전에 제거한다(이월 수정 조건 이행).

## 무엇을(what)
`src/review-preflight.ts` judgeEvidenceCarryOver만: (1) 경로 정규화에 leading `./` 제거 +
연속 슬래시 축약 추가(tasks-format 1단계 정규화와 일치 — 주석의 "동형" 주장 성립),
(2) `declaredDeps`가 빈 배열이면 null과 동일하게 재실행(보수 기본) + 사유 명시.

## AC (Given-When-Then · 테스트 1:1)
- [x] **AC-1**: Given `./src/x.ts` 선언 vs `src/x.ts` diff(및 `src//x.ts` 변형), When 판정하면, Then 겹침으로 재실행.
- [x] **AC-2**: Given `declaredDeps: []` + hermetic-costly, When 판정하면, Then 재실행(사유에 빈 선언 명시). 기존 6케이스 green 유지.

## 티어 근거
**Tier 1.** 순수 함수 1개의 경계 수정(하드 신호 무해당·가역·결정적 테스트 전체 커버). Tier 0 아님: 행동 변화 있음.
