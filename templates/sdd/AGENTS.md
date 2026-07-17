# AGENTS.md — SDD 작업 규약

이 저장소에서 작업하는 모든 AI 에이전트가 따르는 규약이다.

## SDD 흐름 — 기본값

모든 기능·변경은 `specs/{NNN}-{feature-slug}/` 폴더에 3개 문서로 시작한다:

- `goal.md` — 왜(why): Background·Problem·Objective·Success metrics·Non-goals·Constraints·Stakeholders·Risks
- `spec.md` — 무엇을(what): FR(각 FR은 goal 항목을 지지), Acceptance Criteria(Given-When-Then, 테스트와 1:1 매핑), Open questions
- `plan.md` — 어떻게(how): 도메인 경계, 영향 모듈, 단계, 테스트 전략

번호는 3자리(`001`, `002`, ...), 슬러그는 kebab-case. 다음 사용 가능 번호는 기존 `specs/`
폴더의 최댓값 + 1이다(폴더가 없으면 `001`부터 시작).

## `goal-impl {NNN}` 처리 방법 (SDD 구현 워크플로)

이 규약이 SDD 구현 완료 규칙의 정본이다. 논리 command ID는 `goal-impl`이고 호출은 runtime별로
Claude Code `/goal-impl {NNN}`, Codex `$goal-impl {NNN}`, Gemini CLI 생성 wrapper `/goal-impl {NNN}`다.
Claude Code built-in `/goal`(session completion condition)과는 이름·의미가 다르며 shadow하지 않는다.

runtime이 명시 호출을 보증하고 원인자가 정확히 3자리 숫자일 때(또는 provenance 없는 runtime의 새
확인이 있을 때) 다음을 수행한다:

1. `specs/{NNN}-*/` 폴더를 찾는다(번호 프리픽스로 매칭, 슬러그는 몰라도 됨).
2. 해당 폴더의 `goal.md` · `spec.md` · `plan.md`를 모두 읽는다.
3. `plan.md`의 단계를 기준으로 구현한다 — FR/AC는 `spec.md`, 배경/의도는 `goal.md`를 따른다.
4. 구현 후 AC를 테스트로 검증한다(TDD — 실패 테스트를 먼저 쓰고 통과시킨다).
5. **self-review를 반드시 수행한다 — 생략 불가.** 구현·테스트가 끝났다고 스스로 판단해 곧장
   "완료"로 보고하지 않는다.
   - 가능하면 구현 컨텍스트와 분리된 서브에이전트로 독립 리뷰한다. 분리된 에이전트를 띄울
     수 없는 환경이면, 결함을 찾으러 간다는 자세로(자기확증 편향 배제) 직접 재검토한다.
   - 점검 범위 5가지: (1) `spec.md`의 모든 FR·AC가 구현+테스트로 1:1 충족됐는지 추적,
     (2) 유저 시나리오·엣지 케이스가 실제 테스트로 커버됐는지, (3) 로직·경계·에러처리 버그,
     (4) 불필요한 복잡도·보안 취약점, (5) **사실 정확성 — 낡을 수 있는 사실(외부 API·SDK·
     라이브러리 거동·가격·모델명·버전·한도·표준)이 라이브 최신 공식문서로 검증됐는지. 기억으로
     단정한 미검증 사실은 결함으로 본다**(아래 구현 규율 Live-Verify Facts).
   - 명백한 결함이나 미충족 AC를 찾으면 즉시 수정하고 다시 review한다(clean해질 때까지 반복).
     판단이 애매하거나 트레이드오프가 있는 사안만 사용자에게 보고한다.
   - **검증 표기를 세 문서에 남긴다**: self-review가 clean으로 닫히면 결과를 보고문에만 쓰지
     말고 문서 자체에 체크로 표기한다 — `spec.md`의 FR·AC 각 항목에 `[x]` + 검증 근거(테스트
     시나리오/실증 방법), `plan.md`의 단계·테스트 전략 항목 체크, `goal.md`의 Success metrics
     달성 표기. 미충족 항목은 체크하지 않고 사유를 부기한다(은폐 금지). 문서만 읽어도 "무엇이
     실제로 됐는지"가 보여야 한다.
   - self-review에서 결함 0 + 테스트 green + AC 전부 충족(미충족분은 사용자에게 명시 보고)이
     확인된 뒤에야 "완료"로 보고한다.
6. 세 문서 중 하나라도 없으면 진행 전에 사용자에게 알린다 — 문서 없이 구현하지 않는다.

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
