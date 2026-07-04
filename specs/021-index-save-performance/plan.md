# 021 — 색인 저장 성능 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

- **색인 도메인(src/brain.ts)** — 저장 시점 판단(스로틀·finally 보강)은 임베딩 워커
  루프가 있는 여기서만. saveIndex 자체(원자성·락·병합)는 손대지 않는다(FR-4).
- **진입점(scripts/reindex.sh)** — 호스트 라우팅 판정과 `BRAIN_BATCH` 기본 주입만.
  판정은 `read_env_val OLLAMA_API_BASE`(주석 무시, 라인 앵커) 활성값 검사 — doctor의
  raw grep(주석에도 매칭되는 오탐, .env.example 기본 구성에서 실증)보다 엄격하다.
  doctor 쪽 raw grep 정렬은 이 스펙 범위 밖의 후속(spec Open questions 5).

## 영향 모듈

| 모듈 | 변경 |
|---|---|
| `src/brain.ts` | 워커 루프의 `saveIndex(idx)`(진행 저장)를 시간 스로틀로 감싸기(FR-1) + 임베딩 구간을 try/finally로 감싸 중단 시 커밋분 저장(FR-2) + 테스트 계측용 저장 카운터 export(indexRunCount 관례) |
| `scripts/reindex.sh` | 호스트 라우팅 판정 → `BRAIN_BATCH` 기본 32 주입(명시 env 우선, FR-3) |
| `src/brain.test.ts` | AC-1~4(자식 프로세스 + HTTP 임베딩 스텁 + 저장 카운터 출력 프로브, 실패 스텁은 특정 마커 텍스트 포함 요청에 500 반환 — AC-3, conc=1 고정) |
| `scripts/notes-dir.test.sh` | AC-5 배선(npm 스텁이 BRAIN_BATCH 기록 — 호스트/비호스트/명시 3케이스) |
| `docs/faq.md` | 성능 절에 진행 저장 간격·BRAIN_BATCH 프로파일 한 줄 |

## 구현 스케치

```
// brain.ts — doEnsureIndexed의 임베딩 블록
const SAVE_INTERVAL_MS = Math.max(0, Number(process.env.BRAIN_SAVE_INTERVAL ?? 10) * 1000);
let lastSaveAt = Date.now();
async function worker() {
  while (cursor < batches.length) {
    ... 배치 임베딩, 완료 파일 idx.files 반영(기존) ...
    if (SAVE_INTERVAL_MS === 0 || Date.now() - lastSaveAt >= SAVE_INTERVAL_MS) {
      saveIndex(idx); lastSaveAt = Date.now();   // 진행 저장(FR-1)
    }
  }
}
let completed = false;
try {
  await Promise.all(workers);
  completed = true;
} finally {
  // FR-2 — 오류 경로 전용: 임베딩 실패로 중단돼도 그때까지 커밋된 파일 전량을 저장.
  // 성공 경로에서는 저장하지 않는다 — 어차피 말미(프루닝 후) 저장이 전량 기록하므로,
  // 여기서도 저장하면 성공할 때마다 색인 전량 쓰기가 1회 낭비된다(리뷰 중대-1).
  if (!completed) saveIndex(idx);
}
```

주의점:

- **동시 워커의 저장 경합**: 워커 2개가 같은 tick에 스로틀을 통과해도 saveIndex는
  락으로 직렬화되고 내용은 같은 idx 객체라 안전(기존과 동일 성질). lastSaveAt 갱신이
  워커 간 공유 변수여도 "저장이 조금 더/덜 일어나는" 수준 — 정합성 영향 없음.
- **성공 경로의 쓰기 기저값**: 진행 저장(0~N, 시간 비례) + 말미(프루닝 후) 저장 1회가
  전부다. 오류-보강 저장은 `completed` 가드로 성공 경로에서 배제 — AC-1의 "2회 이하"
  상한은 이 가드가 있어야 성립한다. 실패 경로에서는 프루닝에 도달하지 않으므로
  finally 저장이 커밋분을 보존한다(프루닝 전 상태 저장 — 다음 정상 실행이 삭제 반영).
- **saveRunCount 계측**: `export let saveRunCount`(또는 getter)를 saveIndex 진입에서
  증가 — indexRunCount와 같은 테스트 전용 관례. 프로브(자식 프로세스)가 reindex 후
  카운터를 stdout으로 출력해 AC-1·2를 어서션한다.
- **AC-3 실패 스텁의 결정화(리뷰 중대-2)**: 실패 트리거는 요청 순번이 아니라 **요청
  본문의 마커 텍스트**(특정 파일의 청크 내용)로 — 워커 인터리빙과 무관해진다. 테스트
  env에 `BRAIN_CONCURRENCY=1` 고정(배치가 0,1,2… 순차) + `EMBED_RETRIES=1`(재시도
  소음 제거). 한 워커가 throw해도 형제 워커가 계속 커밋하는 비결정도 conc=1로 제거.
  실패 후 색인 JSON을 직접 읽어 커밋분 존재를 확인하고, 스텁 정상화 후 재실행에서
  임베딩 호출이 남은 파일의 배치 수만큼인지 확인.
- **AC-4 결과 동일성**: 파일 키 집합과 청크 수만 비교(벡터는 스텁 고정값이라 동일).
- **reindex.sh 판정(리뷰 중대-3)**: 판정 입력은 reindex.sh가 이미 계산한
  `$ENV_FILE`(=`${LOCALMIND_ENV_FILE:-$PROJECT_DIR/.env}`) **하나만** grep한다 —
  하드코딩 `$PROJECT_DIR/.env`를 쓰면 host 라우팅 개발 머신에서 AC-5의 비호스트
  케이스가 격리 불가로 항상 깨진다(로컬 .env에 host.docker.internal 실재).
  doctor의 litellm.config.yaml 가지는 죽은 가지(spec FR-3 근거)라 계승하지 않는다.
  주입은 `BRAIN_BATCH="${BRAIN_BATCH:-32}"` 형태 — 명시 env 우선이 셸 문법으로 보장.
  AC-5 배선 테스트는 npm 스텁이 BRAIN_BATCH를 기록하도록 확장하고 host/비host/명시
  3케이스 모두 임시 env 파일로 격리한다.

## 단계 (TDD)

1. **실패 테스트** — brain.test.ts에 AC-1~4(저장 카운터 프로브 + 실패 스텁),
   notes-dir.test.sh에 AC-5 배선 3케이스.
2. **구현** — brain.ts 스로틀 + try/finally + 카운터, reindex.sh 프로파일 주입.
3. **회귀** — 전체 스위트(AC-6) + typecheck.
4. **문서** — faq 성능 절.
5. **self-review** — 독립 크리틱 적대 리뷰 + codex 교차(sdd-self-review 스킬), clean까지.
6. **도그푸드 실측** — 실제 코퍼스(1,065파일)에서 강제 전체 재색인 시간 측정, goal
   Success metric(66분 대비) 기록. (선택 — 색인 무효화가 필요해 비용이 있음. 실측
   없이 커밋할 경우 goal에 "실측 대기"로 표기.)

## 테스트 전략

- 기존 관례 계승: 자식 프로세스 격리(NOTES_DIR·BRAIN_INDEX·BRAIN_SAVE_INTERVAL 조합)
  + 부모 HTTP 임베딩 스텁(호출 계측·실패 주입). 020 하니스(makePruneFixture·
  withEmbedStub·runReindexCli)를 재사용하되, 저장 카운터가 필요한 AC-1·2는 reindex
  CLI 대신 카운터를 출력하는 node -e 프로브를 쓴다.
- 시간 의존 제거: AC-1은 "수 초 내 완료(간격 10초 미만)"라 진행 저장 0~1회가 결정적.
  AC-2는 간격 0으로 결정적. 벽시계에 기대는 어서션 없음.
- 검증 분리(AGENTS.md): 적대적 리뷰는 "finally 저장이 프루닝·요약과 상호작용하는
  경로, 워커 경합, 실패 시 부분 커밋의 무결성"을 찾으러 간다.

## 모델 역할 배치

- 스펙·플랜 정의, 최종 적대적 리뷰: 최상위 티어(🔖).
- 구현: 촘촘한 스펙의 국소 변경 — 루틴 구현 티어로 다운시프트 가능.
- 배선·문서: 저위험 기계 작업.
