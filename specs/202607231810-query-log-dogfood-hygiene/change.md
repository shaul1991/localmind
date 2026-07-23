# change: 도그푸드 query-log 오염 방지 — smoke 격리 + 수칙 명문화

## Why (배경·문제)

백로그 확정 항목(회고 1 발견, 2026-07-22 / PR #47): 도그푸드가 노트 폴더는 격리하면서
query-log는 공용 `~/.localmind/query-log.jsonl`에 기록해 실사용 측정(검색 품질 리포트·brief
통계)을 왜곡한다. 2026-07-23 회고에서 오염이 리포트에 실제로 보임을 재확인했고(노트 갭
키워드에 probe·greatreduction 등 도그푸드성 쿼리), 벡터를 실측으로 특정했다:
`scripts/smoke-brain.ts`가 NOTES_DIR는 임시 폴더로 격리하면서 스폰 env에 QUERY_LOG를 넘기지
않아 검색·캡처 레코드가 공용 로그로 샌다(HOME 격리 실측: smoke 1회 → 기본 경로에 2건 기록).

## What (변경)

- `scripts/smoke-brain.ts`: 스폰 env에 `QUERY_LOG`를 격리 경로(임시 NOTES_DIR 내부)로 설정 —
  테스트 스위트(mcp-server.test.ts)가 이미 쓰는 격리 패턴과 동일.
- `scripts/query-log-hygiene.test.mjs`: 정적 회귀 가드(pinning.test.sh 결) — smoke-brain이
  QUERY_LOG를 설정하는지 고정.
- `AGENTS.md` 구현 규율: 도그푸드·프로브·스모크의 QUERY_LOG 격리 수칙 명문화(공용 로그는
  실사용 측정 전용).
- `BACKLOG.md`: 해당 항목 해소 체크.
- (Tier 0 동승) `src/search-event-contract.test.ts` 테스트 제목의 소멸한 retro-note 참조 제거 —
  행동 불변(제목 문구만). `src/brain.test.ts:93`의 retro-analysis 언급은 이관 이력 설명이라
  유지 판정.

## Acceptance Criteria

- [x] AC-1: `npm run smoke:brain` 실행이 공용(기본 경로) query-log에 레코드를 추가하지 않는다.
      *(검증: HOME 격리 라이브 실측 — 수정 전 기본 경로 2건 기록 → 수정 후 0건)*
- [x] AC-2: smoke-brain 스폰 env의 QUERY_LOG 격리 설정이 정적 가드 테스트로 고정된다.
      *(검증: scripts/query-log-hygiene.test.mjs RED→GREEN)*
- [x] AC-3: 격리 경로에는 레코드가 정상 기록된다 — 측정 자체를 없애지 않는다.
      *(검증: 라이브 실측 — 격리 NOTES_DIR/query-log.jsonl에 2건 기록)*
- [x] AC-4: AGENTS.md에 도그푸드 측정 위생 수칙이 명문화된다. *(구현 규율 절 추가)*
- [x] AC-5 (Tier 0): retro-note 테스트 제목 정리 — 전체 스위트 green(행동 불변).
      *(검증: npm test 178/178)*

## 티어 근거

**Tier 1.** config성 env 변경이라 Tier 0 제외(규약) — 행동 영향은 "스모크의 로그 기록 경로"로
한정됨을 실측으로 확인. 계약·마이그레이션·보안·전역 상태 하드 신호 없음, 가역적. 문서는 본
change.md 단일, critic은 in-session 적대 자기검증 1라운드. AC-5는 행동 불변 자명(Tier 0)이라
테스트 추가 없이 동승.

## 검증 기록 (self-review 후 기입, 2026-07-23)

- TDD: 정적 가드 RED(수정 전) → smoke-brain 격리 적용 → GREEN. `npm test` 178/178 green ·
  `make check`(tsc) 통과.
- 라이브(HOME 격리 — 실로그 무오염 측정): 수정 전 smoke 1회 → 기본 경로 2건 기록(누출 재현),
  수정 후 → 기본 경로 0건 + 격리 경로 2건(측정 보존). 실패 검색도 기록되므로 임베딩 상태와
  무관하게 증거 유효.
- in-session 적대 자기검증 1라운드(**비독립 명시** — 순수 실험 기간): blocker 0.
  관찰(비차단·스코프 밖): smoke-brain이 도구 응답이 에러 텍스트여도 ✓/통과로 출력하는 기존
  결함 — 백로그 후보로 보고. smoke-mcp는 검색·캡처를 안 해 격리 불요 확인.
- AGENTS.md 결정 로그 절의 소멸한 make retro 참조도 함께 정정(잔재 정리 스코프) —
  brief 폴백(specs/202607231759, PR #49)이 decision 태그의 현행 소비자임을 명시.
