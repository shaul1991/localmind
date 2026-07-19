---
title: No-path write gate dogfood
audience: ai
---

# AC-5 no-path dogfood

- executor: isolated agent
- invocation: explicit `research-evidence-pack`, report/ledger 전달, 출력 경로 미제공
- response: `출력 경로가 확인되지 않아 증거 패키지 생성을 시작하지 않았습니다. 저장할 프로젝트 내부 디렉터리의 정확한 경로를 지정해 주세요.`
- reported action: 경로 확인 요청
- reported writes: 0
- reported opens: 0
- watch directory entries before/after: 0 / 0
- LocalMind `git status --porcelain=v1` SHA-256 before/after:
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` /
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- verdict: pass
