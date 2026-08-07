# Plan — 원격 LocalMind 정본 preflight

1. `whoami` 공개 안전 응답 테스트 RED → deployment id/라벨 최소 구현 GREEN.
2. 실제 HTTP fixture와 임시 HOME을 쓰는 6-state 테스트 RED → config reader + MCP identity 비교 GREEN.
3. 읽기 전용 CLI 테스트 RED → `scripts/remote-check.ts` GREEN.
4. 서버 준비 로그의 경로 누출 테스트 RED → 공개 안전 summary GREEN.
5. 원격 문서와 CHANGELOG를 구현 상태에 맞춘다.
6. 관련 테스트, 전체 suite, typecheck, build, diff/security review를 수행한다.
7. feature branch에만 commit/push하고 한국어 Draft PR을 만든다.
