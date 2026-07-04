# Goal: 디자인 툴·검증 연동 — 구현된 UI의 실검증 루프와 opt-in 외부 도구 (why)

spec: [spec.md](spec.md) · plan: [plan.md](plan.md)

## 의존 관계 (먼저 읽을 것)

**이 스펙은 026(디자인 페르소나 레지스트리) 구현 완료를 전제한다 — hard dependency.**
027은 026이 신규 생성하는 정본 파일(`templates/agents/ux-reviewer.md`,
`templates/sdd/design.template.md`)과 페르소나(designer·ux-reviewer), design.md 텍스트
정본 위계 위에 **도구·검증 layer만 얹는다**. 026이 머지되기 전에는 027이 편집할 대상
파일이 존재하지 않으므로, 구현 착수 전 026 머지를 확인한다(plan 단계 0 게이트).
026 → 027 순서는 뒤집을 수 없다.

## Background

026이 디자인 계열 lane(정의 designer / 실행 worker / 검증 ux-reviewer)의 삼권분립과
디자인 작업 사전 정의 문서(`design.md`: 패턴·토큰·컴포넌트·프롬프트)를 세웠다. 026의
Non-goals는 **"디자인 툴(피그마 등) 연동·MCP 도구 추가"를 명시적으로 범위 밖**으로
남겼다(026 goal Non-goals). 027이 그 후속으로, ux-reviewer의 **검증 도구 체인**과
외부 디자인 툴 **opt-in 연동**을 정직한 전제와 함께 규약화한다.

리서처 조사(2026-07-04, 출처 T등급 검증):

- **Figma 공식 Dev Mode MCP**(원격 `mcp.figma.com`, OAuth, 데스크탑 앱 불필요): 능력은
  `get_design_context`(프레임→구조화 표현)·`get_variable_defs`(변수·토큰 추출)·Code
  Connect·쓰기(베타·유료). **무료 Starter 플랜은 월 6 tool call**로 실무 불가, Professional
  Dev/Full seat는 일 200회. 연결은
  `claude mcp add --transport http figma https://mcp.figma.com/mcp` + `/mcp` OAuth. [T1]
- **커뮤니티 Figma MCP**: 전부 T4(유지 미보증) — 공급망 위험으로 번들 배제(010 핀 고정
  원칙과 정합), 참고 링크 수준. [T4]
- **Anthropic 공식 디자인 전용 도구: 없음.** 활용 가능한 전부는 ① Claude in Chrome(범용
  브라우저 자동화 — 스크린샷·DOM·콘솔, 있으면 활용)과 ② Claude Code 내장 이미지 읽기
  (Read 도구 — 스크린샷을 직접 대조)뿐이다. [T1]
- **Playwright MCP**(`@playwright/mcp`, Microsoft 공식): 무료·로컬·`npx` 1줄 — 스크린샷·
  접근성 트리·클릭·폼. Playwright 공식 접근성 테스트(axe 통합) 문서 존재. **전제: 실행
  중인 로컬 UI 필요**(design.md 텍스트 정본 단계에선 불가). [T1]
- **W3C DTCG 디자인 토큰 스펙 2025.10 첫 안정판**(Community Group 레벨) — Figma·Style
  Dictionary 등 10여 종 지원, Tokens Studio가 Figma 변수↔JSON 양방향. [T1/T2]
- **정본 위계 실무 주류(2025~26)**: "디자인 토큰은 코드다 — Figma는 소스가 아니라
  소비자"(code-first). 026의 design.md 텍스트 정본 방향과 정합. [T3 다수]

## Problem

- 026은 ux-reviewer에게 "사용성·상태 가시성·접근성·design.md 대비 일관성"을 소유시켰지만,
  **구현된 UI를 실제로 어떻게 검증하는지(무엇을 보고 무엇과 대조하는지)의 실행 절차가
  없다** — 규율만 있고 도구 루프가 없으면 검증이 탁상 리뷰로 퇴화한다.
- 이미 Figma로 디자인 토큰·변수를 관리하는 사용자가 그 자산을 design.md 정본으로
  가져올 경로가 없고, **Figma와 design.md가 다를 때 무엇이 이기는지(드리프트 판정)가
  정의돼 있지 않다** — 정본 위계가 흐려지면 code-first 원칙이 무너진다.
- 디자인 토큰이 커지면 design.md의 값 표로는 관리·소비(빌드 연동)가 버거워지는데,
  **표준(W3C DTCG tokens.json)으로의 이행 경로가 시작점 문서에 없다.**
- 외부 도구 연동은 공급망·비용·전제조건 함정이 많다(커뮤니티 서버 T4, Figma 무료 월 6회,
  Playwright는 실행 UI 필요) — **정직하게 문서화하지 않으면 사용자가 함정에 빠진다.**

## Objective

026의 디자인 lane 위에 **검증·연동 layer**를 문서·페르소나 규약으로 얹는다:

1. **ux-reviewer 검증 도구 체인(핵심)** — "스크린샷 → design.md 토큰·상태 가시성 대조 →
   접근성 기본 검사"의 실검증 루프를 ux-reviewer 페르소나 본문과 docs에 규약화한다.
   최소 단계(사용자가 준 스크린샷을 Read로 대조 — 외부 설치 불필요, 단 산출물 제공 전제)부터 opt-in
   증강(Playwright MCP·Claude in Chrome — 실행 UI 필요)까지 계층으로, **전제조건을
   정직하게** 명시한다.
2. **Figma opt-in 연동 안내** — 기본 워크플로우 아님. 플랜·seat 요건(무료 월 6회 한계
   명시)·OAuth·연결 명령·활용 패턴(`get_variable_defs`로 기존 Figma 토큰을 design.md로
   가져오기)을 docs 절로. **정본 위계 명시: design.md가 정본, Figma는 참조·소비자 —
   둘이 다르면 design.md가 이긴다(드리프트 판정 규칙).**
3. **tokens.json 이행 경로** — design.template.md에 "토큰이 커지면 W3C DTCG tokens.json
   으로"의 선택 섹션(Style Dictionary 예시 1줄, CI 강제 안 함).

## Success metrics

- `templates/agents/ux-reviewer.md` 본문에 검증 도구 체인 절이 존재하고, **실행 UI가
  없을 때의 폴백(정적 대조)과 opt-in 증강의 전제조건**이 명시된다.
- docs에 Figma opt-in 절이 존재하고 ① 무료 월 6회 한계, ② 연결 명령,
  ③ design.md 정본·드리프트 판정 규칙이 모두 문자열로 확인된다.
- `templates/sdd/design.template.md`에 tokens.json 이행 선택 섹션이 존재한다.
- 커뮤니티 Figma 서버·Figma 쓰기·Style Dictionary CI 강제·자동 MCP 설치는 어디에도
  들어가지 않는다(Non-goals가 코드·문서로 지켜짐).

## Non-goals

- **커뮤니티 Figma MCP 서버 번들·자동설치** — 전부 T4(유지 미보증), 010 공급망 핀 고정
  원칙 위반. 참고 링크 수준으로만.
- **Playwright MCP를 localmind가 설치·등록** — opt-in·실행 UI 전제 도구를 대행 설치하면
  ① 미고정 업스트림(`npx @playwright/mcp`) 결합으로 010 원칙 훼손, ② 기본 스코프 크리프.
  **안내(1줄 명령)만** 한다(판단 근거는 plan). 대행 헬퍼 make 타깃은 Open question.
- **Figma 쓰기(write) 연동** — 베타·유료·역방향(코드→Figma). code-first 정본 위계와
  반대이고 성숙도 미달.
- **Style Dictionary 빌드·CI 강제** — tokens.json은 선택 이행 경로로만 안내, 빌드 배선·
  CI 게이트는 만들지 않는다(운영 마찰 > 이득).
- **존재하지 않는 Anthropic 디자인 전용 도구 가정** — 조사 결과 없음. Claude in Chrome·
  내장 이미지 읽기가 활용 가능한 전부.
- **신규 MCP 서버 개발** — localmind는 자기 MCP 하나만 소유. 디자인 검증용 서버를 새로
  만들지 않는다.
- **026 소유 재정의** — designer·ux-reviewer의 lane 경계·design.md 정본 위계·personas.md
  SSoT 구성은 026 소유. 027은 도구·검증 layer만 추가한다.

## Constraints

- 오픈소스: 모든 안내 문구는 특정 개인이 아니라 일반 사용자용. 절대경로는 플레이스홀더
  (`/home/<user>/...`). 비개발자가 이해할 평이한 한국어(연결 명령·플랜 요건 포함).
- 정직성 우선: 전제조건(실행 UI 필요·Figma 유료 실무 요건·Claude in Chrome 가용 편차)을
  숨기지 않는다 — 026이 게이트를 정직하게 문서화한 자세를 계승.
- 정본 위계 불변: design.md 텍스트 정본이 최상위. Figma·tokens.json은 소비자·파생.
  드리프트 시 design.md 승리를 규칙으로 고정.
- 공급망: 010 핀 고정 원칙 — 미고정·미보증 외부 아티팩트를 localmind가 보증(번들·자동
  설치)하지 않는다.
- 026 도구 최소성 존중: ux-reviewer의 `targets.claude.tools`(026이 고정)
  를 확장해 opt-in MCP 도구를 보증하지 않는다(자동 구동 여부는 Open question).

## Stakeholders

단일 사용자(설치한 개인 누구나 — 비개발자 포함). 특히 ① 이미 Figma로 디자인하는
사용자(토큰을 design.md로 들여오려는), ② 구현된 UI를 실제로 검증받고 싶은 사용자.

## Risks

- **전제조건 은폐로 인한 헛수고** — Playwright는 실행 UI, Figma 실무는 유료가 필요한데
  이를 늦게 알면 사용자가 시간을 버린다 → 각 도구 절 첫 줄에 전제조건·비용을 명시(AC로
  grep 고정).
- **정본 드리프트** — Figma 변수와 design.md가 갈라지면 무엇이 진실인지 혼란 → "design.md
  승리" 판정 규칙을 문서·AC로 고정.
- **opt-in 도구 보증 오염** — ux-reviewer 프론트매터에 MCP 도구를 넣으면 미설치 도구를
  레지스트리가 보증 → 넣지 않고 "메인 세션/명시 부여로 사용" 규약화(Open question로 자동
  구동 재론).
- **AC 결정성 착시** — 산출물이 문서라 "연동이 실제로 동작한다"는 테스트가 불가(외부
  계정·OAuth·실행 UI 의존) → AC는 **문서 정확성·페르소나 규율 존재**만 grep·파싱으로
  판정하고, 라이브 도구 동작 검증 불가를 정직한 한계로 명시(026의 "라우팅 실동작 미검증"
  자세 계승).
- **탁상 설계** — 실검증 루프·템플릿을 실제 디자인 작업 없이 설계 → 첫 실전 검증에서
  개정 전제(Open question, 026 Risks 계승).
