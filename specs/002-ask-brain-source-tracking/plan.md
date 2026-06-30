# Plan: ask_brain Source Tracking

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`brain.ts` 의 `askBrain()` 함수 반환값에 `sources: string[]` 를 추가한다.
`searchNotes()` 가 반환하는 청크 배열의 `path` + `folder` 정보를 이미 가지고 있으므로
추가 파일 IO 없이 청크 리스트에서 중복 제거한 출처 목록을 구성할 수 있다.
`mcp-server.ts` 의 `ask_brain` 핸들러는 `sources` 를 받아 응답 텍스트 말미에 추가한다.

## 도메인 경계 (DDD)

- **second-brain 도메인**: `askBrain` 은 "노트 검색 + LLM 조합" 유스케이스.
  출처 추적은 이 유스케이스의 일부 — 별도 서비스가 아닌 `askBrain()` 반환값 확장으로 처리.
- **유비쿼터스 언어**:
  - *출처(source)*: 답변 생성에 사용된 노트 파일 (`폴더라벨/파일명` 형식)
  - *출처 있음(sourced)*: 관련 청크가 1개 이상 히트된 상태
  - *출처 없음(unsourced)*: 검색 결과가 비어 모델 자체 지식만으로 답변한 상태

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | `askBrain()` 반환 타입에 `sources: string[]` 추가, 출처 추출 로직 |
| `src/mcp-server.ts` | 수정 | `ask_brain` 핸들러에서 `sources` 를 응답 텍스트에 포함 |
| `src/brain.test.ts` | 수정/신규 | `askBrain()` 출처 추출 단위 테스트 추가 |

## 단계 (task 분해 가능)

1. **`brain.ts` — `IndexedChunk` 타입 확인**: `searchNotes()` 반환 청크에 `folder` / `path` 필드가 있는지 확인.
   없으면 `ChunkWithMeta` 타입으로 확장(폴더 라벨 포함).

2. **`brain.ts` — 출처 추출 헬퍼**: `extractSources(chunks: ChunkWithMeta[]): string[]` 구현.
   - `path` 에서 각 `NOTES_DIR` 폴더 prefix를 제거해 상대 경로 추출
   - `폴더라벨/파일명` 형식으로 변환
   - `Set` 으로 중복 제거 후 배열 반환

3. **`brain.ts` — `askBrain()` 반환 타입 확장**: 반환 타입을 `{ answer: string; sources: string[] }` 로 변경.
   청크 히트 없으면 `sources: []` 반환.

4. **`mcp-server.ts` — 응답 텍스트 조합**: `ask_brain` 핸들러에서
   - `sources.length > 0`: 응답 말미에 `\n\n[출처: <출처목록>]` 추가
   - `sources.length === 0`: `\n\n⚠️ 관련 노트 없음 — 모델 자체 지식 기반 답변` 추가

5. **테스트 작성**: AC-1 ~ AC-5 단위 테스트 (`searchNotes` mock 활용).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (정상 — 출처 있음) | 단위 | `searchNotes` mock(2개 파일 청크 반환) → 응답에 `[출처: ...]` 포함 확인 |
| AC-2 (출처 없음 경고) | 단위 | `searchNotes` mock(빈 배열) → `⚠️ 관련 노트 없음` 포함 확인 |
| AC-3 (중복 파일 제거) | 단위 | 같은 파일 청크 3개 mock → 출처에 1번만 등장 확인 |
| AC-4 (경로 형식) | 단위 | 절대 경로 청크 → `폴더라벨/파일명` 형식으로 변환 확인 |
| AC-5 (임베딩 서버 다운) | 단위 | `searchNotes` throws → 기존 에러 + 출처 없음 경고 확인 |

## Open questions

- `searchNotes()` 반환 타입에 `folder` 필드가 있는지 코드 확인 필요 (단계 1). 없으면 `IndexedChunk` 에 `folder: string` 추가.
- 현재 `askBrain()` 이 직접 `textResult()` 를 반환하는지, 문자열만 반환하는지 확인 (반환 타입 변경 영향 범위).
