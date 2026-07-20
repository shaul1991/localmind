# AGENTS.md — localmind 작업 규약

이 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex 등)가 따르는 규약이다.

## SDD 흐름 — 기본값

모든 기능·변경은 `specs/{timestamp}-{feature-slug}/` 폴더에 3개 문서로 시작한다:

- `goal.md` — 왜(why): Background·Problem·Objective·Success metrics·Non-goals·Constraints·Stakeholders·Risks
- `spec.md` — 무엇을(what): FR(각 FR은 goal 항목을 지지), Acceptance Criteria(Given-When-Then, 테스트와 1:1 매핑), Open questions
- `plan.md` — 어떻게(how): 도메인 경계, 영향 모듈, 단계, 테스트 전략

폴더 프리픽스는 **생성 시점 timestamp**(`YYYYMMDDHHmm`, 예: `202607172120`), 슬러그는 kebab-case.
(2026-07-17 변경: 기존 3자리 일련번호(`001`…)는 동시작업 시 번호 중복이 발생해 timestamp로 전환 —
사용자 결정. 기존 `NNN-` 폴더는 레거시로 유지하며 매칭 대상이다.)

**기존 spec을 덮어쓰지 않는다** — `mkdir -p`가 아니라 **`mkdir`(`-p` 금지)** 로 만든다. 같은
경로가 이미 있으면 EEXIST로 실패하므로(확인-후-생성의 경쟁 창 없이) 남의 spec을 덮어쓸 수 없다.
EEXIST면 **현재 시각을 다시 읽어** 초까지 확장(`YYYYMMDDHHmmss`)해 재시도한다 — 시각이 진행하므로
곧 빈 경로에 도달한다(같은 경로 재확인은 결과가 같아 무한 반복 — 반드시 시각을 다시 읽는다).

`mkdir`은 **경로**(프리픽스+슬러그) 충돌만 막는다. 같은 분에 만든, 슬러그가 다른 두 spec은
경로가 달라 둘 다 성공하므로 **프리픽스는 유일하지 않을 수 있다**(timestamp만으로는; 레거시 예:
`specs/041-*`가 둘). 따라서 프리픽스로 폴더를 고르는 쪽(아래 규약 1단계)이 모호성을 처리한다.

## 변경 등급 티어 — 작업 크기에 맞는 lane 선택

작업에 착수하기 전에 **먼저 변경 등급(change tier)을 판정**한다. 티어가 문서·critic 의식(ceremony)의
크기를 결정한다 — 작은 변경에 풀 코스를 강제하지 않고, 큰 변경의 품질 게이트는 유지한다. 티어 판정은
**런타임 분류기 코드가 아니라 이 규약 텍스트를 읽어 워크플로가 수행**한다(fan-out 판정이 tasks 선언을
읽는 것과 같은 결). 이 규칙은 **instruction-level**이며 런타임이 기술적으로 강제하지 않는다(과장 금지).

### 티어 트리거 (객관적)

- **Tier 0 — 트리비얼:** **행동 불변이 자명한** 변경만. 주석·문서 문구·포매팅·도구 지원 rename.
  **config/설정 값 변경은 Tier 0에서 제외**한다(타임아웃·feature flag·모델명·토큰 TTL·rate limit 등
  행동을 바꿀 수 있다). 기존 테스트가 커버하며 새 테스트가 불필요하다.
- **Tier 1 — 작음:** 국소적 행동 변경으로 **아래 하드 신호가 모두 아님**. blast-radius가 한정적이다.
  config 값은 행동 영향 없음이 확인되면 Tier 1, 확인 안 되면 상위로 escalate.
- **Tier 2 — 실질적:** 아래 **하드 신호 중 하나라도** 해당하거나 blast-radius가 넓은 변경. 크기가
  작아 보여도 무조건 Tier 2다.
  - **하드 신호:** 신규 도메인 개념 · 계약(API/스키마/이벤트) 변경 · 인증·보안 표면 · 마이그레이션 ·
    데이터 모델 변경 · 전역 상태·직렬화 형식 변경 · 크로스커팅 변경.
- **escalate-on-doubt (양 경계):** 판정이 불확실하면 **한 단계 위 티어**로 올린다. Tier 0↔1,
  Tier 1↔2 **두 경계 모두**에 적용한다. 하향 추측은 금지한다.

### 티어별 의식 (문서·critic)

| Tier | 문서 | critic |
|---|---|---|
| 0 트리비얼 | 없음(기존 트리비얼 예외) | 없음 |
| 1 작음 | 경량 단일 문서 `change.md`(why·what·AC·티어 근거) | **in-session** 적대 자기검증 1라운드, diff 스코프 |
| 2 실질적 | 현행 goal/spec/plan/tasks 4문서(아래 규약대로) | **격리** 적대 critic, self-review 자동 2라운드 상한 |

Tier 1 문서·구현도 **TDD**(AC↔테스트 1:1)를 유지한다. **테스트 생략은 Tier 0에만** 허용된다.
Tier 2는 이 문서의 `goal-impl` 흐름·DoD를 그대로 따른다.

### worked-example (대표 변경 → 티어 → 근거)

| 대표 변경 | 티어 | 근거 |
|---|---|---|
| 오타·주석·문서 문구 수정 | 0 | 행동 불변 자명 |
| README/포매팅 정리, 도구 지원 rename | 0 | 행동 불변 자명 |
| 타임아웃·rate limit 등 config 값 변경 | 1+ | config는 Tier0 제외 — 행동 영향 확인, 불명이면 escalate |
| 기존 함수에 국소 버그 수정(계약·스키마 무변) | 1 | 하드 신호 없음, blast-radius 한정 |
| 새 유효성 규칙 추가(기존 엔드포인트 내부) | 1 | 계약 형태 불변이면 Tier1 |
| API/스키마/이벤트 계약 변경 | 2 | 하드 신호(계약) |
| 로그인·권한·토큰 로직 | 2 | 하드 신호(보안) |
| DB 마이그레이션·데이터 모델 변경 | 2 | 하드 신호(마이그레이션·데이터 모델) |
| 전역 상태·직렬화 형식 변경 | 2 | 하드 신호(전역 상태·직렬화) |
| Tier1/2 경계가 모호한 변경 | 2 | escalate-on-doubt(상향) |

### 판정 기록·중간 승격

- 진입에서 티어를 판정하고 **근거(어느 트리거로 어느 티어인지)를 산출물에 기록**한다(Tier 1의
  `change.md` 또는 Tier 2의 goal/spec·self-review 보고).
- 구현 중 상위 티어 하드 신호(신규 계약·보안·마이그레이션·전역 상태 등)가 드러나면 **상위 티어로
  승격**하고 승격 사실·추가 의식을 보고한다. **하향 재분류는 하지 않는다.**

### critic 캐싱 — matrix-as-map + 라운드 전량 재검증 (보수형)

critic의 콜드리드(cold read) 비용을 낮추되 검증 깊이는 낮추지 않는다.

- **matrix-as-map:** self-review는 이미 `FR/AC + diff + 테스트 근거`로 스코프한다. 그 위에
  verification matrix 각 행이 가리키는 **AC↔코드·evidence 대응을 조사 지도(map)** 로 제공해 critic이
  그 대응을 매번 재구성하지 않게 한다.
- **독립성 가드레일:** map은 "어디를 보라"만 정한다. critic은 검토하는 **각 행을 실제 코드로
  검증**하며, **matrix 상태 셀(구현자가 채운 주장)만으로 통과시키지 않는다**(도장찍기 금지). 읽기
  효율만 높이고 검증 깊이는 줄이지 않는다.
- **라운드 전량 재검증(보수형):** self-review 라운드가 전환돼도(blocker 수정으로 새 candidate)
  **모든 matrix 행을 전량 재검증**한다. **verdict 승계·행 스킵은 하지 않는다** — round 2 격리
  리뷰어는 round 1 verdict를 물려받지 않고 각 행을 독립 재검증한다(per-round 독립성 완전 보존).
  재사용되는 것은 **검증 결과가 아니라 map뿐**이다.
- **round-to-round 무효화-스킵(적극형)은 도입하지 않는다.** blast-radius 무효화는 base 통합 재평가에
  한해 `202607181125`(frozen matrix 영향 행 재평가) 정본 소관으로 남으며, 이 규약은 그것을 재정의하지
  않는다.
- **map 재사용 범위:** matrix map 재사용은 **within-run(한 goal-impl 실행 내)** 으로만 유효하다.
  **세션·실행 간(cross-session) map 재사용은 금지**한다(base·의존성 이동으로 map이 낡을 수 있다).

이 티어·캐싱 도입은 `202607181125`의 확정(self-review 자동 2라운드 상한·matrix 동결·두 시점 base
freshness·외부 완료 상태 SSoT)과 **Tier 2 품질 규율(전 AC green·필수 도그푸드·격리 적대 critic·PR
게이트·Live-Verify)을 문구·의미상 약화하지 않는다.**

## `goal-impl {prefix}` 처리 방법 (SDD 구현 워크플로)

이 규약이 SDD 구현 완료 규칙의 **정본(SSoT)**이다. 논리 command ID는 `goal-impl`이고 runtime별
호출은 Claude Code `/goal-impl {prefix}`, Codex `$goal-impl {prefix}`, Gemini CLI는 생성된
`/goal-impl {prefix}` wrapper(+ 새 확인)다. 세 곳에서 행동은 같고 호출 문자만 공식 문법을 따른다.
Claude Code의 built-in `/goal`은 session completion condition으로 이름·의미가 다르며 LocalMind는
이를 shadow하거나 `goal` skill/wrapper를 만들지 않는다(specs/044).

runtime이 명시 호출을 보증하고 원인자가 spec 폴더 프리픽스(timestamp 또는 레거시 3자리 숫자)일 때
(또는 provenance 없는 runtime에서 바로 앞 턴의 새 확인 응답이 있을 때) 다음을 수행한다:

1. `specs/{prefix}-*/` 폴더를 찾는다(프리픽스로 매칭, 슬러그는 몰라도 됨). **프리픽스가 2개
   이상 폴더에 매칭되면**(같은 분·다른 슬러그, 레거시 번호 중복 등) 추측하지 말고 **어느
   spec인지 사용자에게 묻는다** — 잘못된 폴더로 구현하는 것보다 되묻는 편이 낫다.
2. 해당 폴더의 `goal.md` · `spec.md` · `plan.md`를 모두 읽는다.
3. **시작 base freshness gate**: 어떤 파일도 변경하거나 쓰기 전에 `origin/main`을 fetch하고 최신
   **full SHA**를 기록한다. **latest origin/main base에서 분리한 feature branch**에서만 작업한다.
   기존 dirty·unmanaged 파일은 그대로 보존하고 작업 범위와 겹치면 수정하지 말고 중단·보고한다.
   fetch·정합이 실패하면 `freshness unverified`로 기준 SHA·원인·영향을 밝히고 사용자의 방향을
   받기 전에는 fresh 또는 complete라고 단정하지 않는다.
   그 뒤 `plan.md`의 단계를 기준으로 구현한다 — FR/AC는 `spec.md`, 배경/의도는 `goal.md`를 따른다.
   verification matrix의 모든 AC가 검증 방법·evidence·종료 조건을 가진 정확히 한 행인지 readiness를
   확인한다. 필수 검증 capability가 없거나 skipped/degraded이면 green이 아니라 blocker다. 첫
   dogfood 직전에 matrix를 freeze하며, 이후 개정은 변경 이유·영향 AC·무효화할 evidence를 기록한다.
4. 구현 후 AC를 테스트로 검증한다(TDD — 실패 테스트를 먼저 쓰고 통과시킨다). 테스트 green만으로
   완료하지 않고 실제 실행을 관찰하는 dogfood를 반드시 수행한다.
5. **최종 self-review 직전에 `origin/main`을 다시 fetch해 full SHA를 비교한다.** base 또는 기준 SHA가
   이동했으면 repository 정책대로 정합·통합하고 영향받은 regression 테스트를 재실행해 green이 된
   뒤에만 review를 시작한다. **base 통합으로 candidate가 변경되면 frozen matrix의 영향 행을 재평가하고,
   무효화된 evidence(테스트·dogfood·배포)를 현재 candidate에서 재실행한다.** stop condition 자체가
   틀렸다면 matrix amendment 규칙에 따라 이유·영향 AC·무효 evidence를 먼저 기록한다.
   조회·정합 실패는 `freshness unverified`로 원인·영향과 함께 보고하고
   사용자의 방향 없이 진행하지 않는다.
   **self-review를 반드시 수행한다 — 생략 불가.** 구현·테스트가 끝났다고 스스로 판단해 곧장
   "완료"로 보고하지 않는다.
   - 가능하면 구현 컨텍스트와 분리된 격리 리뷰어(runtime이 제공하는 격리 위임 능력)로 독립
     리뷰한다. 격리 위임을 쓸 수 없는 환경이면, 결함을 찾으러 간다는 자세로(자기확증
     편향 배제) 현재 session이 직접 재검토하고 그 사실(비독립)을 보고에 밝힌다.
   - 점검 범위 5가지: (1) `spec.md`의 모든 FR·AC가 구현+테스트로 1:1 충족됐는지 추적,
     (2) 유저 시나리오·엣지 케이스가 실제 테스트로 커버됐는지, (3) 로직·경계·에러처리 버그,
     (4) 불필요한 복잡도·보안 취약점, (5) **사실 정확성 — 낡을 수 있는 사실(외부 API·SDK·
     라이브러리 거동·가격·모델명·버전·한도·표준)이 라이브 최신 공식문서(T1)로 검증됐는지.
     기억·주입 컨텍스트로 단정한 미검증 사실은 결함으로 본다**(아래 구현 규율 Live-Verify Facts).
   - **candidate와 round:** review candidate는 코드·계약·필수 evidence의 한 세대다. 동일 candidate를
     여러 독립 reviewer가 검수해도 findings를 합친 merged report 하나가 round 1개다. finding 수정으로
     candidate가 바뀐 뒤 새 merged report를 만들 때만 다음 round로 센다.
   - **유한한 자동 재검:** 자동 self-review는 **최대 2 round**다. round 1 blocker를 묶어 수정한 뒤
     round 2를 실행할 수 있다. **round 2에도 blocker가 남으면 즉시 중단**하고 남은 blocker·수정·테스트
     상태·다음 review 목적을 사용자에게 보고한다. 그 결과를 본 뒤의 명시적인 **fresh round approval**
     만 유효하며, **승인 1개는 다음 round 1개만** 해제한다. 과거·포괄·암묵 승인과 승인 재사용은
     무효다. 추가 round 뒤 blocker가 남으면 새 승인을 다시 받아야 한다.
   - round 상한은 품질을 낮추는 성공 조건이 아니다. blocker·미충족 AC·실패한 필수 테스트가 하나라도
     남으면 완료·commit·push로 진행하지 않는다. 판단이 애매하거나 트레이드오프가 있는 사안도
     사용자에게 보고한다.
   - self-review에서 결함 0 + 테스트 green + AC 전부 충족(미충족분은 사용자에게 명시 보고)이
     확인된 뒤에야 "완료"로 보고한다.
   - **검증 표기를 세 문서에 남긴다(2026-07-05 보완)**: self-review가 clean으로 닫히면 결과를
     보고문에만 쓰지 말고 **문서 자체에 체크로 표기**한다 — `spec.md`의 FR·AC 각 항목에
     `[x]` + 검증 근거(테스트 시나리오/실증 방법), `plan.md`의 단계·테스트 전략 항목 체크,
     `goal.md`의 Success metrics 달성 표기. **미충족 항목은 체크하지 않고 사유를 부기**한다
     (은폐 금지). 문서만 읽어도 "무엇이 실제로 됐는지"가 보여야 하며, 이 표기까지가 규약 7
     커밋에 포함된다.
6. 세 문서 중 하나라도 없으면 진행 전에 사용자에게 알린다 — 문서 없이 구현하지 않는다.
7. **versioned completion state와 external completion state를 분리한다.** self-review가 clean이면
   versioned 구현·테스트·문서 상태를 최종 commit에 닫고, feature 브랜치 push + PR 생성까지가
   `goal-impl`의 완료 정의다(치명·중대 0 + 테스트 green + 교차 검증 상태 명시 — 2026-07-05 회고 결정: clean
   후 커밋을 거부한 사례가 0회라 별도 지시를 없앰). **main 직접 push는 금지 — feature
   브랜치에 커밋·push하고 PR을 생성한다. 머지는 사람이 한다**(2026-07-17 결정, D-6 — base
   PR 게이트를 규약7에 명문화). 커밋 메시지에 self-review 요약을 남긴다. clean이 아니면
   커밋하지 않고 보고한다. push 이후 PR/CI 상태는 **원격 GitHub가 SSoT**인 external completion
   state다. PR 번호·CI 상태·run ID만 기록하기 위한 후속 commit은 만들지 않는다. **CI 실제 결함은
   새 candidate**로 수정할 수 있지만 관련 테스트와 남은 round 또는 fresh approval review를 다시
   통과해야 한다. push 뒤에는 CI 감시를 자동으로 걸어 **실패 시에만** 즉시
   알리고(green은 다음 보고에 부기), 끝난 감시 프로세스는 정리한다. **감시 방법(2026-07-05
   보완)**: 폴링 루프 대신 `gh run watch <run-id> --exit-status`(단일 블로킹 명령 — CI 평균
   2.5분이라 폴링·알림 왕복이 CI보다 비쌈)를 쓰고, run 조회는 **전체 sha**만 사용한다
   (짧은 sha는 `--commit` 필터가 빈 결과 → 무한 대기 실측). CI 대기 중 유휴 금지 —
   CI가 전제인 단계(device-sync 등)만 뒤로 미루고 나머지 작업은 병렬로 계속한다.

## 버전·릴리스 — 규약7 이후 (CalVer)

이 절은 규약7의 PR 생성 이후 단계(머지 → 버전 확정 확인 → tag → release)를 정한다.
버전·릴리스 규칙의 정본(SSoT)은 이 절 한 곳이다 — 다른 문서(CHANGELOG·goal-ready 등)는
이 절로의 참조·요약만 담는다.

**버전 형식 (CalVer)**

- 형식은 `YYYY.MM.MICRO` — `YYYY.MM`은 **릴리스(PR 머지) 시점**의 연·월(월은 2자리,
  예: `2026.07`), `MICRO`는 그 달의 릴리스 순번.
- 그 달의 **첫 릴리스는 MICRO = 0**, 이후 릴리스마다 +1.
- git tag는 **`v` 접두 없이** 버전 그대로 쓴다(예: `2026.07.0`).
- 버전에 **SemVer 의미(호환성 시그널)는 없다** — 버전은 "언제 릴리스했나"만 말한다.
  변경의 성격·긴급도는 release notes(CHANGELOG 항목)가 말한다.

**MICRO 산정 — 정본은 git tag 목록**

- **먼저 `git fetch --tags`**로 원격 태그를 동기화한 뒤, `git tag -l 'YYYY.MM.*'
  --sort=-v:refname`(머지 시점의 연·월)의 최상단 **수치 + 1** — 수치 비교다, 사전순이
  아니다(`2026.07.10` > `2026.07.9`). 매칭 태그가 없으면 `0`.
- CHANGELOG 헤더와 어긋나면 **태그가 이긴다** — 태그가 릴리스 행위의 결정적·기계적
  증거다. 어긋남을 발견하면 CHANGELOG를 태그에 맞춰 정정한다.
- 같은 날 두 번째 릴리스든 긴급 hotfix든 **구분 없이 동일 취급, MICRO +1**. 채널·접미
  표기(`-hotfix` 류)는 도입하지 않는다.

**관심사 분리 — 내용은 작업 중, 버전은 머지 직전**

- **변경 내용 서술**(CHANGELOG 항목·PR 설명)은 **작업 중 PR에** 누적한다 — 이때 버전
  숫자는 적지 않는다.
- **버전 숫자 확정**(package.json bump + CHANGELOG 버전 헤더 기입)은 **PR 머지 직전**에
  한다(PR의 chore(release) 커밋). **git tag는 머지 후 절차 4단계에서 verified main에**
  만든다. 작업이 달을 넘겨도 버전은 실제 릴리스(머지) 시점의 연·월이다.
- **버전 확정 커밋**은 main으로 머지될 **PR의 마지막 chore(release) 커밋**으로 넣는다
  (package.json bump는 잠금 파일 동반). 여러 PR 묶음 릴리스면 마지막으로 머지되는 PR에
  넣고, 묶음의 모든 PR이 **이미 머지된 뒤**라면 chore(release) 단독의 **경량 릴리스
  PR**을 만들어 머지한다.
- **월 경계 재확정**: 버전 확정(stamp) 후 머지가 지연돼 월이 바뀌면 머지 전에
  **재확정(re-stamp)** 한다 — "버전 = 머지 시점의 연·월"이 stamp 시점보다 우선한다.

**릴리스 절차 — 5단계** (각 단계의 확인 항목을 통과해야 다음 단계로)

1. **머지 준비** — 머지 방법은 규약7을 따른다(여기서 재서술하지 않는다). 확인:
   릴리스할 변경이 열린 PR에 있고, 그 PR의 마지막 커밋이 버전 확정 커밋인가?
2. **PR 머지** — 확인: `gh pr view <번호>`의 state가 `MERGED`인가? (아래 안전장치 (b)의
   판정 기준을 함께 적용한다.)
3. **버전 확정 커밋 포함 확인** — 머지된 main에 버전 확정 커밋이 들어갔는지 본다.
   확인: main의 `package.json` version과 CHANGELOG 최신 버전 헤더가 릴리스할 버전과
   같은가?
4. **태그** — stale 로컬 HEAD 오태그 방지: **`git fetch origin main --tags` 후
   `git tag <CalVer> origin/main`**(예: `git tag 2026.07.1 origin/main` — 3단계에서
   검증한 정확한 main 커밋 SHA를 대상으로 써도 된다)으로 만들고 태그를 push한다.
   확인: 원격에 태그가 올라갔는가(`git ls-remote --tags origin`)?
5. **릴리스 생성** — `gh release create <CalVer> --verify-tag`(원격에 해당 태그가 이미
   존재해야 생성된다 — 태그가 없으면 gh가 자동 생성해버리는 것을 방지), CHANGELOG의
   해당 버전 항목을 release notes로 넣는다. 확인: `gh release view <CalVer>`가 조회되는가?

**안전장치 2건**

- **(a) gh 계정 확인**: PR 머지 등 gh CLI **쓰기 작업 전에** `gh auth status`로 현재
  활성 계정을 확인한다 — 활성 계정 표시일 뿐 repo 권한 검증은 아니다. 실제 쓰기 작업
  (예: 머지)이 권한 오류를 내면 소유자 계정으로 전환한다(`gh auth switch`).
- **(b) 머지 완료 판정**: "머지 완료"는 `gh pr view`의 state가 `MERGED`**이고(AND)**
  main의 HEAD가 실제로 이동했을 때만 성립한다 — PR state + main HEAD 변화 둘 다 확인.
  main이 불변이면 미머지다 — **tag·release를 진행하지 않는다**(빈 태그 방지).

## 구현 규율

- TDD: 유저 시나리오 → 실패 테스트 → 최소 구현 → 리팩터. AC를 테스트로 1:1 매핑한다.
- 외과적 변경: 요청과 무관한 리팩터·포매팅 변경을 하지 않는다.
- **tasks 병렬 메타데이터**: localmind 자체 `tasks.md`를 저작할 때(손작성·goal-ready 산출물
  모두) `templates/skills/goal-impl/references/tasks-format.md`의 phase 헤더 직하 `depends-on:`·
  `files:` 선언 문법을 따른다 — goal-impl의 fan-out 판정이 이 선언만 읽는다.
- **Live-Verify Facts (기억 불신 원칙)**: 기억·주입 컨텍스트·이전 대화는 **100% 신뢰하지
  않는다** — 출발점일 뿐 근거가 아니다. **낡을 수 있는 사실**(외부 API·SDK·라이브러리 거동,
  가격·요금·모델명·버전·한도, 표준/명세 등 시간에 따라 변하는 것)은 코드·스펙·검수에 넣기
  전에 **라이브 최신 공식문서(T1)로 확인**한다(실시간 공식문서 조회 능력 사용 — runtime이 제공하는 웹/문서 조회 capability).
  라이브로 확인 못 하면 단정하지 말고 **Open question + 검증 태스크로 남긴다**. 이 검증은
  self-review 점검 범위 (5)의 강제 게이트다. (불변 사실 — 수학·언어 문법 등 — 은 제외:
  과잉 방지.)
  - **왜(핵심 원칙)**: 목표는 "한 번에 완벽"이 아니다. **불완전함은 허용된다**(Open
    question·검증 태스크로 정직하게 표시하면 된다). 그러나 **거짓·낡은 정보로 진행하는 것은
    불완전함보다 해롭다** — 틀린 확신은 그 위에 쌓는 모든 것을 오염시켜 더 나쁜 결과를 부른다.
    그래서 미검증은 미검증으로 표시하고, 검증된 것만 확정으로 쓴다. 근거: 2026-07-06 specs/035
    작업 중 기억 기반 Gemini 사실(streamGenerateContent·usageMetadata·Pro 무료)이 라이브
    검증에서 실제로 틀렸던 경험.
- git commit/push는 사용자가 명시적으로 요청했을 때만 수행한다(예외: `goal-impl` 흐름의
  self-review clean 완료 — 위 규약 7).
- **결정 로그**: 사용자에게 트레이드오프 결정을 받으면(선택지 질문 등) 결정 직후 경량
  결정 노트(질문·선택지·선택·근거 + 관련 스펙 포인터)를 second-brain에 적재한다
  (capture_note — **`tags: ["decision"]` 지정**: 회고 리포트(make retro)가 이 태그로
  결정적으로 수집한다, specs/032). 상세는 스펙 문서가 정본 — 노트는 "왜 그렇게
  정했더라?"를 검색으로 소환하기 위한 요약이다(2026-07-05 회고 결정).
- **Open questions 해결 표기**: 스펙의 OQ를 해소하면 항목에 **취소선(`~~…~~`)**을 남기거나
  확정 절로 이관한다 — 취소선이 회고 OQ 대시보드의 유일한 결정적 해결 신호다(specs/032.
  제자리 재서술만 하면 대시보드에 미해결로 계속 잡힌다).

## 디자인·UI/UX 작업

디자인·UI/UX 작업은 "문서 없이 구현 금지"의 디자인판을 따른다(specs/026):

1. **사전 정의 먼저**: 디자이너(designer) 페르소나가 `specs/{timestamp}-{slug}/design.md`를
   완성한다 — 디자인 시스템 패턴, 디자인 토큰(값 표), 컴포넌트 정의(변형·상태·화면 상태
   전이), **실행 에이전트용 프롬프트 전문**까지. 시작점은
   `cp templates/sdd/design.template.md specs/{timestamp}-{slug}/design.md`.
2. **사용자 확인 후 실행**: design.md가 확인되기 전에는 워커가 UI 구현에 착수하지
   않는다. design.md가 없으면 진행 전에 사용자에게 알린다(규약 6과 동일). — 이 확인
   규칙은 **SDD 무대(specs/) 기준**이다. **바이브 코딩 무대**에서는 design.md가 없으면
   디자이너 정의를 먼저 거친 뒤 즉시 구현할 수 있다 — 단 design.md를 새로 만들었다는
   사실과 위치를 **보고 맨 앞에 명시**한다(사후 검토 가능성 확보 — specs/030). 바이브
   design.md의 표준 위치는 노트 폴더의 `projects/<project>/design.md`(계약 저장소 동거,
   SDD 무대는 기존 `specs/{timestamp}-{slug}/design.md` 그대로).
3. **검증 분리**: 구현 후 UX 리뷰어(ux-reviewer)가 design.md 대비 일관성·상태 가시성·
   접근성 기본을 점검한다(도메인 리뷰). 최종 품질 판정은 크리틱(다운시프트 금지).
4. 기본 원칙: 직관성 · 상태 가시성(로딩/성공/실패의 명시적 표면화) · 디버깅/트래킹
   용이성 — 미적 완성도와 충돌하면 가시성·추적성이 우선한다.

## 바이브 코딩 — 도메인 스페셜리스트

기술 도메인 작업(백엔드·프론트엔드·iOS/안드로이드 앱·인프라·데이터·DB·인증·보안)은 해당
도메인 페르소나가 수행한다(specs/028 — 명시 위임으로 시작, 자동 라우팅은 후속):

1. **도메인 가이드(완화 게이트)**: 각 도메인 페르소나는 작업 전 노트 폴더의
   `guides/{domain}.md`를 확인한다 — 있으면 그 스택·컨벤션·금지사항을 따르고, **없으면
   일반 모범 사례로 진행하되 그 사실을 보고에 명시**한다(design.md식 강제 금지가 아님 —
   마찰 최소화). 가이드 시작:
   `cp templates/guides/guide.template.md <노트 폴더>/guides/{domain}.md`.
   가이드를 git 노트 저장소에 두면 백업에 포함된다.
2. **UI 작업은 design.md 게이트가 우선**: 웹/앱 UI 구현에서는 026 디자인 게이트(사전
   정의 — 확인 규칙은 무대별: 위 "디자인·UI/UX 작업" 절 참조)가 완화 게이트보다 우선한다.
3. **보안 리뷰 분리**: 인증·인가 구현(auth-dev)과 그 보안 리뷰(security-reviewer)는 분리
   lane — 최종 게이트는 크리틱(다운시프트 금지).

## 프로젝트 계약 저장소 (바이브 코딩 — DDD 차용)

바이브 코딩 프로젝트의 크로스 도메인 계약은 노트 폴더의 `projects/<project>/`에
축적한다(specs/029). 도메인 가이드(`guides/{domain}.md`)가 "도메인 축"(프로젝트 무관 스택
관례)이라면 이것은 "프로젝트 축"(이 프로젝트에선 무엇이 계약인가) — 직교하는 두 축이다.

1. **문서 4종과 소유**: `context-map.md`·`ubiquitous-language.md`(아키텍트 — 용어 제안은
   누구나, 판정은 아키텍트), `api-contract.md`(backend-dev — API 변경 시 동시 갱신),
   `environments.md`(infra). 디자인 토큰은 복제하지 않는다 — design.md가 정본, context-map은
   위치 포인터만. 시작:
   `cp templates/contracts/api-contract.template.md <노트 폴더>/projects/<project>/api-contract.md`
2. **프로젝트 식별**: cwd 이름과 `projects/` 폴더명을 양방향 정규화(kebab-case·소문자)로
   매칭한다 → 사용자가 명시하면 그것이 우선 → 모호하면 **추측하지 않고 사용자에게 묻는다**.
   폴더 신규 생성은 사용자의 `cp`가 기본(에이전트는 안내만, 명시 요청 시 생성 가능).
3. **게이트 조합**: 문서가 **없으면** 일반 관례로 진행하되 "계약 문서 없음 — 일반 관례로
   진행"을 명시한다(완화 — 028 계승). 문서가 **있으면** 계약이 정본 — 코드와 다르면 계약이
   이긴다(드리프트 결함, owner는 코드 변경과 계약 갱신을 동시에). 계약·가이드가 기존 코드와
   충돌하면 임의로 봉합하지 않고 **표면화한 뒤 사용자 결정을 요청**한다. 이 충돌 규칙은 028
   완화 게이트를 보완하며(규칙 정본은 이 절), 본문을 편집하지 않은 도메인 페르소나도 이
   보편 규칙을 따른다.
4. **시크릿 금지**: environments.md에는 환경변수 **이름·용도만** — 값은 절대 금지(노트
   폴더는 백업 저장소에 그대로 커밋된다).
5. **localmind 자체 예외**: 이 저장소의 개발은 specs/(goal/spec/plan + design.md)가 이미
   계약 역할을 하므로 계약 저장소를 강제하지 않는다 — 외부 바이브 코딩 프로젝트용이다.

## 실행 등급 배치 (provider/model 중립)

단계 라벨이 아니라 **실패 시 파장 × 난이도**로 추상 실행 등급을 고른다. 구체 provider·model
이름이 아니라 **역할과 등급**으로 요청한다. runtime이 등급을 만족하는 model을 고를 수 있으면
그 등급에 가장 적합한 available capability에 매핑하고, 선택 능력이 없거나 등급을 만족하는 별도
model이 없으면 **현재 session이 같은 역할 체크리스트를 수행한 뒤 fallback을 보고**한다. 특정
model의 부재만으로 workflow를 중단하지 않는다.

| 실행 등급 | 사용 범위 | 금지 |
|---|---|---|
| `critical-reasoning` | 아키텍처·goal/spec/plan 정의, 복잡·신규 로직 구현, 적대적 최종/보안 review | 더 낮은 등급으로 조용히 대체 |
| `standard` | 잘 명세된 루틴 구현, 결정론적 테스트 작성·실행 | 최종 critic을 성공 판정하는 유일 reviewer |
| `economy` | 로그 조회·파일 목록·보일러플레이트 같은 저위험 기계 작업 | 아키텍처·코딩 판단·최종 review |

원칙 3가지:

1. 파장이 큰 추론(아키텍처·최종 리뷰)은 `critical-reasoning`, 잘 명세된 기계적 실행은
   다운시프트한다.
2. **최종 검증은 절대 내리지 않는다** — 약한 검증자는 거짓 안심을 준다. 사용자의 "검증"을
   (a) 기계적 테스트 실행(`standard`)과 (b) 적대적 결함 찾기(`critical-reasoning`)로 쪼갠다.
3. `economy`는 코딩·검증·스펙 어디에도 두지 않는다 — 저위험 대량 작업 전용.

독립성: 구현과 리뷰가 같은 등급·같은 컨텍스트가 되면 맹점을 공유하므로, **분리된 컨텍스트 +
적대적 프롬프트**("결함을 찾으러 간다")로 독립성을 확보한다(→ SDD self-review 규약과 동일).
runtime이 별도 등급/model 선택 능력을 제공하지 않아도 workflow는 중단되지 않는다 — 현재 session이
같은 역할을 수행하고 fallback을 밝힌다.

SDD/TDD, 최종 review 강도, evidence 체크, commit/push/CI 같은 행동 gate는 약화하지 않는다. 구체
provider·model 매핑·가격·alias는 이 규약의 필수 계약이 **아니다** — 필요하면 별도 local binding
문서(optional adapter)로 둔다.

이 optional adapter는 온보딩 스킬 `localmind-binding`(설치별 `~/.localmind/_bindings/<runtime-id>.json`)
으로 구체화됐다(specs/050) — 사용법은 [docs/workflows.md](docs/workflows.md) 참조.

## 오픈소스 대상 — 비개발자 포함, 특정 개인 아님

localmind는 누구나 설치해 쓰는 오픈소스 개인 second-brain 도구다. **비개발자도 사용자다.**

- `goal.md`의 Stakeholders 등에 특정 인물(예: 저장소 소유자)을 사용자로 특정하지 않는다 —
  "단일 사용자(설치한 개인 누구나 — 비개발자 포함)"로 쓴다.
- 예시·AC에 실제 개인 절대경로를 넣지 않는다 — 플레이스홀더(`/home/<user>/...`)를 쓴다.
- 에러 메시지·MCP 도구 응답은 비개발자가 이해할 수 있는 평이한 한국어로 작성한다.
