# Spec — Phase 5 portability/ops/security v1

## 기능 계약

1. `.github/workflows/ci.yml`의 build job은 `os=[ubuntu-latest, macos-latest]`, `node=[20,22,24]` cartesian matrix다.
2. job은 `${{ matrix.os }}`에서 실행하고 이름에 OS와 Node를 모두 표시한다.
3. 각 cell은 `npm ci → npm run typecheck → npm test → npm run build → scripts/*.test.sh` 순서다.
4. shell step은 explicit Bash이며 어떤 gate도 `continue-on-error`로 약화하지 않는다.
5. `permissions: contents: read`, `timeout-minutes: 20`, `fail-fast: false`를 고정한다.
6. package는 Node `>=20`과 Node/`.mjs` test glob을 유지한다.
7. 문서는 macOS/Linux, Node 20·22·24, local stdio/remote HTTP, Tailscale/WireGuard/ZeroTier를 정확히 표시한다.

## 기존 실행 계약의 결속

- `src/mcp-parity.test.ts`: 실제 stdio child와 Streamable HTTP server의 schema·identity·capture/search·auth parity.
- `scripts/home-server-deploy.test.sh`: CI-green full SHA, 비권한 실행, protocol initialize health, atomic activation/rollback.
- clean-room/install/setup 및 전체 shell suite: 설치·복구 negative paths.

## 비기능 계약

- workflow 검증은 YAML parser 기반이며 단순 문자열 존재로 통과하지 않는다.
- matrix/config test가 해당 파일 변경의 RED→GREEN 근거다.
- real filesystem watcher integration은 loaded macOS runner에서도 의미를 유지하도록 8초 event guard·10초 child timeout으로 bounded한다.
- 로컬 gate는 6개 runner의 실제 결과를 합성하지 않는다. 최종 PR의 GitHub Actions가 cross-runtime 증거다.

## 비범위

- Windows 지원
- 실제 홈서버에 자동 배포
- public-internet MCP 노출
- VPN provider 종속 설치 자동화
- 이미 검증된 배포 스크립트의 재작성
