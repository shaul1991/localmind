# Goal: 검색 품질 측정 계약

## Background

localmind의 검색은 결과와 점수를 반환하고 검색 이벤트를 JSONL로 남길 수 있지만, 현재 관측값만으로는
"검색 결과가 하나 이상 반환되었다"와 "사용자의 질문에 관련된 결과가 반환되었다"를 구분할 수 없다.
결과 반환률이 높아도 관련성 품질이 높다는 뜻은 아니며, 고정된 정답셋과 반복 가능한 평가 절차가 없으면
검색 알고리즘, 임베딩 모델 또는 점수 임계값 변경의 효과를 비교할 수 없다.

이 작업은 검색 동작을 바꾸기 전에 측정 기준을 먼저 만든다. 공개 가능한 합성 corpus와 정답 질의를
저장소에 고정하고, 관련성 지표와 점수 분포를 산출하며, 운영 로그에는 기존 소비자를 깨지 않는 additive
필드만 추가한다.

## Problem

1. 기존 `success` 관측값은 결과 반환 여부를 나타낼 뿐 관련성 판정이 아니다.
2. 같은 검색 구현을 반복 평가할 공개·고정 corpus와 ground truth가 없다.
3. 양성 질의와 명시적 no-match 질의의 점수 분포가 없어 안전한 임계값의 존재 여부를 알 수 없다.
4. 측정 없이 임계값이나 새 검색 기법을 운영에 적용하면 유효 결과를 숨기거나 무관한 결과를 확신 있게
   노출할 수 있다.
5. 실제 개인 검색어를 fixture 또는 평가 산출물에 넣으면 오픈소스 저장소에 사적 정보가 남을 수 있다.

## Objective

1. 공개 가능한 고정 corpus와 최소 40개의 정답 질의로 검색 품질 기준선을 반복 측정한다.
2. 결과 반환, 정답 문서 검색 성공, 점수 기반 양성 탐지를 서로 다른 개념과 필드로 표현한다.
3. recall@5, MRR@5, 고유 출처 비율, 양성·음성 top-score 분포, ROC-AUC를 한 보고서에서 산출한다.
4. 미리 선언한 관련성·점수 분리 품질 게이트와 단일 후보 임계값을 계산하되 운영 검색 결과에는
   적용하지 않는다.
5. 기존 JSONL 소비자가 계속 동작하도록 로그 계약을 additive하게 확장한다.
6. 평가 입력·로그·보고서가 실제 개인 노트, 질의, 경로 또는 비밀값을 읽거나 복제하지 않게 한다.

## Success Metrics

- [x] 공개 합성 Markdown corpus 12개와 정확히 40개의 고정 질의(양성 24, 명시적 no-match 16)가
      저장소에 존재하고 schema 검증을 통과한다. (근거: `retrieval-quality-fixture.test.ts` green)
- [x] 같은 코드·corpus·설정으로 두 번 실행하면 순위 기반 지표와 게이트 판정이 동일하다. (근거:
      `retrieval-quality-report.test.ts`, `retrieval-quality-adapter.test.ts`의 결정성 단언 green)
- [x] 격리된 임시 경로에서 production 검색 entry point로 40개 질의를 평가하고 운영 노트·색인·로그는
      읽거나 수정하지 않았음을 자동 테스트로 증명한다. (근거: `retrieval-quality-adapter.test.ts`
      forbidden access 0건 + `retrieval-quality-guard.test.ts` coverage oracle green)
- [x] 평가 보고서가 query outcome/결과 반환률, recall@5, MRR@5, 평균 고유 출처 비율, 양성·음성
      top-score 분포, ROC-AUC를 서로 구분해 포함한다. (근거: `retrieval-quality-report.test.ts` green)
- [x] 게이트는 정답 문서 기준 `macro recall@5 >= 0.90`, `ROC-AUC >= 0.90`, 그리고 같은 단일
      임계값에서 양성 탐지율 `>= 0.90`, 음성 FPR `<= 0.10`을 모두 만족할 때만 통과한다. (근거:
      `retrieval-quality-gate.test.ts` green)
- [x] 기존 JSONL 행과 확장 JSONL 행을 모두 읽을 수 있고 기존 필드를 삭제·변경하지 않는다. (근거:
      `search-event-contract.test.ts` green)
- [x] `041` 전후 동일 질의의 운영 검색 결과와 순위가 같으며 후보 임계값 때문에 결과가 제거되지 않는다.
      (근거: `retrieval-quality-boundary.test.ts` green)
- [x] fixture, snapshot, 보고서에 실제 개인 질의나 개인 절대경로가 포함되지 않는다. (근거:
      `retrieval-quality-privacy.test.ts` green)

게이트 실패는 이 기능의 구현 실패가 아니다. 측정기가 정확히 실패를 보고하고 원자료를 남기면 계약은
충족된다. 게이트 통과 여부는 후속 검색 변경의 의사결정 근거다.

## Non-goals

- 운영 검색 결과를 점수 임계값으로 필터링하는 것
- BM25, RRF, MMR, reranker 등 새 검색 알고리즘을 선택하거나 도입하는 것
- 임베딩 모델, chunking, top-k, 색인 형식 또는 재색인 정책을 변경하는 것
- 평가 결과만으로 특정 벡터 DB 도입을 결정하는 것
- 실제 개인 검색 로그를 학습·평가 fixture로 커밋하는 것
- 웹 UI 또는 MCP 공개 응답 형식을 변경하는 것

## Constraints

- 측정 게이트가 검색 동작 변경보다 먼저 구현되어야 한다.
- corpus와 질의는 합성·공개 데이터만 사용하며 사용자명, 홈 디렉터리, 토큰, 실제 노트 내용을 넣지 않는다.
- 기존 JSONL 필드는 의미와 wire shape를 보존한다. 새 필드는 누락 가능한 additive 필드다.
- 관련성 판정은 ground truth가 있는 평가의 query result/report에만 채운다. production logger를 통과하는
  운영·fixture event는 모두 기본 `not_judged`이며 결과 존재만으로 관련성을 추정하지 않는다.
- 지표는 `spec.md`에 고정한 작은 순수 함수로 구현하고 새 외부 metric 의존성을 추가하지 않는다.
  검색·임베딩 SDK의 동작이나 모델명처럼 바뀔 수 있는 외부 사실을 구현에 넣을 때는 구현 시점의 최신
  공식 문서(T1)로 재검증한다. 확인할 수 없으면 Open question으로 남기며 기억으로 단정하지 않는다.
- 사용자 메시지와 보고 문구는 비개발자도 이해할 수 있는 평이한 한국어를 우선한다.

## Stakeholders

- 단일 사용자: localmind를 설치한 개인 누구나(비개발자 포함)
- 검색·색인 구현 담당자
- 검색 변경을 검토하는 아키텍트와 품질 리뷰어
- JSONL 로그와 검색 품질 보고서를 소비하는 운영 도구

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 작은 합성 corpus에 과적합 | 실제 검색 품질을 과대평가 | 041은 기준선·회귀 게이트로만 사용하고 운영 필터에 연결하지 않는다 |
| 양성/음성 불균형 또는 쉬운 음성 질의 | ROC-AUC와 임계값이 낙관적으로 보임 | 24:16 비율을 고정하고 유사하지만 답이 없는 near-miss 음성을 포함한다 |
| chunk 중복이 순위 지표를 부풀림 | 다양한 출처를 찾는 능력 왜곡 | canonical source 기준 고유 출처 비율을 별도 산출한다 |
| 점수 범위가 구현에 따라 다름 | 고정 숫자 임계값 오용 | 원점수 분포와 평가 실행에서 계산한 후보 임계값만 보고한다 |
| 실제 질의 유출 | 개인정보가 Git 이력에 잔존 | 합성 질의만 허용하고 절대경로·비밀값·개인 식별자 검사를 테스트한다 |
| `success` 의미 변경 | 기존 로그 소비자 회귀 | 필드를 보존하고 새 `outcome`/`relevanceJudgment`로 의미를 분리한다 |
| 점수 분리만 좋은 잘못된 검색 | AUC와 임계값은 통과하지만 정답 문서를 찾지 못함 | 게이트에서 정답 문서 기준 macro recall@5를 독립 조건으로 검사한다 |
