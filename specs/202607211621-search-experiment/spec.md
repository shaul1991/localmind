---
audience: both
---

# spec — 검색 스택 실험

## FR

- **FR-1** (goal Objective 지지): 실쿼리 로그 2원(서버 백업 87건·로컬 42건)에서 search_notes
  쿼리를 추출·중복 제거하고, 의도 클러스터별 대표 15~25개를 선정한다(선정 기준 기록).
- **FR-2** (goal Objective 지지): 방법 A = 현행 프로덕션 검색 경로(`searchNotes`, bge-m3
  임베딩·cosine)를 프로그램적으로 호출해 쿼리별 top-5를 얻는다.
- **FR-3** (goal Objective 지지): 방법 B = 신규 의존성 없는 구조 검색 스코어러(제목 매치 ×3·
  태그 ×2·본문 빈도 ×1·최근성 부스트)로 동일 코퍼스에서 쿼리별 top-5를 얻는다.
- **FR-4** (goal Success metrics 지지): 쿼리별 A/B top-5를 나란히 놓고 "쿼리 의도에 더 잘
  답하는 쪽"을 판정(근거 한 줄씩, 무승부 허용) → 집계.
- **FR-5** (goal Objective 지지): 판정 권고안(유지/제거/하이브리드 + 근거 + 제거 시 감량
  목록)을 작성한다. 결정이 아니라 권고 — 사용자 게이트 명시.

## AC

- [x] **AC-1**: Given 로그 2원, When 추출·선정하면, Then evidence에 쿼리 ≥15개와 선정 기준이
  기록돼 있다. [검증: evidence/experiment.md 실파일]
- [x] **AC-2**: Given 선정 쿼리, When 방법 A 실행하면, Then 프로덕션 query-log가 오염되지 않고
  (QUERY_LOG 격리 경로 사용 확인) 쿼리별 top-5(경로·스코어)가 기록된다. [검증: 실행 전후
  ~/.localmind/query-log.jsonl 줄 수 불변 + evidence]
- [x] **AC-3**: Given 동일 쿼리, When 방법 B 실행하면, Then 신규 npm 의존성 0으로 쿼리별
  top-5가 기록된다. [검증: package.json diff 없음 + evidence]
- [x] **AC-4**: Given 양쪽 결과, When 판정하면, Then 쿼리별 승자·근거 1줄과 A/B/무 집계,
  한계(라벨 부재·judge 단일)가 evidence에 명시돼 있다. [검증: evidence 실파일]
- [x] **AC-5**: Given 집계, When 권고안을 쓰면, Then 유지/제거/하이브리드 중 1개 권고 + 뒤집을
  신호 + "최종 결정은 사용자" 문구가 있다. [검증: evidence 실파일]

## Open questions

- 실험이 판정 못 하는 축: 대규모 코퍼스(>10k 노트)에서의 스케일 특성 — 현 1240파일 기준
  결과로 한정.
