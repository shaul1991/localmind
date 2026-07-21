---
title: "사람용 문서 parity — self-review 신기능 4종 반영"
audience: both
---

# Change: docs/workflows.md·agents.md에 2026.07.2~.6 기능 반영

## 왜(why)
완성도 스윕(D1~D3): preflight 게이트·렌즈 병렬·조건부 승계·retro §8 텔레메트리 표가 AI-facing
정본(SKILL·AGENTS)엔 최신인데 **사람용 문서에 0건** — 비개발자가 문서만 읽고 새 기능을 알 수
없다(티어 축만 반영돼 있음). 오픈소스 대상 원칙(비개발자도 사용자) 위반 상태.

## 무엇을(what)
- `docs/workflows.md` self-review 절: preflight(critic 전 결정적 형식 검사, `npm run
  review:preflight`)·렌즈 병렬(5축 동시, round 산정 불변)·hermetic 승계(3조건·출처 표기)를
  평이한 한국어로 추가. AI 정본(SKILL) 참조 포인터 병기 — 상세 재유도 금지(드리프트 방지).
- `docs/agents.md` retro 절: §8 표의 컬럼 의미(라운드·blocker·completion·duration·형태·승계)
  한 줄씩 설명.

## AC (Given-When-Then · 테스트 1:1)
- [x] **AC-1**: Given 개정 문서, When grep 하면, Then preflight·렌즈 병렬·승계·§8 컬럼 설명이
  각각 존재하고 AC-17 parity 테스트 등 기존 문서 계약이 green(전체 스위트).
- [x] **AC-2 (엣지)**: Given 개정 내용, When SKILL 정본과 대조하면, Then 수치·조건이 정본과
  일치(요약이되 모순 없음 — 3조건·2라운드 상한·round 산정 불변).

## 티어 근거
**Tier 1.** 사람용 문서 추가 — 행동 무변이나 문서 계약 테스트(AC-17 등) 영향 확인 필요라
Tier 0 아님. 하드 신호 무해당.
