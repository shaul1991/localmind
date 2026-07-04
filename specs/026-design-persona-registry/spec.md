# Spec: 디자인·UI/UX 페르소나 확장 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## Scope

레지스트리에 2개 페르소나(designer·ux-reviewer)를 추가하고, 디자인 작업 사전 정의
템플릿(`design.md`)과 "정의 없이 구현 금지" 게이트를 세운다. 배포는 016 파이프라인
재사용 + 스킬 관례의 templates 시드를 에이전트로 확장. 실제 UI 구현·툴 연동은 범위 밖.

## 용어

- **designer(디자이너)** — 디자인 시스템 정의 lane: 패턴·디자인 토큰·컴포넌트 명세·
  에이전트 프롬프트를 **정의**한다. 구현하지 않는다(architect의 디자인판).
- **데이터 흐름의 경계(architect↔designer disambiguation)** — architect는 **모듈 간
  의존·시스템 데이터 흐름**(레이어·저장소·API)을, designer는 **컴포넌트 내부의 화면 상태
  전이**(입력→상태→표시, props/이벤트 계약)를 소유한다. 컴포넌트가 시스템과 만나는
  지점(어떤 API를 부를지)은 architect, 그 결과를 어떤 상태·표시로 보여줄지는 designer.
  양쪽 정본의 소유/비소유에 이 구분을 동일 문구로 명시한다.
- **ux-reviewer(UX 리뷰어)** — 디자인 도메인 검증 lane: 사용성·상태 가시성·일관성(토큰
  준수)·접근성 결함을 찾는다. 최종 품질 게이트가 아니다(그건 critic).
- **design.md** — 디자인 작업의 사전 정의 문서: 디자인 시스템 패턴, 컴포넌트 정의,
  디자인 토큰, 에이전트별 실행 프롬프트. SDD 3문서(goal/spec/plan)의 디자인 확장.

## FR

- **FR-1 (designer 페르소나)** *(goal: Objective)* — 정본 `agents/designer.md`를 정의한다.
  frontmatter는 **016 정본 스키마(중첩 `targets:` 블록 — `templates/agents/sample-persona.md`
  참조)**를 따른다: `name: designer`, `description: ...`, `targets.claude.model: opus`,
  `targets.claude.tools: Read, Grep, Glob`(읽기 전용 — 구현 금지의 도구적 강제). top-level
  `model:`/`tools:`는 렌더 산출물 형식이라 loadRegistry가 거부한다(REJECTED — 초안 리뷰 F1). description 트리거 어휘는 "디자인 시스템, 디자인 토큰, 컴포넌트
  정의, 화면 정의" 계열("설계"는 architect 트리거라 사용 금지 — AC-2와 정합) — 기존 8종·스킬의 어휘("설계·경계 판단"=architect, "결함·self-review"
  =critic 등)와 겹치지 않게. 본문(소유/비소유/원칙/출력형식):
  - 소유: 디자인 시스템 패턴 선택, 디자인 토큰 체계(색·타이포·간격·상태), 컴포넌트
    정의(변형·상태·조합 규칙·**화면 상태 전이** — 용어절의 경계), 실행 에이전트용 프롬프트 작성.
  - 비소유: UI 구현(→worker), 사용성 판정(→ux-reviewer), 요구 발굴(→interviewer),
    최종 게이트(→critic).
  - 원칙에 내장: 직관성(학습 없이 이해)·상태 가시성(로딩/성공/실패/진행의 명시적 표면화)·
    디버깅 용이성(추적 가능한 구조·명확한 경계) — 미적 완성도와 충돌하면 가시성·추적성
    우선. **design.md 없이 구현 단계로 넘기지 않는다**(부재 시 사용자에게 알림 — AGENTS.md
    규약 6 계승).
- **FR-2 (ux-reviewer 페르소나)** *(goal: Objective, Risks)* — 정본 `agents/ux-reviewer.md`.
  frontmatter는 FR-1과 동일한 016 정본 스키마: `targets.claude.model: opus`(검증 다운시프트
  금지 원칙), `targets.claude.tools: Read, Grep, Glob, Bash`(실행·재현 검증용 — critic과 동일). description 트리거
  어휘는 "UX 리뷰, 사용성, 접근성, 디자인 토큰 준수" 계열 — **"self-review"·"결함 검증"·
  "품질 게이트" 금지**(critic·sdd-self-review와 라우팅 충돌 방지). 본문:
  - 소유: 사용성 결함(흐름 단절·모호한 상태), design.md 대비 일관성(토큰·패턴 위반),
    상태 가시성 공백, 접근성 기본(대비·포커스·키보드).
  - 비소유: 수정(→worker), 디자인 시스템 재정의(→designer), **최종 품질 판정(→critic —
    ux-reviewer의 통과는 도메인 리뷰이지 게이트가 아니다)**.
- **FR-3 (design.md 템플릿)** *(goal: Objective)* — `templates/sdd/design.template.md`를
  추가한다(위치 확정 — scaffold_sdd는 명명 파일만 복사하므로(src/scaffold.ts 실사) 나란히
  둬도 일반 스펙에 살포되지 않는다). 섹션: ① 디자인 시스템 패턴(선택 근거 포함) ② 디자인 토큰(색·타이포·간격·상태
  — 값 표) ③ 컴포넌트 정의(각: 목적·변형·상태·화면 상태 전이) ④ 에이전트 실행 프롬프트
  (designer가 작성 — worker·ux-reviewer 각각에게 줄 프롬프트 전문). 플레이스홀더 예시는
  일반적 UI(버튼·목록·상태 배지)로. **전달 경로(초안 리뷰 F7)**: scaffold는 이 템플릿을
  복사하지 않으므로(명명 3종만), AGENTS.md 디자인 절에 수동 복사 안내
  (`cp templates/sdd/design.template.md specs/{NNN}-{slug}/design.md`)를 명시한다 —
  scaffold_sdd opt-in 파라미터는 Open questions.
- **FR-4 (정의 없이 구현 금지 게이트)** *(goal: Problem)* — AGENTS.md에 "디자인·UI/UX
  작업" 절을 추가한다: 디자인 작업은 designer가 design.md를 완성(패턴·토큰·컴포넌트·
  프롬프트)하고 사용자 확인을 받은 뒤에만 worker가 구현 착수. design.md가 없으면 진행 전
  사용자에게 알린다(규약 6과 동일 문형). worker의 비소유에 "design.md 없는 UI 구현"을
  추가한다(기존 "명세가 모호하면 구현하지 않고 반환"의 디자인 구체화) — 게이트 문구는
  **templates/agents/worker.md(repo — CI 검증 가능)**에 담고, 이미 정본을 가진 기존
  사용자는 시드가 덮지 않으므로 직접 1회 반영한다(plan 명시 — 초안 리뷰 F4).
- **FR-5 (templates 시드 + 배포)** *(goal: Constraints)* — `templates/agents/`에 **10종
  전부**(기존 8종 + designer·ux-reviewer)를 동봉한다 — 초안 리뷰 F3: 현재 기존 8종은 개발
  기기의 사용자 데이터에만 존재해 **신규 오픈소스 사용자는 시드 메커니즘 자체가 없어 빈
  레지스트리**였다(sample-persona.md만 동봉). 2종만 시드하면 핸드오프(→worker·critic)가
  없는 대상을 가리키는 반쪽 레지스트리가 되므로, 026이 이 갭을 함께 해소한다. 기존 8종
  템플릿은 현행 정본 내용을 그대로 옮긴다(worker만 FR-4 게이트 문구 추가). 시드는 스킬
  관례(seedSkills 대칭)의 **별도 함수 seedAgents** — 정본이 없는 파일만 복사(기존 정본·
  사용자 수정 보호, prune 없음), `agents-deploy` 스크립트에서 seed→deploy 순차
  호출(deployAgents()·MCP deploy_agents는 시드하지 않음 — 초안 리뷰 F8). 렌더·배포는
  016 파이프라인 그대로(Codex 타깃은 범위 밖 — 기존 critic 렌더 불변). **sample-persona.md
  처리(리뷰 N1)**: 기존 `templates/agents/sample-persona.md`(유효 정본 형식의 문서 샘플,
  name: sample-critic — 026 이전엔 어떤 코드도 안 읽는 inert 파일)는 `templates/sample-persona.md`
  (agents/ 밖)로 **이전**해 시드·파싱 스캔에서 제외한다(참조 문서 docs/agents.md의 cp 경로·
  016 plan 표기 갱신 포함). **docs/agents.md에 seed-on-deploy 동작 서술을 추가한다(리뷰
  R1)**: agents-deploy가 없는 정본을 자동 시드하며(fill-missing — 신규 설치 시 10종 생성),
  시드된 정본(~/.localmind/agents/)은 사용자가 자유롭게 편집 가능하고 재시드가 덮지
  않는다 — "덮어써진다" 경고는 렌더 산출물(~/.claude/agents/)에만 해당함을 구분해 안내. 시드는 **fill-missing-only** — seedSkills의 update-managed
  분기는 채택하지 않는다(운영 정본은 사용자 데이터, templates 갱신은 릴리스로만 전파 —
  goal Risks 위계와 정합, 리뷰 N3).
- **FR-6 (SSoT 갱신)** *(goal: Success metrics)* — docs/personas.md를 10종 구성으로
  갱신한다. 단순 행 추가가 아니라 **구성 원칙의 능동적 재조정**이다(초안 리뷰 F6): SSoT는
  "소수 정예 4~6 코어·매트릭스(10+) 거부"를 명시했으므로, "기능 축 코어 5는 불변, 무대
  확장 3→5(디자인 무대 +2)"의 논리로 원칙과 정합함을 문서에 기록한다. 구성표(모델·소유·
  핸드오프), 무대별 개입 지도에 "디자인 무대" 추가, 트리거 어휘 배정 기록, TL;DR의 총원
  표기 갱신.

## Acceptance Criteria

> 테스트는 기존 하니스 재사용: registry/deploy 단위 테스트(src/agents/*.test.ts 관례 —
> 임시 폴더 정본 fixture), 배선·문구는 grep. AC 라벨은 "026 AC-n".

- **AC-1 (FR-1·2 정본 유효성)** Given templates/agents/의 10종 파일을 loadRegistry로
  파싱하면, Then problems가 0건이고 각 페르소나가 유효 target(claude)을 갖는다(016 검증
  규칙 — frontmatter까지만: loadRegistry는 본문 절을 검증하지 않는다, 초안 리뷰 F2).
- **AC-1b (FR-1·2 본문 구조)** Given designer·ux-reviewer 템플릿 본문을 문자열 검사하면,
  Then 소유/비소유/원칙/출력형식 4개 절이 존재하고, 양쪽 비소유에 상대 lane 핸드오프
  (→worker·→critic 등)와 데이터 흐름 경계 문구가 있다(별도 grep — loadRegistry 아님).
- **AC-2 (FR-1·2 어휘 비충돌)** Given 10종 정본 + 스킬(sdd-self-review)의 description을
  모으면, Then designer·ux-reviewer의 description에 "self-review"·"결함 검증"·"품질 게이트"·
  "설계"(architect 트리거) 문자열이 포함되지 않는다(라우팅 tie 방지 — 문자열 검사로 고정).
- **AC-3 (FR-5 시드)** Given **빈 노트 폴더 agents/**(신규 설치 재현)에서, When
  `agents-deploy` 스크립트(seed→deploy)를 실행하면, Then 10종 전부가 시드·배포된다.
  Given 사용자가 수정한 designer.md(또는 기존 8종 정본)가 이미 있으면, Then 시드가
  해당 파일을 덮어쓰지 않는다(내용 불변 — 없는 파일만 채움).
- **AC-3b (FR-5 sample 비활성)** Given 시드·배포 후, Then 노트 폴더 agents/와 배포
  결과에 `sample-critic`이 존재하지 않고, `templates/agents/`에 sample-persona.md가
  없다(이전 완료 — 스캔 대상 10종 정합, 리뷰 N1).
- **AC-4 (FR-5 멱등·기존 보호 회귀)** Given 시드+배포를 2회 실행하면, Then 두 번째는
  "변경 없음"(시드 0건·배포 변경 없음)이고 기존 deploy·registry 테스트가 green이다
  (016 멱등 계승).
- **AC-5 (FR-3·4 게이트 문서)** Given repo 파일 검사, Then `templates/sdd/design.template.md`가
  4개 섹션(패턴·토큰·컴포넌트·프롬프트)을 갖고, AGENTS.md에 "디자인·UI/UX 작업" 절(수동
  복사 안내 포함 — FR-3 전달 경로)이 있으며, **templates/agents/**의 designer와 worker에
  design.md 게이트 문구가 있다(전부 repo 안 — CI grep 가능, 초안 리뷰 F4).
- **AC-5b (FR-5 오픈소스 위생)** Given `templates/agents/*.md` 전수 검사, Then 개인
  절대경로 패턴(`/Users/`·`/home/`)이 없다(grep — 기계 검증). "특정 개인 지칭 없음"은
  grep으로 판정 불가한 의미 판단이라 plan 단계 2의 사람 전수 검토로 분리한다(리뷰 R2 —
  거짓 기계-검증 인상 방지).
- **AC-6 (FR-6)** Given docs/personas.md, Then 구성표에 designer·ux-reviewer 행(모델·
  핸드오프 포함)이 있고, "총 8"·"8개" 잔존 표기가 없으며(내부 모순 방지 — 초안 리뷰 F6),
  구성 원칙 절이 디자인 무대 확장을 명시적으로 정당화한다(소수 정예 원칙의 능동적 재조정 —
  "코어는 그대로, 무대 확장 +2"의 논리 기록).

## Open questions

1. **런타임 자동 개입(017 확장)** — ux-reviewer를 검증 흐름에 자동 개입시킬지. 명시
   위임으로 시작해 사용 관찰 후 결정.
2. **Codex 타깃 렌더** — 새 페르소나를 codex 교차 검증 백엔드로도 쓸지(현재 critic만).
   디자인 리뷰의 교차 모델 가치가 확인되면 확장.
3. **design.md의 위치** — specs/{NNN}/design.md(SDD 폴더 안, 현 결정)로 충분한지, 프로젝트
   공용 디자인 시스템 문서(design/ 루트)가 따로 필요한지 — 여러 스펙이 같은 토큰을 공유하기
   시작하면 재론.
4. **템플릿의 실전 검증** — 템플릿은 첫 실전 디자인 작업에서 개정을 전제로 한 시작점이다
   (탁상 설계의 한계 — goal Risks).
5. **scaffold_sdd의 design opt-in** — 수동 복사로 시작(F7 해소), 디자인 작업이 잦아지면
   `scaffold_sdd(design: true)` 파라미터로 승격 검토.
6. **디자인 실행 전용 페르소나(ui-worker)** — 현 결정은 기존 worker 재사용(잘 명세된
   구현 lane에 부합, 소수 정예 원칙). design.md 기반 구현이 반복적으로 worker의 일반 lane과
   긴장하면 분리 재론.
