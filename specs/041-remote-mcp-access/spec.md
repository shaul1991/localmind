# Spec: 원격 MCP 접속(HTTP)

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

## Scope
localmind MCP 진입점(`src/mcp.ts`)에 **HTTP(Streamable HTTP) 전송 모드**를 추가한다. 환경변수로
전송 방식을 고르고(기본 stdio), HTTP 모드는 Bearer 토큰 인증을 강제하며, 바인드 주소를 설정
가능하게 한다. 도구 정의(`buildServer`, 13종)는 그대로 재사용한다. 홈서버 기동용 Make 타깃과
맥(Claude Code) 연동 문서를 추가한다.

## Context
- 현재: `src/mcp.ts`가 `StdioServerTransport`만 사용. 도구는 `src/mcp-server.ts`의 `buildServer()`가 정의.
- 스택 서버(`src/server.ts`)는 express 앱. express는 이미 의존성.
- SDK `@modelcontextprotocol/sdk@^1.29.0` — `StreamableHTTPServerTransport`
  (`.../server/streamableHttp.js`)를 express 라우트에 물리는 표준 패턴 존재(POST/GET/DELETE
  `/mcp` + `Mcp-Session-Id` 세션 라우팅). ※ 정확한 임포트·시그니처는 설치본으로 재확인(plan OQ).
- 클라이언트 접속 방식(라이브 검증, 2026-07-12):
  - **Claude Code**: `claude mcp add --transport http <url> --header "Authorization: Bearer <t>"`
    → 로컬 CLI가 직접 접속 → **Tailscale 사설 URL 도달 가능**(공용 노출 불필요).
  - **Claude Desktop/모바일 커넥터**: Anthropic 클라우드에서 접속 → 사설 URL 불가(비목표).

## Functional Requirements
<!-- 각 FR 끝에 goal의 어느 목표/제약을 지지하는지 표기. -->
- [ ] **FR-1 (HTTP 전송 모드)**: `MCP_TRANSPORT=http`일 때 `dist/mcp.js`는 Streamable HTTP
  서버로 뜬다 — `POST/GET/DELETE {MCP_HTTP_PATH:-/mcp}`에서 MCP 프로토콜을 처리하고, initialize
  요청에 세션을 생성해 `Mcp-Session-Id`로 후속 요청을 라우팅한다. → goal: Objective
- [ ] **FR-2 (Bearer 인증 강제)**: HTTP 모드는 모든 MCP 요청에 `Authorization: Bearer <MCP_AUTH_TOKEN>`을
  요구한다. 헤더 없음/불일치 → `401`, 도구 접근 불가. `MCP_TRANSPORT=http`인데 `MCP_AUTH_TOKEN`이
  비어 있으면 **기동을 거부**한다(평이한 한국어 에러). → goal: Constraint(최소 보안)
- [ ] **FR-3 (사설 우선 바인딩)**: 바인드 주소는 `MCP_HTTP_HOST`(기본 `127.0.0.1`)·`MCP_HTTP_PORT`
  (기본 예: `8788`)로 설정. 기본은 비공개(localhost)이고 네트워크 노출은 명시적 opt-in만. → goal: Constraint(사설 우선)
- [ ] **FR-4 (하위호환)**: `MCP_TRANSPORT` 미설정/`stdio`이면 기존과 100% 동일하게 stdio로 뜬다.
  기존 `make mcp-install`·`make mcp-desktop` 경로 무영향. → goal: Constraint(하위호환)
- [ ] **FR-5 (노트 워처 단일화)**: HTTP 모드에서도 `watchNotes()`가 프로세스당 1회만 동작해
  파일 변경 재인덱싱이 유지된다(세션마다 중복 기동 금지). → goal: Objective(중앙 두뇌 일관성)
- [ ] **FR-6 (기동·연동 수단)**: 홈서버 기동용 `make mcp-serve-http`(토큰 미설정 시 생성·안내)와,
  맥 Claude Code 연동 명령·Tailscale 안내를 `docs/mcp.md`에 추가한다. → goal: Objective/Expected outcome

## Acceptance Criteria
<!-- 각 AC는 검증가능·테스트와 1:1 매핑(Given-When-Then). -->
- [ ] **AC-1 (도구 노출)**: Given `MCP_TRANSPORT=http`+유효 `MCP_AUTH_TOKEN`으로 기동, When 클라이언트가
  Bearer 토큰과 함께 initialize→tools/list를 보내면, Then localmind 도구 13종을 그대로 반환한다.
- [ ] **AC-2 (인증 차단)**: Given HTTP 모드, When Authorization 헤더가 없거나 토큰이 틀린 요청을 보내면,
  Then `401`을 반환하고 어떤 도구도 실행되지 않는다.
- [ ] **AC-3 (기동 거부)**: Given `MCP_TRANSPORT=http`이고 `MCP_AUTH_TOKEN`이 비어 있음, When 프로세스를
  시작하면, Then 평이한 한국어 에러와 함께 non-zero로 종료하고 포트를 열지 않는다.
- [ ] **AC-4 (하위호환)**: Given `MCP_TRANSPORT` 미설정, When `dist/mcp.js`를 시작하면, Then stdio 전송으로
  뜨고(HTTP 포트 미개방) 기존 stdio 클라이언트가 정상 동작한다.
- [ ] **AC-5 (세션 라우팅)**: Given initialize로 세션이 생성됨, When 반환된 `Mcp-Session-Id`로 후속
  요청을 보내면 같은 세션으로 처리되고, When 알 수 없는 세션 id를 보내면 Then `404`(세션 없음)를 반환한다.
- [ ] **AC-6 (엔드투엔드 단일 두뇌)**: Given HTTP 모드로 뜬 한 인스턴스, When 한 클라이언트가 `capture_note`로
  노트를 적재한 뒤 (재인덱싱 후) 다른 클라이언트가 `search_notes`로 조회하면, Then 그 노트가 반환된다
  (동일 저장소이므로 별도 동기화 없이).
- [ ] **AC-7 (엣지: 기본 바인딩 비공개)**: Given `MCP_HTTP_HOST` 미설정, When 기동하면, Then `127.0.0.1`에만
  바인딩되어 외부 인터페이스로는 접속되지 않는다(노출은 명시 opt-in에서만).

## Open questions
- ~~맥에서 Claude Desktop 커넥터로 사설 URL이 되나?~~ → **안 됨**(클라우드 경유). Claude Code 직접
  접속 또는 로컬 `mcp-remote` 프록시로만. (라이브 검증 완료, 2026-07-12 — spec Context 반영)
- 기본 HTTP 포트를 `8788`로 둘지(스택 8787·litellm 4000과 충돌 회피). → plan에서 확정.
- 세션 모드: stateful(세션맵) vs stateless(요청당 transport). watchNotes 단일화·구현 단순성 기준으로
  plan에서 택1(잠정: stateful 세션맵 — SDK 표준 패턴).
