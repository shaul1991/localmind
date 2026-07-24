# change: smoke-brain — 도구 에러 응답을 실패로 판정

## Why (배경·문제)

`scripts/smoke-brain.ts`는 도구 호출 결과의 `isError`를 확인하지 않고 응답 텍스트를 ✓로
출력한다. 그래서 도구가 오류 페이로드(예: "search_notes 실패: 임베딩 키…")를 반환해도
"모든 second-brain 도구 통과"와 0 종료로 끝난다 — 스모크가 거짓 안심을 준다
(2026-07-23 실측: EMBEDDINGS_KEY 부재 환경에서 전 단계 실패인데 ✓ 통과 출력. 회고
후속 백로그 후보 → 2026-07-24 회고에서 "오늘의 변경 1개"로 채택).

## What (변경)

- `smoke-brain.ts`: 각 도구 호출 뒤 `isError`를 검사하는 `expectOk` 가드 추가 — 에러면
  ✗ + 오류 본문 표시 + 즉시 비0 종료(이후 "모든 통과" 미출력). 정상 응답의 출력·흐름은 불변.
- `scripts/smoke-brain.test.sh`(신규): 결정적 실패 경로 검증 — 임베딩 키 없는 환경에서
  smoke:brain 실행 → 비0 종료 + ✗ 표시 + "모든 통과" 부재. (성공 경로는 임베딩 엔진이
  필요해 비헤르메틱 — CI 제외, 로컬 도그푸드로 확인.)

## Acceptance Criteria

- [x] AC-1: 도구가 `isError` 응답을 반환하면 해당 단계가 ✗로 표시되고 비0으로 종료하며
      "모든 second-brain 도구 통과"가 출력되지 않는다. *(검증: scripts/smoke-brain.test.sh
      3어서션 RED→GREEN — 키 부재 환경 결정적 재현)*
- [x] AC-2 (회귀): 정상 응답 경로의 출력·0 종료는 기존과 동일하다. *(검증: 실 임베딩
      도그푸드 — smoke:brain 전 단계 ✓·"모든 통과"·exit 0)*

## 티어 근거

**Tier 1.** 국소 행동 변경(스모크 스크립트의 판정 강화) — 하드 신호 없음, 가역,
실패 경로는 결정적 테스트로 커버. 문서는 본 change.md 단일, in-session 자기검증 1라운드.

## 검증 기록 (self-review 후 기입, 2026-07-24)

- TDD: 신규 셸 테스트 RED(3 실패 — 거짓 통과 재현) → 구현 → GREEN(3/3).
- 구현 중 결함 1건을 테스트가 즉시 검출: 초기 `process.exit(1)` 구조는 스폰된 MCP 서버
  자식을 고아로 남겨 셸 캡처가 매달림(120s 타임아웃 실측) → throw + finally
  `client.close()`로 재설계, close 실패는 원 오류를 가리지 않게 삼킴.
- `npm test` 189/189 · 셸 전수 20파일 green(CI 동일 루프) · tsc 통과.
- 같은 패턴 전수 검색: smoke-mcp.ts는 임베딩 의존 호출이 없고 도구 표면을 deepEqual로
  이미 엄격 검증 — 해당 없음 판정.
- in-session 적대 자기검증 1라운드(**비독립 명시** — 코어-온리 확정 체제): blocker 0.
