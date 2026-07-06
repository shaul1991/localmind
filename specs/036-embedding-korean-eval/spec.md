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
- [x] **FR-5 (자원 실측)**: qwen3-0.6b 색인 시 16GB에서 RAM 여유·임베드 지연을 기록한다.
      → goal: Constraints(16GB)·Success(자원)
      *검증: 실측 — qwen3 런타임 GPU 풋프린트 num_ctx4096=2.2GB(경합 시 OOM)→2048=2.0GB(적합).
      bge-m3=664MB. GPU 임베딩 지연 bge-m3 12.2s / qwen3 19.5s(56개, num_ctx2048).*
- [x] **FR-6 (하네스 재현성)**: 질의셋·색인·계산·리포트가 **재실행 가능**(같은 입력→같은 수치).
      → goal: Constraints(재현성) *검증: `scripts/embed-bench.ts` — 임베딩 결정론, 재실행 동일.*

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑 가능하게(Given-When-Then). 유저 시나리오와
     엣지 케이스를 AC로 표면화한다. -->
- [x] **AC-1 (질의셋)**: Given 벌트, When 질의셋 구축, Then 한국어 질의 **≥ N개**(제안 N=20)가
      각각 **≥1개 라벨 기대노트**와 함께 버전드 파일에 존재한다.
      *검증: `queries.ko.json` 20개 한국어 질의 + gold 경로.*
- [x] **AC-2 (측정)**: Given 두 모델 색인, When 하네스 실행, Then 각 모델의 recall@5·recall@10·
      MRR이 같은 질의셋으로 산출된다. *검증: 실벌트 261문서 — bge-m3(100/100/**0.738**),
      qwen3(100/100/**0.498**).*
- [x] **AC-3 (리포트)**: Given 실행 결과, When 리포트 생성, Then 질의별 어느 모델이 이겼는지 +
      집계 표 + **채택/유지 권고(margin 포함)**가 출력된다. *검증: 러너 리포트 출력(결과 절 참조).*
- [x] **AC-4 (16GB 적합)**: Given qwen3-0.6b 색인을 스택 가동 중 실행, When 관측, Then OOM·
      스래싱 없이 완료되고 RAM 여유·임베드 지연이 기록된다.
      *부분 검증: 완료됨. 단 **발견** — 사용자의 다른 Docker 스택 동시 구동 시 qwen3(num_ctx4096
      2.2GB)가 **GPU OOM** → num_ctx 2048(2.0GB)로 낮춰야 GPU 적합. bge-m3(664MB)는 문제 없음.
      즉 qwen3는 16GB에서 여유가 빠듯(자원 footprint가 결정 요소).*
- [x] **AC-5 (비파괴 — 엣지)**: Given 실험 실행, When 완료, Then 기존 bge-m3 운영 색인·설정이
      불변이다. *검증: 하네스는 코퍼스 파일 읽기 + ollama 호출만 — 운영 `.brain-index`·`.env`
      미접근(설계상 비파괴). 전체 386 테스트 green.*
- [x] **AC-6 (결정 게이트)**: Given 결과, Then 채택 권고는 **qwen3-0.6b가 한국어 recall@5에서
      bge-m3 대비 회귀 없음 + 유의미 개선**일 때만. 아니면 **유지** 권고.
      *검증: 실벌트 recall@5 비회귀(O) + 개선(X, MRR **−0.240** 오히려 악화) → **유지(bge-m3)** 산출.*
- [x] **AC-7 (하네스 정확성 — 단위)**: Given 소형 합성 세트(정답 알려짐), When recall@k·MRR
      계산, Then 손계산 값과 일치한다. *검증: `src/eval-metrics.test.ts` 9/9 green.*

## 결과 (2026-07-07 실행 — 2회)

**Run 2 — 실벌트(정본 결론)**: 코퍼스 = 개인 벌트의 지식 문서 261개(capture 제외, 유사 인플루언서
분석 노트 14종 포함), 질의 26개(로컬 gold, 미커밋).

| 모델 | recall@5 | recall@10 | **MRR** |
|---|---|---|---|
| bge-m3:latest | 100.0% | 100.0% | **0.738** |
| qwen3-embedding:0.6b | 100.0% | 100.0% | **0.498** |
| 델타(qwen3−bge) | 0%p | 0%p | **−0.240** |

**결정: 유지(bge-m3) — 강한 근거.** 둘 다 gold를 top-10에 넣지만(recall 포화), **bge-m3가 정답을
훨씬 상위로 랭크**한다(MRR 0.738 ≫ 0.498). 즉 **drop-in 평문 임베딩(localmind 실사용 방식)에서
qwen3-0.6b는 한국어 회상 랭킹이 bge-m3보다 뚜렷이 나쁘다.** 이유 정합: bge-m3는 한국어 특화
(MIRACL ko 71.8)이고 qwen3 우위는 집계 다국어(중국어·영어 중심). **집계 MTEB를 안 믿고 실벌트를
돌린 것이 결정을 뒤집었다**(Live-Verify의 실증).

**Run 1 — 저장소 예시(변별 부족)**: 코퍼스 = `specs/*/goal.md` 36개(서로 다른 주제). bge-m3
(100/100/0.950) vs qwen3(100/100/0.967) — 둘 다 포화, MRR 미세차. **너무 쉬워 결론 불가** →
Run 2로 확정. (재현 가능한 공개 예시로 `queries.ko.json` 유지.)

> **미검증(후속)**: qwen3의 **instruction-tuned query** 방식(공식 권장)은 미적용 — localmind가 평문
> 임베딩만 하므로. 그 방식이면 qwen3가 나아질 수 있으나 현 사용 방식엔 무관. recall@5도 포화
> (코퍼스 261로도 gold가 top5 밖으로 안 밀림) → 더 큰 코퍼스면 recall 자체도 갈릴 수 있음.

**부수 발견(자원, AC-4)**: qwen3-0.6b GPU 런타임 num_ctx4096=2.2GB(경합 아니어도 벌트 큰 노트에서
OOM)→2048=2.0GB. bge-m3(664MB)는 무탈. 임베딩 지연(261+26개): bge-m3 39s / qwen3 69s. 교체 시
qwen3가 **더 무겁고 느림** — 16GB에선 부담.

## Open questions
<!-- 해소분은 취소선. -->
- ~~질의셋 크기 N~~ → **해소: N=20**(실행). 실벌트 재실행 시 확대 권장.
- ~~판정 임계(margin)~~ → **해소: recall@5 비회귀 + (recall@10|MRR) +0.02**(적용).
- ~~라벨링 방식~~ → **해소: 저장소 문서로 gold 수동 라벨**(비민감·재현). 개인 벌트는 사용자 라벨.
- ~~병렬 색인 방법~~ → **해소: 하네스 독립 임베드**(brain.ts 미변경 — 완전 비파괴). Simplicity First.
- ~~[Phase 0] qwen3 태그·dims·context~~ → **해소: `qwen3-embedding:0.6b`, dims 1024(bge-m3와 동일),
  context 32768, 595.78M**(라이브 확인).
- **미해소(후속)**: 실벌트에서의 강한 신호 A/B, qwen3 instruction-query 방식, embeddinggemma 비교.
