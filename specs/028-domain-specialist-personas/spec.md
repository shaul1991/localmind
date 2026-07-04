# Spec: 바이브 코딩용 도메인 스페셜리스트 페르소나 세트 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## Scope

레지스트리에 도메인 페르소나 9종(구현 8 + 보안 리뷰 1)을 추가하고, 도메인 가이드 규약
(`guides/{domain}.md`) + 템플릿 + 각 페르소나의 완화 게이트를 세운다. critic이 보안 도메인
트리거를 security-reviewer에 양도한다. 배포는 026 파이프라인(seedAgents fill-missing)
재사용. 실제 도메인 구현·런타임 자동 라우팅·가이드 자동 로딩/백업 배관은 범위 밖.

## 용어

- **도메인 축 vs 역할 축** — 기존 10종은 **역할 축**(architect=구조, critic=검증, worker=
  구현…). 이번 9종은 **도메인 축**(무엇에 대한 작업인가). 기각된 "매트릭스(10+)"는
  role×domain 곱(90)이었다. 이번은 **worker 역할 하나에만** 도메인 특화 + 보안 도메인
  리뷰어 1 — role 축은 불변.
- **바이브 코딩 무대** — SDD·지식·디자인과 병렬인 새 무대. 명세 없이 도메인 가이드 +
  대화로 진행하는 구현 흐름. worker(SDD 무대: spec/plan 확정 구현)와 구분된다.
- **완화 게이트(softened gate)** — design.md식 "정의 없이 구현 금지"의 강제 게이트가 아님.
  각 도메인 dev는 작업 전 `<노트 폴더>/guides/{domain}.md`를 확인해 **있으면 따르고, 없으면
  일반 모범 사례로 진행하되 "도메인 가이드 없음 — 일반 관례로 진행"을 보고에 명시**한다.
- **도메인 가이드** — `<첫 노트 폴더>/guides/{domain}.md`(기본 설치면 `~/.localmind/guides/` —
  이하 이 표기로 통일). 스택(언어·프레임워크·버전)·컨벤션(네이밍·구조·테스트)·금지사항·
  참조. 축적형 사용자 콘텐츠 — 위치는 agents/·skills/와 같은 firstNotesDir 하위이되
  **인덱스 정책은 반대**(agents/·skills/는 검색 제외, guides/는 검색 포함 — 가이드는 진짜
  축적 지식이므로 의도된 차이, 리뷰 결함 9). 028은 파일을 시드하지 않는다(범용 도메인
  가이드가 없으므로 — 사용자가 `cp`로 시작).

## 트리거 어휘 배정표 (서로소 — AC-3로 고정)

각 description의 **배정 noun**(포함해야 함)과 **금지 noun**(포함 금지 = 다른 lane 소유).
공통 금지어(전 도메인 dev): `설계`(architect), `self-review`·`결함 검증`·`품질 게이트`
(critic), `디자인 시스템`·`디자인 토큰`·`컴포넌트 정의`(designer), `사용성`·`접근성`
(ux-reviewer). 아래는 도메인 간 상호 배정.

| 페르소나 | 모델 | 배정 트리거 noun(포함) | 상호 금지 noun(타 도메인 소유) |
|---|---|---|---|
| `backend-dev` | opus | 백엔드·서버사이드·API·엔드포인트 | 프론트엔드·앱·인프라·데이터 파이프라인·인증·물리 스키마·보안 리뷰 |
| `frontend-dev` | opus | 프론트엔드·웹 UI·브라우저·컴포넌트 구현 | 백엔드·앱·컴포넌트 정의·디자인 토큰·사용성 |
| `ios-dev` | opus | iOS·Swift·SwiftUI·아이폰 앱 | 안드로이드·Kotlin·웹 UI·프론트엔드 |
| `android-dev` | opus | 안드로이드·Kotlin·Jetpack·안드로이드 앱 | iOS·Swift·웹 UI·프론트엔드 |
| `infra` | opus | 인프라·배포·CI/CD·컨테이너·쿠버네티스·IaC·프로비저닝 | 백엔드·서버사이드·데이터 파이프라인·물리 스키마 |
| `data-platform` | opus | 데이터 파이프라인·ETL·데이터 웨어하우스·스트리밍 | 백엔드·물리 스키마·인덱스 최적화·인프라 |
| `auth-dev` | opus | 인증·인가·로그인·세션 관리·액세스 토큰·OAuth·RBAC | 백엔드(일반)·보안 리뷰·취약점 |
| `dba` | opus | 데이터베이스·물리 스키마·인덱스 최적화·쿼리 최적화·마이그레이션 | 데이터 파이프라인·백엔드·데이터 모델 설계(→architect) |
| `security-reviewer` | opus 🔖 | 보안 리뷰·취약점·위협 모델링·시큐어 코딩·공급망 보안 | 인증 구현(→auth-dev)·결함 검증·품질 게이트·self-review(→critic) |

> "앱"은 ios/android/hybrid 공유 위험어 → 배정 noun은 bare "앱"이 아니라 "iOS 앱"·"안드로이드
> 앱" 처럼 플랫폼 noun과 결합해야 한다. **"토큰"도 동일 취급(리뷰 결함 1)**: bare "토큰"은
> designer·ux-reviewer의 "디자인 토큰"에 부분 문자열로 포함돼 서로소가 깨진다 — "액세스
> 토큰"·"세션 토큰"처럼 결합형만 허용. 한국어 부분 문자열 함정은 026 AC-2·027 구현에서
> 반복 실증된 클래스로, 배정 noun 추가 시 항상 기존 전 description과의 포함 관계를 검사한다. dba의 "스키마 설계"는 데이터 모델 경계라 architect
> lane → dba는 "물리 스키마·마이그레이션"으로 한정("설계" 금지어와 정합).

## FR

- **FR-1 (구현 도메인 dev 8종)** *(goal: Objective)* — 정본 `agents/{backend-dev,
  frontend-dev,ios-dev,android-dev,infra,data-platform,auth-dev,dba}.md`를 정의한다.
  frontmatter는 **016 정본 스키마(중첩 `targets:` 블록 — sample-persona.md 형식)**:
  `targets.claude.model: opus`(바이브 코딩 = 명세 부재 기본값의 구현 — goal Constraints), tools 라인 없음(구현자 = 기본 도구 셋, worker와 동일).
  description은 배정표의 배정 noun을 포함하고 금지 noun을 제외한다. 본문 4절(소유/비소유/
  원칙/출력형식):
  - 소유: 해당 도메인 구현·테스트(도메인 스택 기준).
  - 비소유(핸드오프): 구조·경계→architect, 요구 발굴→interviewer, 최종 게이트→critic,
    그리고 인접 도메인 명시(예: backend-dev의 "DB 물리 스키마→dba, 인증 흐름→auth-dev,
    배포→infra"). frontend-dev는 추가로 "디자인 정의→designer, 사용성 점검→ux-reviewer"와
    **design.md 게이트 계승**(design.md 있으면 그 정의를 따름 — worker 게이트의 도메인판).
    **게이트 공존 규칙(리뷰 결함 4)**: UI 작업에서 design.md 강제 게이트(026 — 없으면 구현
    금지·사용자 알림)가 도메인 가이드 완화 게이트보다 **우선**한다 — 완화 게이트는 스택·
    컨벤션용이지 UI 사전 정의를 대체하지 않는다. 이 규칙을 frontend-dev·ios-dev·
    android-dev 본문에 명문화한다.
  - 원칙에 **완화 게이트 문구**(FR-4) 내장 + "명세·구조가 모호하면 멈추고 반환"(worker 규율
    계승).
- **FR-2 (security-reviewer)** *(goal: Objective, Risks)* — 정본 `agents/security-reviewer.md`.
  `targets.claude.model: opus`(다운시프트 금지), `targets.claude.tools: Read, Grep, Glob,
  Bash`(재현 검증, 쓰기 없음 — critic/ux-reviewer와 동형). description은 "보안 리뷰·취약점·
  위협 모델링·시큐어 코딩·공급망 보안" 계열 — **"self-review"·"결함 검증"·"품질 게이트"
  금지**(critic 충돌 방지, ux-reviewer 패턴). 본문:
  - 소유: 보안 취약점(주입·인증우회·시크릿 노출·권한상승), 위협 모델링, 시큐어 코딩 점검,
    공급망 보안(의존성·핀).
  - 비소유: 인증/인가 **구현**→auth-dev(security-reviewer는 리뷰), 수정→도메인 dev,
    **최종 품질 판정→critic**(도메인 리뷰이지 게이트 아님 — ux-reviewer와 동일 문형).
- **FR-2b (critic 보안 트리거 양도)** *(goal: Problem, Risks)* — `templates/agents/critic.md`
  description에서 보안 **도메인** 트리거를 양도한다: "보안·정확성 리뷰" → "정확성·추적성
  리뷰"류로 조정해 "취약점·위협 모델링·시큐어 코딩·공급망 보안" 문자열이 description에
  없게 한다. critic 본문에 핸드오프 1줄 추가: 깊은 보안 도메인 리뷰(위협 모델링·취약점 스캔
  해석)는 security-reviewer의 몫이되 **최종 게이트에서 명백한 보안 결함은 여전히 잡는다**.
  (critic body의 기존 보안 소유 문구—시크릿 노출·입력 주입—는 유지: 최종 게이트의 보안 패스.)
- **FR-3 (도메인 가이드 스키마)** *(goal: Objective)* — `templates/guides/guide.template.md`를
  추가한다. 섹션: ① 스택(언어·프레임워크·주요 버전) ② 컨벤션(네이밍·디렉토리 구조·테스트
  규율) ③ 금지사항(이 프로젝트에서 하지 말 것) ④ 참조(공식 문서·표준 링크). 규약 위치는
  `<첫 노트 폴더>/guides/{domain}.md`(agents/·skills/ 계열). **028은 도메인 가이드 파일을
  시드하지 않는다**(범용 가이드 부재 — 사용자가 `cp templates/guides/guide.template.md
  <노트폴더>/guides/backend.md`로 시작). AGENTS.md 바이브 코딩 절에 이 복사 안내를 명시한다.
- **FR-4 (완화 게이트)** *(goal: Problem)* — AGENTS.md에 "바이브 코딩 — 도메인 스페셜리스트"
  절을 추가한다: 기술 도메인 작업은 해당 도메인 페르소나가 수행하며, 작업 전
  `guides/{domain}.md`를 확인해 **있으면 그 스택·컨벤션·금지사항을 따르고, 없으면 일반 모범
  사례로 진행하되 그 사실을 보고에 명시**한다(design.md식 강제 금지가 아님 — 마찰 최소화).
  명시 위임(Agent 도구)으로 시작하며 자동 라우팅은 후속임을 명시. 각 도메인 dev 정본
  원칙에 동일 완화 게이트 문구를 담는다(templates/agents — CI grep 가능).
- **FR-5 (worker 경계 명시)** *(goal: Problem)* — `templates/agents/worker.md` 비소유에 1줄
  추가: 특정 기술 스택 도메인 작업(백엔드·프론트엔드·앱·인프라·DB 등)은 해당 도메인
  페르소나에게 — worker는 **도메인 미지정의 명세 기반 구현(localmind 자체 개발 포함, SDD
  무대)**. description은 도메인 noun을 담지 않아 기존 유지(수정 불필요). **UI 소유 분할
  (리뷰 결함 4)**: 기존 design.md 게이트 문구(026)의 UI 구현 소유를 재조정한다 — 웹 UI는
  frontend-dev, iOS/안드로이드 UI는 ios/android-dev, **도메인 미지정 UI만 worker**. 게이트
  자체(design.md 확정 후 구현)는 세 소유자 모두에게 동일하게 적용된다.
- **FR-6 (templates 시드 + 배포)** *(goal: Constraints)* — `templates/agents/`에 신규 9종을
  동봉한다. 시드는 026 `seedAgents`(fill-missing-only) 그대로 — 없는 파일만 복사, 기존
  정본·사용자 수정 보호, prune 없음. 기존 사용자는 다음 `agents-deploy` 시 9종 자동 수급.
  렌더·배포는 016/026 파이프라인 불변(Codex 타깃은 critic만 유지). 신규 코드 없음 —
  콘텐츠 추가 + 기존 시드 함수 재사용.
- **FR-7 (SSoT 갱신)** *(goal: Success metrics)* — docs/personas.md를 19종 구성으로 갱신한다.
  단순 행 추가가 아니라 **구성 원칙의 능동적 재조정**(026 패턴): (a) 역할 축 10종 불변,
  (b) worker 역할 하나에만 도메인 분화 8 + 검증 lane에 보안 도메인 리뷰어 1, (c) 바이브
  코딩이 026 재조정 각주가 허용한 "새 무대"임을 기록, (d) 매트릭스(90)와의 구분(단일 역할
  분화 ≠ role×domain 곱). 구성표·무대별 개입 지도에 "바이브 코딩 무대" 추가, 트리거 어휘
  배정 기록, TL;DR 총원 갱신, 도메인 축 진입 문턱(Open q) 기록.

## Acceptance Criteria

> 기존 하니스 재사용(src/agents/*.test.ts — 임시 폴더 fixture + repo 파일 grep +
> loadRegistry). AC 라벨 "028 AC-n". loadRegistry는 frontmatter만 검증(본문 절은 별도 grep).

- **AC-1 (FR-1·2 정본 유효성)** Given templates/agents/를 loadRegistry로 파싱하면, Then
  problems가 0건이고 정확히 **19종**이며(기존 10 + 신규 9), 각 페르소나가 유효 claude
  target을 갖는다. (026 회귀 갱신 — seed.test.ts의 `TEN` 목록, "정확히 10종", 시드 개수 리터럴
  10(AC-3 블록)·9(부분 존재 블록→18), `ssot.includes("10")` 단언까지 전부 — 리뷰 결함 7.)
- **AC-2 (FR-1·2 본문 구조 + 인접 핸드오프, 리뷰 결함 5)** Given 신규 9종 본문을 문자열
  검사하면, Then 소유/비소유/원칙/출력형식 4절이 존재하고, 비소유에 공통 핸드오프
  (architect·critic)와 **도메인별 필수 인접 핸드오프**가 있다(테스트 데이터로 고정):
  backend-dev→{dba, auth-dev, infra}, frontend-dev→{designer, ux-reviewer, backend-dev},
  ios-dev·android-dev→{designer}, infra→{backend-dev},
  data-platform→{dba}, auth-dev→{security-reviewer}, dba→{data-platform, architect(모델
  설계)}, security-reviewer→{auth-dev(구현), critic(최종)}. **auth-dev↔security-reviewer
  양방향 대칭**을 명시 grep으로 고정.
- **AC-3 (어휘 서로소 — 신규 lane 대(對) 전체, 리뷰 결함 2·8·재검 조정)** Given 19종 +
  스킬(sdd-self-review) description과 배정표(테스트 데이터로 전사), Then:
  ① 각 신규 9종 description이 자기 배정 noun을 포함한다.
  ② **신규 9종의 각 배정 noun N에 대해, 그 소유자를 제외한 나머지 18종 + 스킬 description에
  N이 부분 문자열로 존재하지 않는다** — 이 단방향 정의가 역방향 충돌(기존 페르소나가 신규
  noun을 품는 경우, 예: bare "토큰"⊂"디자인 토큰")까지 커버한다.
  ③ **공통 금지어(기존 소유자의 배정 noun: 설계·self-review·결함 검증·품질 게이트·디자인
  시스템·디자인 토큰·컴포넌트 정의·사용성·접근성)는 신규 9종 description에만 부재**를
  검사한다.
  **스코프 주석(재검 신규 결함 수정)**: 기존 10종 상호 간 검사는 하지 않는다 — 기존
  페르소나 쌍의 부분 문자열 중복("질문 설계"⊂interviewer vs architect의 "설계", "디자인
  토큰 준수"⊂ux-reviewer vs designer의 "디자인 토큰")은 026 이전부터 존재하는 **의도된
  lane 공유**이며 028 범위 밖이다. 전 19×19 대칭 pairwise는 이 의도된 중복에서 충족
  불가(UNSAT)가 되므로 채택하지 않는다.
- **AC-4 (FR-2b critic 보안 양도)** Given templates/agents/critic.md, Then **description에
  "보안" 문자열이 없고**(양도의 load-bearing 단언 — 현행 critic은 "보안·정확성 리뷰"를
  보유하므로 편집 없이는 red, 리뷰 결함 3), "취약점"·"위협 모델링"·"시큐어 코딩"·"공급망
  보안"도 없으며(회귀 보조), 본문에 security-reviewer 핸드오프 문구가 있다.
  security-reviewer는 "보안 리뷰"를 자기 description에 정당 보유(AC-3 pairwise에서
  "보안 리뷰"의 유일 소유자).
- **AC-5 (모델 티어)** Given 신규 9종 frontmatter, Then 구현 8종은 `model: opus`이고
  tools 라인이 없으며(구현자 기본 도구), security-reviewer는 `model: opus` +
  `tools: Read, Grep, Glob, Bash`(쓰기 없음)이다.
- **AC-6 (FR-3·4 완화 게이트·가이드 스키마)** Given repo 파일 검사, Then
  `templates/guides/guide.template.md`가 4섹션(스택·컨벤션·금지사항·참조)을 갖고, AGENTS.md에
  "바이브 코딩" 절(가이드 `cp` 안내 + "없으면 일반 관례 + 명시" 문구 포함)이 있으며, **각
  도메인 dev 본문**에 `guides/` 참조 + "없으면 ... 명시" 완화 게이트 문구가 있다(전부 repo —
  CI grep). frontend-dev 본문에 design.md 게이트 계승 문구가 있다.
- **AC-7 (FR-6 시드·멱등·보호)** Given 빈 노트 폴더 agents/에서 seedAgents를 실행하면, Then
  19종 전부 시드된다. Given 사용자가 수정한 정본이 있으면 Then 덮지 않는다(내용 불변).
  2회차는 전부 exists(멱등 — 026 계승).
- **AC-8 (FR-5 worker 경계)** Given templates/agents/worker.md, Then 비소유에 도메인 위임
  문구(도메인 페르소나에게)가 있고, worker description에 도메인 noun(백엔드·프론트엔드·
  안드로이드…)이 없다(기존 유지 — 역-충돌 방지).
- **AC-9 (오픈소스 위생)** Given `templates/agents/*.md`·`templates/guides/*.md` 전수, Then
  개인 절대경로(`/Users/`)가 없고 `/home/`은 플레이스홀더(`/home/<`)만 있다(grep). "특정
  개인·특정 스택 미지칭"은 grep 불가한 의미 판단이라 plan 단계 2의 사람 전수 검토로 분리.
- **AC-10 (FR-7 SSoT)** Given docs/personas.md, Then 구성표에 9행(모델·핸드오프)이 있고,
  스테일 총원 표기("총 10"·"이 10개")가 없으며, **TL;DR의 성분 합이 총원과 정합**한다
  ("무대 확장 5개" 잔존 검출 — 성분 표기 갱신 없이 총원만 고치는 반쪽 수정 방지, 리뷰
  결함 6). 구성 원칙 절이 도메인 축 확장을 명시적으로 정당화한다(역할 축 불변 + 단일 역할
  분화 + 바이브 코딩 무대 — 매트릭스 90과의 구분 기록).

> **정직한 한계**: 실제 자동 라우팅은 Claude Code 내부라 테스트 불가 — AC는 description
> 어휘 서로소(정적 문자열)까지만 보증한다(026 AC-2와 동일). "그냥 구현해줘"류 worker↔도메인
> dev 잔여 tie는 어휘로 해소 불가한 잔여 위험으로 인정한다. 완화 게이트의 실효는 페르소나
> 규율 준수에 달려 있음을 스펙이 인정(코드 강제 아님 — 의도된 마찰 최소화).

## Open questions

1. **하이브리드 앱(hybrid-dev)** — React Native·Flutter·Expo·Dart는 native iOS/Android
   noun과 서로소라 별도 페르소나로 분리 가능(유지 근거). 반대로 하이브리드 작업은 흔히
   플랫폼별 네이티브 모듈로 갈라져 frontend-dev + ios/android 협업으로 커버 가능(흡수 근거).
   현 결정: **흡수로 시작**, RN/Flutter 작업이 반복되고 협업이 불충분하면 20번째로 추가
   (026 ui-worker Open q와 동형 — 재사용 우선, 긴장 재발 시 분리).
2. **런타임 자동 라우팅(017 연계)** — 도메인 dev를 대화에서 자동 개입시킬지. 명시 위임으로
   시작해 관찰 후 결정(2차).
3. **도메인 가이드 자동 로딩·백업(019 연계)** — 가이드를 세션 시작 시 자동 주입할지, 그리고
   ~/.localmind/guides 백업 갭(asset-mirror 미대상)을 019 확장으로 메울지. 현재는 사용자가
   git 노트 저장소에 두도록 안내. 2차.
4. **도메인 가이드 인덱스 정책** — 현재 검색 대상(brain.ts 제외 목록에 없음). 가이드가
   노트 검색을 오염시키면 agents/·skills/처럼 제외 재론.
5. **추가 도메인의 진입 문턱** — 게임·ML·임베디드 등. 무한 증식 방지를 위해 "실제 반복 수요
   + 서로소 어휘 확보 + 기존 lane 흡수 불가"를 신규 도메인 추가의 3조건으로 둔다.
6. **도메인 dev의 sonnet 다운시프트** — 구현 8종은 opus 기본(사용자 결정 — 명세 부재
   구현). 도메인 가이드가 충분히 축적돼 태스크가 잘 조여지는 도메인은 비용 관찰 후
   sonnet 다운시프트 재론.
7. **Codex 타깃 렌더** — security-reviewer를 codex 교차 검증 백엔드로도 쓸지(현재 critic만).
