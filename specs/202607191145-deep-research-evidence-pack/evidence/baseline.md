---
title: Deep Research evidence pack baseline
audience: both
---

# Baseline

- 확인 시각: 2026-07-19 11:45 KST
- base: `origin/main`
- base full SHA: `5ac797bcc8ae3ae054ba52851fd9d86b939ba5c7`
- feature branch: `feat/202607191145-deep-research-evidence-pack`
- 시작 dirty 상태: 신규 SDD 폴더만 존재, 기존 tracked/unmanaged 변경 없음
- binding: Codex `standard=gpt-5.6-terra`, `critical-reasoning=gpt-5.6-sol`
- baseline test: `npm test` — 935 tests, 935 pass, 0 fail
- baseline build: `npm run build` — exit 0
- whitespace: `git diff --check` — exit 0
- validator compatibility target: macOS 기본 `/usr/bin/python3` 3.9.6 확인
- verification matrix readiness: AC-1~AC-12가 정확히 한 행씩 있고 빈 종료 조건 없음
