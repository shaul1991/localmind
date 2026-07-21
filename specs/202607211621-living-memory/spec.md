---
audience: both
---

# spec — 살아있는 기억 (결정 스키마 · brief · 재접촉 리마인드)

## FR (각 FR은 goal 항목을 지지)

- **FR-1 결정 캡처** (→ Objective 1): `capture_note`가 결정 캡처를 지원한다 — 선택(choice)·
  이유(why)·전제 목록(assumptions: 각각 `fact` + `volatility: high|low`)을 받으면 노트
  frontmatter에 `type: decision` + 3층 구조 + 각 전제의 `last_verified`(캡처 시각 자동)로
  저장한다. 기존 비정형 캡처(파라미터 미지정)는 바이트 동일하게 동작한다.
- **FR-2 forward-only 비회귀** (→ Objective 1, Non-goal 1): 스키마 없는 기존 노트는 소급
  구조화 없이 캡처·검색·브리핑 전 경로에서 종전과 동일하게 동작한다.
- **FR-3 brief 도구** (→ Objective 2): 신규 MCP 도구 `brief` — 프로젝트/주제 힌트(문자열)를
  받아 관련 결정 노트의 요약(선택·이유 요지·전제 상태)과 최근 방향 노트를 반환한다. 관련
  결과가 없으면 빈 브리핑 안내를 반환한다(에러 아님). 배달 패턴은 "CLAUDE.md류 한 줄 지시
  (세션 시작 시 brief 호출)"로 문서화한다 — 런타임 중립 (OQ-V3의 v1 답).
- **FR-4 재접촉 리마인드** (→ Objective 3): `brief`·`search_notes` 응답에 포함된 결정 노트 중
  `volatility: high` 전제의 `last_verified`가 임계(기본 30일, env로 조정)를 지난 것이 있으면,
  응답 **끝에 한 줄 신호**("이 결정의 전제 N건은 재검증된 지 M일 — 확인 권장")를 부가한다.
  결과 본문은 무변경. 검증 수행은 호스트 AI의 몫 — localmind는 신호만 낸다.
- **FR-5 재검증 갱신 관례** (→ Objective 3): v1에서 전제 재검증의 기록은 노트 파일 직접
  편집(`last_verified` 갱신 — 노트는 평문 파일이다)으로 지원하고 이 관례를 문서화한다.
  갱신된 `last_verified`는 다음 조회부터 신호 판정에 즉시 반영된다. 전용 도구는 만들지
  않는다(도구 표면 최소 — 실사용에서 필요가 실증되면 후속).

## Acceptance Criteria (Given-When-Then — 테스트 1:1)

- [ ] **AC-1** (FR-1) Given 결정 파라미터(choice·why·assumptions 2건: high 1·low 1), When
  capture_note 호출, Then 노트 파일 frontmatter에 `type: decision`·choice·why·assumptions
  (각 fact·volatility·last_verified=캡처 시각)가 기록된다.
- [ ] **AC-2** (FR-1) Given 결정 파라미터 없이 종전 방식 호출, When capture_note, Then 생성
  노트가 현행과 동일 구조다(비정형 경로 무변 — 회귀 테스트).
- [ ] **AC-3** (FR-1) Given assumptions 항목에 volatility 누락, When capture_note, Then 평이한
  한국어 안내 에러를 반환하고 파일을 만들지 않는다.
- [ ] **AC-4** (FR-2) Given 스키마 없는 기존 노트만 있는 폴더, When search_notes·brief 호출,
  Then 에러 없이 종전과 동일하게 동작한다(신호·결정 요약 없음).
- [ ] **AC-5** (FR-3) Given 힌트와 일치하는 결정 노트 존재, When brief(hint), Then 응답에 그
  결정의 선택·이유 요지·전제 상태가 포함된다.
- [ ] **AC-6** (FR-3) Given 힌트와 관련된 노트 없음, When brief(hint), Then 빈 브리핑 안내
  (한국어, 에러 아님)를 반환한다 — 흐름 비차단.
- [ ] **AC-7** (FR-4) Given volatility high 전제의 last_verified가 임계 초과한 결정 노트,
  When 그 노트가 brief 또는 search_notes 결과에 포함, Then 응답 끝에 한 줄 신호가 부가되고
  결과 본문은 신호 유무와 무관하게 동일하다.
- [ ] **AC-8** (FR-4) Given 전제가 전부 low이거나 전부 최근 검증됨, When 조회, Then 신호가
  붙지 않는다(오탐 0).
- [ ] **AC-9** (FR-4, §6-2) Given 결정 노트 frontmatter가 깨져 신호 계산 불가, When
  search_notes, Then 검색 결과는 정상 반환되고 신호만 생략된다(신호 실패가 기능을 막지 않음).
- [ ] **AC-10** (FR-5) Given 노트 파일에서 last_verified를 오늘로 갱신, When 다음 brief 조회,
  Then 신호가 사라진다(재검증 반영).
- [ ] **AC-11** (§6-1) 결정 캡처 전 과정이 capture_note 1회 호출로 완료된다 — 후속 확인·승인
  요구 없음(테스트: 단일 호출 후 파일 완성 상태 검증).
- [ ] **AC-12** (docs) 사용 문서에 결정 캡처·brief 세션 연결(CLAUDE.md 한 줄 패턴)·재검증
  관례가 안내된다.

## Open questions

- **OQ-C1**: 신호 임계 기본 30일이 적정한가 — 실사용 후 재보정 대상(env `BRIEF_STALE_DAYS`).
- **OQ-C2**: brief의 "관련" 판정 — v1은 기존 검색(현행 스택)을 재사용한다. Phase D 판정이
  검색 스택을 바꾸면 brief도 그것을 따른다(brief 자체는 스택 중립).
- **OQ-C3**: 재검증 이력 누적(갱신 기록의 타임라인) — v1은 last_verified 단일 값. 이력
  필요성은 실사용 후 판단.
