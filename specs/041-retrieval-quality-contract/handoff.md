# Handoff — 041 검색 품질 회귀 계약

## 현재 상태

Phase 3 v1 candidate는 공개 CC0 합성 corpus 5문서·5질의를 production retrieval 경로로 실행하고, positive relevance baseline 회귀를 CI에서 차단한다. 전체 검색 품질의 완성이나 실제 provider 품질 증명은 아니다.

## v1 완료 범위

- `npm run eval:retrieval -- --corpus … --baseline … --report … --manifest …`
- hit@5, MRR@5, relevant recall@5, expected-document coverage, no-match FPR
- corpus canonical relevance와 returned document 재검증
- duplicate chunk document-level de-duplication
- query event drain 5/5
- machine-readable ranked source·runtime·p50/p95 timing·provenance
- loopback deterministic embedding, temp HOME/index/log, 외부 network·개인 노트 미사용
- normal baseline exit 0, regression exit 1, malformed input exit 2

## 다음 작은 개선 후보

아래는 기존 확대 초안의 유효한 연구 방향이지만 v1 blocker가 아니다. 각각 별도 TDD slice로 계산한다.

1. corpus를 12문서·40질의로 확장하고 near-miss no-match를 강화한다.
2. unique-source ratio, score distribution, ROC-AUC와 후보 threshold를 **보고만** 한다.
3. 실제 provider별 한국어 embedding 비교를 별도 opt-in evidence로 만든다.
4. relevance threshold, hybrid retrieval, rerank는 측정 결과와 별도 제품 결정 후 도입한다.
5. no-match FPR baseline을 현재 1.0에서 단계적으로 낮춘다.

## 재개 조건

다음 작업은 v1 report에서 관측된 한 가지 metric 또는 실패 유형을 골라 좁은 완료 기준을 먼저 고정한다. 12/40 확장 전체를 한 번에 완료해야만 다음 개선을 인정하는 방식으로 되돌리지 않는다.
