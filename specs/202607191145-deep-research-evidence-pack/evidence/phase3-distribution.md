---
title: Phase 3 distribution evidence
audience: both
---

# Phase 3 — distribution·문서

> **결론** — 일곱 packaged workflow가 정본·Claude·공용 Agent Skill target에서 재현되고, 실행
> validator가 필요한 `research-evidence-pack`만 Gemini generated wrapper에서
> `skipped-dependency`로 정직하게 제외된다. 문서와 배포 계약 focused test는 모두 green이다.

## 변경 경계

- README·agents·workflows·CHANGELOG에 stable ID, 적응형 충분성, checkpoint, 별도 evidence pack의
  explicit/docs-only 경계와 정확한 다섯 파일을 기록했다.
- Gemini wrapper verifier는 catalog 전체가 아니라 `wrapperSelfContained`인 workflow만 검증한다.
- Claude·공용 Agent Skill target에는 `scripts/validate_bundle.py` 실행 비트까지 배포한다.
- Gemini generated wrapper 비적격은 실패로 위장하거나 기능 지원으로 과장하지 않는다.

## 검증

- `npm run typecheck` — exit 0.
- focused TypeScript test — 132/132 pass.
- `scripts/workflow-lifecycle.test.mjs` — 14/14 pass.
- lifecycle에서 seed→deploy→redeploy, drift 복원, unmanaged 보존, recover/restore와 target verification을
  temp roots로 확인했다.
