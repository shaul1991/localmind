# Plan: 검색 관측성 — 소프트 실패를 볼 수 있게

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

이미 계산·보유된 값(`NoteHit.score`·`NoteHit.path`)을 로그 레코드에 additive로 실어, 로그의
표현력을 "이진 성공/실패"에서 "스코어 분포"로 끌어올린다. 새 계산·새 모듈·새 도구는 만들지
않는다 — 로깅 레코드에 필드 2개(`topScore`, search_notes `sources`)를 추가하고, 순수
집계 모듈(`query-analysis.ts`)에 분포 통계 하나를 더하고, CLI 리포트가 그것을 렌더한다.
프라이버시 고지는 문구만 갱신한다. 소프트 실패 임계는 데이터를 본 뒤 정하기로 하고 이번엔
관측만 세운다.

## 도메인 경계 (DDD)

- **observability 도메인**(004/017 계승): 쿼리 로그는 second-brain 도메인의 부산물이 아니라
  관측 레이어의 책임. 타입 정본은 `query-analysis.ts`, 기록은 `brain.ts`, 계산은 `analyze()`,
  렌더는 각 진입점 — 이 경계를 그대로 유지한다.
- **유비쿼터스 언어**(추가):
  - *소프트 실패(soft failure)*: `success:true`(결과 반환)이지만 `topScore`가 낮아 1등이 정답이
    아닐 개연성이 큰 쿼리. (임계는 미확정 — 분포로 관측)
  - *스코어 분포(score distribution)*: 창 내 성공 레코드(search_notes+ask_brain)의 `topScore` 통계(건수·중앙값·p25·min·max).

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/query-analysis.ts` | 수정 | `QueryLogRecord.topScore?: number \| null` 추가(정본 — 기존 nullable 관례와 동일, strict 대입 성립); `analyze()`에 `scoreStats`(성공+수치 topScore 대상)·`scoredMissing` 카운트 추가; `QueryAnalysis`에 필드 추가 |
| `src/brain.ts` | 수정 | `searchNotes()` 로그에 `topScore`·`sources` 추가; `askBrain()` `logAsk`에 `topScore` 추가 — 둘 다 기존 `NoteHit[]` 재사용 |
| `scripts/query-report.ts` | 수정 | "스코어 분포" 렌더 섹션 추가(표본 최소치 이상일 때); 기존 출력 회귀 금지 |
| `scripts/backup.sh` | 수정 | `BACKUP_QUERY_LOG` 활성화 고지에 "도달한 노트 경로" 명시 |
| `specs/004-.../spec.md`·`specs/019-.../goal.md` | 수정 | 고지 확장에 대한 개정(supersede) 상호참조 표기 |
| `src/query-analysis.test.ts` | 수정 | `scoreStats` 집계·하위호환(필드 없는 레코드 혼재) 단위 테스트 |
| `src/brain.test.ts` | 수정 | AC-1~AC-3 프로브 테스트(`topScore`·`sources` 기록) |
| `scripts/backup.test.sh` | 수정 | AC-6 고지 문구 grep |

> `scripts/brain-report.ts`(주간 노트)는 이번 범위에서 건드리지 않는다 — 분포 주간 추이는 Open question.

## 단계 (task 분해 가능 · 의존 순)

1. **`query-analysis.ts` — 타입·집계 확장(정본 먼저)**:
   - `QueryLogRecord`에 `topScore?: number | null` 추가.
   - `analyze()`: 비-capture 성공 레코드(search_notes+ask_brain) 중 `typeof r.topScore === "number"`
     인 것으로 `scoreStats = { count, min, p25, median, max }` 계산(정렬 후 분위 산출). 별도로
     `scoredMissing`(성공 검색 중 topScore 없는 수)도 반환(투명성·하위호환 가시화).
   - `QueryAnalysis`에 `scoreStats`·`scoredMissing` 필드 추가. 기존 필드·기존 제안 문구 불변.

2. **`brain.ts` — 로깅 필드 추가**:
   - `searchNotes()`: `logQuery`에 `topScore: out[0]?.score ?? null`,
     `sources: [...new Set(out.map((h) => h.path))]` 추가.
   - `askBrain()`(`logAsk`): 레코드에 `topScore: hits[0]?.score ?? null` 추가.
     `logAsk`는 `hits`를 클로저로 이미 참조하므로 시그니처 변경 불필요.

3. **`scripts/query-report.ts` — 분포 렌더**:
   - **게이트는 `scoreStats.count >= SCORE_MIN_SAMPLES(=10)` 하나**(기존 insufficient 게이트와
     별개 — 모집단이 다르다: 전체 표본이 20건 이상이어도 topScore 보유분이 10건 미만이면
     분포 미출력, spec FR-3·AC-5). 조건 충족 시 "스코어 분포" 섹션 출력
     (예: `중앙값 0.42 · p25 0.31 · 최소 0.18 · 최대 0.71 (N건)` + 한 줄 해설:
     "낮을수록 어정쩡한 성공이 많다는 뜻 — 후속 검색 개선의 기준선이에요").
   - `scoredMissing > 0`이면 "스코어 미기록 N건(옛 로그)"을 부기. 표본 미만이면 기존 흐름 유지.

4. **`backup.sh` — 고지 문구 갱신**: opt-in 고지에 "검색어와 **도달한 노트 경로**가 백업 저장소
   git 이력에 남아요"를 반영. 대화형/비대화형 분기 문구 모두 정합.

5. **문서 개정 표기**: `specs/004`·`specs/019`의 프라이버시 고지 항목에 "025에서 노트 경로
   포함을 명시하도록 고지 확장" 상호참조 한 줄.

6. **테스트**: AC-1~AC-6(아래 표). TDD — 실패 테스트 먼저.

7. **self-review** — 독립 크리틱 적대 리뷰 + codex 교차(sdd-self-review 스킬), clean까지.

## 프라이버시 트레이드오프 (결정 + 기각안)

- **결정**: `search_notes` `sources`를 로그·백업에 그대로 싣고, 고지 문구를 갱신한다.
- **기각안 1 — 백업 시 sources 필드만 스트립**: 019의 쿼리 로그 병합이 라인 단위 dedupe이라
  (같은 쿼리라도 sources 유무로 라인이 달라져) 중복 계상·병합 깨짐을 유발. 게다가 `ask_brain`
  sources는 이미 백업되므로 부분 보호는 착시. → 복잡도만 늘고 일관성 훼손.
- **기각안 2 — sources 로깅 자체를 opt-in 하위 플래그로**: 관측이 목적인데 기본 off면 데이터가
  안 쌓여 스펙 목적 상실. 백업은 이미 019에서 opt-in(기본 로컬 전용)이므로 이중 게이트는 과함.

## 테스트 전략

| AC | 레벨 | 방법 |
|----|------|------|
| AC-1 (search 스코어·출처) | 단위(프로브) | 히트 있는 `searchNotes` → `topScore` 수치·`sources` 비어있지 않음. **스텁이 청크별 distinct 벡터를 반환하게 해 `topScore === max(전 히트 score)`까지 단언**(균일 스텁으로는 "최상위" 검증 불가 — 리뷰 경미-2) |
| AC-2 (히트 없음 경계) | 단위(프로브) | 빈 결과 → `topScore:null`·`sources:[]`·`success:false` |
| AC-3 (ask 스코어·단일) | 단위(프로브) | **기존 004 ask_brain 테스트 확장**(신규 아님) — topScore 수치 단언 추가, 단일 레코드·sources 유지·search 중복 0 회귀 고정 |
| AC-4 (하위호환) | 단위 | 레거시+신규 혼재 배열 → `analyze()` 정상, `scoreStats.count`는 topScore 보유분만 + `scoredMissing` 집계 |
| AC-5 (분포 출력) | 통합 | topScore 보유 성공 10건(now 상대 ts) → 분포 섹션 출력 / 보유 9건+레거시 20건 → 미출력(모집단 분리) |
| AC-6 (프라이버시 고지) | 셸 | `backup.test.sh`에서 활성화 고지 문구에 "노트 경로" grep |

기존 하니스 재사용: `runQueryLogProbe`(자식 프로세스 + HTTP 임베딩/게이트웨이 스텁 +
QUERY_LOG 주입 — 004 관례), query-analysis 단위 테스트(순수 함수 — 레코드 배열 직접 조립).

## Open questions

- W27 실쿼리 소실 원인 조사(spec Open questions) — 결과에 따라 `--clean` rewrite 경합
  방어(예: 제거 건수 상한 경고, 또는 append-safe 정리)를 후속 FR로. 이번 범위 밖.
- 스코어 분포의 브레이크다운(폴더별·도구별) 필요 여부 — 데이터가 쌓인 뒤 재론.
- `brain-report.ts` 주간 노트에 분포 추이 추가 — 후속.

## 모델 역할 배치

- 스펙 정의·최종 적대적 리뷰: 최상위 티어(🔖).
- 구현: 촘촘한 스펙의 국소 additive 변경 — 루틴 구현 티어 가능.
- 문서·문구: 저위험 기계 작업.
