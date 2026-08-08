# 리뷰 — 홈서버 안전 자동 최신화

## 현재 판정

로컬 구현과 품질 게이트는 통과했다. `npm run typecheck`, 200개 Node 테스트, `npm run build`, 전체 셸 테스트(신규 46개 포함)가 모두 성공했다. 독립 리뷰에서 지적된 root 실행, `.env` source, 첫 배포 self-link, readiness 경쟁, capability, restrictive umask 위험을 반영해 비권한 런타임/빌더, 검증 후 `root:root` 읽기 전용 release 회수, systemd sandbox, 리터럴 환경 파서, bounded health 재시도와 명시적 artifact 권한을 추가했다. 홈서버 실배포 관찰은 Draft PR과 별도로 운영 단계에서 수행한다.

## Codex PR 리뷰 대응

- HTTP MCP unit에 `MCP_TRANSPORT=http`를 명시했다.
- `StateDirectory=localmind-deploy`와 설치 시 `/opt/localmind/releases` 선생성을 추가했다.
- restrictive umask로 생성된 release 부모를 `0755`로 고정해 런타임 traversal을 보장했다.
- 개인 note 경로를 unit에서 제거하고 설치별 `write-paths.conf` drop-in으로 분리했다.
- source checkout을 `/var/lib/localmind-deploy/source`로 표준화했다.
- system-wide `/usr/bin/node`·`/usr/bin/npm` 전제를 설치 단계에서 검증하고 npm 경로를 unit에 명시했다.
- IPv6 literal은 bracket URL로 probe하고 wildcard `::`는 `[::1]`로 매핑했다.
- Linux 홈서버에서 공백 포함 `ReadWritePaths` drop-in과 unit 전체가 `systemd-analyze verify`를 통과했다.

## 확인할 위험

- `gh` 인증 만료 또는 GitHub API 장애 시 배포가 보류되는가
- 기존 `.env`가 `/etc/localmind/localmind.env`로 권한 600을 유지하는가
- 새 unit 전환 중 서비스 중단이 최소화되고 health 실패 시 이전 release로 복귀하는가
- source repo의 비추적 `.env.bak-*`를 삭제하지 않는가
