# 명세 — 홈서버 안전 자동 최신화

## 기능 요구사항

1. `origin/main`을 fetch하고 full SHA를 배포 식별자로 사용한다.
2. GitHub Actions `CI`의 해당 SHA 결론이 `success`인 경우만 진행한다.
3. `/opt/localmind/releases/<sha>` worktree에서 `npm ci`, `npm test`, `npm run typecheck`, `npm run build`를 실행한다.
4. `/opt/localmind/current` 링크를 원자적으로 교체하고 `localmind-mcp.service`를 재시작한다.
5. Bearer 인증을 포함한 MCP `initialize`를 bounded retry하고 응답에서 `protocolVersion`을 확인한다.
6. 실패 시 이전 링크를 복원하고 서비스를 다시 확인한다.
7. 이미 최신 SHA여도 MCP 서비스가 중지되어 있으면 재시작한다.

## 안전 조건

- source repo의 추적 파일이 dirty면 중단한다. 비추적 운영 백업 파일은 삭제하지 않는다.
- 환경 파일과 인증 토큰을 출력하거나 셸 코드로 source하지 않는다.
- npm lifecycle·테스트·빌드는 `localmind-builder` 비권한 사용자로 실행한다.
- 검증된 release는 활성화 전에 `root:root`, `u=rwX,go=rX`로 회수해 builder가 현재·롤백 artifact를 수정하지 못하게 한다.
- MCP 런타임은 `localmind` 비권한 사용자와 systemd sandbox로 제한한다.
- `flock`으로 중복 배포를 막는다.
- CI 미확인 상태는 실패 폐쇄 방식으로 보류한다.
