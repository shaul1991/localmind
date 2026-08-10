# Goal — 검색 품질 회귀 계약

## 결론

Phase 3는 LocalMind 검색 전체의 완성 선언이 아니다. 개인 노트나 외부 Ollama 없이도 production retrieval 경로를 반복 실행해, 공개 기준선보다 나쁜 회귀를 CI에서 차단하는 첫 측정 단위를 완성한다.

## 사용자 가치

- 검색 변경이 유용한 문서를 상위 결과에서 밀어내면 merge 전에 알 수 있다.
- 개인 노트·credential을 fixture나 evidence에 포함하지 않는다.
- corpus, baseline, production source, report의 결속을 machine-readable manifest로 확인할 수 있다.

## 이번 Phase의 범위

- CC0 공개 합성 corpus 5문서·5질의
- production index/embed/search/query-event 경로
- hit@5, MRR@5, relevant recall@5, expected-document coverage, no-match false-positive rate
- 비차단 p50/p95 latency 관측
- baseline 위반 시 non-zero CLI와 CI test 실패

## 범위 밖

- 실제 개인 노트 relevance
- provider별 embedding 품질·latency 비교
- hybrid search, rerank, threshold 도입
- no-match false-positive rate 개선 자체

이 항목은 후속 작은 Phase/PR로 계산하며 Phase 3 완료를 무기한 막지 않는다.
