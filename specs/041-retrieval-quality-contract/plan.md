# Plan: 검색 품질 측정 계약

## Approach

측정기와 fixture를 먼저 만들고 현재 검색기를 black-box로 평가한다. 검색 알고리즘 변경이나 임계값 적용은
하지 않는다. 계산 로직은 검색 실행과 분리된 순수 함수로 두어 작은 고정 예제로 검증하고, 실제 검색
adapter는 fixture 전용 임시 색인만 사용한다.

## Domain Boundaries

| Boundary | Owns | Must not own |
|---|---|---|
| Fixture contract | 합성 corpus, query ground truth, schema validation | 운영 노트, 실제 개인 질의 |
| Evaluation adapter | fixture 전용 임시 색인 생성, 현재 검색 호출, canonical source 정규화 | 운영 색인 수정, 검색 알고리즘 변경 |
| Metrics core | canonical recall@5, MRR@5, 고유 출처 비율, 분포, ROC-AUC, gate | 파일 I/O, 환경변수, 검색 실행 |
| Search event writer/reader | additive JSONL 필드와 구버전 호환, 운영형 `not_judged` event | fixture ground truth, 관련성 자동 추정, 결과 필터링 |
| Report/CLI | fixture relevance, JSON 보고서, provenance, 한국어 요약, 원자적 명시 output | 품질 실패를 실행 오류로 변환, threshold 적용, 기본 repo artifact 생성 |

## Impacted Areas

- `tests/fixtures/retrieval-quality/`: 고정 corpus 12개와 `queries.ko.json`
- `src/retrieval-quality/`: 순수 metrics/gate, fixture 검색 adapter, report serializer/runner
- 기존 검색 JSONL event type, writer, reader의 additive 필드
- 기존 결과 지표를 표시하는 CLI/report-note/retro-note의 “결과 반환률” 문구(구조·JSON key는 유지)
- 얇은 `scripts/retrieval-quality.ts`와 `package.json`의 `retrieval:quality` script
- fixture, metrics, gate, compatibility, privacy, production-boundary 테스트

기존 `src/brain.ts`의 검색 책임 분해는 042의 범위다. 041 구현은 필요한 최소 호출 경계만 추가하고
대규모 이동이나 리팩터를 하지 않는다. `retrievalEvaluationPort`의 deterministic index 준비, production
search, event drain, immutable runtime projection 네 함수만 추가한다. projection은 값을 소유하지 않고 현재
owner에서 조립하며 logger/report가 ID literal을 복제하지 않는다. 041 완료 전 042를 병렬 구현하지 않는다.

## Implementation Steps

### Phase 0: Baseline and Live Verification

- [x] 현재 검색 entry point, hit의 canonical source/chunk 식별자, 점수 정렬 방향, 실제 알고리즘·임베딩
      식별자를 코드와 기존 테스트로 확인한다.
- [x] 기존 JSONL `success`의 write/read/report 경로를 특성 테스트로 고정하고 사용자 표면에서는
      “결과 반환률”로 설명한다.
- [x] 새 외부 metric 의존성을 추가하지 않고 `spec.md`의 pairwise ROC-AUC와 기존 nearest-index 분위수
      규칙을 손계산 예제로 고정한다. 검색·임베딩 SDK의 변할 수 있는 사실만 최신 T1으로 검증한다.
- [x] 변경 전 고정 임시 색인에서 대표 검색 결과를 characterization fixture로 저장한다. 실제 개인
      노트나 검색어는 사용하지 않는다.

### Phase 1: Failing Tests and Fixed Fixtures

- [x] AC-001과 AC-008의 실패 테스트를 먼저 작성한다.
- [x] `spec.md`에 선언된 12개 합성 Markdown과 40개 질의를 정확히 만든다.
- [x] schema version, ID 유일성, 24/16 구분, 정답 참조, 금지 문자열을 검사하는 validator를 구현한다.
- [x] 고정 `BRAIN_CHUNK_SIZE=400`에서 `EVAL-004`/`EVAL-010`이 각각 2개 이상 chunk인지 검증한다.
- [x] fixture 내용 hash가 파일 순서나 OS 경로 구분자에 따라 달라지지 않도록 정렬·정규화 규칙을 테스트하고,
      정확히 13개 파일의 digest를 validator와 독립된 검토 완료 리터럴로 고정한다. 추가 파일도 거부한다.

(근거: `retrieval-quality-fixture.test.ts` green)

### Phase 2: Pure Metrics and Gate

- [x] AC-002, AC-003, AC-005, AC-006의 손계산 가능한 실패 테스트를 작성한다.
- [x] raw top 5의 첫 canonical source occurrence만 남긴 순위로 recall@5, MRR@5를 계산하고 raw top 5 밖
      hit로 빈자리를 보충하지 않는다. 고유 출처 비율은 raw top 5의 unique source/hit count다.
- [x] 양성·음성 top-score 분포와 동점을 처리하는 ROC-AUC를 구현한다.
- [x] macro recall@5를 점수 분리 조건과 독립 검사하고, 적격 후보 중 가장 큰 유한 threshold를 고르는
      gate와 고정 순서 실패 이유를 순수 함수로 구현한다.
- [x] NaN/Infinity는 평가 오류, 결과 없음은 missing sentinel, 동일 점수는 0.5, 5개 미만 hit와 중복
      chunk는 명시된 지표 규칙대로 처리하는 테스트를 추가한다.
- [x] 높은 점수의 오답만 반환해 AUC와 threshold 조건은 통과하지만 macro recall@5가 0인 반례가 gate에서
      실패하는 테스트를 추가한다.

(근거: `retrieval-quality-metrics.test.ts`, `retrieval-quality-gate.test.ts` green)

### Phase 3: Additive Search Event Contract

- [x] AC-004의 구버전·신버전 JSONL 실패 테스트를 작성한다.
- [x] `outcome`, `relevanceJudgment`, `retrievalAlgorithm`, `embeddingModel`, `topScores`,
      `uniqueSourceCount`를 optional additive 필드로 type/writer/reader에 추가한다.
- [x] 운영 logger의 `relevanceJudgment` 기본값을 `not_judged`로 두고 결과 수나 점수에서 추정하지 않는다.
- [x] 운영 `search_notes`의 결과 있음/없음/예외를 `spec.md` matrix대로 각 1행 기록하고, 예외는 그대로
      다시 던진다. 기존 `ask_brain`/`capture_note` 행과 기록 횟수는 바꾸지 않는다.
- [x] 기존 필드, 파일 위치, append 동작, 오류 처리와 reader fallback을 보존한다.
- [x] 잘못된 optional 필드는 필드 단위로 누락시키고 기존 행은 유지한다. 기존 `successRate` JSON key는
      유지하면서 지정된 CLI/report 문구만 “결과 반환률”로 바꾼다.
- [x] 결과가 있으면 `topScore === topScores[0]`임을 검증하고, logger 실패가 성공 응답 또는 원래 검색
      예외를 바꾸지 않는 두 경로를 각각 테스트한다.
- [x] production 검색 응답은 event write를 기다리지 않되 pending append drain seam을 두고, 평가 runner가
      임시 로그 read/cleanup 전에 await하게 한다. drain은 직전 drain 이후 attempted/succeeded/failed를
      반환·reset하고 정상 40질의에서 40/40/0을 요구한다. sleep/polling delay에 의존하지 않는다.
- [x] `query-report --clean`을 raw-line retention으로 바꿔 최근 확장/unknown/malformed/invalid-ts 행을
      byte-for-byte 보존하고, parse 가능한 유효 ts가 30일을 초과한 행만 제거함을 테스트한다.

(근거: `search-event-contract.test.ts` green)

### Phase 4: Fixture-only Evaluation and Report

- [x] AC-009의 고정 clock·고정 검색 stub과 AC-010의 격리 production-entry 실패 테스트를 작성한다.
- [x] OS 임시 디렉터리에 fixture 전용 색인을 만들고 현재 검색 entry point를 호출하는 adapter를 구현한다.
- [x] evaluation port가 generic scanner/concurrency 대신 정렬된 fixture를 serial로 production chunk/embed/v5
      save/reload하고 실제 index keys/sidecar slots를 단언한다. production hit 순서는 후처리 재정렬 없이
      그대로 수집한다.
- [x] 전체 40개를 평가하고 query ID별 top5 canonical sources, top score, 정답 hit 여부를 report result에
      수집한다. 임시 production JSONL은 질의당 1행과 `not_judged`만 가지며 ground truth를 넣지 않는다.
- [x] query별 `outcome`과 전체 `resultReturnRate`를 정답 recall 및 threshold detection과 별도 report 필드로
      직렬화한다.
- [x] chunk/limit, embedding dimension/implementation/contract fingerprint, synthetic index/query result
      fingerprint와
      `spec.md`의 JSON contract를 생성한다. production과 test-stub baseline eligibility를 분리한다.
- [x] `npm run --silent retrieval:quality -- [--help] [--json] [--output <path>]`의 stdout/stderr/exit 0·1·2
      계약과 한국어
      요약을 구현한다. 품질 gate 실패는 정상 종료 0이다.
- [x] test preload/access guard로 운영형 note/index/query-log 금지 prefix를 받는 모든 path-taking FS API
      접근이 0건임을 증명한다. production module의 사용 method가 guard registry에 없으면 실패하는 coverage
      oracle과 forbidden 차단/기록 및 temp 허용 positive/negative control을 둔다. 바이트·mtime 비교만으로
      읽기 부재를 주장하지 않는다.
- [x] 성공·runner 오류·output rename 오류에서 임시 index/sidecar/query-log/output temp를 `finally`로
      제거하고, 명시하지 않은 output이나 부분 destination이 생기지 않음을 테스트한다.
- [x] output은 `reportType`으로 기존 report를 식별하고 tracked/evaluation-input/symlink/directory target을
      거부한다. same-parent `wx` 0600 random temp collision, 기존 report 보존, 자기 temp만 cleanup하는 경로를
      테스트한다.

(근거: `retrieval-quality-report.test.ts`, `retrieval-quality-adapter.test.ts`, `retrieval-quality-guard.test.ts`,
`retrieval-quality-cli.test.ts` green)

### Phase 5: No-filter Boundary and Regression

- [x] AC-007은 실제 temp-file sink와 test-only no-op sink를 비교한다. 새 production env/flag를 추가하지 않는다.
- [x] threshold candidate가 report 객체 밖의 검색/MCP/web 호출 경계로 전달되지 않음을 검증한다.
- [x] 전체 typecheck, unit/integration test, fixture privacy scan을 실행한다.
- [x] 같은 commit/fixture에서 production search entry 평가를 서로 다른 임시 디렉터리로 두 번 실행해 hit
      순서, 순위 지표, fingerprint, threshold, gate가 같은지 비교한다.
- [x] clean, evaluation-input dirty, 범위 밖만 dirty인 fixture에서 세 provenance flags와 경고를
      검증한다. evaluation input pathspec에는 041 goal/spec 정본도 포함한다. test stub은 항상 ineligible이며
      worktree output도 고정 이유로 ineligible이다. flags는 artifact 생성 전 snapshot이며 공식 baseline은
      repository output을 쓰지 않고 evaluation input pathspec이 HEAD와 같은 production embedding 실행으로
      제한한다.
- [x] 평가 JSON과 요약에 기준선 수치를 기록하되 gate 실패를 숨기거나 알고리즘 개선으로 포장하지 않는다.

(근거: `retrieval-quality-boundary.test.ts` green, 전체 npm test 685/685·typecheck clean)

### Phase 6: Adversarial Self-review and SDD Closure

- [x] `goal.md` Objective/Success Metrics -> `spec.md` FR/AC -> 테스트를 1:1 추적한다.
- [x] 양성·no-match, 중복 chunk, 동점, missing result, NaN/Infinity, 구버전 JSONL, 운영 비필터링,
      개인정보 경계를 결함을 찾는 관점에서 재검토한다.
- [x] 최신 외부 사실을 사용한 모든 지점에 live official verification 근거가 있는지 확인한다.
- [x] 명백한 결함을 모아 수정하고 테스트·self-review를 다시 수행한다.
- [x] clean이면 세 SDD 문서의 FR/AC/단계/Success Metrics에 `[x]`와 테스트 근거를 남긴다. 미충족은
      체크하지 않고 이유를 쓴다.
- [x] `/goal 041` 실행일 때만 AGENTS.md 규약에 따라 self-review 요약을 포함해 commit/push하고 전체
      SHA로 CI를 감시한다. (이 커밋에서 수행 — self-review 요약 포함 commit/push + `gh run watch <full-sha>`)

## Test Strategy

| Test lane | Scenarios | Maps to | Status |
|---|---|---|---|
| Fixture validation | count, duplicate ID, missing relevant ID, no-match with answer, forbidden private data | AC-001, AC-008 | [x] |
| Metric unit | first/fifth/missing relevant hit, duplicate chunks, canonical rank shift, fewer than 5 hits | AC-002 | [x] |
| Score/AUC unit | ties, negative values, no results, nearest-index quantiles, known pairwise AUC | AC-003 | [x] |
| Gate unit | pass, low relevance, high-score wrong docs, low AUC, no eligible threshold, multiple eligible thresholds | AC-005, AC-006 | [x] |
| JSONL compatibility | legacy/extended row, topScore equality, result/no-result/error, logger failure, raw-line clean retention, ask/capture unchanged, invalid optional field | AC-004 | [x] |
| Evaluation integration | production entry twice, FS deny+coverage guard, 40 one-row not-judged events, no hit reorder, identifiers/fingerprints, outcome/return rate, cleanup, deterministic JSON | AC-001, AC-009, AC-010 | [x] |
| Production boundary | temp-file vs test-only no-op sink equality, candidate threshold has no consumer | AC-007 | [x] |
| Privacy | absolute paths, token patterns, actual query import, snapshot duplication | AC-008 | [x] |
| CLI | default/help/json/output modes, no implicit artifact, atomic rename, exit 0/1/2, temp cleanup | AC-011 | [x] |

## Rollout and Failure Handling

- 041은 검색 결과를 바꾸지 않으므로 별도 데이터 migration이나 feature flag가 필요하지 않다.
- 기존 JSONL row에는 새 필드가 없음을 정상 상태로 취급한다. backfill하지 않는다.
- 평가 색인 생성 실패, fixture schema 오류, 비유한 검색 점수는 실행 오류로 명확히 보고한다.
- 품질 gate 실패는 정상 측정 결과다. 보고서에 실패 이유를 유지하고 운영 동작을 바꾸지 않는다.
- 현재 검색 식별자를 얻지 못하면 `unknown`으로 조용히 대체하지 않고 구현을 중단해 Open question으로
  기록한다. 비교 불가능한 기준선을 만들지 않는다.

## Definition of Done

- 모든 FR이 하나 이상의 통과한 AC 테스트와 연결되고 AC-001~AC-011에 자동 근거가 있다.
- 공개 corpus 12개, 양성 24개, no-match 16개가 고정되고 개인정보 검사를 통과한다.
- 결과 반환 관측값과 다섯 종류 품질 지표, 정답 관련성·점수 분리를 모두 검사하는 predeclared gate가
  결정적으로 산출된다.
- legacy/new JSONL 호환과 `not_judged` 기본값이 검증된다.
- 운영 검색 결과가 변경되지 않음을 integration test로 증명한다.
- stable CLI, provenance fingerprint, FS read-deny, 원자적 output과 temp cleanup이 자동 검증된다.
- self-review에서 치명·중대 결함 0, 전체 테스트 green, live-verify 상태가 명시된다.
