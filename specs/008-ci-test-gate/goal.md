# Goal: CI Test Gate (CI가 테스트를 실행하게)

## Background — 배경

2026-07-01 프로젝트 전반 품질·보안 평가에서 **가장 값싸고 효과 큰 결함(H1)** 으로 지목됐다.
specs/001~007을 구현하며 단위·통합 테스트 40여 개(`src/*.test.ts`, `scripts/*.test.sh`)가
쌓였지만, `.github/workflows/ci.yml`은 테스트 도입 전에 작성되어 typecheck·build·docker
build만 검증한다. 테스트가 존재하는데 CI 게이트가 없는 상태다.

## Problem — 문제

- 회귀를 잡을 테스트가 있어도 CI에서 돌지 않아, 테스트를 깨뜨리는 변경이 main에 그대로
  들어갈 수 있다.
- 기여자(PR) 입장에서도 자신의 변경이 기존 동작을 깨는지 로컬 실행 없이는 알 수 없다.
- 평가에서 확인된 테스트 공백 모듈: `transform.ts`(메시지 평탄화), `tools.ts`(프롬프트 기반
  함수호출의 JSON 파싱 — 핵심 로직인데 미테스트), `session.ts`(세션 매핑·TTL·consume-once).
  이들은 임베딩 서버 없이도 테스트 가능한 순수 로직이다.

## Objective — 목표

CI가 모든 push/PR에서 단위 테스트를 실행해 회귀를 막는 게이트가 되게 한다. 아울러
임베딩 서버 없이 테스트 가능한 핵심 순수 로직 모듈(transform·tools·session)의 테스트
공백을 메워 게이트의 실효성을 높인다.

## Expected outcome — 기대 결과

- `npm test`(비통합 테스트)가 CI의 필수 단계가 된다 — 실패 시 머지 불가 신호.
- 셸 테스트(`scripts/*.test.sh`)도 CI에서 실행된다.
- `transform.ts`·`tools.ts`·`session.ts`에 핵심 시나리오 단위 테스트가 추가된다.
- 통합 테스트(`LOCALMIND_INTEGRATION=1`)는 인증된 CLI·임베딩 서버가 필요하므로 CI에서
  제외됨을 명시적으로 문서화한다(현재 주석 관례 유지).

## Success metrics — 성공 지표

- CI 워크플로우에 테스트 단계가 존재하고, 테스트 실패 시 CI가 red가 된다.
- transform/tools/session 각각에 대해 정상 경로 + 대표 엣지 케이스가 테스트로 커버된다.
- CI 전체 소요 시간 증가 ≤ 2분(테스트는 임베딩 없이 수백 ms 수준).

## Non-goals — 비목표

- 통합 테스트(임베딩·CLI 필요)의 CI 실행은 범위 밖 — 로컬 전용으로 유지.
- 커버리지 도구(c8 등) 도입·커버리지 임계값 강제는 범위 밖.
- routes/·backends/의 테스트는 범위 밖(스모크 스크립트 영역 — CLI 인증 필요).
- E2E 테스트 프레임워크 도입은 범위 밖.

## Constraints — 제약

- 기존 테스트 러너(node:test + tsx) 유지 — 새 테스트 프레임워크 도입 금지.
- CI 매트릭스(Node 20/22/24) 유지.
- 새 단위 테스트는 네트워크·파일시스템 외부 의존 없이 실행 가능해야 한다(순수 로직만).

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함) 및 오픈소스 기여자 — 변경 안전성 보장

## Risks — 리스크

- Node 20/22/24 매트릭스에서 `node --import tsx/esm --test`의 glob 처리 차이로 특정 버전에서
  테스트 수집이 실패할 수 있음 — 매트릭스 전 버전에서 확인 필요.
- 셸 테스트가 macOS에서 작성됐으므로 ubuntu 러너에서 bash/coreutils 차이(mktemp, date 옵션
  등)로 깨질 수 있음 — CI에서 실제 실행해 확인.
