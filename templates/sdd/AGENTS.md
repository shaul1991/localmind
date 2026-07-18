# AGENTS.md — SDD 작업 규약

이 저장소에서 작업하는 모든 AI 에이전트가 따르는 규약이다.

## SDD 흐름 — 기본값

모든 기능·변경은 `specs/{timestamp}-{feature-slug}/` 폴더에 3개 문서로 시작한다:

- `goal.md` — 왜(why): Background·Problem·Objective·Success metrics·Non-goals·Constraints·Stakeholders·Risks
- `spec.md` — 무엇을(what): FR(각 FR은 goal 항목을 지지), Acceptance Criteria(Given-When-Then, 테스트와 1:1 매핑), Open questions
- `plan.md` — 어떻게(how): 도메인 경계, 영향 모듈, 단계, 테스트 전략

폴더 프리픽스는 **생성 시점 timestamp**(`YYYYMMDDHHmm`, 예: `202607172120`), 슬러그는 kebab-case.
동시작업(병렬 세션·멀티 에이전트)에서 번호가 겹치지 않게 하려는 것이다.

**기존 spec을 덮어쓰지 않는다** — `mkdir -p`가 아니라 **`mkdir`(`-p` 금지)** 로 생성해 같은 경로가
이미 있으면 EEXIST로 실패하게 한다(확인-후-생성의 경쟁 창 없이 덮어쓰기 불가). EEXIST면 **현재
시각을 다시 읽어** 초까지 확장(`YYYYMMDDHHmmss`)해 재시도한다 — 시각이 진행하므로 곧 빈 경로에
도달한다(같은 경로 재확인은 무한 반복 — 반드시 시각을 다시 읽는다).

`mkdir`은 **경로**(프리픽스+슬러그) 충돌만 막는다. 같은 분에 만든, 슬러그가 다른 두 spec은 경로가
달라 둘 다 성공하므로 **프리픽스는 유일하지 않을 수 있다**. 프리픽스로 폴더를 고르는 쪽(아래 규약
1단계)이 모호성을 처리한다.

기존 `NNN-`(3자리 일련번호) 폴더는 레거시로 유지하며 프리픽스 매칭 대상이다.

## `goal-impl {prefix}` 처리 방법 (SDD 구현 워크플로)

이 규약이 SDD 구현 완료 규칙의 정본이다. 논리 command ID는 `goal-impl`이고 호출은 runtime별로
Claude Code `/goal-impl {prefix}`, Codex `$goal-impl {prefix}`, Gemini CLI 생성 wrapper `/goal-impl {prefix}`다.
Claude Code built-in `/goal`(session completion condition)과는 이름·의미가 다르며 shadow하지 않는다.

runtime이 명시 호출을 보증하고 원인자가 spec 폴더 프리픽스(timestamp 또는 레거시 3자리 숫자)일
때(또는 provenance 없는 runtime의 새 확인이 있을 때) 다음을 수행한다:

1. `specs/{prefix}-*/` 폴더를 찾는다(프리픽스로 매칭, 슬러그는 몰라도 됨). **프리픽스가 2개 이상
   폴더에 매칭되면**(같은 분·다른 슬러그, 레거시 번호 중복 등) 추측하지 말고 **어느 spec인지
   사용자에게 묻는다** — 잘못된 폴더로 구현하는 것보다 되묻는 편이 낫다.
2. 해당 폴더의 `goal.md` · `spec.md` · `plan.md`를 모두 읽는다.
3. **시작 base freshness gate**: 어떤 파일도 변경하거나 쓰기 전에 repository가 설정한 upstream의
   **원격 기본 브랜치**를 조회하고 latest **full SHA**를 기록한다. 그 base에서 분리한 feature branch에서만
   작업한다. 기존 dirty·unmanaged 파일은 그대로 보존하고 작업 범위와 겹치면 수정하지 말고 중단·보고한다.
   remote 조회·정합이 실패하면 `freshness unverified`로 기준 SHA·원인·영향을 밝히고 사용자의 방향을
   받기 전에는 fresh 또는 complete라고 단정하지 않는다.
   그 뒤 `plan.md`의 단계를 기준으로 구현한다 — FR/AC는 `spec.md`, 배경/의도는 `goal.md`를 따른다.
   verification matrix의 모든 AC가 검증 방법·evidence·종료 조건을 가진 정확히 한 행인지 readiness를
   확인한다. 필수 검증 capability가 없거나 skipped/degraded이면 green이 아니라 blocker다. 첫
   dogfood 직전에 matrix를 freeze하며, 이후 개정은 변경 이유·영향 AC·무효화할 evidence를 기록한다.
4. 구현 후 AC를 테스트로 검증한다(TDD — 실패 테스트를 먼저 쓰고 통과시킨다). 테스트 green만으로
   완료하지 않고 실제 실행을 관찰하는 dogfood를 반드시 수행한다.
5. **최종 self-review 직전에 원격 기본 브랜치를 다시 fetch해 full SHA를 비교한다.** base 또는 기준
   SHA가 이동했으면 repository 정책대로 정합·통합하고 영향받은 regression 테스트를 재실행해 green이
   된 뒤에만 review를 시작한다. **base 통합으로 candidate가 변경되면 frozen matrix의 영향 행을 재평가하고,
   무효화된 evidence(테스트·dogfood·배포)를 현재 candidate에서 재실행한다.** stop condition 자체가
   틀렸다면 matrix amendment 규칙에 따라 이유·영향 AC·무효 evidence를 먼저 기록한다.
   조회·정합 실패는 `freshness unverified`로 원인·영향과 함께 보고하고
   사용자의 방향 없이 진행하지 않는다.
   **self-review를 반드시 수행한다 — 생략 불가.** 구현·테스트가 끝났다고 스스로 판단해 곧장
   "완료"로 보고하지 않는다.
   - 가능하면 구현 컨텍스트와 분리된 서브에이전트로 독립 리뷰한다. 분리된 에이전트를 띄울
     수 없는 환경이면, 결함을 찾으러 간다는 자세로(자기확증 편향 배제) 직접 재검토한다.
   - 점검 범위 5가지: (1) `spec.md`의 모든 FR·AC가 구현+테스트로 1:1 충족됐는지 추적,
     (2) 유저 시나리오·엣지 케이스가 실제 테스트로 커버됐는지, (3) 로직·경계·에러처리 버그,
     (4) 불필요한 복잡도·보안 취약점, (5) **사실 정확성 — 낡을 수 있는 사실(외부 API·SDK·
     라이브러리 거동·가격·모델명·버전·한도·표준)이 라이브 최신 공식문서로 검증됐는지. 기억으로
     단정한 미검증 사실은 결함으로 본다**(아래 구현 규율 Live-Verify Facts).
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
   - **검증 표기를 세 문서에 남긴다**: self-review가 clean으로 닫히면 결과를 보고문에만 쓰지
     말고 문서 자체에 체크로 표기한다 — `spec.md`의 FR·AC 각 항목에 `[x]` + 검증 근거(테스트
     시나리오/실증 방법), `plan.md`의 단계·테스트 전략 항목 체크, `goal.md`의 Success metrics
     달성 표기. 미충족 항목은 체크하지 않고 사유를 부기한다(은폐 금지). 문서만 읽어도 "무엇이
     실제로 됐는지"가 보여야 한다.
   - self-review에서 결함 0 + 테스트 green + AC 전부 충족(미충족분은 사용자에게 명시 보고)이
     확인된 뒤에야 "완료"로 보고한다.
6. 세 문서 중 하나라도 없으면 진행 전에 사용자에게 알린다 — 문서 없이 구현하지 않는다.
7. **versioned completion state와 external completion state를 분리한다.** clean 뒤에는 repository가
   정한 feature branch commit·push·PR 생성 gate를 따른다. push 이후 PR/CI 상태는 **원격 PR/CI
   시스템이 SSoT**인 external completion state다. PR 번호·CI 상태·run ID만 기록하기 위한 후속
   commit은 만들지 않는다. **CI 실제 결함은 새 candidate**로 수정할 수 있지만 관련 테스트와 남은
   round 또는 fresh approval review를 다시 통과해야 한다. remote·provider별 세부 절차는 repository
   정책이 정본이며, blocker 0 + 테스트 green + AC 전부 충족과 feature PR gate는 약화하지 않는다.

## 구현 규율

- TDD: 유저 시나리오 → 실패 테스트 → 최소 구현 → 리팩터. AC를 테스트로 1:1 매핑한다.
- 외과적 변경: 요청과 무관한 리팩터·포매팅 변경을 하지 않는다.
- **Live-Verify Facts (기억 불신 원칙)**: 기억·주입 컨텍스트·이전 대화는 **100% 신뢰하지
  않는다** — 출발점일 뿐 근거가 아니다. **낡을 수 있는 사실**(외부 API·SDK·라이브러리 거동,
  가격·요금·모델명·버전·한도, 표준/명세 등 시간에 따라 변하는 것)은 코드·스펙·검수에 넣기
  전에 **라이브 최신 공식문서로 확인**한다(runtime이 제공하는 실시간 웹/문서 조회 능력 사용). 확인 못 하면
  단정하지 말고 **Open question + 검증 태스크로 남긴다**. 이 검증은 self-review 점검 범위 (5)의
  강제 게이트다. (핵심: 불완전함은 허용되나 — Open question으로 정직하게 표시 — **거짓·낡은
  정보로 진행하는 것은 불완전함보다 해롭다**. 불변 사실(수학·문법)은 제외.)
- git commit/push는 사용자가 명시적으로 요청했을 때만 수행한다(예외: `goal-impl` 흐름의
  self-review clean 완료 — feature 브랜치 커밋·push + PR 생성까지가 완료다. main 직접 push
  금지, 머지는 사람).
