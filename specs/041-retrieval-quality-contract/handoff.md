# Implementation Handoff: 041 검색 품질 측정 계약

## Handoff Status

2026-07-11 문서 readiness 재검에서 blocker/high finding 0건으로 닫혔다. 제품 구현은 시작하지 않았고
`goal.md` Success Metrics, `spec.md` FR/AC, `plan.md` 단계 체크는 모두 미완료 상태다. 이 문서는 구현
모델에게 전달할 준비가 됐다는 뜻이지 041 기능이 완료됐다는 뜻이 아니다.

아래 프롬프트 전문을 구현 모델에게 그대로 전달한다.

---

당신은 localmind 저장소의 `/goal 041` 구현 담당자다. 목표는 검색 알고리즘을 개선하는 것이 아니라,
개선 전에 품질을 재현 가능하게 측정하는 계약을 구현하는 것이다. 작업 전 저장소 루트 `AGENTS.md`와
다음 문서를 모두 읽어라.

- `specs/041-retrieval-quality-contract/goal.md`
- `specs/041-retrieval-quality-contract/spec.md`
- `specs/041-retrieval-quality-contract/plan.md`
- 관련 선행 문서 `specs/004-failure-query-analysis/`, `specs/025-search-observability/`,
  `specs/036-embedding-korean-eval/`

## Role and Working Method

- backend/data 품질 구현자로 행동하되 최종 self-review에서는 구현을 방어하지 말고 결함을 찾아라.
- TDD 순서를 지켜라: AC별 실패 테스트 -> 최소 구현 -> 리팩터 -> 전체 회귀 -> 적대적 self-review.
- 구현 전에 현재 검색 entry point, JSONL writer/reader, hit source ID, 점수 정렬 방향, 알고리즘과 실제
  임베딩 모델 식별자를 코드로 확인하라. 이 handoff의 기억이나 예시는 현재 사실의 근거가 아니다.
- 별도 subagent를 쓸 수 있으면 최종 critic을 분리된 컨텍스트에서 실행하라. 불가능하면 새 체크리스트로
  직접 재검토하라.

## Required Outcome

1. `spec.md`에 고정된 공개 합성 Markdown 12개와 질의 40개를 정확히 구현한다. 양성은 24개,
   `relevantDocIds: []`인 명시적 no-match는 16개다. canonical body/frontmatter와 query의 key 순서,
   category/rationale 문구를 임의로 바꾸지 마라. 평가 `BRAIN_CHUNK_SIZE=400`에서 EVAL-004와 EVAL-010이
   각각 2개 이상 chunk인지 검증하라.
2. fixture 전용 임시 색인에서 현재 검색 경로를 실행한다. 운영 색인, 운영 JSONL, 실제 note repo는
   평가 입력이나 출력으로 사용하지 마라. fixture 파일/chunk 삽입 순서만 고정하고 production이 반환한
   hit 순서는 동점까지 그대로 사용하라. adapter가 별도 chunk ID를 만들거나 재정렬하지 마라.
3. production raw top 5 안에서 canonical source의 첫 occurrence만 남긴 순위로 recall@5와 MRR@5를
   계산한다. raw top 5 밖 hit로 중복 자리를 보충하지 마라. 예를 들어 `A1, A2, relevant-B`이면 B의
   reciprocal rank는 `1/2`다. top5 고유 출처 비율, 양성/음성 top score 분포와 ROC-AUC도 계산한다.
4. 정답 문서 기준 `macro recall@5 >= 0.90`, `ROC-AUC >= 0.90`, 동일한 단일 threshold에서 양성 탐지율
   `>= 0.90`, 음성 FPR `<= 0.10`을 모두 만족할 때만 pass인 측정 gate를 구현한다. 양성 탐지율은 점수
   threshold의 `TP/24`이며 정답 hit recall이 아니다. 높은 점수의 오답만 반환하면 AUC가 좋아도 fail이어야
   한다. 여러 적격 threshold가 있으면 가장 큰 유한 값을 고른다.
5. 기존 JSONL 계약에 optional additive 필드 `outcome`, `relevanceJudgment`, `retrievalAlgorithm`,
   `embeddingModel`, `topScores`, `uniqueSourceCount`를 추가한다. 기존 필드를 삭제하거나 타입/의미를
   바꾸지 마라. 운영 `search_notes`는 결과 있음/없음/예외를 spec matrix대로 정확히 1행 기록하되
   예외를 삼키지 말고 그대로 다시 던져라. 결과가 있으면 `topScore === topScores[0]`이어야 하고 logger
   실패는 성공 응답이나 원래 검색 예외를 바꾸면 안 된다. `query-report --clean`은 raw line을 기준으로
   유효 ts가 30일을 초과한 행만 제거하고 최근/unknown/malformed/invalid-ts 행을 byte-for-byte 보존한다.
   `ask_brain`/`capture_note` 기록은 바꾸지 마라. 기존
   `success` 표시는 새 평가 보고서와 `query-report`/report-note/retro-note 표시에서 “결과 반환률”로
   설명하되 `successRate` JSON key, 웹 UI, MCP 응답은 바꾸지 마라.
6. 운영 검색의 관련성은 자동 판정하지 않는다. fixture runner도 production `searchNotes`를 부르므로 임시
   JSONL에는 질의마다 정확히 1행의 `not_judged` event만 남긴다. ground truth의 `relevant`/
   `not_relevant`는 evaluation query result와 보고서에만 붙이고 event/API 인자로 주입하지 마라.
7. 후보 threshold는 평가 JSON과 요약에만 존재해야 한다. 검색, recall, ask, MCP, 웹 응답에서 결과를
   걸러내거나 순위를 바꾸는 코드에 연결하지 마라.
8. 실제 개인 질의, 사용자 홈 절대경로, token/secret, 실제 note 내용은 fixture, snapshot, sample report,
   commit message에 넣지 마라. 운영형 note/index/query-log 경로의 읽기와 쓰기를 모두 금지하고 자동
   access guard로 0건임을 증명하라.

## Interfaces to Implement

- Fixture validator: schema version, exact counts, unique IDs, relevant ID references, no-match empty answers,
  forbidden private material을 검사한다.
- Pure metrics API: 검색 결과와 ground truth를 입력받아 per-query와 aggregate recall@5, reciprocalRankAt5,
  unique-source ratio, distributions, ROC-AUC를 반환한다. 새 외부 metric 의존성을 추가하지 말고
  `spec.md`의 nearest-index 분위수와 pairwise AUC 공식을 그대로 구현한다. 파일 I/O나 전역 설정에
  의존하지 않게 하라.
- Pure gate API: macro recall@5와 top score labels를 받아 single threshold candidate, confusion matrix,
  positive detection rate, FPR, pass/fail reasons를 반환한다. 적격 threshold가 없으면 candidate 전체가
  `null`이며 임의 confusion 값을 만들지 않는다.
- Evaluation adapter: 합성 fixture를 임시 색인으로 만들고 현재 production search entry point를 호출한다.
  production raw hit 순서를 보존하고 fixture relevance는 report result에서만 계산한다. query별 `outcome`과
  aggregate `resultReturnRate`를 정답 recall 및 threshold detection과 별도 필드로 둔다.
- Search event compatibility: legacy row와 extended row를 같은 reader가 읽고 writer는 새 필드를 additive하게
  기록한다. 잘못된 optional 필드는 행 전체가 아니라 해당 필드만 누락시킨다. production 응답은 기존처럼
  append를 기다리지 않되 pending write drain seam을 제공하고 runner는 temp log read/delete 전에 await한다.
  sleep이나 임의 polling delay로 event cardinality를 맞추지 않는다.
- Report serializer/CLI: canonical package script 명령은
  `npm run --silent retrieval:quality -- [--help] [--json] [--output <path>]`
  하나다. 기본은 한국어 요약만 stdout, `--help` 단독은 runner 없이 한국어 usage와 exit 0, `--json`은
  JSON만 stdout, `--output`은 동일 JSON bytes를 명시 경로에
  temp+rename으로 기록한다. 명시하지 않은 파일은 만들지 마라. 상대 path는 cwd 기준이며 parent는 이미
  존재해야 한다. tracked/evaluation-input/symlink/directory target은 거부하고, target이 없거나 기존
  `reportType:"localmind-retrieval-quality"`, `schemaVersion:1` report일 때만 생성/교체한다. same-parent temp는
  random suffix와 exclusive `wx` 0600을 쓰고 자기 temp만 cleanup한다. gate fail은 0, runtime/schema 오류는
  1, usage 오류는 2다. 부분 JSON이나 부분 destination을 남기지 않는다.
- Provenance: HEAD 전체 SHA와 `workingTreeDirty`/`evaluationInputsDirty`/`baselineEligible` 및 이유를 기록한다.
  evaluation input에는 041 goal/spec 정본도 포함한다. dirty 실행은 테스트·진단에 쓸 수 있지만 공식
  기준선으로 부르지 않는다. 범위 밖 사용자 변경은 보존하고 eligibility에서 제외한다. provenance는 artifact
  생성 전 capture하며 worktree output은 별도 이유로 ineligible이다. chunk size 400, retrieval limit 5,
  actual embedding dimension, stable implementation/contract fingerprint, 13-file fixture
  hash, reloaded synthetic index fingerprint, raw top-5 query-result fingerprint를 기록한다. endpoint는 hash도
  공개 report에 넣지 않는다. test stub은 항상 baseline ineligible다. self-review clean 후
  041 관련 파일을 commit한 다음 repo에 산출물을 쓰지 않는 production-embedding eligible 실행으로 공식
  baseline을 한 번 생성해 최종 보고에 남긴다.
- Lifecycle: 성공, validation/search 오류, output rename 오류 모두에서 임시 index, vector sidecar, query log,
  output temp를 `finally`로 제거한다.

새 계산/runner/serializer는 `src/retrieval-quality/`, CLI는 `scripts/retrieval-quality.ts`에 둔다. JSONL은
기존 `src/query-analysis.ts` type/reader와 `src/brain.ts` logger/search wrapper만 최소 확장한다.
`src/brain.ts`의 internal `retrievalEvaluationPort`는 `prepareDeterministicIndex(orderedFixturePaths)`, production
`searchNotes`, `drainQueryEvents()`, `readRuntimeSnapshot(retrievalLimit)`만 노출한다. deterministic prepare는
generic scanner/concurrency를 쓰지 않고 기존 chunk/embed/v5 save/reload를 serial fixture order로 재사용한다.
drain은 직전 drain 이후 `{attempted,succeeded,failed}`를 반환·reset하며 정상 평가에서는 정확히 40/40/0을
요구한다. 원래 검색 예외가 있으면 drain 실패가 이를 대체하지 않는다.
runtime snapshot은 각 owner 값을 모은 immutable projection이지 새 state owner가 아니다. 알고리즘/
implementation ID literal은 production owner 상수 하나를 공유한다. Retriever/QueryEventWriter/IndexStore
추출과 `src/brain.ts` 대규모 이동은 042의 작업이며, 042는 이 port를 보존하거나 adapter와 함께 migrate한다.
구현 순서는 041 -> 042 -> 043이며 병렬 구현하지 않는다.

## Mandatory Test Sequence

1. AC-001/AC-008: exact 13-file count, independent fixture digest, schema, references, synthetic-only privacy.
2. AC-002/AC-003: 손계산 가능한 canonical top-5 순위, duplicate chunks/rank shift, ties, negative scores,
   no result, distribution/AUC.
3. AC-005/AC-006: passing gate, low macro recall, high-score wrong-doc counterexample, low AUC, missing eligible
   threshold, deterministic largest threshold.
4. AC-004: legacy/extended JSONL, topScore/topScores equality, result/no-result/error one-row cardinality, logger
   failure non-interference, original-error preservation, raw-line `query-report --clean` retention, invalid optional
   fields. recent malformed/unknown/invalid-ts line도 보존한다.
5. AC-009: fixed clock/search stub로 두 번 생성한 report payload 동일성.
6. AC-010: 서로 다른 temp root의 격리 자식 프로세스와 production entry로 40개 평가를 두 번 실행한다.
   guard forbidden stat/read/write 차단·기록과 temp allow control을 먼저 증명하고 reset한다. 이후
   forbidden-prefix FS access 0건과 production FS method/guard registry coverage, deterministic v5 key/sidecar
   order, 임시 JSONL 40개
   `not_judged`, report-only relevance, runtime IDs/fingerprints, outcome/return rate, 두 실행의 hit/metric/gate
   동일성, success/error cleanup을 검증한다.
   temp env와 access guard는 production brain module 최초 import 전에 설치한다.
7. AC-007: temp-file sink와 test-only no-op sink에서 hit ID/order/count/score 완전 동일; 새 production
   flag/env 없음; threshold consumer 없음.
8. AC-011: default/`--help`/`--json`/`--output`, npm preamble 없는 stdout, no implicit artifact, protected target,
   prior valid report replacement, exclusive temp collision, worktree-output ineligibility, atomic write, exit 0/1/2,
   failure cleanup.
9. 현재 저장소의 전체 typecheck, unit/integration test, privacy scan, 실제 fixture evaluation 두 번.

각 테스트 이름 또는 시나리오를 `spec.md`의 해당 AC에 검증 근거로 남겨라. 전체 테스트가 환경 문제로
실행되지 않으면 원인과 실행하지 못한 범위를 정확히 보고하고 green이라고 표현하지 마라.

## Live-Verify Gate

- 임베딩 SDK 또는 검색 SDK의 거동·버전·모델명을 코드나 문서에 넣기 전 최신 공식 문서 또는 원 논문
  (T1)을 라이브 조회하라. metric 계산에는 새 외부 라이브러리를 도입하지 않는다.
- ROC-AUC 동점과 분위수 규칙은 `spec.md`의 고정 계약을 따르고 손계산 테스트로 증명한다. 현재 검색의
  score 방향과 `cosine-full-scan-v1` 식별자가 실제 코드와 일치하는지, runtime embedding model 값을
  올바르게 읽는지는 구현 직전 로컬 코드와 테스트로 확인한다.
- 공식 근거를 조회할 수 없으면 새 사실을 확정하지 말고 Open question과 검증 task로 남겨라. 측정
  계약과 맞는 작은 순수 구현으로 대체할 수 있으면 손계산 테스트로 증명하라.

## Stop Conditions

다음 중 하나면 임의로 진행하지 말고 사용자에게 보고하라.

- 현재 검색기가 canonical source ID 또는 원점수를 제공하지 않아 계약을 지킬 수 없다.
- 기존 `success` 의미가 문서의 “결과 반환”과 충돌하고 호환 변경만으로 해결할 수 없다.
- fixture 평가를 위해 production 색인이나 실제 사용자 note를 수정해야 한다.
- fixture 평가가 production note/index/query-log의 읽기를 피할 수 없거나 access guard를 우회해야 한다.
- threshold를 운영 결과에 적용해야만 테스트를 통과하는 구조다.
- 새 외부 dependency가 필수인데 최신 공식 계약을 확인할 수 없다.
- 기존 코드와 041 문서가 충돌해 어느 쪽을 정본으로 삼을지 제품 결정이 필요하다.

## Self-review and Completion

구현 후 다음을 결함을 찾는 관점에서 검토하라.

1. goal의 각 Objective/Success Metric, 모든 FR, 모든 AC가 구현과 테스트에 1:1 연결되는가.
2. 24 positive/16 no-match, exact identifier/digest, 한국어 의역, near-miss, duplicate canonical rank,
   missing result, ties, non-finite score가 실제 테스트되는가.
3. 결과 반환·정답 recall·점수 탐지를 혼동하거나 AUC/gate의 분모·비교 연산·threshold 선택에 경계 오류가
   없는가. 높은 점수 오답 반례가 gate를 통과하지 않는가.
4. 실제 검색어 유출, 운영 경로 read/write, JSONL ground-truth 오염, JSONL 호환 파괴, temp artifact 누수,
   불필요한 dependency나 042 범위 선점이 없는가.
5. 변할 수 있는 외부 사실이 최신 공식 문서(T1)로 검증되었고 미검증 사실은 정직하게 표시되었는가.

명백한 결함은 모아서 수정하고 테스트와 review를 다시 수행하라. clean이면 `goal.md` Success Metrics,
`spec.md` FR/AC, `plan.md` 단계·테스트 전략에 `[x]`와 구체 테스트 근거를 기록하라. 미충족은 체크하지
말고 이유를 부기하라. `/goal 041`이므로 clean일 때만 AGENTS.md 규약에 따라 self-review 요약을 담아
commit/push하고, 전체 commit SHA로 CI를 감시하라. clean이 아니면 commit하지 말고 결함을 보고하라.

---
