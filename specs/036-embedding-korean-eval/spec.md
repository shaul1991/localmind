# Spec: 한국어 임베딩 A/B 하네스 (qwen3-0.6b vs bge-m3)

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: FR·AC는 체크박스로 둔다. self-review가 clean으로 닫히면 각 항목을
     `[ ]`→`[x]`로 바꾸고 옆에 검증 근거(테스트 시나리오/실증 방법)를 적는다. 미충족 항목은
     체크하지 않고 사유를 부기한다(은폐 금지). — AGENTS.md `/goal` 규약 5. -->

> **검증 상태**: 모델 수치는 조사분(T1~T3). 정확 dims·context·ollama 태그·한국어 성능은
> **Phase 0 라이브 재확인** 후 확정. 결과에 따라 임계·후보 조정 가능(실험 스펙).

## Scope
<!-- 이번에 만드는 범위. goal의 Objective에 대응. -->

기존 bge-m3 운영 색인을 깨지 않고, **qwen3-embedding:0.6b를 병렬로 색인**해 **라벨링된 한국어
질의셋에 대해 recall@k·MRR로 A/B** 하고, **채택/유지 권고 리포트**를 내는 오프라인 평가 하네스.
실제 운영 모델 전환은 범위 밖(결정까지만 — goal Non-goals).

## Context
<!-- 현재 상태·관련 시스템. 변경의 출발점. -->

- 현재 임베딩: bge-m3(ollama). `src/brain.ts` — 벡터 사이드카(`.brain-index` + Float32 사이드카,
  헤더에 `dims` 스탬프), `EMB_MODEL`(env `EMBEDDINGS_MODEL`), 모델 변경 감지 시 재색인 유도
  (`notifyReindexOnce`). `scripts/embed.sh`가 ollama 임베딩 백엔드 기동(host/gpu/cpu).
- 벌트 규모(참고): 실측 1,079파일 / 8,277청크(2026-07-03 기록).
- 후보(로컬 ollama): `qwen3-embedding:0.6b`(639MB·1024 dims·32K context, 조사분).

## Functional Requirements
<!-- 각 FR 끝에 (goal의 어느 목표/제약을 지지하는지) 표기. 연결 없으면 scope creep. -->
- [ ] **FR-1 (한국어 질의셋)**: 실제 벌트에서 **한국어 질의 N개**를 만들고 각 질의에 기대 관련
      노트/청크 id를 라벨링해 **버전드 파일**로 둔다. → goal: Objective(근거)·Success(질의셋)
- [ ] **FR-2 (비파괴 병렬 색인)**: qwen3-0.6b로 벌트를 **별도 색인 경로**에 임베딩한다. bge-m3
      운영 색인·설정은 불변. → goal: Constraints(비파괴)
- [ ] **FR-3 (recall@k·MRR 산출)**: 각 질의를 각 모델 색인에 질의해 **recall@5·recall@10·MRR**을
      동일 조건으로 계산한다. → goal: Objective(측정)·Success(recall)
- [ ] **FR-4 (비교 리포트 + 권고)**: 질의별 승패 + 모델별 집계 recall@k 표 + **채택/유지 권고**
      (임계 대비 margin 명시)를 리포트로 낸다. → goal: Expected outcome(결론)
- [ ] **FR-5 (자원 실측)**: qwen3-0.6b 색인 시 16GB에서 RAM 여유·임베드 지연을 기록한다.
      → goal: Constraints(16GB)·Success(자원)
- [ ] **FR-6 (하네스 재현성)**: 질의셋·색인·계산·리포트가 **재실행 가능**(같은 입력→같은 수치).
      → goal: Constraints(재현성)

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. -->
- [ ] **AC-1 (질의셋)**: Given 벌트, When 질의셋 구축, Then 한국어 질의 **≥ N개**(제안 N=20)가
      각각 **≥1개 라벨 기대노트**와 함께 버전드 파일에 존재한다.
- [ ] **AC-2 (측정)**: Given 두 모델 색인, When 하네스 실행, Then 각 모델의 recall@5·recall@10·
      MRR이 같은 질의셋으로 산출된다.
- [ ] **AC-3 (리포트)**: Given 실행 결과, When 리포트 생성, Then 질의별 어느 모델이 이겼는지 +
      집계 표 + **채택/유지 권고(margin 포함)**가 출력된다.
- [ ] **AC-4 (16GB 적합)**: Given qwen3-0.6b 색인을 스택 가동 중 실행, When 관측, Then OOM·
      스래싱 없이 완료되고 RAM 여유·임베드 지연이 기록된다.
- [ ] **AC-5 (비파괴 — 엣지)**: Given 실험 실행, When 완료, Then 기존 bge-m3 운영 색인·설정이
      바이트 단위로 불변이다(존재·해시 확인).
- [ ] **AC-6 (결정 게이트)**: Given 결과, Then 채택 권고는 **qwen3-0.6b가 한국어 recall@5에서
      bge-m3 대비 회귀 없음 + 유의미 개선**일 때만. 아니면 **유지** 권고.
- [ ] **AC-7 (하네스 정확성 — 단위)**: Given 소형 합성 세트(정답 알려짐), When recall@k·MRR
      계산, Then 손계산 값과 일치한다(하네스 로직 검증).

## Open questions
<!-- 미결정 사항. 숨기지 말 것. plan/구현 전에 해소하거나 명시 진행. -->
- **질의셋 크기 N·다양성**: 제안 N=20~30(주제·길이·난이도 다양). 최종은 착수 시 확정.
- **판정 임계(margin)**: 제안 — 한국어 recall@5 **비회귀(≥ bge-m3)** 필수 + 집계 recall@10
  또는 MRR **유의미 개선**(예: +2%p↑)일 때 채택. 임계 확정 필요.
- **라벨링 방식**: 사람이 아는 노트로 수동 라벨(gold). 자동 유사도 라벨은 순환논리라 배제.
- **병렬 색인 방법**: `brain.ts`가 별도 사이드카 경로로 색인하도록 env/플래그가 필요한지, 아니면
  하네스가 독립적으로 임베드→임시 인덱스 구성할지 — Phase 0/plan에서 확정.
- **[Phase 0]** qwen3-0.6b 정확한 ollama 태그·dims·context·한국어 실성능 라이브 확인.
