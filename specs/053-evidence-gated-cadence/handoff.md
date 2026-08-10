# Handoff — Phase 6

## 구현 표면

- `scripts/evidence-cadence.mjs`: schema/state machine, hash chain, sequence-segment reader/writer, bounded stdin CLI
- `scripts/evidence-cadence.test.mjs`: proposal, privacy, transition, lifecycle, persistence, concurrency, alias regressions
- `docs/evidence-cadence.md`: 사용법, 보안 경계, 정직한 한계

## 재개 규칙

candidate bytes가 바뀌면 이전 frozen gate와 독립 review를 폐기한다. 정확한 latest candidate에서 targeted/full gates, 독립 START/END fingerprint, blocker 0을 다시 확인한다. 자동 schedule·push·merge는 수행하지 않는다.
