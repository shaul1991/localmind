# Spec — 원격 LocalMind 정본 preflight

## 요구사항
1. `whoami`는 `LOCALMIND_DEPLOYMENT_ID`(기본 `localmind`)와 노트 폴더 라벨만 반환하고 hostname·절대경로를 반환하지 않는다.
2. preflight는 Claude Code의 local(`~/.claude.json` project), project(`.mcp.json`), user(`~/.claude.json`) scope를 읽는다.
3. `localmind` 등록 0개, 2개 이상, 비 HTTP, local/project scope 등록, 판정할 수 없는 scope 구조는 fail closed 한다.
4. user scope의 단일 HTTP 등록만 허용하고, URL은 `LOCALMIND_MCP_URL`, 인증은 정확히 `Authorization: Bearer ${MCP_AUTH_TOKEN}` 환경변수 템플릿만 허용한다.
5. 유효한 등록이면 환경변수 치환 후 실제 MCP `whoami`를 호출해 기대 deployment id와 비교한다.
6. 설정 파일을 변경하지 않고 결과에 URL·token·절대경로를 포함하지 않는다.
7. `없음 / user-stdio / local-http / 둘 다 / wrong identity / auth 실패`와 malformed 설정을 공개 fixture로 자동 검증한다.

## Acceptance Criteria
- **AC-1**: 6-state 표 테스트의 code/성공 여부가 모두 기대값과 일치한다.
- **AC-2**: 성공은 user scope의 단일 HTTP, 제한된 URL·인증 환경변수 계약, expected id 일치가 모두 성립할 때만 가능하다.
- **AC-3**: token·hostname·절대경로 누출 검사가 0건이다.
- **AC-4**: CLI 실행 전후 설정 파일이 byte-equal이다.
- **AC-5**: 전체 테스트·typecheck·build가 통과한다.

## 중단 조건
scope를 결정적으로 읽지 못하거나 identity 확인에 hostname·절대경로가 필요하면 자동 gate를 중단하고 문서 경고로 축소한다. 공식 Claude Code 문서의 저장 위치·우선순위가 확인되어 이 조건은 발생하지 않았다.
