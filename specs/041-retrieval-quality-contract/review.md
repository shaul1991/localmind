# Review — Phase 3 검색 품질 회귀 게이트

## 동결 범위

공개 synthetic corpus, production retrieval 실행, metric 정본성, baseline non-regression, report/provenance 재현성만 평가한다. 실제 provider 품질, 개인 corpus, hybrid/rerank/threshold는 잔여 위험이며 blocker가 아니다.

## 구현 증거

- missing runner: RED → CLI/report/manifest GREEN
- duplicate relevant chunks: recall 2 RED → 고유 document recall 1 GREEN
- timing section missing RED → p50/p95 비차단 관측 GREEN
- forged relevance/unknown returned document RED → corpus-bound validation GREEN
- strict no-match baseline: exit 1, violation report 생성

## 잔여 위험

- 현재 production 검색은 relevance threshold가 없어 no-match query에도 결과를 반환한다. v1 baseline은 이를 숨기지 않고 FPR 1.0으로 기록한다.
- fixture lexical embedding은 production 경로의 회귀 재현용이지 실제 provider 품질의 대체 증거가 아니다.
- latency는 machine-readable 관측값이나 host variance 때문에 이번 Phase의 pass/fail에는 사용하지 않는다.

## 최종 gate

- targeted: 6/6
- 전체 Node: 318/318, 52 suites
- shell: 23/23
- typecheck/build/diff: GREEN
- 최신 docs-inclusive candidate를 frozen artifact와 독립 범위 제한 검토로 확인한 뒤 commit한다.
