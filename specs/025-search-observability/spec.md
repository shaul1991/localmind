# Spec: 검색 관측성 — 소프트 실패를 볼 수 있게

상위: [goal](goal.md) · plan: [plan.md](plan.md)

## Scope

`search_notes`·`ask_brain` 쿼리 로그에 `topScore`(최상위 스코어)와 `search_notes`의
`sources`(반환 노트 키 목록)를 additive로 추가하고, `query-report`가 성공 검색의 스코어
분포를 출력하게 한다. 임계값 기반 자동 판정·검색 알고리즘 변경은 범위 밖.

## Context

- **현재 `search_notes` 로깅**(`src/brain.ts` searchNotes): `ts·tool·query·hitCount·success·folder`만
  기록. `searchNotes()`는 `searchNotesInternal()`이 반환한 `NoteHit[]`(각 `path`·`text`·`score`
  보유)를 이미 손에 쥐고 있으므로, `topScore = out[0]?.score`·`sources = [...new Set(out.map(h => h.path))]`는
  **추가 계산 없이** 로그에 실을 수 있다.
- **현재 `ask_brain` 로깅**(`src/brain.ts` `logAsk`): `sources`·`success`·`verify`·`model`·
  `persona`를 단일 레코드로 이미 기록(004 + 017). `hits`(정렬된 `NoteHit[]`)를 보유하므로
  `topScore = hits[0]?.score`만 추가하면 된다. 로깅 부재가 아니다 — goal Background 참조.
- **로그 타입 정본**: `src/query-analysis.ts`의 `QueryLogRecord`. CLI 리포트(`scripts/query-report.ts`)·
  리포트 노트(`scripts/brain-report.ts`)가 공유. `topScore?: number | null`을 이 정본에 추가한다(기존 nullable 필드 관례 `folder?: string | null`과 동일 — strict 모드에서 `?? null` 대입이 성립해야 한다).
- **파서 관용도**: `readRecords`는 `ts`·`query`만 요구하고 나머지 필드는 optional로 다룬다 —
  레거시 라인(신규 필드 없음)과 신규 라인이 한 파일에 섞여도 안전하다.
- **집계 진입점 2개**: CLI(30일/20건), 리포트 노트(7일/10건). 스코어 분포는 `analyze()`가
  계산하고 각 진입점이 렌더한다(017 레이어 분리 유지).
- **프라이버시 경로**: `BACKUP_QUERY_LOG=1`이면 `scripts/backup.sh`가 로그 파일 전체를
  백업 repo에 복사한다(기기별 `query-log.<dev>.jsonl`). `ask_brain` `sources`(노트 경로)는 이미
  이 경로로 백업된다. `search_notes` `sources` 추가는 **새 카테고리가 아니라 같은 노출의 확대**다.
- ⚠️ `--clean`(`scripts/query-report.ts`)의 원자적 rewrite는 실행 중 MCP가 append한
  레코드를 유실할 수 있음이 코드 주석에 기지 리스크로 남아 있다 — W27 소실의 유력 후보(Open question).

## Functional Requirements

- **FR-1 (search_notes 스코어·출처 기록)**: `searchNotes()`의 로그 레코드에 `topScore`(타입
  `number | null` — 반환 결과의 최상위 `score`, 결과 없으면 `null`)와 `sources`(반환 노트 키의 중복 제거 목록, 결과
  없으면 `[]`)를 추가한다. 두 값은 이미 계산된 `NoteHit[]`에서 재사용한다(추가 연산 0).
  → goal: Objective, Expected outcome

- **FR-2 (ask_brain 스코어 기록)**: `askBrain()`의 `logAsk` 레코드에 `topScore`(타입 `number | null` —
  정렬된 `hits`의 최상위 `score`, 히트 없으면 `null`)를 추가한다. 기존 `sources`·단일 레코드·`verify`/`model`/
  `persona`(017)는 불변.
  → goal: Expected outcome

- **FR-3 (스코어 분포 집계·출력)**: `analyze()`가 창(window) 내 **성공 레코드(search_notes +
  ask_brain — 둘 다 searchNotesInternal의 코사인 스코어라 스케일 동일)** 중 `topScore`가 수치인
  것으로 분포 통계(건수·중앙값·하위 분위(p25)·최솟값·최댓값)를 계산하고, `query-report`가 이를
  "스코어 분포" 섹션으로 렌더한다. **출력 게이트는 `scoreStats.count >= SCORE_MIN_SAMPLES(=10)`**
  — 기존 `insufficient`(전체 비-capture 20건) 게이트와 별개다: 레거시(스코어 미기록) 라인이
  많아 전체 표본이 충분해도, topScore 보유 표본이 10건 미만이면 분포를 출력하지 않는다
  (N=1짜리 무의미한 분포 방지). **소프트 실패 임계값은 하드코딩하지 않는다** — 사용자가 분포를
  보고 판단하게 한다.
  → goal: Objective, Non-goals(임계 확정 유보)

- **FR-4 (완전 하위호환)**: `topScore`·`sources`가 없는 레코드가 섞인 로그로도 `analyze()`·
  `query-report`·`brain-report`가 에러 없이 동작한다. 분포 통계는 `topScore`를 가진 레코드만
  대상으로 하고, 필드 없는 레코드 수를 별도로 센다(투명성 — `scoredMissing`).
  → goal: Constraints(하위호환), Non-goals(포맷 파괴 금지)

- **FR-5 (프라이버시 고지 정합)**: `search_notes` `sources`(노트 경로)가 백업 대상에 포함되므로,
  `scripts/backup.sh`의 `BACKUP_QUERY_LOG` 활성화 고지에 "검색어에 더해 **도달한 노트 경로**가
  백업 git 이력에 남고, 설정을 꺼도 이미 커밋된 이력은 지워지지 않음"을 명시한다. 004/019의
  관련 문서에 개정(supersede) 표기를 남긴다.
  → goal: Constraints(프라이버시), Risks

## Acceptance Criteria

> AC 번호는 이 스펙 로컬 표기다 — 테스트 라벨은 `025 AC-n`으로 붙여 기존 004 AC 라벨(brain.test.ts의
> 쿼리 로그 describe)과 구분한다. 025 AC-3은 기존 ask_brain 단일 레코드 테스트의 **확장**(topScore
> 단언 추가)이지 신규 테스트가 아니다.

> 모두 `runQueryLogProbe`(자식 프로세스 + HTTP 임베딩/게이트웨이 스텁, `QUERY_LOG` 주입,
> `src/brain.test.ts`)로 결정적으로 작성 가능. FR-3·4는 `query-analysis` 단위 테스트로,
> FR-5는 `scripts/backup.test.sh` 문구 grep으로.

- **AC-1**: Given 히트가 있는 `search_notes("백업 절차")` 호출 시,
  When 로그 레코드를 읽으면,
  Then `topScore`가 수치이고 `sources`가 비어 있지 않은 배열(반환 노트 키)로 기록돼 있다.

- **AC-2 (엣지 — 히트 없음)**: Given 히트가 없는 `search_notes("아무것도 없는 주제")` 호출 시,
  When 로그 레코드를 읽으면,
  Then `success:false`·`hitCount:0`이고 `topScore`는 `null`, `sources`는 `[]`이다.

- **AC-3**: Given 출처 있는 답변을 내는 `ask_brain("백업 절차가 뭐지?")` 호출 시,
  When 로그 레코드를 읽으면,
  Then 레코드는 1건이고 `topScore`가 수치이며 기존 `sources`·`success:true`가 유지된다
  (`search_notes` 중복 레코드 0 — 004 불변).

- **AC-4 (하위호환)**: Given `topScore`·`sources`가 없는 레거시 라인과 신규 라인이 섞인 로그로,
  When `make query-report`(또는 `analyze()`)를 실행하면,
  Then 에러 없이 exit 0 하고, 스코어 분포는 `topScore` 보유 레코드만 집계하며
  `scoredMissing`이 레거시 건수를 센다.

- **AC-5 (스코어 분포 출력 게이트)**: Given `topScore` 보유 성공 레코드 10건(SCORE_MIN_SAMPLES)
  이상을 포함한 로그(fixture의 ts는 `Date.now()` 상대로 생성 — query-report는 실행 시각 기준
  30일 창을 쓰므로 고정 과거 날짜는 컷오프에 걸린다)로, When `make query-report`를 실행하면,
  Then "스코어 분포"(중앙값 등) 섹션이 출력된다. Given topScore 보유분이 10건 미만이고
  레거시(미기록) 성공 라인이 20건 이상이어도, Then 분포 섹션은 출력되지 않는다(모집단 분리 —
  기존 집계·제안 출력은 불변).

- **AC-6 (프라이버시 고지)**: Given `BACKUP_QUERY_LOG=1`로 최초 백업을 실행할 때,
  When 활성화 고지가 출력되면,
  Then 문구에 "노트 경로"(도달한 노트 경로가 이력에 남음)가 포함된다.

## Open questions

- **W27 실쿼리 11건 소실 원인** — `--clean`의 rewrite 경합(query-report.ts 기지 리스크),
  기기 전환 시 미병합(019), 혹은 리셋 중 무엇인지 미확정. 조사 후 재발 방지책이 필요하면 별도
  FR/스펙으로. 이번 스펙은 원인 코드 수정을 범위 밖으로 둔다(Non-goal).
- **소프트 실패 임계값** — 분포를 관측한 뒤 결정. 코사인 스코어 스케일이 임베딩 모델에 의존하므로
  고정 임계는 이르다. 후속 스펙에서 확정.
- **`topScore` 외 상위 N 스코어(top1–top2 마진) 기록 여부** — 재랭킹 효과 판정에 마진이
  유용할 수 있으나, 지금은 소프트 실패 탐지에 `topScore` 하나로 충분하다고 판단(Simplicity
  First). 데이터가 부족을 증명하면 재론.
- **주간 추이(brain-report) 스코어 분포 포함 여부** — 후속 판단. 이번엔 CLI 리포트에만 우선 추가.

## 알려진 한계

- 스코어 분포는 후속 검색 개선의 before/after 비교 기준선을 제공할 뿐, 개선 자체는 하지 않는다.
- 임베딩 모델을 교체하면 `topScore` 스케일이 달라져 분포의 시계열 연속성이 끊긴다(모델 메타는
  023/017 경로에 있으나 이 스펙은 그 정규화를 다루지 않는다).
- `sources`는 반환 노트의 **키(label/relpath)** 만 담고 본문·청크 오프셋은 담지 않는다.
