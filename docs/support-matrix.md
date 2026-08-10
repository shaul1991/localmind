# 지원 행렬

localmind의 지원 계약은 **macOS·Linux × Node 20·22·24**다. 한 기기에서는 local stdio MCP를, 여러 기기가 같은 정본을 공유할 때는 remote HTTP MCP를 사용한다.

| 호스트 | Node | local stdio | remote HTTP | CI 계약 |
|---|---:|---|---|---|
| macOS | 20, 22, 24 | 지원 | 지원 | 세 버전 전체 gate |
| Linux | 20, 22, 24 | 지원 | 지원 | 세 버전 전체 gate |
| Windows | — | 보장하지 않음 | 보장하지 않음 | matrix 없음 |

각 CI cell은 `npm ci → typecheck → Node tests → build → 전체 shell negative suite`를 실행한다. Node tests에는 실제 stdio child와 Streamable HTTP server의 tool schema·정본 identity·capture/search parity·인증 실패 회귀가 포함된다. shell suite에는 clean-room 복구, 설치, CI-green SHA 배포, 비권한 빌드/런타임, protocol health, atomic 전환과 rollback fixture가 포함된다.

## 증거의 한계

- 로컬 검증은 현재 호스트·현재 Node와 workflow wiring을 증명한다. **모든 6개 cell의 실제 성공 여부는 해당 commit의 GitHub Actions 결과가 정본**이다.
- Linux 홈서버 자동 배포는 systemd fixture와 문서 계약이다. 실제 홈서버의 권한·네트워크·서비스 관찰은 설치 운영 단계에서 별도로 확인한다.
- 원격 연결은 무료로 시작하기 쉬운 **Tailscale**을 기본 추천하지만 필수는 아니다. **WireGuard**, **ZeroTier** 또는 접근 제어된 다른 사설망도 사용할 수 있다. 공개 인터넷 직접 노출은 지원 기본값이 아니다.
- local stdio와 remote HTTP는 모두 MCP이며, remote HTTP는 여러 writable brain을 만드는 기능이 아니라 한 canonical brain을 공유하는 방식이다.
