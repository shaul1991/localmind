# Spec: SDD Scaffold

상위: [goal](goal.md)

## Scope

`templates/sdd/`에 범용 AGENTS.md + goal/spec/plan 템플릿을 정본으로 두고, 공용 로직
(`src/scaffold.ts`)으로 대상 디렉토리에 복사한다. 이 로직을 MCP 도구(`scaffold_sdd`)와
`make init-sdd` 커맨드 양쪽에서 재사용한다.

## Context

localmind는 이미 `AGENTS.md`(자체 프로젝트 규칙)와 `specs/{NNN}-*/` 구조를 갖고 있다
(specs/001~006). 이번 기능은 이 패턴을 **범용화해 다른 프로젝트에도 심을 수 있게** 만든다.
기존 스크립트 패턴(`scripts/*.sh` — 친절한 한국어 메시지, `ok()`/`warn()`/`err()`)과
기존 MCP 도구 패턴(`src/mcp-server.ts` — `registerTool` + `textResult`)을 그대로 따른다.

## Functional Requirements

- **FR-1 (정본 템플릿)**: `templates/sdd/AGENTS.md`(범용 SDD 규칙)와
  `templates/sdd/{goal,spec,plan}.template.md`(빈 문서 골격)를 localmind 저장소에 정본으로
  둔다. → goal: Constraints (정본 하나)

- **FR-2 (공용 스캐폴드 함수)**: `src/scaffold.ts`에 `scaffoldSdd(targetDir: string):
  ScaffoldResult`를 구현한다. `templates/sdd/`의 각 파일을 `targetDir`(및
  `targetDir/specs/`)로 복사하고, 파일별 결과(생성됨/건너뜀)를 담은 결과 객체를 반환한다.
  → goal: Objective, Constraints (로직 중복 금지)

- **FR-3 (기존 파일 보호)**: 대상 경로에 동일 파일명이 이미 있으면 덮어쓰지 않고 결과에
  "건너뜀(이미 존재)"으로 기록한다. → goal: Constraints, Risks

- **FR-4 (대상 디렉토리 자동 생성)**: `targetDir`(또는 `targetDir/specs`)가 없으면 생성한다.
  → goal: Objective

- **FR-5 (MCP 도구)**: `mcp-server.ts`에 `scaffold_sdd` 도구를 등록한다. 필수 파라미터
  `path`(대상 디렉토리)를 받아 `scaffoldSdd(path)`를 호출하고, 결과를 사람이 읽기 쉬운
  텍스트로 반환한다. `path` 누락 시 스키마 검증으로 거부된다(zod `z.string()` 필수).
  → goal: Objective ("MCP로도 제공")

- **FR-6 (make 커맨드)**: `make init-sdd DIR=<대상경로>`가 `scaffoldSdd(DIR)`를 호출하는
  얇은 스크립트(`scripts/init-sdd.ts`, 다른 스크립트처럼 `tsx`로 실행)를 통해 동작한다.
  → goal: Objective ("make 커맨드로도 제공")

- **FR-7 (범용 템플릿 검증 가능성)**: `templates/sdd/AGENTS.md`에는 localmind 고유 명령어
  (`make backup` 등)·localmind 전용 절("오픈소스 대상" 섹션 등)이 포함되지 않는다 — SDD
  흐름·`/goal {NNN}` 처리·self-review 필수·구현 규율(TDD·외과적 변경·명시적 커밋)만 담는다.
  → goal: Success metrics

- **FR-8 (결과 보고)**: make/MCP 둘 다 실행 후 "생성됨: AGENTS.md", "건너뜀: specs/(이미
  존재)"처럼 파일별 결과를 명확히 보고한다. → goal: Constraints (비개발자 친화적 메시지)

## Acceptance Criteria

- **AC-1**: Given 빈 디렉토리 `DIR`,
  When `make init-sdd DIR=<path>`를 실행하면,
  Then `<path>/AGENTS.md`와 `<path>/specs/` 폴더가 생성된다.

- **AC-2**: Given 빈 디렉토리,
  When MCP `scaffold_sdd` 도구를 `path=<path>`로 호출하면,
  Then `make init-sdd`와 동일한 파일 집합이 생성된다(같은 정본 템플릿 사용 확인).

- **AC-3 (엣지 — 기존 AGENTS.md 존재)**: Given 대상에 이미 다른 내용의 `AGENTS.md`가 있을 때,
  When 스캐폴드를 실행하면,
  Then 기존 파일은 그대로 유지되고 결과에 "건너뜀(이미 존재): AGENTS.md"가 표시된다.

- **AC-4 (엣지 — 존재하지 않는 대상 경로)**: Given 아직 존재하지 않는 디렉토리 경로,
  When 스캐폴드를 실행하면,
  Then 디렉토리가 새로 생성되고 정상적으로 파일이 채워진다.

- **AC-5 (범용성)**: Given 생성된 `AGENTS.md`,
  When 내용을 검사하면,
  Then `make backup`·`localmind`·"오픈소스 개인 second-brain 도구" 같은 localmind 고유
  문구가 포함되지 않는다.

- **AC-6 (엣지 — path 파라미터 누락)**: Given MCP `scaffold_sdd`를 `path` 없이 호출하면,
  Then 파일을 생성하지 않고 "path는 필수입니다" 류의 명확한 오류를 반환한다.

- **AC-7 (엣지 — specs만 있고 AGENTS.md는 없는 경우)**: Given 대상에 `specs/` 폴더는 있지만
  `AGENTS.md`는 없을 때,
  When 스캐폴드를 실행하면,
  Then `specs/`는 건너뛰고 `AGENTS.md`만 새로 생성된다(부분 적용 가능).

## Open questions

- ~~`templates/sdd/{goal,spec,plan}.template.md`가 사용자의 private 벌트에 있는
  `templates/sdd/*.template.md`와 내용이 유사할 수 있으나, localmind는 그 벌트를 참조할 수
  없으므로(OSS 일반성 원칙) **독립적으로 새로 작성**한다 — 이번 세션의 specs/001~006에서
  실제로 써온 섹션 구조를 기준으로 만든다(plan에서 확정).~~
- `specs/` 폴더를 완전히 빈 채로 만들지, `.gitkeep`류 placeholder를 넣을지는 plan에서 결정.
