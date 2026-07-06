# Plan: 한국어 임베딩 A/B 하네스

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑한다. 상위: [goal](goal.md) · [spec](spec.md) -->

> **Live-Verify 먼저(Phase 0)**: 모델 태그·dims·context는 착수 시 ollama·HF에서 라이브 확인 후
> 진행한다. 아래 수치는 조사분(확정 아님).

## 접근 요약
<!-- 핵심 기술 접근 1~2단락. -->

**비파괴 오프라인 하네스**로 간다. 운영 bge-m3 색인은 그대로 두고, qwen3-0.6b를 **별도 인덱스
경로**에 임베딩한 뒤, 라벨링 한국어 질의셋으로 두 인덱스에 질의해 recall@k·MRR을 계산하고
리포트를 낸다. 기존 `brain.ts` 임베딩·사이드카·검색 로직을 최대한 재사용하되, 실험은 운영과
격리된 경로/파라미터로 수행한다(Simplicity First — 새 검색엔진 만들지 않음).

## 도메인 경계 (DDD)
<!-- bounded context·도메인 모델·유비쿼터스 언어. 변경이 닿는 도메인 경계. -->

- 이 작업은 **실험·툴링** 관심사다. 도메인 모델 변경 없음. 신규 용어 없음(embedding model·index·
  recall@k·query set — 기존/표준어). glossary 무변경.
- `brain.ts`의 임베딩·사이드카·유사도 검색을 **재사용**한다(포트: ollama 임베딩 클라이언트).
  실험 코드는 `scripts/`에 두어 운영 경로와 분리.

## 영향 모듈
<!-- 수정/신규 파일·경로. (예: 수정 X, 신규 Y, 무변경 Z) -->

- **신규** `scripts/embed-bench.ts` — A/B 하네스(질의셋 로드 → 두 모델 색인에 질의 → recall@k·
  MRR → 리포트).
- **신규** `specs/036-embedding-korean-eval/queries.ko.json`(또는 fixtures) — 라벨링 질의셋
  (질의 텍스트 + 기대 노트/청크 id 목록). 버전드.
- **신규** `src/eval-metrics.ts` + `eval-metrics.test.ts` — recall@k·MRR·cosine 순수 함수+단위
  테스트(기존 테스트 글로브가 커버하도록 src/에 배치).
- **무변경** `src/brain.ts` — 파라미터화 불필요(하네스 독립 임베드로 충분 — Simplicity First).
- **무변경** 운영 `.brain-index`·bge-m3 설정·litellm·`.env`(EMBEDDINGS_MODEL) — 완전 비파괴.

## 단계 (task 분해 가능)
<!-- 순서·의존이 드러나게. self-review clean 후 완료된 단계는 [ ]→[x]로 표기. -->
- [x] 0. **Phase 0 라이브 확인**: qwen3-0.6b 실태그·dims·context 확인. *`ollama pull
      qwen3-embedding:0.6b`; dims 1024(bge-m3와 동일), context 32768, 595.78M — 라이브 확인.*
- [x] 1. **하네스 계산 로직 TDD**: recall@k·MRR 순수 함수(AC-7). *`src/eval-metrics.ts` +
      `eval-metrics.test.ts` 9/9(합성 세트 손계산 일치). (테스트는 src/로 배치 — 기존 글로브 커버.)*
- [x] 2. **한국어 질의셋 구축**: 질의 20개 + gold 라벨. *`queries.ko.json`. 코퍼스는 저장소
      한국어 문서(비민감·재현) — 개인 벌트 원문 미노출, 동일 하네스로 벌트 재실행 가능.*
- [x] 3. **비파괴 실험**: 하네스가 파일 읽기+ollama만 — 운영 색인 미접근(brain.ts 무변경).
      *AC-5. brain.ts 파라미터화 불필요(Simplicity First — 독립 임베드로 충분).*
- [x] 4. **A/B 실행 + 자원 실측**: 두 모델 임베딩→recall@k·MRR + GPU 풋프린트·지연 기록.
      *AC-2·4. bge-m3 12.2s/qwen3 19.5s. qwen3 GPU OOM(경합)→num_ctx 2048로 해소.*
- [x] 5. **리포트 + 결정 게이트**: 러너가 집계·델타·권고 출력. *AC-3·6 → 유지(bge-m3).*
- [x] 6. **결론 표기**: 결과를 goal/spec에 표기(결과 절·caveat). 채택 결정 아님(유지)이라 운영
      전환 후속 불요. 재실행(실벌트) 권장만 명시.

## 테스트 전략
<!-- 각 AC를 어느 레벨 테스트(단위/통합/E2E)로 검증할지. TDD로 작성.
     상태 컬럼은 self-review clean 후 [x] green(또는 실증 근거)으로 채운다. -->
| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 질의셋 | 검증 | `queries.ko.json` 20개+gold | [x] |
| AC-2 측정 | 도그푸드 | 두 모델 임베딩→recall@k·MRR 산출 | [x] |
| AC-3 리포트 | 도그푸드 | 집계·델타·권고 출력 | [x] |
| AC-4 16GB | 관측 | 완료 O / qwen3 GPU OOM→num_ctx 튜닝 필요 | [~] 발견 부기 |
| AC-5 비파괴 | 검증 | 하네스가 운영 색인 미접근(설계상) | [x] |
| AC-6 결정 게이트 | 판정 | 임계 대비 → 유지(bge-m3) | [x] |
| AC-7 계산 정확성 | 단위 | eval-metrics.test 9/9 | [x] |

- **결정론 단위(AC-7)** 는 fake 세트로 TDD. **A/B 결과(AC-2~4·6)** 는 실벌트 **도그푸드**가
  본질(헌법 §8 "테스트 green + 도그푸드"). 실벌트 수치는 재현 가능하나 값 자체는 데이터 의존.
- 프라이버시: 질의셋·리포트에 노트 **원문 대신 id/제목 위주**로(민감 내용 최소 노출).

## Open questions
<!-- plan 차원의 미결정(드라이버 선택·배치 등). -->
- `brain.ts` 별도 인덱스 경로 파라미터화가 필요한지, 하네스 독립 임베드로 충분한지(3단계에서 판정).
- 질의셋을 specs 폴더 vs 노트 폴더 어디에 둘지(민감도 — id 위주면 specs 가능).
- 리포트 산출물 위치·형식(md 표 + 콘솔).
