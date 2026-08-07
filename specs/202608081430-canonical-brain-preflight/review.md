# Review — 원격 LocalMind 정본 preflight

## 판정

**통과** — 구현 후보의 최소 수직 슬라이스를 충족한다.

## TDD 증거

- RED: `whoami`가 deployment id 대신 hostname/절대경로를 반환해 테스트 실패.
- GREEN: deployment id + 라벨만 반환.
- RED: preflight 모듈/CLI 부재, scope·identity 상태 테스트 실패.
- GREEN: user scope HTTP 단일 등록 + `whoami` identity 일치만 성공.
- RED→GREEN 추가 보강: malformed config fail-closed, local/project scope 거부, 잘못된 identity 미출력, 허용되지 않은 env secret 거부, 공개 identity 형식 검증, 무응답 endpoint 8초(테스트 25ms) timeout.

## 실제 검증

- `npm test`: **197 pass, 0 fail, 0 skip**.
- `npm run typecheck`: 성공.
- `npm run build`: 성공.
- 실제 Streamable HTTP fixture + 임시 HOME/QUERY_LOG dogfood: 성공. 설정 파일 byte-for-byte 불변과 secret·절대경로 미출력 확인.
- `git diff --check`: 성공.

## 독립 리뷰 반영

사전 커밋 독립 리뷰의 보안/정확성 지적을 검증 후 반영했다.

- 저장소 제어 `.mcp.json`에서 임의 endpoint로 secret이 전송될 수 있음 → local/project scope는 네트워크 전에 거부하고 user scope만 허용.
- 임의 환경변수 header 확장 → `Authorization`의 `MCP_AUTH_TOKEN`만 허용.
- malformed JSON·scope/object 구조를 미설정으로 오인 → `localmind` 항목과 프로젝트 객체까지 모든 scope를 fail-closed.
- 인증 없는 endpoint가 공개 id만 흉내낼 수 있음 → `Authorization: Bearer ${MCP_AUTH_TOKEN}` 단일 헤더를 필수화하고 literal token을 거부.
- wrong identity 및 준비 로그의 경로/hostname 노출 → 신뢰 전 id 미출력, 공개 label 검증, endpoint 로그 제거.
- 무응답 endpoint 무한 대기 → 요청별 timeout 추가.

## 범위·잔여 위험

- Claude Code 설정 저장 형식이 향후 변경되면 `CONFIG_INVALID`/`NO_CONFIG`로 보수적으로 실패할 수 있다.
- 실제 개인 홈서버·개인 연결 계정은 접근하지 않았으며, 인증된 로컬 HTTP fixture로만 확인했다.
- preflight는 설정을 고치지 않는다. 실패 시 사용자가 문서에 따라 등록을 정리해야 한다.

## 연구 근거

`localmind-research-lab/reports/drafts/2026-08-08-canonical-brain-and-verifiable-sources.md`
