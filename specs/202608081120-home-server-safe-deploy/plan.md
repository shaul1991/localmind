# 계획 — 홈서버 안전 자동 최신화

1. 셸 픽스처로 성공, CI 실패, health 실패 롤백, dirty 거부, 멱등 no-op을 RED로 고정한다.
2. release worktree 기반 배포 스크립트를 최소 구현한다.
3. systemd service/timer와 MCP 서비스 unit을 추가한다.
4. 로컬 전체 품질 게이트를 실행한다.
5. 홈서버에 기존 SHA release를 bootstrap한 뒤 unit을 전환한다.
6. 최신 CI-green SHA를 배포하고 MCP 원격 호출까지 확인한다.
