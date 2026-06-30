# Plan: Failure Query Analysis

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`brain.ts` 에 경량 로거(`QueryLogger`)를 추가한다. `searchNotes()` / `askBrain()` 의 마지막에
fire-and-forget 방식으로 JSONL 레코드를 append한다.
분석은 `scripts/query-report.mjs` (Node.js ES Module) 스크립트로 수행하고
`Makefile` 에 `query-report` / `query-log-clean` 타깃을 추가한다.
001·002 구현 결과(`validationStatus`, `sources`)를 로그 레코드에 함께 담아 통합 분석한다.

## 도메인 경계 (DDD)

- **observability 도메인**: 쿼리 로그는 second-brain 도메인의 부산물이 아니라
  시스템 관측 레이어의 책임. `brain.ts` 에 인라인하되 `QueryLogger` 클래스로 경계를 명확히 한다.
- **유비쿼터스 언어**:
  - *쿼리 이벤트(query event)*: `search_notes` / `ask_brain` 한 번의 호출 기록
  - *실패 쿼리(failed query)*: `hitCount === 0` 또는 `success === false` 인 쿼리 이벤트
  - *노트 갭(note gap)*: 자주 실패하는 주제 — 아직 노트가 없는 영역
  - *개선 제안(improvement suggestion)*: 실패 패턴 분석 결과로 도출된 액션 아이템

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | `QueryLogger` 클래스 추가, `searchNotes()` / `askBrain()` 에 로깅 side-effect |
| `scripts/query-report.mjs` | 신규 | JSONL 로그 분석 스크립트 |
| `Makefile` | 수정 | `query-report`, `query-log-clean` 타깃 추가 |
| `.gitignore` | 수정 | `query-log.jsonl` 패턴 추가 |
| `src/brain.test.ts` | 수정/신규 | `QueryLogger` 단위 테스트, fire-and-forget 동작 확인 |

## 단계 (task 분해 가능)

1. **`brain.ts` — `QueryLogger` 클래스**:
   - `logPath`: `QUERY_LOG` env → `~/.localmind/query-log.jsonl`
   - `log(record: QueryRecord): void` — `fs.appendFile` 비동기, 오류 시 stderr만 기록 (throw 금지)
   - `QueryRecord` 인터페이스: `ts, tool, query, hitCount, success, captureValidation?, sources?`

2. **`brain.ts` — `searchNotes()` 로깅**: 기존 반환 직전에 `QueryLogger.log(...)` fire-and-forget.
   `hitCount = results.length`, `success = results.length > 0`.

3. **`brain.ts` — `askBrain()` 로깅**: 002 구현의 `sources` 결과와 함께 로깅.
   `success = sources.length > 0`.

4. **`scripts/query-report.mjs` — 분석 스크립트**:
   - `QUERY_LOG` 경로의 JSONL 파일을 줄 단위로 읽기
   - 최근 30일 필터링
   - 출력 섹션: 총량/성공률 → 실패 키워드 Top 10 → 인덱싱 미확인 빈도 → 노트 갭 주제 → 개선 제안
   - 키워드 추출: 공백 분리 + 한국어 조사 제거 휴리스틱 (이, 가, 을, 를, 의, 에, 은, 는 제거)
   - 개선 제안 규칙:
     - 실패율 > 50% → "청크 크기 축소 (`BRAIN_CHUNK_SIZE=1000`) 시도"
     - 노트 갭 키워드 ≥ 3개 → "해당 주제 노트 작성 권장: [키워드]"
     - `captureValidation: unconfirmed` > 10% → "임베딩 서버 상태 확인 (`make health`)"

5. **`Makefile` 타깃 추가**:
   ```makefile
   query-report:
   	node scripts/query-report.mjs
   query-log-clean:
   	node -e "..." # 30일 이전 항목 필터링 후 재저장
   ```

6. **`.gitignore` 업데이트**: `*.jsonl` 또는 `query-log.jsonl` 추가.

7. **테스트 작성**: AC-1 ~ AC-6 커버 (`fs.appendFile` mock, 임시 로그 파일 활용).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (실패 쿼리 기록) | 단위 | `searchNotes` 빈 결과 → 로그 파일에 `hitCount:0` 레코드 확인 |
| AC-2 (성공 쿼리 기록) | 단위 | `askBrain` 출처 있음 → `success:true, sources:[...]` 레코드 확인 |
| AC-3 (fire-and-forget) | 단위 | `fs.appendFile` mock throw → `searchNotes` 정상 응답 확인 |
| AC-4 (리포트 출력) | 통합 | 30건 샘플 로그 파일 → `query-report.mjs` 실행 → 개선 제안 포함 확인 |
| AC-5 (로그 없음) | 통합 | 로그 파일 없음 → exit 0, 안내 메시지 확인 |
| AC-6 (데이터 부족) | 통합 | 5건 로그 → "데이터 부족" 경고 포함 확인 |

## Open questions

- 001 `captureValidation` 상태를 로그에 포함하려면 `capture_note` 흐름과 `search_notes` 흐름이 연결돼야 함. 현재 별개 호출이므로 `captureValidation` 은 `capture_note` 로그에서만 기록하고 `search_notes` 로그는 별도로 처리하는 게 현실적. 설계 확정 필요.
- `query-log-clean` 구현: Node.js 인라인 스크립트 vs 별도 `.mjs` 파일 — 재사용성 위해 별도 파일 권장.
- 분석 스크립트 실행 주기 자동화(예: `make backup-cron` 에 통합): 004 범위 밖으로 Open questions 에 남김.
