# Plan: Capture Validation Loop

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`brain.ts` 의 `capture()` 함수에 검증 단계를 추가한다. 파일 저장 + 초기 인덱싱 완료 후
저장된 파일 경로를 기준으로 `searchNotes()` 재검색을 수행하고 히트 여부를 반환값에 포함한다.
mcp-server.ts의 `capture_note` 핸들러는 이 반환값을 받아 응답 텍스트에 검증 상태를 추가한다.
별도 서비스나 외부 의존 없이 프로세스 내에서 완결된다.

## 도메인 경계 (DDD)

- **second-brain 도메인**: 노트 파일(정본) + 임베딩 인덱스(파생)의 일관성 유지가 책임.
  `capture` 는 "파일 쓰기 + 인덱스 갱신 + 인덱스 정합 검증"의 단일 유스케이스다.
- **유비쿼터스 언어**:
  - *캡처(capture)*: 노트를 파일로 저장하고 인덱스에 반영하는 전체 행위
  - *검증(validation)*: 캡처 후 해당 노트가 검색 가능 상태인지 확인하는 행위
  - *인덱싱 확인(index-confirmed)*: 재검색에서 해당 파일이 히트됨
  - *인덱싱 미확인(index-unconfirmed)*: 재검색 후에도 히트 없음

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | `capture()` 반환 타입에 `validationStatus` 추가, 검증 로직 추가 |
| `src/mcp-server.ts` | 수정 | `capture_note` 핸들러에서 `validationStatus` 를 응답 텍스트에 포함 |
| `src/brain.test.ts` | 신규 | `capture()` 검증 시나리오 단위 테스트 |

## 단계 (task 분해 가능)

1. **`brain.ts` — 반환 타입 확장**: `capture()` 가 `{ path: string; validationStatus: 'confirmed' | 'unconfirmed' | 'skipped'; retried: boolean }` 를 반환하도록 수정.

2. **`brain.ts` — 키워드 추출 헬퍼**: 텍스트에서 재검색용 쿼리를 추출하는 `extractSearchQuery(text: string): string | null` 구현 (첫 비어있지 않은 줄 기준 50자, 10자 미만이면 null 반환).

3. **`brain.ts` — 재검색 검증 로직**: `capture()` 내부에서 인덱싱 완료 후 `searchNotes()` 호출. 히트된 결과 중 저장된 파일 경로(`path`)와 일치하는 항목 존재 여부로 `confirmed` / `unconfirmed` 판정. 타임아웃 3초 초과 시 `skipped`.

4. **`brain.ts` — reindex 재시도**: `unconfirmed` 판정 시 `reindexFile()` 재호출 후 재검색 1회 더 수행. 결과 반영.

5. **`mcp-server.ts` — 응답 텍스트 생성**: `validationStatus` 에 따라 응답 텍스트 말미에 `✅ 인덱싱 확인됨` / `⚠️ 인덱싱 미확인 — 수동 make reindex 권장` 추가.

6. **테스트 작성**: AC-1 ~ AC-5 를 커버하는 단위 테스트 (brain 함수 직접 호출, searchNotes mock).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (정상 캡처 → 검증 성공) | 단위 | `searchNotes` 를 파일 경로 히트 반환으로 mock, `capture()` 검증 |
| AC-2 (초기 실패 → 재시도 성공) | 단위 | 첫 `searchNotes` 는 빈 배열, 두 번째는 히트 반환 mock |
| AC-3 (영구 실패 → 경고) | 단위 | `searchNotes` 항상 빈 배열, 파일 저장 성공 확인 |
| AC-4 (타임아웃 → skipped) | 단위 | `searchNotes` 를 3초 초과 지연 mock → `skipped` 반환 확인 |
| AC-5 (짧은 텍스트 → 생략) | 단위 | 5자 텍스트 입력 → 재검색 미호출 확인 |

## Open questions

- `reindexFile()` 이 현재 `brain.ts` 내부 함수인지 export 여부 확인 필요 (단계 4 전 확인).
- 타임아웃 구현: `Promise.race` + `setTimeout` 패턴으로 처리 (Node.js `AbortController` 대안도 가능).
