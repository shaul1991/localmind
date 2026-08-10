# Review — Phase 5

## RED→GREEN

- RED: 기존 CI에는 OS matrix가 없고 `runs-on: ubuntu-latest`로 고정돼 contract test가 실패했다.
- GREEN: `os=[ubuntu-latest, macos-latest]`, Node 20·22·24, read-only permission, 20분 timeout, explicit Bash를 연결한 뒤 targeted contract test가 통과했다.

## Local targeted evidence

- 현재 cell: Darwin, Node 22.23.2
- portability workflow contract: 1/1
- 실제 stdio/HTTP parity 및 privacy: 3/3
- install, clean-room recover, setup readiness, CI-green deploy/rollback fixture: 4개 script 모두 통과
- typecheck, build, diff check: 통과

첫 frozen broad attempt에서는 기존 real `fs.watch` 삭제-event integration이 3초 guard에 도달했다. 같은 immutable snapshot의 단일 재확인은 108ms에 통과해 기능 결함이 아닌 loaded-runner timing flake로 확인했다. macOS matrix 안정성을 위해 event guard를 bounded 8초, child timeout을 10초로만 늘렸고 동일 integration은 110ms에 다시 통과했다. 실패 evidence는 폐기 candidate evidence에 보존한다.

다른 5개 OS/Node cell의 실제 성공은 이 문서에서 합성하지 않으며 Draft PR GitHub Actions에서 확인한다.

## 독립 검토 체크리스트

- 6개 matrix cell과 gate 순서가 parser로 결속됐는가
- stdio/HTTP parity와 home deploy negative suite가 각 cell의 전체 test 경로에 포함되는가
- CI 권한·timeout·실패 전파가 fail closed인가
- 문서가 실제 PR CI 이전에 6-cell 성공을 과장하지 않는가
- Tailscale이 쉬운 기본 추천이되 WireGuard·ZeroTier도 허용되는가

최종 frozen evidence와 판정은 candidate 고정 후 기록한다.
