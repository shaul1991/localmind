# Goal — Phase 6 evidence-gated cadence

LocalMind 코어 개선 후보가 민감 원문이나 무한 schedule에 의해 자동 구현되지 않도록, 최소 evidence와 사람 승인에 결속된 append-only ledger를 제공한다.

## 성공 기준

- 첫 cycle은 bootstrap이고 목표별 iteration은 최대 5회다.
- 명시 trigger·before metric·재현/가설/fixture/stop-condition hash 없이는 proposal을 만들 수 없다.
- 별도 human authorization hash 없이는 구현을 시작할 수 없고 전역 구현 WIP는 1개다.
- validated/rejected는 lesson·residual-risk evidence를 남기며 replace/maintain/revalidate가 append-only다.
- raw query·note content·path는 저장·CLI 출력·오류에 들어가지 않는다.
- concurrent append, chain tamper, symlink/hard-link alias는 fail-closed한다.

## 비범위

scheduler, research agent/critic/persona, 자동 구현, 자동 merge, 전자서명/ACL 저장소, Windows 지원, hostile root 방어는 만들지 않는다.
