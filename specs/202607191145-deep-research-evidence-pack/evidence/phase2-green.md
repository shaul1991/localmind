---
title: Phase 2 canonical GREEN evidence
audience: both
---

# Phase 2 canonical GREEN

- deep-research ID·atomic claim·adaptive sufficiency·checkpoint focused tests: 4/4 pass
- research-evidence-pack path/safety/exact-output contract tests: 3/3 pass
- validator fixture syntax + valid/invalid behavior tests: 6/6 pass
- policy explicit/docs-only test: 1/1 pass
- macOS 기본 Python 3.9.6에서 validator valid pack exit 0:
  `sources=2 evidence=2 claims=2 coverage=2/2`
- invalid fixture 4종은 각각 duplicate ID, broken reference, invalid status,
  supported-without-evidence 오류로 exit 1
- validator executable mode: `-rwxr-xr-x`
- skill-creator quick validation: deep-research와 research-evidence-pack 모두 valid
- `git diff --check`: exit 0

Distribution-stage observation: 기존 generated command adapter는 executable resource가 있는 workflow를
self-contained wrapper로 만들지 않고 `skipped-dependency`로 보고한다. product engine을 Phase 2에서
확장하지 않았으며 Phase 3에서 지원 범위와 기대값을 정직하게 문서화한다.
