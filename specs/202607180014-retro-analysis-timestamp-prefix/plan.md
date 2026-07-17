# Plan: retro-analysis spec 참조 파서 — timestamp 프리픽스 대응

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`src/retro-analysis.ts`의 `specs/` 경로형 캡처가 폴더 식별자 전체(`{prefix}-slug`, 프리픽스 3+자리)를
키로 잡게 한다. **실제 변경은 국소적**이다(구현 후 확정): ① `parseCommits`의 path 정규식 1개
(`\bspecs\/(\d{3}[\w-]*)`), ② 그 변경이 노출한 이중 키를 막는 인접형 lookahead(`(?!\/)`) 1개.
`collectDecisionNotes`(line 131)는 이미 `\d{3}[\w-]*`라 무변경, 레거시 바레 `(NNN)`·나열형도 무변경.
032 오집계 방어(절 시작만 / 인접 12자 / 절 중간 배제)를 보존하고, 순수 집계 경계(IO 없음)를
유지하며 TDD로 진행한다.

`workflow-policy`의 `PREFIX_RE`는 재사용하지 않는다(미export·`^…$` 앵커라 부분 매치 부적합 +
활성화 컨텍스트와의 결합 과설계 — FR-5 정정). 대신 `specs/` 경로형은 **느슨한 캡처**
`specs/([0-9]{3,}(?:-[\w-]+)?)`로 폴더 식별자를 잡는다(3+ 숫자 프리픽스 + 선택 슬러그). 레거시 바레
`(NNN)`·`docs(spec):` 나열형·인접형은 timestamp를 쓰지 않으므로(OQ-1) 기존 `\d{3}` 그대로 둔다.

## 도메인 경계 (DDD)

- **bounded context**: 워크플로 회고(retrospective) 집계 — specs/032가 세운 컨텍스트. 이 작업은
  경계를 넓히지 않고 기존 파서의 인식 범위만 확장한다.
- **유비쿼터스 언어**: "spec 식별자(spec identifier)" = `{prefix}-slug` 폴더명. "프리픽스(prefix)" =
  식별자 앞부분 숫자(timestamp 또는 레거시 번호). cadence 키 = spec 식별자.
- **순수성 불변식**: `retro-analysis.ts`는 텍스트/객체 입력만 받는 순수 함수(IO는 `scripts/retro-report.ts`).
  이 경계를 깨지 않는다.

## 영향 모듈

- **수정**: `src/retro-analysis.ts` — `parseCommits`의 path 정규식 1개(폴더 식별자 캡처) + 인접형
  lookahead 1개(이중 키 방지), `CommitAggregate.specCadence` 주석(3자리 → spec 식별자). (`collectDecisionNotes`
  line 131은 이미 폴더 식별자 캡처라 무변경 — 회귀 테스트로 확인만.)
- **수정**: `src/retro-analysis.test.ts`(032 정본 테스트) — 신규 timestamp 시나리오 추가 +
  레거시 기대 키를 새 규칙에 맞춰 갱신(집계 누락 0 확인).
- **무변경**: `src/agents/workflow-policy.ts`(FR-5 정정으로 결합 철회 — 건드리지 않는다),
  `src/retro-note.ts`(렌더 — Non-goal), `scripts/retro-report.ts`(얇은 IO — 폴더명은
  이미 식별자 전체를 넘김), `extractOpenQuestions`(이미 폴더명 키 — 회귀 테스트만).

## 단계 (task 분해 가능)

- [x] 1. **실패 테스트 먼저(RED)** — timestamp 경로형 cadence(AC-1), 혼재·동일프리픽스 분리(AC-2),
      decision 노트 키 일치(AC-3), specs/ 앵커 필수(AC-6), 오집계 방지(AC-5) 시나리오를
      `retro-analysis.test.ts`에 추가 → 검증: 새 테스트가 현재 코드에서 실패.
- [x] 2. **`parseCommits` 캡처 통일** — `specs/{식별자}` 경로형을 느슨 캡처(3+ 숫자 프리픽스 + 선택
      슬러그), 키는 식별자 전체. 레거시 `(NNN)`·나열형은 후방호환 유지, 오집계 방어 보존 → 검증: 1단계 테스트 GREEN.
- [x] 3. **`collectDecisionNotes` 규칙 정렬** — line 131을 2단계와 같은 캡처 규칙으로 → 검증: AC-3 GREEN.
- [x] 4. **레거시 회귀 확인·기대 키 이관** — 032 기존 테스트를 새 키 규칙에 맞춰 갱신, 집계 누락 0
      확인(AC-4) → 검증: 전체 스위트 GREEN.
- [x] 5. **도그푸드** — 실제 `make retro` 실행, 이 spec 폴더(timestamp)가 리포트에 나타남을 관측(AC-7)
      → 검증: 리포트 출력에 `202607180014-retro-analysis-timestamp-prefix` 존재.

## 테스트 전략

| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 cadence 경로형 | 단위 | `parseCommits`에 timestamp 경로형 커밋 픽스처 → 키 집계 | [x] |
| AC-2 혼재·동일프리픽스 분리 | 단위 | 3자리+timestamp+같은분 두 슬러그 혼합 로그 → 독립 키 | [x] |
| AC-3 decision 키 일치 | 단위 | timestamp 참조 decision 노트 → `specRefs` == cadence 키 | [x] |
| AC-4 레거시 집계 유지 | 단위 | 032 기존 픽스처 → 집계 누락 0(키는 새 규칙) | [x] |
| AC-5 오집계 방지 | 단위 | `docs(spec): {ts} cap 100` → 절 중간 숫자 배제 | [x] |
| AC-6 timestamp specs/ 앵커 | 단위 | specs/ 밖 12·14자리 숫자열 → timestamp 미집계 | [x] |
| AC-7 도그푸드 | 실증 | `make retro` 실행 → 리포트에 이 spec 식별자 관측 | [x] |

## Open questions

- 없음(spec의 OQ-1·2·3 전부 확정). FR-5 정정대로 `workflow-policy` `PREFIX_RE`는 재사용하지 않고
  (결합 과설계·앵커 정규식 부적합) `specs/` 경로형을 느슨하게 캡처한다.
