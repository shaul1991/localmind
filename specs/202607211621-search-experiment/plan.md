---
audience: both
---

# plan — 검색 스택 실험

- **경계**: read-only 실험 — src/ 무변경. 러너는 scratchpad, 산출물은 이 폴더 evidence만.
- **영향 모듈**: 없음(읽기: src/brain.ts searchNotes·NOTES_DIR 코퍼스·query-log 2원).
- **단계**: ① 쿼리셋 추출·선정 → ② 러너 스크립트(A: `searchNotes` import 호출, QUERY_LOG
  스크래치 격리 / B: 구조 스코어러) → ③ 실행·결과 수집 → ④ judge 판정·집계 → ⑤ 권고안 →
  ⑥ evidence 기록·AC 체크.
- **테스트 전략**: 실험 슬라이스 — 단위 테스트 대신 AC의 실파일·불변(로그 무오염·의존성 0)
  검증. 러너는 일회용(테스트 스위트 미편입).
