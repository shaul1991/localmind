# Spec: 디자인 툴·검증 연동 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## 의존

**026 구현 완료 전제(hard dependency).** 027이 편집하는 `templates/agents/ux-reviewer.md`·
`templates/sdd/design.template.md`는 026이 생성한다. 026 미머지 시 구현 착수 금지
(plan 단계 0 게이트). 026이 소유한 lane 경계·design.md 정본 위계·personas.md SSoT는
불변 — 027은 도구·검증 layer만 추가한다.

## Scope

ux-reviewer 페르소나 본문에 **검증 도구 체인**을 규약화하고, docs에 **Figma opt-in 연동
안내**(정본 위계·드리프트 판정 포함)를, design.template.md에 **tokens.json 이행 선택
섹션**을 추가한다. 외부 도구 설치·번들·쓰기 연동·CI 강제·신규 서버 개발은 범위 밖.
신규 코드는 없음(문서·페르소나 본문 + 배선 grep 테스트만).

## 용어

- **검증 도구 체인** — ux-reviewer가 구현된 UI를 실검증하는 계층적 절차: (최소) 사용자가
  제공한 스크린샷을 Read로 design.md 토큰·상태와 대조 → (opt-in 증강) Playwright MCP·
  Claude in Chrome로 스크린샷·접근성 트리·상호작용을 자동 수집. 각 계층의 전제조건 명시.
- **정본 위계(design.md canonical)** — design.md 텍스트 정본이 최상위, Figma·tokens.json은
  소비자·파생. **드리프트 판정: Figma 변수 ≠ design.md면 design.md가 이긴다.**
- **opt-in** — localmind 기본 워크플로우가 아니며 사용자가 명시적으로 도구를 설치·연결한
  경우에만 동작. localmind는 설치를 대행하지 않고 안내만 한다.
- **tokens.json 이행** — design.md 토큰 값 표가 커지면 W3C DTCG(2025.10) tokens.json으로
  옮기는 선택 경로. CI 강제 없음.

## FR

- **FR-1 (ux-reviewer 검증 도구 체인)** *(goal: Objective 1, Problem)* —
  `templates/agents/ux-reviewer.md` **본문**에 "검증 도구 체인" 절을 추가한다(프론트매터·
  026 소유 소유/비소유 절은 불변 — 026 도구 최소성 존중, `targets.claude.tools` 확장 금지). 절 내용:
  - **계층 1(외부 설치·실행 UI 불필요 — 단, 대조할 스크린샷·캡처가 제공돼야 함)**:
    사용자가 제공한 스크린샷/화면 캡처를 Read로 읽어(026이 부여한 Read 도구) design.md의
    토큰(색·타이포·간격·상태)·상태 가시성(로딩/성공/실패/진행)과 1:1 대조, 접근성
    기본(대비·포커스·키보드 추정)을 점검.
  - **계층 0(산출물 전무 폴백)**: 스크린샷도 실행 UI도 없으면 design.md·코드 대비 정적
    리뷰만 수행하고 **"실제 구현 미검증 — 검증 산출물 없음"을 리뷰에 명시**한다(전제조건
    은폐 금지 — goal Risks. "항상 가능"이라는 표현은 쓰지 않는다: Read 도구가 항상
    있다는 것과 절차가 항상 실행된다는 것은 다르다).
  - **계층 2(opt-in 증강 — 전제: 실행 중 로컬 UI)**: Playwright MCP가 연결돼 있으면
    스크린샷·접근성 트리(axe)·상호작용을 자동 수집해 대조. Claude in Chrome이 가용하면
    라이브 DOM·콘솔까지 확인. **구동 주체 단서**: 두 도구 모두 MCP 도구라 ux-reviewer
    서브에이전트의 `targets.claude.tools` 목록(026 고정) 밖이다 — **메인 세션 또는 명시
    도구 부여로만 구동**하고, 서브에이전트 단독 실행 시에는 계층 1/0으로 폴백한다
    (프론트매터 불변 — Open questions 2).
  - **정직한 전제조건 명시**: "실행 중인 로컬 UI가 없으면 계층 2는 불가 — 계층 1로 검증하고
    그 한계를 리뷰에 명시한다." design.md 정본과의 **불일치는 결함으로 보고**(design.md가
    기준).
  - **핸드오프 불변**: 수정→worker, 시스템 재정의→designer, 최종 판정→critic(026 계승).

- **FR-2 (Figma opt-in 연동 안내)** *(goal: Objective 2)* — `docs/agents.md`에 "디자인
  검증 도구 연동 (opt-in)" 절을 추가한다. 하위:
  - **정본 위계 규칙(맨 앞)**: "design.md가 정본, Figma는 참조·소비자. Figma 변수와
    design.md가 다르면 **design.md가 이긴다.** Figma에서 가져온 값은 design.md에 반영해야
    정본이 된다." (code-first 원칙 명시)
  - **Figma 연결**: 계정·플랜·seat 요건과 **무료 Starter 월 6 tool call 한계(실무 불가)**를
    첫 줄에 경고. 연결 명령
    `claude mcp add --transport http figma https://mcp.figma.com/mcp` + `/mcp` OAuth.
  - **활용 패턴**: `get_variable_defs`로 기존 Figma 토큰·변수를 추출해 design.md 토큰 표로
    가져오기(들여오기는 1회성·수동 반영 — 자동 동기화 아님). `get_design_context`로 프레임
    구조 참조.
  - **커뮤니티 서버 경고**: 커뮤니티 Figma MCP는 유지 미보증(T4)이라 localmind가 권장·
    번들하지 않는다(010 공급망 원칙). 참고만.

- **FR-3 (Playwright MCP·Claude in Chrome 설치 안내)** *(goal: Objective 1, Non-goals)* —
  FR-2와 같은 docs 절에 검증 도구 설치 **안내**(localmind가 설치·등록 대행 안 함)를 둔다:
  - **전제조건(첫 줄)**: "실행 중인 로컬 UI가 있어야 의미가 있다."
  - Playwright MCP 연결 1줄(예: `claude mcp add playwright -- npx @playwright/mcp@<version>`
    — 버전 핀 권장을 함께 안내, 010 정합). Claude in Chrome은 "가용하면 활용"으로 조건부.
  - **왜 자동설치 안 하나** 짧은 근거(opt-in·전제조건·공급망) 명시.

- **FR-4 (tokens.json 이행 경로)** *(goal: Objective 3)* — `templates/sdd/design.template.md`
  에 "토큰이 커지면: W3C DTCG tokens.json (선택)" 섹션을 추가한다: 언제 옮기나(값 표가
  관리·소비 한계에 이르면), tokens.json이 표준(2025.10 안정판)이며 Figma·Style Dictionary
  등이 소비함, Style Dictionary 변환 예시 1줄. **CI 강제 아님·design.md 정본 불변**을 명시.

## Acceptance Criteria

> 테스트는 grep(문서 문자열)·loadRegistry 파싱(회귀)·기존 셸 배선 테스트 재사용. AC 라벨은
> "027 AC-n". **라이브 외부 도구 동작(Figma OAuth·Playwright 실행·실제 UI 검증)은 계정·
> 네트워크·실행 UI 의존이라 CI에서 검증하지 않는다 — 정직한 한계(AC-7).**

- **AC-1 (FR-1 규율 존재)** Given `templates/agents/ux-reviewer.md` 본문 문자열 검사, Then
  "검증 도구 체인" 절이 존재하고 ① 계층 1의 전제(스크린샷·캡처 제공)와 계층 0 폴백
  (산출물 전무 시 "실제 구현 미검증" 한계 명시), ② opt-in 증강의 전제조건(실행 중 로컬
  UI)과 구동 주체 단서(메인 세션/명시 부여), ③ design.md 불일치=결함 문구가 모두
  있다(grep).

- **AC-2 (FR-1 회귀 — 파싱 불변)** Given 본문 편집 후 `templates/agents/ux-reviewer.md`를
  loadRegistry로 파싱하면, Then problems 0건이고 유효 target(claude)을 가지며
  `targets.claude.tools`가 **027 편집 전(026 시드 baseline)과 동일**하다(도구 최소성 불변 —
  026 값을 리터럴로 못박지 않는 상대 비교, 리뷰 결함 7: 026 구현이 값을 조정해도 AC가
  낡지 않게. 단계 0 게이트에서 실제 값을 확인해 테스트에 반영).

- **AC-3 (FR-2 정본 위계·드리프트 규칙)** Given `docs/agents.md`, Then "design.md가 정본"과
  "다르면 design.md가 이긴다"(드리프트 판정) 취지 문구가 존재한다(grep).

- **AC-4 (FR-2 Figma 비용 정직성)** Given `docs/agents.md`의 Figma 절, Then 무료 월 "6"
  tool call 한계 경고와 연결 명령(`mcp.figma.com`) 문자열, 그리고 커뮤니티 서버에 대한
  유지 미보증 경고가 존재한다(grep — 리뷰 결함 8 보강. "T4"는 리서처 조사의 출처 등급
  주석이지 docs 요구 문자열이 아니다 — 사용자 문서는 비개발자용 평이 문구를 쓴다는
  AGENTS.md 규약에 따라 "유지가 보증되지 않는다" 취지면 충족).

- **AC-5 (FR-3 전제·비대행)** Given `docs/agents.md`의 검증 도구 절, Then "실행 중인 로컬
  UI" 전제조건과 Playwright 연결 명령이 존재하고, **localmind가 자동설치하지 않음을 밝히는
  문구와 그 근거(opt-in·공급망)**가 있다(grep — 리뷰 결함 8 보강). 회귀: **실행 가능한
  설치 레시피 부재** — `Makefile`의 타깃과 `scripts/`의 비테스트 스크립트(`*.test.sh`
  제외)에 Playwright/Figma MCP를 `claude mcp add`하는 코드가 없다(grep). **자기충돌
  방지(리뷰 결함 4)**: 이 AC의 positive 테스트(docs 문구 확인)는 회귀 grep 패턴과 겹치지
  않는 하위문자열(`mcp.figma.com`·`@playwright/mcp`)로 어서션한다 — 테스트 파일이 회귀
  패턴을 문자 그대로 담지 않게.

- **AC-6 (FR-4 tokens.json 섹션)** Given `templates/sdd/design.template.md`, Then "tokens.json"
  (또는 DTCG) 이행 선택 섹션이 존재하고 "CI 강제 아님"·design.md 정본 불변 취지가 있다
  (grep).

- **AC-7 (오픈소스 위생 + 한계 명시)** Given 027이 저술한 **콘텐츠 산출물**(templates/·
  docs/·노트 agents/ — **테스트 하니스 `*.test.sh` 제외**: 위생 grep 패턴을 담는 테스트
  파일이 자기 패턴에 매칭되는 자기충돌 방지, AC-5와 대칭) 전수 검사, Then
  ① `/Users/`가 없고(grep), ② `/home/` 등장분 중 플레이스홀더(`/home/<`)가 아닌 것이
  없다(grep 조합 예: `grep '/home/' | grep -v '/home/<'` — 결정적 기계 검증). "특정 개인
  지칭 없음"은 grep 불가한 의미 판단이라 plan 단계 2의 사람 전수 검토로 **완전 분리**한다
  (026 AC-5b/R2와 동일한 쪼갬 — grep 라벨에 섞지 않는다). 그리고 이 spec이 "라이브 외부
  도구 동작 미검증"을 한계로 명시한다(문서 판정).

## Open questions

1. **Playwright 설치 대행 헬퍼** — 디자인 검증이 잦아지면 `make mcp-install`처럼 안내형
   헬퍼(probe·버전 핀·정리 포함)로 승격할지. 현재는 docs 안내(1줄)로 시작 — 공급망·opt-in
   관점에서 대행 유보.
2. **ux-reviewer 자동 구동(MCP 도구 권한)** — ux-reviewer 서브에이전트가 계층 2 도구
   (**`mcp__playwright__*`·`mcp__claude-in-chrome__*` 등 MCP 도구 전반**)를 자율 구동하려면
   `targets.claude.tools`에 추가가 필요하나, 미설치 opt-in 도구를 레지스트리가 보증하게 됨.
   현 결정은 **메인 세션/명시 도구 부여로 사용**(프론트매터 불변 — FR-1 구동 주체 단서).
   자동 구동 가치가 확인되면 재론.
3. **Figma 자동 동기화** — 현재 `get_variable_defs`는 1회성·수동 반영. 여러 스펙이 같은
   토큰을 공유하기 시작하면 들여오기 스크립트·주기 대조를 재론(026 OQ3 design/ 루트 문서화
   와 연동).
4. **Claude in Chrome 가용 편차** — 브라우저 확장 가용성이 환경마다 다르고, 서브에이전트
   도구 부여 문제(OQ2와 동일 구조)도 공유한다. "가용하면 활용" 조건부로만 안내, GA 상황
   변화 시 갱신.
5. **tokens.json 이행 임계** — design.md 값 표에서 tokens.json으로 넘어가는 시점 기준을
   명문화할지. 현재는 사용자 판단(시작점 문서).
6. **실전 검증** — 검증 도구 체인·템플릿 섹션은 첫 실전 디자인 검증에서 개정 전제(탁상
   설계 한계 — goal Risks, 026 OQ4 계승).
