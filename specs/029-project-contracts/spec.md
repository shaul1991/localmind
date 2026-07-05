# Spec: 프로젝트별 계약 저장소 — DDD 차용 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## Scope

노트 폴더 하위에 프로젝트별 계약 저장소 `projects/{project}/`(문서 4종)를 규약으로 세우고,
계약 문서 템플릿 4종(`templates/contracts/`) + AGENTS.md "프로젝트 계약 저장소" 절 + 기존
페르소나 본문의 최소 수술(소유 매트릭스·완화 게이트에 계약 확인 얹기)을 추가한다. 신규
페르소나·신규 코드·자동 로딩·기계 가독 형식·백업/인덱스 전용 배관은 범위 밖. 실제 프로젝트
계약 내용 작성 대행도 범위 밖. **028과의 관계**: 029의 충돌 처리 규칙은 028 완화 게이트를
**보완**한다(supersede 아님) — 규칙 정본은 AGENTS.md에 두고, 본문을 편집하지 않는 도메인
dev(dba·auth-dev·data-platform 등)는 AGENTS.md 보편 규칙으로 상속한다(리뷰 경미 4).

## 용어

- **계약 저장소(project contract repository)** — `<첫 노트 폴더>/projects/{project}/`(기본
  설치면 `~/.localmind/projects/{project}/`). 프로젝트 종속 크로스 도메인 계약·경계·용어를
  담는 축적형 사용자 콘텐츠. 위치는 028 `guides/`와 **형제**(하위 아님) — 둘 다 firstNotesDir
  하위라 백업·인덱스를 계승(brain.ts 제외 목록 미추가). **029는 파일을 시드하지 않는다**
  (범용 프로젝트가 없음 — 사용자가 `cp`로 시작).
- **2축 구분(도메인 축 vs 프로젝트 축)** — `guides/{domain}.md`(028)는 **도메인 축**:
  프로젝트 무관 스택 관례("우리는 이 스택을 이렇게 쓴다"). `projects/{project}/`(029)는
  **프로젝트 축**: 프로젝트 종속 계약("이 프로젝트의 API는 이렇다"). 직교 축 — 도메인 dev는
  둘 다 참조한다. 이 구분은 028 "역할 축 vs 도메인 축"과 동형의 축 분리다.
- **계약 문서 4종** —
  - `context-map.md`(컨텍스트 맵): bounded context 목록과 그 관계(의존·상하류·공유 커널),
    각 계약 문서·design.md 위치로의 포인터(프로젝트 진입점 겸용). **소유: architect.**
  - `ubiquitous-language.md`(용어집): 프로젝트 유비쿼터스 언어. **소유: architect(전 페르소나
    제안 가능).**
  - `api-contract.md`(API 계약): 엔드포인트·요청/응답 형태·상태 코드·에러 표면. **소유:
    backend-dev.**
  - `environments.md`(환경): 서비스 URL·환경변수 **이름**과 용도(**값 절대 금지**). **소유: infra.**
- **디자인 토큰의 자리** — 계약 저장소에 토큰을 **복제하지 않는다**. design.md가 정본(026/027)
  이고, context-map.md는 design.md 위치를 가리키는 **포인터만** 둔다. designer는 그 포인터
  규율만 소유(정본 정의는 design.md 불변).
- **완화 게이트(028 계승)** — 계약 문서 **부재**는 진행을 막지 않는다: 없으면 일반 관례로
  진행하되 "계약 문서 없음 — 일반 관례로 진행"을 보고에 명시한다(design.md식 강제 아님).
- **드리프트 결함(026/027 계승)** — 계약 문서 **존재 시** 코드와의 불일치는 결함이다: 계약이
  정본, "다르면 계약이 이긴다". owner는 코드 변경과 계약 갱신을 **동시**에 한다(staleness도
  owner의 드리프트). 소비자는 계약을 정본으로 준수한다(이탈은 소비자의 드리프트).
- **충돌 처리 규칙(028 2차 실전 관찰 명문화)** — 계약(또는 가이드)이 **기존 코드와 충돌**하면:
  ① 신규 작업은 계약의 내부 일관성을 우선하되, ② 충돌을 **표면화**하고, ③ 임의 봉합 대신
  **사용자 결정을 요청**한다. 이 규칙은 계약↔코드 드리프트·가이드↔코드·용어 충돌에 공통 적용된다.

## 쓰기 소유 · 읽기 소비 매트릭스 (DDD 차용의 핵심)

| 계약 문서 | 쓰기 소유자 | 주 소비자 | 게이트(부재 / 존재 시 불일치) |
|---|---|---|---|
| `context-map.md` | **architect** | 전 도메인 dev(오리엔테이션) | 부재=완화 / 구조 불일치=architect에 반환 |
| `ubiquitous-language.md` | **architect** (전 페르소나 **제안**) | **전 페르소나** | 부재=완화 / 용어 충돌=표면화 + architect 판정 |
| `api-contract.md` | **backend-dev** | frontend-dev·ios-dev·android-dev | 부재=완화 / 소비자 코드 불일치=드리프트 결함; owner는 API 변경 시 동시 갱신 |
| `environments.md` | **infra** | 전 도메인 dev | 부재=완화 / **값 아닌 이름만**·시크릿 금지 |
| (디자인 토큰) | **designer → design.md 정본(026)** | frontend-dev·ios-dev·android-dev | 계약 저장소는 **포인터만**; design.md 드리프트 규칙(027) |

- **소유 = 유일 쓰기 권한**: 각 문서는 소유자만 정본을 갱신한다(DDD published language).
- **제안 vs 판정**: ubiquitous-language는 전 페르소나가 신규·상충 용어를 **제안**할 수 있으나,
  채택·충돌 판정은 architect가 한다(architect 정본의 기존 유비쿼터스 언어 소유 실체화).
- **최소 수술 원칙**: 페르소나 description은 불변. owner 3종(architect·backend-dev·infra)만
  소유 문서를 본문 소유 절에 명시하고, 소비자 UI dev 3종(frontend·ios·android)만 소비 확인을
  원칙 절에 얹는다. 나머지 도메인 dev의 계약·용어집 소비는 AGENTS.md 절의 보편 규칙으로 덮는다
  (본문 편집 최소화 — 028 완화 게이트에 계약 확인을 얹는 방식).

## 프로젝트 식별 규약

페르소나가 "지금 어느 프로젝트인가"를 아는 방법(실용 규약 + 폴백):

1. **1차: cwd 기반 추론** — 바이브 코딩은 프로젝트 작업 디렉토리에서 일어난다. 페르소나는
   `basename(cwd)`를 `projects/{project}/`에 매핑한다. 매칭은 **양방향 정규화 비교**(둘 다
   kebab-case·소문자로 정규화해 비교 — `MyApp` cwd ↔ `projects/my-app/` 매칭, 리뷰 경미 5)이며,
   폴더명은 kebab-case를 권장한다(템플릿·docs 안내).
2. **override: 사용자 명시** — 위임 프롬프트에서 프로젝트를 명시하면(예: "foo 프로젝트
   백엔드…") cwd 추론보다 우선한다.
3. **폴백: 모호 시 사용자 질문** — cwd basename이 일반명(`src`·`app`)이거나 매핑되는
   `projects/{project}/`가 없고 사용자도 명시하지 않으면, **추측하지 않고 사용자에게
   묻는다**("어느 프로젝트의 계약을 참조할까요?"). 신규 생성은 **사용자의 `cp`**가 기본이고
   에이전트는 안내만 한다(FR-1 정합 — 에이전트가 임의로 projects/를 만들지 않는다. 단
   사용자가 명시 요청하면 생성 가능). 이는 완화 게이트 철학과 정합(추론 가능하면 추론,
   모호하면 표면화 + 질문).

> **정직한 한계**: 프로젝트 식별은 Claude 내부 판단이라 CI 미검증 — AC는 규약 문구(정적
> 문자열)까지만 보증한다(028 라우팅 미검증과 동일). 코드 마커(`.localmind-project`) 도입은
> cwd 추론이 실전에서 불안정할 때의 후속(Open q — 029는 신규 코드 0).

## FR

- **FR-1 (계약 저장소 구조 규약)** *(goal: Objective)* — `<첫 노트 폴더>/projects/{project}/`를
  규약 위치로 정한다(agents/·skills/·guides/ 계열, guides/와 **형제**). 문서 4종
  (context-map·ubiquitous-language·api-contract·environments). 백업·인덱스는 firstNotesDir
  하위라 자동 계승 — brain.ts 제외 목록·019 asset-mirror·배포 파이프라인 **무변경**.
  028처럼 파일을 시드하지 않는다(범용 프로젝트 부재 — `cp`로 시작).

- **FR-2 (계약 문서 템플릿 4종)** *(goal: Success metrics)* — `templates/contracts/`에 추가:
  - `context-map.template.md`: ① bounded context 목록(이름·책임 한 줄) ② 컨텍스트 관계
    (의존·상하류·공유 커널 — DDD 관계 유형) ③ 관련 문서 포인터(각 계약 문서 + **design.md
    위치** — 토큰 정본은 여기 복제 금지) ④ 소유·갱신 주체(architect).
  - `ubiquitous-language.template.md`: 용어 엔트리 형식 = **용어 · 정의 · bounded context ·
    금지 동의어**(+ 근접어 구분). 갱신 주체(architect 소유, 전 페르소나 제안) + 충돌 판정
    규칙을 헤더에 명시.
  - `api-contract.template.md`: 엔드포인트·메서드·요청 형태·응답 형태·상태 코드·에러 표면.
    소유(backend-dev) + 소비자(frontend/ios/android) + **드리프트 규칙**(계약이 정본, owner는
    API 변경 시 동시 갱신)을 헤더에 명시.
  - `environments.template.md`: 환경별(로컬·스테이징·프로덕션) 서비스 URL·환경변수 **이름**과
    용도. **최상단에 시크릿 값 금지 경고**(노트 폴더는 백업 저장소에 커밋됨 — 값은 프로젝트
    자체 `.env`(git-ignore)에, 여기엔 이름·용도만). 소유(infra).
  - 모든 템플릿은 오픈소스 위생(플레이스홀더, 실제 시크릿 값·개인 경로 없음).

- **FR-3 (AGENTS.md "프로젝트 계약 저장소" 절)** *(goal: Objective)* — AGENTS.md에 절 추가:
  ① 2축 구분(도메인 가이드 vs 프로젝트 계약), ② 구조·`cp` 안내
  (`cp templates/contracts/api-contract.template.md <노트 폴더>/projects/<project>/api-contract.md`),
  ③ **프로젝트 식별 규약**(cwd 1차 · 명시 override · 모호 시 사용자 질문), ④ **게이트 조합**
  (부재=완화 + 존재 시 불일치=드리프트 결함) + 충돌 처리 규칙, ⑤ **시크릿 금지**(environments)
  + 백업 커밋 경고 계승, ⑥ **보편 규칙**(전 도메인 페르소나는 작업 전 해당 프로젝트 계약을
  확인, 용어집은 전 페르소나 공용), ⑦ **localmind 자체 예외**(FR-7).

- **FR-4 (owner 소유 매트릭스 — 본문 수술)** *(goal: Objective)* — 소유자 3종 본문 소유 절에
  소유 문서 1줄 추가:
  - `architect.md`: 기존 "유비쿼터스 언어" 소유를 **파일로 실체화** — "프로젝트 계약 저장소의
    `context-map.md`(bounded context·관계)와 `ubiquitous-language.md`(용어집)를 소유·갱신한다.
    용어 충돌은 bounded context 한정으로 병기하고, 해소 불가 시 근거와 함께 판정한다(요구가
    모호하면 인터뷰어)." 기존 소유/비소유·"화면 상태 전이"·"시스템 데이터 흐름" 문구는 불변.
  - `backend-dev.md`: 소유 절에 "프로젝트 `api-contract.md`를 소유·갱신한다 — API 변경 시
    계약을 동시에 갱신한다(staleness 금지)." 기존 "API 계약의 구현 수준 결정" 문구와 정합.
  - `infra.md`: 소유 절에 "프로젝트 `environments.md`(URL·환경변수 **이름**·용도)를 소유·
    갱신한다 — **시크릿 값은 넣지 않는다**." 기존 "시크릿을 코드·로그에 남기지 않는다" 문구와 정합.

- **FR-5 (소비자 확인 + 게이트 조합 — 본문 수술)** *(goal: Problem)* — 소비자 UI dev 3종
  원칙 절에 계약 소비 1줄 추가(028 완화 게이트에 얹기):
  - `frontend-dev.md`·`ios-dev.md`·`android-dev.md`: "작업 전 프로젝트 `api-contract.md`·
    `environments.md`를 확인한다 — 있으면 계약을 정본으로 따르고(코드 불일치는 드리프트 결함),
    없으면 일반 관례로 진행하되 '계약 문서 없음'을 명시한다." frontend-dev는 기존 design.md
    게이트 우선순위 문구 불변(토큰 정본은 design.md).
  - owner 3종·소비자 3종 본문 및 AGENTS.md에 **드리프트 규칙**("계약이 정본, 다르면 계약이
    이긴다") + **충돌 처리 규칙**(표면화 + 사용자 결정)이 존재해야 한다(grep AC).

- **FR-6 (designer 토큰 포인터 규율)** *(goal: Constraints)* — `designer.md` 본문에 1줄 추가:
  "프로젝트 계약 저장소는 디자인 토큰을 복제하지 않는다 — design.md가 정본이고, 계약 저장소
  (`context-map.md`)는 그 위치를 가리키는 포인터만 둔다." 026 정본 위계 방어(신규 복제 위험 차단).

- **FR-7 (localmind 자체 예외)** *(goal: Objective)* — AGENTS.md 계약 절에 명시: **localmind
  자체 개발은 SDD(specs/)가 이미 계약 역할**(goal/spec/plan + design.md)을 하므로 계약
  저장소를 강제하지 않는다. 계약 저장소는 **외부 바이브 코딩 프로젝트**용이다(028 worker(SDD)
  ↔ 도메인 dev(바이브) 분리와 동형).

- **FR-8 (docs 갱신)** *(goal: Success metrics)* — `docs/agents.md`에 "프로젝트 계약 저장소
  (바이브 코딩)" 절을 추가한다: 구조·소유 매트릭스 요약·**시크릿 금지 + 백업 커밋 경고**
  ("주의" 절 계승)·`cp` 안내·localmind 예외. `docs/personas.md`는 신규 페르소나가 없어 로스터 불변
  이되, 계약 소유(architect·backend-dev·infra) 각주를 더한다(구성 원칙 재조정 아님).

## Acceptance Criteria

> 기존 하니스 재사용(src/agents/seed.test.ts — 임시 폴더 fixture + repo 파일 grep +
> loadRegistry). AC 라벨 "029 AC-n". loadRegistry는 frontmatter만 검증(본문 절은 grep).

- **AC-1 (FR-2 계약 템플릿 존재·섹션)** Given repo 파일 검사, Then `templates/contracts/`에
  4종(context-map·ubiquitous-language·api-contract·environments).template.md가 존재하고,
  각 필수 섹션이 있다(grep — 앵커는 일반 한국어 단독이 아니라 **구체 다어절 구문**으로,
  리뷰 경미 7): context-map={"bounded context"·"관련 문서"}, ubiquitous-language={"bounded
  context"·"금지 동의어"}, api-contract={"엔드포인트"·"상태 코드"}, environments={"환경변수"·"시크릿"}.

- **AC-2 (FR-2·8 시크릿 금지)** Given `templates/contracts/environments.template.md`와
  `docs/agents.md`·`AGENTS.md`, Then environments 템플릿 최상단에 "시크릿 값 금지" 취지
  경고 + "값이 아니라 이름"·"백업 저장소에 커밋됨" 문구가 있고, docs/AGENTS.md에 동일 취지
  백업 커밋 경고("주의" 절 계승)가 있다(grep). **시크릿 부재의 1차 방어는 grep이 아니라 plan 단계
  2의 사람 전수 검토다(리뷰 중대 1 — 거짓 안심 방지)**: grep은 보조 가드로 최소 2구문
  (`키=값`·`키: 값` 형태의 8자 이상 연속 토큰)과 알려진 접두(`sk-` 류)의 부재만 검사하며,
  이 grep이 모든 시크릿 구문을 잡지 못함을 스펙이 명시한다(마크다운 표 셀·따옴표 값 등은
  사람 검토 몫).

- **AC-3 (FR-4 owner 소유 매트릭스)** Given owner 3종 본문, Then `architect.md`에
  `context-map`·`ubiquitous-language`(또는 "용어집") 소유 문구, `backend-dev.md`에
  `api-contract` 소유 문구, `infra.md`에 `environments` 소유 문구가 있다(grep). architect
  기존 단언("화면 상태 전이" 또는 "시스템 데이터 흐름" — seed.test.ts 026 AC-1b)이 **불변**임을
  회귀로 확인한다.

- **AC-4 (FR-3·5 게이트 조합·충돌 규칙)** Given AGENTS.md + owner/consumer 본문, Then
  AGENTS.md "프로젝트 계약 저장소" 절에 ① 부재=완화("없으면 … 명시") ② 존재 시 불일치=드리프트
  ("계약이 정본"·"다르면 계약이 이긴다" 취지) ③ 충돌 처리(표면화 + 사용자 결정) ④ 프로젝트
  식별(cwd + 모호 시 사용자 질문)이 모두 있고, 소비자 UI dev 3종 본문에 드리프트/완화 게이트
  문구가 있다(grep).

- **AC-5 (FR-5 소비자 확인)** Given `frontend-dev.md`·`ios-dev.md`·`android-dev.md` 본문,
  Then 각각 `api-contract`(또는 "API 계약") 소비 확인 문구가 있다(grep). frontend-dev의 기존
  design.md 게이트 우선순위 문구가 **불변**임을 회귀로 확인한다.

- **AC-6 (FR-2 용어집 DDD 규율)** Given `ubiquitous-language.template.md`, Then 엔트리 형식
  4요소(용어·정의·bounded context·금지 동의어)와 갱신 주체(architect 소유·전 페르소나 제안)·
  충돌 판정 규칙이 있다(grep).

- **AC-7 (FR-6 토큰 포인터 정본 방어)** Given `designer.md` 본문, Then "복제하지 않는다"·
  "design.md가 정본"·"포인터" 취지 문구가 있다(grep). 026 정본 위계 회귀.

- **AC-8 (회귀 — 파싱 불변·트리거 서로소 유지)** Given `templates/agents/`를 loadRegistry로
  파싱하면, Then problems 0건 · **19종 불변**(ALL 목록 그대로) · 각 유효 claude target.
  그리고 편집된 7종(architect·backend-dev·infra·frontend-dev·ios-dev·android-dev·designer)의
  **description에 계약 트리거 어휘**("계약"·"컨텍스트 맵"·"용어집"·"환경 정보"·"계약 저장소")가
  **부재**한다(신규 트리거 미도입 · 라우팅 tie 0 유지). **검사 스코프(리뷰 경미 2 —
  실측 확정)**: 반드시 loadRegistry로 **파싱된 `description` 필드만** 검사한다 — raw 파일·
  본문(bodyOf) grep 금지. backend-dev **본문**에는 기존 "API 계약의 구현 수준 결정" 문구가
  이미 있고 FR-4/5가 본문에 계약 어휘를 추가하므로, 파일 전체 grep은 반드시 오탐한다
  (026~028 3회 실증된 부분 문자열 함정과 동류). 실측 결과 편집 7종 description에 계약
  어휘 0건 — AC 충족 가능 확인됨.

- **AC-9 (FR-7 localmind 예외)** Given AGENTS.md + docs/agents.md, Then "localmind 자체
  개발은 specs/가 계약 역할"·"계약 저장소를 강제하지 않는다" 취지 문구가 있다(grep).

- **AC-10 (오픈소스 위생)** Given `templates/contracts/*.md` + 편집된 페르소나 본문 전수,
  Then `/Users/`가 없고 `/home/`은 플레이스홀더(`/home/<`)만 있다(grep — 위생 grep을 담는
  테스트 파일 자기충돌은 027 AC-7 방식으로 회피). "특정 개인·특정 스택 미지칭"은 grep 불가한
  의미 판단이라 plan 단계의 사람 전수 검토로 분리한다.

> **정직한 한계**: 프로젝트 식별(cwd 매칭)·드리프트 판정·계약 소비·완화 게이트 실효는 전부
> Claude 내부 규율이라 CI 미검증 — AC는 규약 문구(정적 문자열)까지만 보증한다(026 AC-2·028
> 계승). 계약 staleness와 시크릿 유출은 코드 강제 불가로, 스펙이 이 한계를 인정한다(의도된
> 마찰 최소화 — design.md식 강제 게이트가 아님).

## Open questions

1. **계약 자동 로딩(017 연계)** — 세션 시작 시 프로젝트 계약을 자동 주입할지. 명시 참조로
   시작해 관찰 후 결정(2차 — 028 가이드 자동 로딩 Open q와 연동).
2. **기계 가독 형식 이행(027 tokens.json 패턴)** — api-contract.md → OpenAPI,
   environments.md → `.env.example`, ubiquitous-language → 구조화 포맷. 값 표가 관리 한계에
   이르면 opt-in 이행(CI 강제 아님). 마크다운으로 시작.
3. **프로젝트 식별의 코드 마커** — cwd 추론이 실전에서 불안정하면 `.localmind-project`
   마커 파일로 승격(028 라우팅 관찰과 동형 — 신규 코드 0으로 시작).
4. **프로젝트 아카이빙** — 완료 프로젝트 `projects/{project}/` 정리 규약(인덱스·백업에서
   빼는 방법 포함). 현재는 사용자 수동.
5. **계약 인덱스 정책** — 현재 검색 포함(028 guides 계승). environments env 이름·계약
   문자열이 검색을 오염시키면 agents/·skills/처럼 제외 재론.
6. **크로스 프로젝트 용어집** — 조직 공통 용어를 프로젝트 위 계층에 둘지. 현재는 프로젝트별
   (사용자 결정). 공유 용어 수요가 반복되면 재론.
7. **dba 스키마·data-platform 파이프라인 계약** — 1차 4종에서 의도적으로 제외(리뷰 경미 3
   보완): api-contract가 서비스 공개 경계를 덮고, DB 물리 스키마·파이프라인 출력은 각
   도메인의 내부 계약으로 간주한다. 크로스 도메인 스키마 참조(예: frontend가 DB 형태에
   의존)가 실전에서 반복되면 5종째(schema-contract 등)로 재론.
8. **guides/ ↔ projects/ 경계 흐림** — 프로젝트 종속 스택 관례(가이드인가 계약인가)의
   회색지대. 현재는 2축 구분으로 안내, 실전에서 오배치가 반복되면 규약 정교화.
