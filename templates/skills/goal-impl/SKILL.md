---
name: goal-impl
description: SDD 구현 오케스트레이션 — 확정된 specs/{timestamp}-{slug}/의 goal·spec·plan(+tasks)을 받아 tasks 분해 → TDD 구현 → 도그푸드 → self-review → PR 생성까지 DoD 충족까지 수행한다. goal-ready의 짝(문서→구현). "구현 착수", "052 구현해줘", spec이 확정돼 코드를 쓸 때 사용.
---
<!-- managed-by: localmind (skill: goal-impl) — localmind 정본(데이터 폴더 skills/)에서 배포됨. 수정은 정본에서. -->

# Goal-Impl — 문서 → 구현 오케스트레이션

`/goal-ready {요구}`가 "요구 → 문서"라면, `/goal-impl {prefix}`은 "문서 → 구현"이다.
완료 정의는 DoD(§8)를 모두 채우는 것이며, commit/push/PR/CI 규칙은 저장소 AGENTS.md가 정본이다.

## §1. 활성화 판정 — side effect 전 권한 확인

이 워크플로는 코드 변경·commit·push·CI까지 갈 수 있으므로 **실행 권한(execution grant)** 없이는
어떤 side effect도 내지 않는다. 첫 동작으로 다음을 판정한다.

- **런타임이 명시 호출을 보증(provenance)하고** 사용자가 넘긴 원인자(raw arguments)가 **전체가 정확히
  spec 폴더 프리픽스(timestamp `^(?:[0-9]{12}|[0-9]{14})$` 또는 레거시 3자리 `^[0-9]{3}$`)이면 실행
  권한이다. timestamp는 `YYYYMMDDHHmm`(12자리) 또는 초까지 확장한 `YYYYMMDDHHmmss`(14자리) 둘뿐이다.
- 런타임이 그 보증을 제공하지 못하면(provenance 부재), **side effect가 있는 어떤 동작도 하지 않고**
  해당 프리픽스와 함께 일회용 확인 문구(challenge)만 보낸 뒤 멈춘다. **바로 다음 사용자 턴이** 그
  확인 문구와 번호를 정확히 일치시켜 응답한 경우에만 실행 권한으로 전환한다.
- 인용문·부정문·설명/리뷰 전용 요청, 추가·복수 인자, 지난 턴의 낡은/재사용된 확인 문구는 권한이
  아니다. 프롬프트에 명령 문자열이나 생성된 요청 텍스트가 있다는 사실 자체도 권한이 아니다.

이 확인 절차는 워크플로 행동 지침이다. 런타임에 실행 전 hook이 없으면 이를 기술적으로 강제된
"도구 호출 0회 보장"이라고 과장하지 않고, 지침 수준(instruction-level)의 가드임을 보고에 밝힌다.
런타임이 provenance도, 이 새 확인 턴도 제공할 수 없으면 이 워크플로는 중단한다.

## §2. AGENTS.md를 정본으로 읽기

실행 권한을 얻으면 저장소 `AGENTS.md`를 최우선 정본으로 읽는다. `AGENTS.md`가 없거나 요구한 번호의
goal/spec/plan 세 문서 중 하나라도 없으면 구현 전에 멈추고 평이한 한국어로 사유를 보고한다.

## §2A. 티어 인지 실행 — 변경 등급(AGENTS.md 정본)

이 워크플로는 **Tier 2(실질적 변경) 구현 흐름의 정본**이며, 진입은 §2대로 **goal/spec/plan 세
문서를 전제**한다. 진입 시 AGENTS.md "변경 등급 티어" 절을 정본으로 변경 등급(티어)을 인지한다 —
등급에 따라 이 워크플로가 담당하는지 여부와 검수 강도가 갈린다.

- **Tier 1(작음)** — **이 워크플로(goal-impl)의 진입 대상이 아니다.** Tier 1은 `change.md` 한 장만
  갖고 3문서가 없어 §2 하드스톱에 걸리므로, goal-ready가 안내한 대로 **in-session에서 구현·검증**한다:
  **in-session 적대 자기검증 1라운드**(격리 위임 없이 현재 세션이 결함을 찾으러 가는 자세로 diff
  스코프를 재검토)로 검수하며, §7A의 자동 2라운드 상한·격리 리뷰어 요구는 적용하지 않는다. 구현 중
  상위 티어 하드 신호가 드러나면 아래 "중간 티어 승격"대로 Tier 2로 올려 goal/spec/plan 3문서(+tasks는
  없으면 §3대로 생성)·goal-impl 흐름으로 전환한다 — tasks.md의 phase 의존·검증 선언은 우회되지 않는다.
- **Tier 2(실질적)** — 이 문서의 현행 흐름(§1~§10) 그대로 따른다: **격리 self-review 자동
  2라운드 상한**(§7A)을 적용한다.
- **Tier 0(트리비얼)** — 이 워크플로의 대상이 아니다(AGENTS.md 정본상 문서·critic 의식 없음).
- **중간 티어 승격** — 구현 중 상위 티어 하드 신호(신규 도메인 개념·계약(API/스키마/이벤트)
  변경·인증·보안 표면·마이그레이션·데이터 모델 변경·전역 상태·직렬화 형식 변경·크로스커팅
  변경 등, AGENTS.md 정본 기준)가 드러나면 **상위 티어로 승격**하고 승격 사실과 추가 의식(예:
  Tier 1→2 승격 시 격리 self-review·자동 2라운드 상한으로 전환)을 보고한다. **하향 재분류는
  하지 않는다.**

## §3. 입력 확정

- 인자: spec 폴더 프리픽스(timestamp, 레거시 3자리 허용) 또는 경로. `specs/{timestamp}-slug/`에서 goal·spec·plan(+tasks)을 읽는다.
- **tasks.md가 이미 있으면 그대로 쓴다 — 재작성·재분해 금지**(goal-ready 산출물이다). 없으면
  plan을 근거로 분해하되, 이때 `references/tasks-format.md`의 depends-on·files 선언 문법을 포함해 분해한다(fan-out 판정 입력).
- **plan에 확정 사실 표(F-n)가 있으면 그것이 유일한 사실 출처다 — 재조사 금지, 인용만.**
  예외: 표에 없는 사실 · 근거 행이 실제와 어긋남 · 표 작성 후 트리 변경. 이때 **틀린 항목만** 갱신한다.
- **readiness 미비 시**: goal/spec/plan이 테스트가능 AC 부재·FR→goal 추적 끊김·plan 경계 부재 등
  기준에 못 미치면 **구현하지 말고 goal-ready로 되돌린다**.
- **verification matrix readiness**: plan에는 spec의 모든 AC가 정확히 한 행씩 매핑된
  `AC / 검증 방법·레벨 / 최소 evidence / 통과·종료 조건 / 상태` 5열 matrix가 있어야 한다.
  dogfood 전에 누락·중복·빈 셀과 실행 가능성을 확인한다. 필수 검증 capability가 없으면
  **blocker**이며, `skipped/degraded`는 green으로 간주하지 않고 미충족으로 보고한다.

## §3A. Base freshness gate — 변경 전과 final review 직전

repository가 정한 base·remote·통합 정책을 따른다. 특정 provider나 branch 이름을 generic skill이
강제하지 않는다.

1. **변경·쓰기 전 시작 gate** — remote의 repository base를 조회해 확인 시각과 **full SHA**를
   기록하고, 그 latest base에서 분리된 feature branch인지 확인한 뒤에만 쓴다. 기존 dirty·unmanaged
   자산은 보존하며 변경 대상과 겹치면 중단·보고한다.
2. **최종 self-review 직전 gate** — 같은 base를 다시 조회해 full SHA를 비교한다. base/기준 SHA가
   이동했다면 repository 정책대로 정합·통합하고 영향받는 필수 테스트/regression을 재실행해 green인
   뒤에만 review round 1을 시작한다. **base 통합으로 candidate가 변경되면 frozen matrix의 영향 행을
   재평가하고, 무효화된 evidence(테스트·dogfood·배포)를 현재 candidate에서 재실행한다.** stop condition
   자체가 틀렸다면 §7B의 matrix amendment 기록을 먼저 남긴다.
3. remote 부재·조회 실패·정합 불가이면 `freshness unverified`로 기준 SHA·원인·영향을 보고하고
   사용자 방향 없이 fresh 또는 complete라고 단정하지 않는다.

## §4. 끊김 방어 (사용자 최대 우려 — 구조로 막는다)

스킬은 스스로를 다시 깨우지 못한다(턴 종료·컨텍스트 소진 시 끊김). 그래서 **끊겨도 싸게 재개**되게
만든다. 아래는 AGENTS.md §15 "도구 무관 원칙·권장 기본" 패턴과 동형이다 — **불변식(재량 불가)**을
먼저 두고, 이를 달성하는 현재 검증된 수단은 **권장 기본(default recipe)**으로 강등한다.

### 불변식(재량 불가)

- **재개 가능 상태가 항상 존재한다** — 끊긴 시점의 완료·미완료를 외부 진행 기록만으로 판별할 수
  있어야 한다. 진행자의 기억·세션 컨텍스트에 의존하지 않는다.
- **진행 중 되돌림 지점이 존재한다** — 각 단계 완료 시 되돌아갈 안정 지점을 남긴다. 최종
  commit/push/PR/CI 완료 판정은 §8·AGENTS.md가 정본이며, 이 불변식은 *진행 중* 회복력에 대한 것이다.
- **메인 컨텍스트 소진이 작업을 막지 않는다** — 무거운 실행을 메인이 혼자 떠안아 컨텍스트가 바닥나는
  구조를 피한다.

### 권장 기본(default recipe)

- **I-1 tasks.md 체크박스 = 진행 상태(SSoT).** task 완료 **즉시** `- [ ]` → `- [x]`로 체크한다. 몰아서 하지 않는다.
  끊긴 뒤 "체크박스 보고 이어서"가 성립해야 한다 — 이게 성립하면 끊김은 재앙이 아니라 잠깐 멈춤이다.
- **I-2 phase 단위 커밋(진행 중 되돌림 지점).** 각 phase 끝나면 커밋해 끊겨도 재개할 지점을 만든다.
  이건 *진행 규율*이지 완료 규칙이 아니다 — 최종 commit/push/PR/CI 완료는 §8·AGENTS.md가 정본이다.
  커밋 메시지에 phase·task 범위 명시.
- **I-3 컨텍스트 소진 방어 — 구현을 메인에서 다 하지 마라.** plan의 역할 배치대로 **phase별 서브에이전트 위임**
  (각자 새 컨텍스트), 메인은 조율·검증만. 메인 컨텍스트를 아껴야 긴 작업이 한 세션에 끝난다.
  - ⚠️ **쓰기 작업은 반드시 쓰기 가능한 실행 역할에 위임하라** — 읽기 전용 판단·검증 역할(설계·리뷰·
    조사 전용 역할)은 파일을 못 고친다(문서 편집조차 불가). 코드·문서를 **쓰는** task는 쓰기 가능한
    실행 역할에 준다. plan이 쓰기 task를 읽기 전용 판단·검증 역할에 배치했더라도 **그대로 따르지 말고**
    쓰기 가능한 실행 역할로 바꿔 위임한다(읽기 전용 역할은 *판단·설계·검증*에만 쓴다) — 실제로 이
    함정을 밟아 한 라운드를 버린 경험이 있다.
- **재개 시**: tasks.md 체크박스 + git log로 현재 위치를 파악하고 **미완료 task부터** 잇는다. 완료분 재작업 금지.

실행자는 불변식을 지키는 한 위 권장 기본을 다른 수단(다른 진행 기록 매체·다른 커밋 단위 등)으로
대체할 재량을 갖는다.

## §4A. Fan-out DAG — 동시 spawn (§4 I-3의 구체화)

I-3의 "phase별 서브에이전트 위임"을 여러 노드에 **동시에** 적용할 때의 규칙이다. 선언 문법·
disjoint 판정의 상세 정본은 `references/tasks-format.md`다 — 이 절은 그 판정을 실행에 어떻게
쓰는지만 규정한다. §4와 같은 불변식/권장 기본 2층 구조를 따른다.

### 불변식(재량 불가)

- **메인이 유일한 조율자다(메인 = hub, 서브에이전트 = leaf)** — worker끼리 직접 통신하지 않는다.
  배리어 통과·진행 부기(tasks.md 체크박스·선언 갱신)·통합 검증·phase 커밋은 언제나 메인이 수행한다.
- **파일 disjoint 없이 병렬 금지** — files 선언이 겹치는 노드는 의존이 없어도 동시 spawn 대상이
  아니다(직렬 기본).
- **의존 미충족 노드는 spawn하지 않는다** — depends-on의 선행 노드가 배리어를 통과하기 전에는
  실행 대상이 아니다.
- **서브에이전트는 leaf다 — 중첩 위임(C)은 기본 금지** — 서브에이전트가 하위 worker를 다시
  spawn하는 것은 사용자가 특정 사안에 명시적으로 허용한 경우에만 1단계까지 허용한다. 기본은
  hub-and-spoke.

### 권장 기본(default recipe)

- **fan-out 조건** — 메인은 tasks의 depends-on·files 선언이 이루는 의존 DAG를 읽어, **의존이
  모두 완료되고 서로 파일 disjoint하며 각각 유의미한 크기인 노드들만 한 메시지에 동시
  spawn**한다. 셋 중 하나라도 어긋나면 병렬화하지 않는다.
- **배리어** — 동시 spawn된 worker가 모두 끝나면 메인이 결과를 통합 검증(테스트·정합 확인)하고
  phase 커밋한 뒤에야 다음 레이어를 해금한다(조율 주체는 위 불변식 소절 참조). **진행 부기
  (tasks.md 체크박스·선언 갱신)도 메인이 배리어에서 수행한다** — worker의 files 선언 대상이
  아니다(병렬 worker가 tasks.md를 동시에 쓰는 충돌을 구조적으로 배제).
- **파일 겹침 → 직렬 기본** — files 선언이 겹치는 노드는 의존이 없어도 직렬로 실행한다.
  worktree 격리(worker별 저장소 복제 후 병합)는 사용자가 명시적으로 선택했을 때만 쓰는 옵션이다.
- **의존 미충족 → 보류** — depends-on의 선행 노드가 아직 배리어를 통과하지 못했으면 그 노드는
  spawn하지 않고, 선행 배리어 통과 후에야 실행 대상이 된다.
- **병렬을 강제하지 않는다** — 곁가지·병렬 여지가 없는 단순한 작업은 불필요한 spawn 없이 기존
  직렬 흐름 그대로 완주한다.

실행자는 불변식을 지키는 한 위 권장 기본을 다른 수단(다른 배리어 표기·다른 fan-out 크기 기준 등)
으로 대체할 재량을 갖는다.

### 실행 형태 — A/B 노드 크기 구분

메인=hub·서브에이전트=leaf·중첩 위임(C) 제약은 위 불변식 소절이 정본이다. 이 소절은 그 아래에서
노드를 A(fan-out)와 B(메인 직접 실행)로 가르는 고유 기준만 다룬다.

- **A/B는 노드 크기로 가른다** — 무거운 작업은 서브에이전트로 fan-out(A, 새 컨텍스트로
  오프로드), 값싼 독립 조회·검증은 메인이 도구를 직접 병렬 실행(B)한다. 유의미한 크기에 못
  미치는 잔task는 B로 처리하거나 단일 worker로 묶는다 — 개별 병렬 spawn 대상이 아니다.

## §5. 구현 규율

이 절의 항목은 대체 가능한 수단이 없는 **불변식(재량 불가)**이다 — "권장 기본"으로 강등하지 않는다.

- **TDD 강제** — 유저 시나리오 → **실패 테스트 먼저(red)** → 최소 구현(green) → 리팩터.
  spec의 AC를 테스트에 1:1 매핑한다. 엣지 케이스는 발견 즉시 실패 테스트로 재현 후 고쳐 **회귀로 누적**한다.
  ([dev-methodology-ddd-tdd])
- **RED 확인 생략 금지** — 테스트가 *실제로 실패하는지* 눈으로 본 뒤 구현한다. 처음부터 green인 테스트는 아무것도 안 잡는다.
  tasks에 RED 기대가 적혀 있으면 그대로 확인한다.
- **회귀 핀 유효성** — 기존 거동을 지키는 테스트는 "그냥 통과"하면 안 된다. 핀이 진짜인지 의심되면
  **대상 로직을 일시 무력화해 그 테스트가 실패하는지 확인**하고 원복한다.
- **DB 엔진 패리티** — 통합·마이그레이션 테스트는 **운영과 동일 엔진**의 일회용 실DB. SQLite 등 대체 금지(헌법 §8).
- **외과적 변경** — 변경된 모든 줄이 tasks/spec에 추적돼야 한다. 무관한 리팩터·정리 금지(발견하면 언급만). ([llm-coding-discipline])
- **로컬 인프라** — 테스트·도그푸드는 로컬 환경(로컬 API+DB+테스트키). **운영 DB·실키 금지.**

### 불변식 요약

이 워크플로 전체의 재량 불가 항목을 한곳에 모은 소절이다 — 아래 목록은 새 규칙을 만들지 않고
각 절에서 이미 정의된 불변식을 **참조로만 연결**한다.

- **구역 내(§4·§4A·§5 — 이번 재서술 대상)**: TDD red 관찰(§5)·회귀 핀 유효성(§5)·외과적 변경(§5)·
  로컬 인프라(§5) + 재개 가능 상태·되돌림 지점·메인 컨텍스트 보호(§4) + 메인 유일 조율·파일
  disjoint 없이 병렬 금지(§4A).
- **구역 밖(재서술 대상 아님 — 본문은 그대로)**: base freshness 2게이트(§3A)·
  round 예산(§7A)·preflight/DoD/PR 게이트(§8)·Live-Verify(§8 self-review 점검 축 ⑤).

**실행자는 불변식을 지키는 한 수단 재량을 갖는다** — 위 목록에 없는 구체 수단(도구·순서·표기
형식)은 실행자 재량이다.

## §6. 중단 규율 (추측 금지)

아래는 **구현하지 말고 멈춰 사람에게 올린다**:

- tasks/spec이 모호해 해석이 갈린다 → 해석 후보를 제시하고 묻는다(말없이 고르지 않는다).
- **spec과 코드가 어긋난다**(문서가 실재와 다름) → F 표 항목이면 그 항목만 갱신, 설계 전제가 흔들리면 사람에게.
- **spec을 바꿔야 한다** → 코드부터 고치지 않는다. **spec-first**: spec/plan을 먼저 갱신·검수받고 구현한다. ([no-work-without-doc])
- 같은 실패를 3회 이상 반복한다 → 접근을 바꿔야 한다는 신호. 멈추고 보고한다.

## §7. 실행 등급·역할

- **구현은 `standard` 등급으로 충분** — tasks.md가 결정적으로 쓰였다면 잘 명세된 실행이다.
  난이도상 막히면 `critical-reasoning` 등급으로 escalate한다.
- **self-review는 절대 다운시프트 금지**(§8) — 최종 게이트이므로 `critical-reasoning` 등급을 쓴다.
- 등급별로 어떤 모델·역할을 쓸지는 이 설치의 **바인딩**(`/localmind-binding`으로 설정)이 정본이다.
  바인딩이 없으면 **side effect 전에** 온보딩 방법을 안내하고 **기본적으로 진행하지 않는다** —
  사용자가 그 자리에서 명시적으로 "이번만 바인딩 없이 진행"을 선택하면 임시로 진행할 수 있고,
  그 경우 보고에 바인딩 미설정 상태로 진행했음을 명시한다. 역할을 격리된 프로세스로 위임할 수
  없는 설치에서는 현재 세션이 그 역할의 체크리스트를 직접 수행하고, 결과 보고에
  **비독립(fallback)**임을 명시한다.
- 각 문서 헤더의 `모델 이력`에서 **구현(예상)** 을 실제 사용 모델로 갱신한다.

## §7A. Review candidate·review round·자동 예산

- **review candidate**는 review 대상인 코드·계약·필수 evidence의 한 세대다. finding 수정이나 실제
  CI 결함 수정으로 의미가 달라지면 새 candidate다. clean 뒤 링크·상태 같은 기계적 표기만 더한 것은
  새 candidate가 아니다.
- **review round**는 같은 candidate를 대상으로 만든 merged review report 하나다. 격리 reviewer가
  여럿이어도 같은 candidate의 findings를 하나로 병합하면 round 하나이며, reviewer 수·finding 수·
  round 안의 테스트 횟수는 count를 늘리지 않는다. candidate 수정/변경 뒤 **새 merged review report**가
  생성될 때만 다음 round다.
- **automatic round budget(자동 review round 예산)**의 상한은 **최대 2 round**다. 최초 review가 round 1이고,
  blocker를 수정한 candidate의 자동 재검이 round 2다. round 1이 clean이면 round 2를 소비하지 않는다.
- round 2 report에 blocker가 남으면 **중단**한다. 남은 blocker·수정·테스트 상태·다음 review 목적을
  보고하고, round 3이나 완료·commit으로 진행하지 않는다.
- **fresh round approval**은 사용자가 현재 goal·직전 round·남은 findings·다음 review 범위를 보고받은
  뒤 명시한 승인이다. **승인 1개가 다음 round 1개**만 해제하며 실행 즉시 소진된다. 그 round에도
  blocker가 남으면 새 승인을 요청한다. **과거 승인**, **포괄 승인**, **암묵 승인**, **승인 재사용**은
  다음 round를 해제하지 않는다.

### 라운드 전환 시 전량 재검증 (보수형, AGENTS.md "critic 캐싱" 정본)

self-review 라운드가 전환돼(blocker 수정으로 새 candidate 생성) round 2가 열려도 **모든
verification matrix 행을 전량 재검증**한다. **verdict 승계·행 스킵은 하지 않는다** — round 2
격리 리뷰어는 round 1의 verdict를 물려받지 않고 각 행을 독립적으로 재검증한다(per-round
독립성 완전 보존, 위 자동 review round 예산과 정합). 라운드 간 재사용되는 것은 **검증 결과가
아니라 matrix map(AC↔코드·evidence 대응 조사 지도)뿐**이며, map은 "어디를 보라"만 정할 뿐
통과 근거가 아니다.

**일부 행만 재검증하는 verification skip(verdict 스킵)은 이 워크플로에 여전히 금지한다.** 이것과
별개로 **evidence 실행 결과의 조건부 승계**(hermetic·고비용·수정 diff와 선언 의존의 교집합
공집합 3조건 전부, 출처 표기 의무, 저비용은 항상 재실행)는 허용한다 — 절차 상세는
sdd-self-review SKILL "승계 절차" 절이 정본이다(specs/202607210545). blast-radius 무효화
판정은 §3A(base freshness gate)의 "base 통합으로 candidate가 변경되면 frozen matrix의 영향
행을 재평가" 규약에 **한해서만** 적용되며, 그 규약을 여기서 재정의하지 않는다.

## §7B. Matrix freeze와 증거 범위

matrix readiness가 통과한 뒤 **첫 dogfood 직전에 matrix를 freeze(동결)**한다. 이후 matrix 밖의
evidence 형식·증거 선호는 **advisory** 또는 후속 과제이지 현재 blocker가 아니다. 단 재현된
**제품·보안 결함은 blocker**이며 동결로 무시하지 않는다.

stop condition이 실제로 잘못됐음이 입증되면 **변경 이유**, **영향 AC**, **무효화할 기존 evidence**를
먼저 기록하고 영향받는 행과 검증만 다시 실행한다. **새로운 요구 또는 AC**는 사용자 승인 뒤
**spec-first**로 spec/plan/matrix를 먼저 바꾸고 검수받은 다음 구현한다.

## §8. DoD — 이걸 다 채워야 완료

순서대로. 앞이 안 되면 뒤로 가지 않는다.

1. **전 AC green** — spec의 모든 AC가 **실환경 테스트**로 통과(단위+통합+e2e, 해당 레벨은 plan 테스트 전략 표대로).
   미충족 AC가 있으면 **명시 보고**한다(숨기지 않는다).
2. **도그푸드(필수)** — 테스트 green만으로 완료가 아니다. **실제 실행으로 과정·결과를 관찰**한다(헌법 §8).
   무엇을 관찰했는지 보고에 적는다. 관찰 불가면 그 사실을 보고한다.
3. **self-review** — 위임 직전, 저장소가 결정적 preflight 검사를 제공하면(예: localmind의
   `npm run review:preflight -- specs/{spec}`) 먼저 실행한다. 실패하면 critic을 시작하지 않고
   기계 수정 먼저 한다. preflight 통과는 어떤 AC의 green 근거도 아니다. 그 뒤
   `sdd-self-review` 스킬로 독립(적대적) 리뷰를 돌린다. **이 워크플로가 끝나면 반드시 수행**한다.
   명백한 결함·AC 미충족은 실패 테스트로 재현해 수정하되 §7A의 automatic round budget을 따른다.
   round 2 뒤 blocker가 남으면 fresh round approval 전에는 완료·commit하지 않는다. 애매한 판단·
   트레이드오프만 사람에게 올린다. ([self-review-after-goal])
4. **완료(commit/push/PR/CI)는 저장소 AGENTS.md 규약대로.** 이 워크플로는 별도의 완료 규칙을
   자체 정의하지 않는다 — AGENTS.md가 정본이다.

### Versioned completion state와 external completion state

- **versioned completion state**는 최종 repository commit 전에 확정 가능한 코드·테스트·문서·publish
  handoff 준비다. tracked task checkbox는 여기까지만 닫는다.
- **external completion state**는 push 뒤 PR 번호·review·CI run·성공/실패처럼 remote가 소유하는
  상태다. repository AGENTS.md가 정한 remote PR/CI를 SSoT로 삼고 최종 보고에 링크·상태를 남긴다.
  외부 상태만 mirror하려는 status-only follow-up commit은 만들지 않는다.
- CI가 **실제 결함**을 발견하면 그 수정은 **새 candidate**다. 관련 테스트를 다시 통과시키고 남은
  round 또는 fresh approval 규칙에 따른 review를 거친 뒤 commit한다. 새 PR head의 CI가 다시 외부
  정본이 된다.

## §9. 보고·정직

- **수행 결과**: 완료 task·미완료(있으면 이유)·전 AC 충족 여부(미충족은 명시).
- **도그푸드 관찰 내용** — 무엇을 실행해 무엇을 봤는지.
- **self-review 결과** — 수정한 결함 / 사람에게 올리는 판단.
- **PR 링크** + 다음 단계(사람 검토·머지).
- 프로젝트에 변경 로그 규약이 있으면 배포 후 항목 초안을 안내한다.
- **정직한 보고** — 없는 문서, 무관한 dirty 파일, 환경 제약으로 못 돌린 테스트는 숨기지 않고
  사실대로 보고한다.

## §10. 이름·지속 실행 (선택)

이 워크플로 이름을 런타임 내장 명령과 겹치게 바꾸지 마라. 런타임에 지속 실행(목표 유지) 내장
기능이 있으면 사용자가 바깥에서 감쌀 수 있으나, 이 워크플로의 필수 전제는 아니다.

## 관련

- [goal-ready] — 짝: 요구 → 문서(goal/spec/plan/tasks). 이 스킬의 입력을 만든다.
- [sdd-self-review] — §8-3의 실행 수단.
- [sdd-default-flow] · [sdd-goal-governance] — 이 스킬이 앉는 전체 SDD 흐름.
- [dev-methodology-ddd-tdd] — §5 구현 규율의 근거.
- [self-review-after-goal] — §8-3 게이트의 근거.
- [llm-coding-discipline] — 외과적 변경·단순함 우선·목표 주도.
- [goal-spec-plan-for-goal-handoff] — §3 readiness 기준.
