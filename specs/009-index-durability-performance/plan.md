# Plan: Index Durability & Performance

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`brain.ts` 내부의 인덱스 IO 3함수(loadIndex/saveIndex/ensureIndexed)만 외과적으로 수정한다.
모듈 스코프에 캐시 상태(`cachedIndex`, `cachedStat`)와 single-flight 프라미스
(`indexingInFlight`)를 둔다. 외부 시그니처는 전혀 바뀌지 않으므로 mcp-server.ts 등
호출부는 무변경이다.

## 도메인 경계 (DDD)

- **second-brain 도메인 — 인덱스 영속성(persistence) 서브레이어**: "파생물(인덱스)의
  읽기/쓰기/동시성"만 다룬다. 검색·캡처·링크 등 유스케이스 로직은 건드리지 않는다.
- **유비쿼터스 언어**:
  - *캐시 적중(cache hit)*: 파일 stat(mtime+size)이 불변이라 파싱을 생략하는 상태
  - *원자적 교체(atomic swap)*: temp 파일 완성 후 rename으로 한 번에 바꾸는 쓰기
  - *single-flight*: 동시 요청을 하나의 실제 실행으로 합치는 패턴

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | loadIndex/saveIndex 캐시·원자화, ensureIndexed single-flight |
| `src/brain.test.ts` | 수정 | AC-1~4·6 테스트 추가 (기존 테스트 무변경) |
| 그 외 전체 | 무변경 | 외부 API 불변 |

## 단계 (task 분해 가능)

1. **캐시 상태 도입**: 모듈 스코프에
   ```ts
   let cachedIndex: BrainIndex | null = null;
   let cachedStat: { mtimeMs: number; size: number } | null = null;
   ```
   `loadIndex()`: `fs.statSync(INDEX_PATH)` → cachedStat과 동일하면 cachedIndex 반환.
   파일 없음(ENOENT)이면 캐시 무효화 후 빈 인덱스 반환(AC-6). 다르면 재파싱 후 캐시 갱신.

2. **`saveIndex()` 원자화 + 캐시 갱신**:
   ```ts
   const tmp = INDEX_PATH + ".tmp";
   fs.writeFileSync(tmp, JSON.stringify(idx));
   fs.renameSync(tmp, INDEX_PATH);
   cachedIndex = idx; cachedStat = stat(INDEX_PATH);
   ```
   temp 파일명은 고정(`.tmp` 접미) — 같은 프로세스는 4단계 직렬화로 동시 쓰기가 없고,
   잔여 temp는 다음 저장이 덮어쓴다. `.gitignore`/백업 제외 확인(`.brain-index.json*`).

3. **테스트용 캐시 리셋 훅**: 테스트가 캐시 상태를 초기화할 수 있게
   `export function _resetIndexCacheForTest(): void` 추가(언더스코어 관례로 내부용 명시).

4. **`ensureIndexed()` single-flight**:
   ```ts
   let indexingInFlight: Promise<BrainIndex> | null = null;
   async function ensureIndexed(): Promise<BrainIndex> {
     if (indexingInFlight) return indexingInFlight;
     indexingInFlight = doEnsureIndexed().finally(() => { indexingInFlight = null; });
     return indexingInFlight;
   }
   ```
   기존 본문은 `doEnsureIndexed()`로 이름만 바꿔 이동(로직 무변경).
   주의: 진행 중 실행에 합류한 호출자는 "합류 시점 이후의 파일 변경"을 못 볼 수 있으나,
   기존 동시 실행보다 나쁘지 않음(주석으로 명시).

5. **`capture()`의 `checkIndexed()`·`removeFromIndex()` 경유 확인**: 둘 다 `loadIndex()`를
   쓰므로 캐시 도입만으로 자동 정합 — 별도 수정 불필요한지 코드 확인.

6. **테스트 작성**: AC-1~4·6. 캐시 테스트는 임시 인덱스 파일 + `_resetIndexCacheForTest()`
   활용. single-flight는 `Promise.all([ensureIndexed(), ensureIndexed(), ensureIndexed()])`
   후 스캔 횟수 계측(파일 읽기 카운트를 위해 테스트 전용 임시 vault에서 자식 프로세스 또는
   listMarkdown 호출 부수효과 관찰 — 구현 시 가장 단순한 계측 방식 선택).

7. **성능 확인(도그푸드)**: 실측 vault(NOTES_DIR 설정 상태)에서 연속 `search_notes` 2회
   호출의 2회차 지연이 체감 개선되는지 확인해 결과를 기록.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (캐시 적중) | 단위 | 파일 로드 → 재호출 시 동일 객체 참조(`assert.equal(a, b)`) 확인 |
| AC-2 (외부 변경 감지) | 단위 | 파일 수정(내용+utimes) 후 재호출 → 새 객체·새 내용 확인 |
| AC-3 (원자적 쓰기) | 단위 | 저장 후 temp 부재 + 파일 파싱 가능 확인 |
| AC-4 (single-flight) | 단위 | 동시 3회 호출 → 실제 실행 1회 계측 |
| AC-5 (회귀 없음) | 기존 스위트 | `npm test` + `LOCALMIND_INTEGRATION=1 npm test` 전체 통과 |
| AC-6 (캐시 후 삭제) | 단위 | 캐시 확보 → 파일 삭제 → 빈 인덱스 반환 확인 |

## Open questions

- AC-4 계측 방식: 가장 단순한 것은 `doEnsureIndexed` 시작 시 증가하는 테스트 관찰용
  카운터 export — 프로덕션 코드에 테스트 전용 상태를 넣는 트레이드오프가 있어, 대안
  (임시 vault에서 신규 파일 추가 후 동시 호출 → 임베딩 fetch 호출 수 관찰)과 구현 시 비교 결정.
