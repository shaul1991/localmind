---
title: Phase 5 dogfood 관찰 기록
audience: both
---

# T5.1 — preflight 자기 적용 (2026-07-20 19:05경)

- 위반 시나리오: 임시경로만 참조하는 probe evidence를 두고 `npm run review:preflight -- specs/202607201808-critic-efficiency`
  → `❌ preflight 위반 1건 … (temp-path-evidence) … versioned 경로(specs/202607201808-critic-efficiency/evidence/)가 본문에 없습니다`, exit 1 관찰.
- clean 시나리오: probe 제거 후 재실행 → `✅ preflight 통과 … ℹ preflight 통과는 critic 시작의 전제일 뿐 AC green의 근거가 아닙니다.`, exit 0 관찰.

# T5.2 — retro 집계 절 관찰

- `npm run retro-report` 실행 → `~/.localmind/reports/retro-2026-07-20.md`에
  `## 8. self-review 라운드 집계` 절 출현. 레거시 evidence 4건이 "스키마 미준수 evidence: 4건
  (레거시 forward-only — 소급 개정 없음, FR-5)"로 은폐 없이 표기됨.
- **도그푸드가 잡은 실결함**: scripts/retro-report.ts JSDoc 주석 내 `specs/*/evidence` 경로의
  `*/`가 주석을 조기 종료시켜 진입점이 TransformError로 죽음(테스트는 진입점 미실행이라 1017
  green이 못 잡음). 주석 문구 수정으로 해소, 수정 후 스위트 1017 green 재확인.
- 참고: 수정 직후 1회 스위트에서 1 fail 관찰됐으나 즉시 2회 재실행 모두 1017/1017 green —
  재현 불가 일과성으로 기록(은폐 없이 명시).
