# Goal — LocalMind 코어 중장기 개선 Phase 0~6

## 문제

LocalMind의 최근 개선은 4시간 주기 연구·구현 작업으로 빠르게 누적됐지만, GitHub 원격 상태와 외부 목표 레지스트리가 어긋났고 다음 작업의 범위가 단기 후보 중심으로 분절됐다. 신뢰성·복구·검색 품질·브리핑·이식성·living memory를 사용자 가치 순서로 닫는 하나의 기준선이 필요하다.

## 사용자 가치

사용자와 위임받은 AI가 어느 기기에서든 같은 정본을 확인하고, 결정의 why를 한 번만 안전하게 저장하며, 출처가 있는 기억을 다시 찾고, 새 세션에서 관련 맥락을 자동으로 전달받는다.

## 범위

- Phase 0부터 Phase 6까지 순서대로 구현한다.
- 각 Phase는 하나의 검증된 커밋으로 구분한다.
- Phase 0·1은 각각의 `[verified]` 커밋을 유지한 선행 PR로 병합한다. Phase 2~6은 후속
  feature branch에 각각 하나의 `[verified]` 커밋으로 누적해 Draft PR로 제출한다.
- `main` 직접 push와 자동 merge는 하지 않는다.

## 근거

- `docs/product-vision.md`
- `docs/core-roadmap.md`
- LM-RAG-001 삭제 anti-resurrection 구현 결과
- LM-RAG-002 setup readiness 구현 후보
- 기존 retrieval-quality 041 평가 자산과 한국어 embedding 비교 결과
