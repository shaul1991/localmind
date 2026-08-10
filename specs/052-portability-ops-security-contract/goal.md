# Goal — Phase 5 이식성·운영·보안 계약

이미 구현된 transport parity와 안전 배포를 실제 support matrix에 지속적으로 결속한다.

## 성공 기준

- CI가 Ubuntu·macOS와 Node 20·22·24의 6개 cell을 fail-fast 없이 실행한다.
- 각 cell이 typecheck, 전체 Node tests, build, 전체 shell negative suite를 같은 순서로 통과해야 한다.
- workflow token은 read-only이고 각 cell은 bounded timeout을 갖는다.
- support 문서가 local stdio/remote HTTP, Tailscale 기본 추천과 WireGuard·ZeroTier 대안을 명확히 구분한다.
- 실제 6-cell 성공은 PR CI 전에는 완료로 오보고하지 않는다.
