# 목표 — 홈서버 안전 자동 최신화

홈서버가 GitHub `main`의 CI 성공 커밋만 자동 배포하고, 새 MCP가 정상 응답하지 않으면 이전 정상 release로 복귀하게 한다.

## 성공 기준

- 새 SHA가 없으면 무변경으로 종료한다.
- CI가 성공하지 않은 SHA는 배포하지 않는다.
- 새 release에서 설치·테스트·타입검사·빌드가 모두 성공해야 전환한다.
- MCP initialize health check 실패 시 이전 release를 복구한다.
- 15분 timer와 중복 실행 lock을 제공한다.
