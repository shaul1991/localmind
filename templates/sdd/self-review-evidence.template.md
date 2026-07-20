---
title: "{{제목 — 예: Self-review round {{N}} merged report}}"
audience: both
candidate-id: "{{full SHA 또는 결정적 candidate 식별자}}"
round: {{정수 — 1부터}}
independence: {{isolated-context | cross-runtime | main-session-fallback}}
blockers: {{정수}}
advisories: {{정수}}
approval-needed: {{true | false}}
completion: {{clean | blocked}}
duration-minutes: {{선택 — 라운드 소요 시간(정수), 기록 정확성 한계로 생략 가능}}
lenses: {{선택 — 병렬 렌즈 실행 시 목록, 예: [추적성, 커버리지, 정확성, 단순성-보안, 사실정확성]}}
---

<!-- specs/202607201808-critic-efficiency FR-5 — self-review evidence frontmatter 표준.
     필수 7필드(candidate-id·round·independence·blockers·advisories·approval-needed·completion)는
     항상 채운다 — retro 집계기(src/retro-analysis.ts)와 review-preflight가 이 필드를 기계
     판독한다. 선택 2필드(duration-minutes·lenses)는 있으면 채우고 없으면 줄 자체를 지운다.
     본문은 기존 관례대로 blocker·수정 내역을 자유 서술한다(sdd-self-review SKILL §5). -->

# Self-review round {{N}}

## Blocker
<!-- 치명·중대 결함, AC 미충족을 서술. 없으면 "없음". -->

## 수정
<!-- blocker에 대한 수정 내역. 다음 round가 있으면 무엇을 재검하는지 명시. -->
