# Plan — Phase 3 검색 품질 회귀 게이트

1. **RED:** 공개 corpus CLI가 없어서 gate test가 `ERR_MODULE_NOT_FOUND`로 실패한다.
2. **GREEN:** validator, lexical fixture embedding, production retrieval runner, JSON report/manifest를 최소 구현한다.
3. **RED→GREEN:** duplicate chunk recall이 2가 되는 metric 오류를 고유 document 집계로 수정한다.
4. **RED→GREEN:** timing 누락을 비차단 p50/p95 report로 보완한다.
5. **RED→GREEN:** forged relevance와 unknown returned document를 corpus 정본 검증으로 거부한다.
6. targeted → full Node → typecheck/build → shell/Bash/diff 순으로 검증한다.
7. 최신 bytes를 범위 제한 독립 검토한 뒤 정확히 하나의 Phase 3 `[verified]` 커밋으로 닫는다.
