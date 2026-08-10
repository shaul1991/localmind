# Spec — Retrieval Quality Contract v1

## FR-1 공개 corpus

`fixtures/retrieval-quality/public-synthetic-v1/`은 CC0 합성 Markdown 5개와 positive 4개·no-match 1개 질의를 제공한다. document/query ID는 고유하며 document는 corpus root 내부의 symlink 아닌 `.md` regular file이어야 한다.

## FR-2 production 경로

`npm run eval:retrieval -- --corpus … --baseline … --report … --manifest …`는 loopback deterministic embedding server를 사용하되, 색인과 검색은 `brain.retrievalEvaluationPort`의 production chunk/embed/index/save/reload/search 경로를 사용한다. 외부 network·실시간 Ollama·개인 HOME을 사용하지 않는다.

## FR-3 metric 정본성

metric row는 corpus query ID·canonical relevance·known returned document에 다시 결속한다. 같은 문서의 여러 chunk는 recall에서 한 document로 계산한다.

- `hitAtK`: positive query 중 relevant document가 하나 이상 반환된 비율
- `mrrAtK`: positive query의 첫 relevant rank reciprocal 평균
- `relevantRecallAtK`: 반환된 고유 relevant document / 기대 relevant document
- `expectedDocumentCoverage`: 한 번 이상 찾은 기대 document / 전체 기대 document
- `noMatchFalsePositiveRate`: no-match query 중 결과가 하나 이상 반환된 비율

## FR-4 baseline과 종료 코드

minimum metric 미달 또는 maximum metric 초과는 report에 deterministic violation으로 기록하고 exit 1을 반환한다. malformed corpus/baseline/CLI는 exit 2다. 최초 baseline은 positive metric 1.0을 요구한다. production relevance threshold가 아직 없으므로 no-match FPR 1.0은 잔여 위험으로 명시해 허용한다.

## FR-5 report와 provenance

report는 schema, corpus, runtime, metrics, baseline, timing, drain, ranked result, violation, pass/fail을 JSON으로 기록한다. timing은 host variance 때문에 관측만 하고 gate하지 않는다. manifest는 corpus·baseline·각 document·runner/evaluator/testkit/brain source·report SHA-256과 runtime을 기록하며 임시 절대경로를 포함하지 않는다.

## FR-6 재현성

같은 source/corpus/baseline의 품질 metric, ranked result, corpus/document/source/runtime manifest는 실행 위치와 무관하게 동일하다. wall-clock timing과 그에 따라 바뀌는 report digest는 deterministic 비교 대상이 아니다.

## Acceptance Criteria

1. 정상 baseline은 exit 0, strict no-match baseline은 exit 1이다.
2. positive metric은 모두 1.0이고 query event drain은 5/5 성공이다.
3. duplicate chunk가 recall을 1보다 크게 만들지 않는다.
4. forged relevance·unknown document·path traversal을 fail-closed한다.
5. 두 temp root 실행의 deterministic projection이 동일하다.
6. 전체 Node/typecheck/build/shell/diff gate가 유지된다.
