# Spec: 워크플로우 회고 리포트 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## Scope

작업 방식을 되짚는 회고 리포트를 004/017 리포트와 동형인 2단 구조로 추가한다:
순수 집계 모듈 `src/retro-analysis.ts`(+렌더 `src/retro-note.ts`) + 얇은 진입점
`scripts/retro-report.ts` + `make retro`·`make retro-cron`. 입력은 1차 프록시 신호만
(git log·specs OQ·결정 노트·query 집계·guides/projects 인벤토리). 출력은 `<노트
폴더>/reports/retro-{날짜}.md`. analyst 페르소나가 있으면 해석 위임, 없으면 집계만.
결정 로그 식별 관례(frontmatter tags의 `decision` — capture tags 파라미터로 생성)를 AGENTS.md에 보강하고 analyst 정본 소유를 확장한다.
신규 코드 경로는 회고에 한정 — 검색·백업·인덱스 배관은 손대지 않는다(**예외 1건, 리뷰
D2**: `capture()`/capture_note에 **선택적 `tags` 파라미터**를 추가한다 — 결정 노트의
결정적 식별에 필요. 기존 호출은 무변경·하위호환).

## Context

- **query-report 계열 관례(계승 대상)**: `scripts/query-report.ts`·`scripts/brain-report.ts`는
  얇은 진입점(IO·페르소나 호출)이고 계산은 `src/query-analysis.ts`(순수), 렌더는
  `src/report-note.ts`(순수 `renderMarkdown`). 회고도 이 3분할을 그대로 복제한다.
- **017 위임 패턴(계승)**: `brain-report.ts`는 `resolvePersona("analyst")`가 있으면
  `personaChat`으로 해석하고, 없거나 표본 부족이면 집계만 노트에 담는다(AC-13). 회고도 동일.
- **reports/ 주의(계승)**: `docs/agents.md §4` — `make report`가 만드는 노트는 검색 질의
  원문을 담고 검색·백업에 잡힌다. 회고 노트도 같은 주의 문구를 렌더한다.
- **결정 로그 규약의 공백**: AGENTS.md 결정 로그 규약(구현 규율)은 결정 노트를 second-brain에
  적재하라고만 하고 **식별 관례가 없다**. 회고가 이 노트를 결정적으로 수집하려면 식별자가
  필요하다 → 이번 스펙이 **frontmatter tags의 `decision`** 관례를 보강한다(`type:` 필드가
  아님 — capture()가 그 필드를 낼 수 없음이 실측됨, FR-3. 리뷰 R1 정합).
- **OQ 헤딩 변형**: 실측상 `## Open questions`(004는 "— 2026-07-03 재검으로 확정" 접미,
  030은 접미 없음)로 제목 뒤 자유 텍스트가 붙는다. 해결된 항목은 `~~취소선~~`으로 표기됨
  (004). 파서는 이 변형을 결정적으로 처리해야 한다.
- **analyst 정본은 사용자 데이터**: repo는 `templates/agents/analyst.md`(시드)만 소유하고
  배포 정본은 `<노트 폴더>/agents/analyst.md`다(016/026). 본문 확장은 templates 시드에 반영.

## Functional Requirements

- **FR-1 (2단 집계 구조)** *(goal: Objective)* — `src/retro-analysis.ts`(순수)가 다음 프록시
  집계를 만들고, `scripts/retro-report.ts`(진입점)가 git spawn·파일 읽기·노트 쓰기·analyst
  위임만 담당한다(query-report 3분할 계승). 순수 함수:
  - `parseCommits(gitLogText)` → 구간 커밋 총수, 타입별 분포(feat/fix/test/… conventional
    prefix 파싱 — **prefix 미매칭(Merge·`notes:` 등)은 "기타" 버킷**으로 분류, 리뷰 D1),
    스펙 cadence — **실측된 세 참조 형식을 모두 인식한다(리뷰 D1: 리터럴 `specs/NNN`은
    초기 커밋 관례일 뿐, 현행은 괄호형·spec 커밋형)**: ① `specs/NNN`, ② 제목 말미
    `(NNN)`(3자리 괄호), ③ `docs(spec):` 나열형 — **절 시작 위치(콜론/쉼표 뒤)의 3자리만** 스펙 번호로
    인정한다(구현 재검 확정: "docs(spec): 031 cap 100 chars"의 100 미집계, "022 a, 023 b,
    024 c" 전부 집계). 그 외 커밋의 베어 3자리는 `spec` 토큰 인접(12자 이내)만(리뷰 R6 —
    `fix: reduce to 100` 류 거짓 양성 방지).
  - `extractOpenQuestions(files)` → FR-2.
  - `collectDecisionNotes(files)` → FR-3.
  - `analyze(records)`는 **기존 `src/query-analysis.ts`를 재사용**한다(중복 구현 금지).
  - `inventory(guidesDir, projectsDir)` → 파일 목록 + 개수 + 최종 수정 시각(git archaeology
    안 함 — goal Constraints).

- **FR-2 (OQ 대시보드 — 결정적 추출)** *(goal: Objective, Non-goals)* —
  **`RETRO_REPO`(기본 cwd) 기준** `specs/*/spec.md`에서 `## Open questions` 섹션을
  결정적으로 추출한다(리뷰 D7 — guides/·projects/ 인벤토리는 **노트 폴더 기준**.
  specs/가 없는 일반 사용자 경로는 AC-9 참조):
  - 헤딩 매칭: `^#{2,}\s+Open questions`(대소문자 무시, 제목 뒤 자유 텍스트 허용).
  - 섹션 경계: 다음 `^#{1,}\s` 헤딩 또는 EOF까지.
  - 항목: 리스트 아이템(`-`/`*`/`숫자.`). **취소선(`~~`)이 "해결됨"의 유일한 결정적
    신호다**(리뷰 D5 — 실데이터의 해결 표기는 취소선·헤딩 접미·섹션 리네임·제자리
    재서술의 4종이나, 헤딩 접미는 031의 "인터뷰에서 확정 — 6건"처럼 *예정*을 뜻하기도
    해 자동 판정이 불가능하다. 리네임된 섹션은 헤딩 미매칭으로 자연 스킵). 취소선 없는
    제자리-해결 항목은 파서가 미해결로 표면화한다 — **문서화된 한계**이며, 사람이
    대시보드에서 판별한다(자동 판정 금지 정신과 정합). AGENTS.md에 "OQ 해결 시 취소선
    표기" 관례를 1줄 보강한다.
  - 출력: spec 번호별 미해결 OQ 원문 목록. **재론 조건은 OQ 원문에 포함된 채로 표면화**
    하며, 조건 도래 판정은 하지 않는다(사람/analyst 몫 — 자동 판정 금지).

- **FR-3 (결정 로그 노트 수집 + 식별 관례 보강 — 리뷰 D2 재설계)** *(goal: Objective)* —
  - **식별 기준 = frontmatter `tags`에 `decision` 포함**(`type:` 필드가 아님 — 실측:
    capture()의 frontmatter 템플릿은 고정이라 `type:`을 낼 경로가 없다. 리뷰 D2).
  - **생성 경로를 실현 가능하게 보강**: `capture()`와 capture_note MCP 도구에 **선택적
    `tags` 파라미터**를 추가한다(빈 기본값 — 기존 호출 무변경. 큐레이터 자동 태깅은
    `^tags: \[\]$` 빈 배열만 채우므로 사전 지정 tags를 덮지 않음 — 상호작용 실측 정합).
    frontmatter 조립 시 각 tag는 **JSON 문자열화로 이스케이프**한다(writeTagsToNote와
    동일 — 대괄호·따옴표·개행 주입 방어, 리뷰 R5).
  - 수집: `<노트 폴더>/**/*.md` 중 frontmatter tags에 `decision`이 있는 노트(제목·날짜·
    본문 내 스펙 포인터 추출). `type: report`/`type: retro` frontmatter 노트는 자동
    제외(자기 참조 방지).
  - **AGENTS.md 결정 로그 규약 보강**: 결정 노트는 capture_note에 `tags: ["decision"]`을
    지정해 적재한다. 소급 태깅은 하지 않는다(신규 노트부터 — 초기 수집량이 낮은 진짜
    원인이 "생성 경로 부재"였음을 이번에 해소).

- **FR-4 (자동화 후보 노이즈 임계)** *(goal: Objective, Success metrics)* — 반복 패턴의
  관찰 횟수가 **3회 이상**이면 "자동화 후보(승격)", 2회면 "관찰 중"으로 분류한다(임계
  상수는 모듈에 명시, 오늘 회고의 판정 기준 계승). **bare 타입 제외(2026-07-05 첫 실전
  개정)**: 스코프 없는 conventional 타입(feat·docs·기타 등)은 모든 저장소에서 자명하게
  반복되는 노이즈라 승격·관찰 대상에서 제외한다 — 신호는 scoped 패턴(예: fix(test))에서만.
  §7 액션 리스트는 §2의 복제를 피해 승격 상위 5건만 나열한다(초과분은 §2 참조 표기).

- **FR-5 (analyst 위임 — 017 패턴)** *(goal: Objective)* — `resolvePersona("analyst")`가
  있으면 `personaChat`으로 집계를 해석해 노트의 "분석가 해석" 섹션을 채운다. 없거나
  표본 부족이면 해석을 생략하고 집계만 담는다(brain-report AC-13 계승). **표본 부족의
  임계는 모듈 상수로 명시한다(리뷰 D8)**: 구간 커밋 < 3 **그리고** 결정 노트 < 1
  **그리고** 검색 레코드 < 10이면 부족(전부 미만일 때만 — 하나라도 있으면 해석 시도).

- **FR-6 (회고 노트 출력)** *(goal: Objective, Constraints)* — `src/retro-note.ts`의 순수
  `renderRetro(agg, interpretation, generatedAt)`가 `<첫 노트 폴더>/reports/retro-{YYYY-MM-DD}.md`를
  렌더한다. frontmatter `type: retro`·`tags: [report, retro]`. 섹션:
  1. **작업 패턴 관측** — 구간 커밋 총수·타입 분포·스펙 cadence(기계 집계). 승인 루프
     정밀 카운트는 프록시 밖임을 명시(정직한 한계).
  2. **자동화 후보** — 승격(≥3) / 관찰 중(<3) 분리(FR-4).
  3. **OQ 대시보드** — spec별 미해결 OQ + 재론 조건 문구(FR-2). 섹션 헤더에 파서
     한계 고지("취소선 없는 항목은 미해결로 표시됨 — 해결 여부는 사람이 판별")를
     렌더한다(리뷰 R4 — AC-2b와 추적 정합).
  4. **결정 로그 요약** — 수집된 결정 노트 목록(FR-3).
  5. **검색 품질 요약** — 기존 analyze() 결과 요약(FR-1 재사용).
  6. **사용자 결정 대기 액션 리스트** — analyst/집계가 도출한 제안(FR-7 게이트 적용).
  노트 상단에 reports/ 주의 문구(검색·백업에 잡힘)를 렌더한다.

- **FR-7 (자기 개정 안전 게이트 — 핵심, 리뷰 D4 정직화)** *(goal: Objective, Non-goals,
  Risks)* —
  - 스크립트는 `<노트 폴더>/reports/` **바깥의 어떤 파일도 쓰거나 수정하지 않는다**
    (AGENTS.md·`agents/*`·`specs/*`·`guides/*`·`projects/*` 불변 — 오직 읽기).
  - **강제 메커니즘의 정직한 실체**: Node 프로세스에 진짜 샌드박스는 없다 — "물리
    제한"이 아니라 **단일 가드 함수**(모든 파일 쓰기를 라우팅하며, 해석된 절대경로가
    reports/ prefix 밖이면 throw)를 코드의 유일 쓰기 지점으로 두는 **구조적 규율 +
    결정적 테스트 단언**이다. 가드 밖 직접 `writeFileSync` 호출은 금지(코드 구조 grep으로
    회귀 고정).
  - "사용자 결정 대기 액션 리스트"의 각 항목은 **제안 표기**(예: "제안:" 프리픽스)로만
    렌더하고, 노트는 게이트 고지 문구를 담는다: 규약·페르소나 개정은 사용자 결정 + SDD
    스펙 경유(회고는 제안까지).

- **FR-8 (실행 형태 — report와 분리)** *(goal: Objective, Risks)* — `make retro`(명시 실행,
  `npm run retro-report` 래핑)와 `make retro-cron`(선택 주기 — `report-cron.sh` 패턴을
  복제한 `scripts/retro-cron.sh`, 별도 crontab 마커 `# localmind-retro`)를 제공한다.
  `make report`(주 1회 검색 품질)와 **통합하지 않는다** — cadence·관심사가 다르다.

- **FR-9 (analyst 정본 확장 — 신규 페르소나 없음)** *(goal: Objective, 028 3조건)* —
  `templates/agents/analyst.md` 소유 항목에 "워크플로우 회고 리포트(`make retro`) 집계
  해석"을 추가한다(lane 확장 — 신규 페르소나·신규 트리거 어휘 도입 아님). docs/personas.md·
  docs/agents.md §4 위임 표의 analyst 행에 회고를 반영한다.

## Acceptance Criteria

> 기계 집계·파싱·게이트는 결정적 테스트. 순수 모듈은 vitest(`src/retro-analysis.test.ts`),
> 진입점 통합은 셸(`scripts/retro-report.test.sh` — query-report.test.sh의 픽스처·assert
> 관례 계승, fixture git repo/specs/노트 폴더). analyst 해석 품질은 CI 미검증(페르소나
> 규율 — 026~031 정직한 한계).

- **AC-1 (FR-2 OQ 추출 결정성)** Given fixture spec 2개 — 하나는 `## Open questions`,
  다른 하나는 `## Open questions — 재검으로 확정`(제목 접미) — 각각 미해결 항목 2개 +
  `~~취소선~~` 해결 항목 1개를 담을 때, When 회고를 실행하면, Then OQ 대시보드는 두 spec의
  **미해결 4개를 spec 번호와 함께** 나열하고 **취소선 2개는 제외**한다.

- **AC-2 (FR-2 재론 조건 원문 보존·자동 판정 없음)** Given OQ 항목이 "반복되면 X를
  명문화"라는 조건 문구를 포함할 때(analyst **부재** 픽스처 — 자유 해석 텍스트로 인한
  비결정 제거, 리뷰 D9), When 회고를 실행하면, Then 대시보드는 그 조건 문구를 **원문
  그대로** 표면화하고, "조건 도래/충족" 류의 판정 문자열이 **OQ 대시보드 섹션 안에**
  없다(섹션 스코프 grep).
- **AC-2b (FR-2 제자리-해결 한계 고정 — 리뷰 D5)** Given 취소선 없이 "이미 반영됨"이라
  서술된 OQ 항목 픽스처, When 회고를 실행하면, Then 그 항목은 미해결로 표면화된다 —
  파서의 문서화된 한계를 테스트로 고정(사람 판별 몫임을 노트 대시보드 헤더에 명시).

- **AC-3 (FR-3 결정 노트 수집)** Given 노트 폴더에 tags에 `decision`을 가진 노트 2개
  (각각 `specs/NNN` 포인터 포함)와 `type: report` 노트 1개·프론트매터 없는 일반 노트
  1개가 있을 때, When 회고를 실행하면, Then 결정 로그 요약은 **decision 태그 2개만**
  (제목·날짜·스펙 포인터) 나열하고 나머지는 제외한다.
- **AC-3b (FR-3 생성 경로)** Given capture_note를 `tags: ["decision"]`과 함께 호출하면,
  Then 생성된 노트 frontmatter의 tags에 `decision`이 포함된다(기존 tags-미지정 호출은
  `tags: []` 불변 — 하위호환 회귀). 특수문자 tag(따옴표·대괄호 포함) 1건은 JSON
  이스케이프돼 frontmatter가 깨지지 않는다(리뷰 R5).

- **AC-4 (FR-4 3회 임계 — 첫 실전 개정)** Given fixture에 bare 타입 다회(feat 53·docs 38)와
  scoped 패턴(fix(test) 3회·docs(spec) 2회)이 함께 있을 때, When 회고를 실행하면, Then
  **scoped 3회만 승격**, scoped 2회는 관찰, **bare 타입은 양쪽 다 제외**된다.

- **AC-5 (FR-1 commit 집계)** Given fixture git log — feat 2·fix 3·test 1 + Merge 1 +
  `notes:` 비관례 1 + `docs(spec):` 3(단건·절 중간 3자리 함정 "cap 100 chars"·나열형
  "022 a, 023 b, 024 c") — 스펙 참조는 혼합 형식(리터럴 `specs/NNN` 없음: 현행 repo 관례
  재현, 리뷰 D1 + 구현 재검), When 회고를 실행하면, Then 커밋 총수 11·타입 분포(기타 2·
  docs 3)·031 cadence 3·**100 미집계**·022/023/024 각 1이 fixture 기대치와 일치한다.

- **AC-6 (FR-7 안전 게이트 — 쓰기 스코프)** Given fixture 실행 환경(AGENTS.md·agents/*·
  specs/* 존재), When 회고를 실행하면, Then 새 파일은 `<노트 폴더>/reports/retro-*.md` **하나뿐**
  이고, AGENTS.md·`agents/*`·`specs/*`의 내용·수정시각이 불변이다(실행 전후 대조 —
  단 이 대조는 fixture 트리에 한정된 관측임을 인정, 리뷰 D4).
- **AC-6b (FR-7 가드의 이빨 — 리뷰 D4)** Given 가드 함수에 reports/ 밖 경로(예: 임시
  fixture의 agents/ 절대경로)를 직접 전달하는 단위 테스트, Then **예외를 던진다**. 그리고
  진입점·렌더 코드에 가드 경유가 아닌 직접 파일 쓰기 호출이 없다(코드 구조 grep —
  `writeFileSync`뿐 아니라 `appendFileSync`·`createWriteStream`·`renameSync` 등 쓰기
  계열 API 전체가 가드 모듈에만 등장, 재검 권고 반영).

- **AC-7 (FR-7 제안 표기·게이트 고지)** Given 회고 노트, Then "사용자 결정 대기 액션
  리스트" 항목은 제안 표기로 렌더되고, 노트는 게이트 고지 문구(규약·페르소나 개정은
  사용자 결정 + SDD 스펙 경유)를 포함한다(grep).

- **AC-8 (FR-5 analyst 부재)** Given `analyst` 페르소나가 없을 때, When 회고를 실행하면,
  Then 노트는 집계 섹션을 정상 렌더하고 "분석가 해석"은 부재 플레이스홀더로 채워지며
  exit 0 (brain-report 계승).
- **AC-8b (FR-5 표본 부족 스킵 — 리뷰 D8 + 재검 정직화)** Given analyst 존재 + 전 소스가
  임계 미만인 픽스처, When 회고를 실행하면, Then 해석이 생략되고 "표본 부족" 명시 +
  exit 0. **관측 한계(정직)**: personaChat 미호출 자체는 게이트웨이 스텁 없이 직접 관측
  불가 — 테스트는 렌더·종료 코드까지 고정하고, 미호출은 코드 경로 가드(`if (!insufficient)`)
  + 즉시 종료로 뒷받침한다(가드 이전 호출 회귀의 이론적 여지는 문서화된 한계).

- **AC-9 (엣지 — git repo 아님/데이터 없음)** Given `RETRO_REPO`가 git 저장소가 아니거나
  구간에 커밋·스펙·결정 노트·검색이 모두 없을 때, When 회고를 실행하면, Then **노트는
  항상 생성하되**(brain-report의 항상-생성과 정합 — 리뷰 D3: "만들지 않거나"의 이중
  정의 제거) 해당 섹션에 "데이터 부족/git 저장소 아님"을 평이한 한국어로 명시하고
  exit 0. `specs/`가 없는 사용자(일반 설치)는 OQ 대시보드가 공란 + "specs 없음" 명시
  (리뷰 D7 흡수).

- **AC-10 (FR-6 reports/ 주의 렌더)** Given 회고 노트, Then 상단에 검색·백업에 잡힌다는
  주의 문구가 렌더된다(docs/agents.md §4 계열 — 리뷰 D6 정정, grep).

- **AC-11 (FR-9 analyst 확장·회귀)** Given `templates/agents/`를 loadRegistry로 파싱하면,
  Then problems 0 · 총 19종 불변 · analyst description(트리거 어휘) 불변(028/029 스코프 —
  파싱된 description 필드만), analyst 본문에 "회고" 소유 문구가 추가돼 있다(본문 grep).

- **AC-12 (위생)** Given 편집·신규 전 파일, Then `/Users/` 부재 · `/home/`은
  플레이스홀더만(grep — 테스트 하니스 제외, 027/030 방식).

## Open questions

1. **트랜스크립트 마이닝 2차** — 승인 루프 정밀 카운트·개입 원문 분류는 세션 트랜스크립트가
   필요하다(크고·민감·비쌈). 1차 프록시가 "기계적 개입 60%" 같은 신호를 못 잡는 것이
   반복 확인되면 2차에서 트랜스크립트 소스·마스킹·비용 상한을 설계한다.
2. **자동 실행 주기 기본값** — 스프린트 경계는 불규칙이라 report처럼 "주 1회" 기본이
   맞지 않을 수 있다. `retro-cron`의 기본 DOW/간격을 유보(첫 실전 cadence 관찰 후 결정).
   `RETRO_DAYS`(구간 일수) 기본값과 since-last-retro 자동 바운딩 채택 여부도 여기 포함.
3. **회고 → 스펙 자동 초안 연결** — 액션 리스트 항목을 goal/spec 초안으로 자동 전개할지.
   자기 개정 게이트(FR-7)와의 경계 설계가 선결 조건.
4. **결정 노트 식별 관례 정착률** — tags `decision`은 신규 관례라 초기 수집량이 낮다.
   정착이 더디면 (a) 소급 태깅 배치 안내, (b) 관례 강제 시점 재론.
5. **guides/·projects/ 인벤토리 축약의 실효** — mtime 인벤토리로 git archaeology를 회피한
   판단이 회고 신호로 충분한지. 부족하면 git 노트 저장소 한정 archaeology를 검토.
