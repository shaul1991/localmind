# Plan: 원격 MCP 접속(HTTP)

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑. 상위: [goal](goal.md) · [spec](spec.md) -->

## 접근 요약
`src/mcp.ts`를 "전송 방식 선택 진입점"으로 바꾼다. `MCP_TRANSPORT` 환경변수로 stdio(기본)와
http를 고르고, http면 express 앱에 SDK의 `StreamableHTTPServerTransport`를 물린 `serveHttp()`를
호출한다. 도구 정의(`buildServer()`)와 노트 워처(`watchNotes()`)는 **프로세스당 1회** 초기화해
공유하고, 세션은 SDK 표준 세션맵 패턴으로 관리한다. 인증은 라우트 앞단 Bearer 미들웨어로
강제한다. 기존 stdio 경로는 그대로 남긴다(회귀 0).

## 도메인 경계 (DDD)
- **MCP 전송(transport) 경계**: 새로 생기는 관심사. "도구 정의(mcp-server)"는 무변경, "전송·인증·
  세션"만 신규. 도구 도메인과 전송 도메인을 분리해 stdio/http가 같은 `buildServer()`를 공유한다.
- 유비쿼터스 언어: *transport mode*(stdio|http), *auth token*, *session*(Mcp-Session-Id), *bind host*.

## 영향 모듈
- **수정** `src/mcp.ts`: 전송 분기(stdio/http). stdio 경로는 현행 유지.
- **신규** `src/mcp-http.ts`: `serveHttp({ port, host, path, token })` — express 앱 + Streamable HTTP
  전송 + Bearer 미들웨어 + 세션맵 + `watchNotes()` 단일 기동 + graceful shutdown. (테스트 대상 함수로 분리)
- **신규** `src/mcp-http.test.ts`: AC-1·2·5·7 통합 테스트(실제 HTTP 요청).
- **수정** `src/mcp.ts` 관련 단위 테스트 또는 신규 `src/mcp-transport.test.ts`: 전송 선택·AC-3·4.
- **수정** `Makefile`: `mcp-serve-http` 타깃(토큰 자동 생성·안내), 필요 시 `mcp-config`류 http 변형.
- **수정** `docs/mcp.md`: HTTP 원격 모드 절 + Claude Code 연동 명령 + Tailscale 안내 + 보안 경고.
- **무변경** `src/mcp-server.ts`(도구 정의), `src/server.ts`(스택 서버).

## 단계 (task 분해 가능)
<!-- self-review clean 후 완료된 단계는 [ ]→[x]로 표기. -->
- [ ] 1. **SDK API 재확인(OQ 해소)**: 설치본(1.29.x)에서 `StreamableHTTPServerTransport` 정확한
  임포트 경로·생성자 옵션(`sessionIdGenerator`/`onsessioninitialized`/`onclose`)·`handleRequest`
  시그니처 확정. (Live-Verify 게이트 — 기억으로 단정 금지)
- [ ] 2. **전송 선택 진입점**(FR-4): `src/mcp.ts`에서 `MCP_TRANSPORT` 분기. 미설정/stdio → 현행 그대로.
- [ ] 3. **`serveHttp()` 골격**(FR-1): express 앱 + `POST/GET/DELETE {path}` 라우트, initialize 시
  세션 생성·세션맵 저장, 후속은 `Mcp-Session-Id`로 라우팅, 알 수 없는 세션 → 404(AC-5).
- [ ] 4. **Bearer 인증**(FR-2): 라우트 앞단 미들웨어에서 `Authorization: Bearer` 검증(상수시간 비교),
  실패 → 401(AC-2). 기동 시 토큰 공백이면 non-zero 종료 + 한국어 에러(AC-3).
- [ ] 5. **바인딩·설정**(FR-3, AC-7): `MCP_HTTP_HOST`(기본 `127.0.0.1`)·`MCP_HTTP_PORT`(기본 `8789`)·
  `MCP_HTTP_PATH`(기본 `/mcp`). 기본 비공개 확인.
- [ ] 6. **워처 단일화·shutdown**(FR-5): `watchNotes()` 1회 기동, SIGINT/SIGTERM에 워처 close + 서버
  종료. 세션 onclose 시 맵 정리.
- [ ] 7. **기동·연동 수단**(FR-6): `make mcp-serve-http`(토큰 없으면 생성·표시), `docs/mcp.md` 갱신
  (Claude Code `claude mcp add --transport http ... --header`, Tailscale 사설망 안내, 보안 경고).
- [ ] 8. **E2E 검증**(AC-6): HTTP 인스턴스에 두 클라이언트 접속 → capture_note → 재인덱싱 → search_notes
  반환 확인(수동 또는 통합).
- [ ] 9. self-review(분리 컨텍스트 에이전트) → 세 문서 검증 표기 → 커밋·push·CI 감시.

## 테스트 전략
<!-- 각 AC를 어느 레벨 테스트로 검증할지. TDD. 상태는 self-review clean 후 채운다. -->
| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 도구 노출 | 통합 | http로 기동 후 initialize→tools/list, 도구 13종 이름 assert | [ ] |
| AC-2 인증 차단 | 통합 | 토큰 없음/오토큰 요청 → 401, 도구 미실행 assert | [ ] |
| AC-3 기동 거부 | 단위 | 토큰 공백으로 serveHttp 진입 → throw/exit·포트 미개방 assert | [ ] |
| AC-4 하위호환 | 단위 | `MCP_TRANSPORT` 미설정 → stdio 경로 선택(전송 팩토리 분기) assert | [ ] |
| AC-5 세션 라우팅 | 통합 | initialize로 Mcp-Session-Id 획득→재사용 OK / 임의 세션→404 | [ ] |
| AC-6 단일 두뇌 E2E | 통합/수동 | 한 세션 capture_note→재인덱싱→다른 세션 search_notes 반환 | [ ] |
| AC-7 기본 바인딩 | 단위 | host 미설정 시 바인드 주소=127.0.0.1 assert | [ ] |

## Open questions
- 세션 모드 확정: **stateful 세션맵**(SDK 표준, watchNotes 단일화에 유리) 잠정 채택 — 1단계
  재확인 후 stateless가 더 단순하면 재검토.
- ~~기본 포트 `8788` 확정 여부~~ → **`8789`로 확정**: `8788`은 모니터링 UI 서버 포트(specs/034)라 회피(8787 스택·4000 litellm·8788 UI 모두 피함).
- Make 타깃에서 토큰 저장 위치(`.env`의 `MCP_AUTH_TOKEN`) — 기존 `make init-env` 관례와 정합 확인.
