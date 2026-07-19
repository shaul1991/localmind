---
title: Phase 1 RED evidence
audience: both
---

# Phase 1 RED

- `npm run typecheck`: exit 0
- `git diff --check`: exit 0
- deep-research evidence ledger/pack/validator focused test: 13 tests, 2 pass, 11 expected fail
  - AC-1 기존 report-only 회귀 핀과 fixture syntax harness만 pass
  - AC-2~4는 ID·적응형 충분성·checkpoint 계약 부재로 fail
  - AC-5·8·9는 canonical `research-evidence-pack` 부재로 fail
  - AC-6·7은 `scripts/validate_bundle.py` 부재로 fail
- evidence-pack policy test: 1 expected fail — catalog/package policy 부재
- evidence-pack lifecycle test: 2 expected fail — 7번째 canonical package 부재
- valid/invalid/security fixture는 exact five-file 및 JSON/JSONL 문법 자체는 valid
