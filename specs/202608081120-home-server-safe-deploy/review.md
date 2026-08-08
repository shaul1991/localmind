# 리뷰 — 홈서버 안전 자동 최신화

## 현재 판정

로컬 구현과 품질 게이트는 통과했다. `npm run typecheck`, 200개 Node 테스트, `npm run build`, 전체 셸 테스트(신규 65개 포함)가 모두 성공했다. 독립 리뷰에서 지적된 root 실행, `.env` source, 첫 배포 self-link, readiness 경쟁, capability, restrictive umask 위험을 반영해 비권한 런타임/빌더, 검증 후 `root:root` 읽기 전용 release 회수, systemd sandbox, 리터럴 환경 파서, bounded health 재시도와 명시적 artifact 권한을 추가했다. 홈서버 실배포 관찰은 Draft PR과 별도로 운영 단계에서 수행한다.

## Codex PR 리뷰 대응

- HTTP MCP unit에 `MCP_TRANSPORT=http`를 명시했다.
- `StateDirectory=localmind-deploy`와 설치 시 `/opt/localmind/releases` 선생성을 추가했다.
- restrictive umask로 생성된 release 부모를 `0755`로 고정해 런타임 traversal을 보장했다.
- 개인 note 경로를 unit에서 제거하고 설치별 `write-paths.conf` drop-in으로 분리했다.
- source checkout을 `/var/lib/localmind-deploy/source`로 표준화했다.
- system-wide `/usr/bin/node`·`/usr/bin/npm` 전제를 설치 단계에서 검증하고 npm 경로를 unit에 명시했다.
- IPv6 literal은 bracket URL로 probe하고 wildcard `::`는 `[::1]`로 매핑했다.
- note 쓰기 루트는 설치자가 환경 변수로 반드시 지정하며, 부모 traversal은 사용자 ACL로 제한한다.
- 공개 저장소 bootstrap은 자격증명 없는 HTTPS clone을 사용한다.
- `current`와 `last-good-sha`가 어긋나면 준비된 release를 재빌드하지 않고 GitHub 재조회와 무관하게 health 검증을 즉시 재개한다.
- `last-good-sha`는 파일 fsync 후 원자적으로 교체한다. 교체 전 실패는 이전 pointer로 롤백하고, 교체 후 디렉터리 fsync 실패는 새 pointer·current 일관성을 유지하며 경고한다.
- 쓰기 루트는 권한 변경 전에 절대·정규화·non-root 경로인지 검증한다.
- fresh install은 `.env.example`에서 `.env`를 만들고 인증 token·노트·인덱스·query log 경로를 명시한다.
- GitHub 자격증명은 root-only `/etc/localmind/deploy.env`로 MCP 환경과 분리하고 bootstrap 전에 인증을 검증한다.
- MCP는 `/var/lib/localmind` StateDirectory와 강제 HOME을 가져 `QUERY_LOG` 미설정 시에도 writable 기본값을 사용한다.
- Linux 홈서버에서 공백 포함 `ReadWritePaths` drop-in과 unit 전체가 `systemd-analyze verify`를 통과했다.

## 확인할 위험

- `gh` 인증 만료 또는 GitHub API 장애 시 배포가 보류되는가
- 기존 `.env`가 `/etc/localmind/localmind.env`로 권한 600을 유지하는가
- 새 unit 전환 중 서비스 중단이 최소화되고 health 실패 시 이전 release로 복귀하는가
- source repo의 비추적 `.env.bak-*`를 삭제하지 않는가
