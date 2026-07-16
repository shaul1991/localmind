# Goal: /localmind-rules — 거버넌스 규칙 저작·관리 커맨드

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- 왜(why). 구현 세부(SKILL 구조·API·파일경로·단계)는 넣지 않는다. -->

## Background — 배경

localmind는 이미 에이전트 작업 규칙의 단일 정본이다(specs/041): 규칙은 `~/.localmind/rules/`의
**규칙당 `.md` 1개**(base 전역 · overlay 프로젝트, 충돌 시 overlay 승)로 저작하고, `make
rules-deploy`가 Claude/Codex/repo 표면에 managed 섹션으로 배포한다. 그러나 **규칙을 실제로 만들·고치는
행위는 손으로 `.md`를 편집하는 것**이 전부다 — specs/041도 "규칙을 어떻게 생성·편집하나"를 미해결
open question으로 남겼다. 규칙 저작용 커맨드는 존재하지 않는다(net-new).

## Problem — 문제

새 규칙을 정의할 때마다 **대화식으로 매번 처음부터 푼다** — 구조(Why/How/관련)도, 기존 규칙과의
정합도 그때그때 즉흥이다. 특히 새 규칙이 기존 규칙과 **모순**될 수 있는데(예: "hotfix는 먼저 고치고
사후 문서화"는 기존 `no-work-without-doc`와 정면 충돌) 이를 **체계적으로 잡는 장치가 없다**. 결과적으로
규칙 관리가 불투명하고, 반복 불가능하며, 접근성이 낮다.

## Objective — 목표

기존 규칙을 읽고 사용자의 의도를 파악해, **충돌·링크 고아를 검증 게이트로 잡으며**, 규칙을
추가/제거/편집하고 배포까지 제안하는 **`/localmind-rules` 슬래시 커맨드**를 제공한다. 규칙 관리를
"매번 새 대화"가 아니라 **명확·가시적·반복 가능한 한 커맨드**로 만든다. (본질은 interview-protocol의
검증 게이트를 "규칙 변경"에 재귀 적용하는 것.)

## Expected outcome — 기대 결과

- 규칙 하나를 만드는 일(충돌 조정 포함)이 **즉흥 대화 없이 한 흐름**으로 끝난다.
- 새/변경 규칙이 기존 규칙과 부딪히면 **사용자에게 검증 게이트로 올라와** 의식적으로 조정된다
  (예외 절 · overlay 오버라이드 · 재서술 · 취소).
- 저작 결과가 곧바로 배포로 이어진다(base=글로벌, overlay=repo).

## Success metrics — 성공 지표

<!-- self-review clean 후 달성분은 [ ]→[x], 미달성은 미체크 + 사유 부기. -->

- [~] `/localmind-rules`로 새 규칙을 **처음부터 배포까지** 한 흐름으로 저작 가능 — 커맨드 배포됨,
      흐름 배선 검증. 전체 end-to-end 실측은 사용자 실사용 시(게이트 결정 필요).
- [x] 기존 규칙과 **의미적으로 충돌**하는 규칙 저작 시 **검증 게이트** + 조정 선택 — dogfood:
      hotfix ↔ no-work-without-doc 충돌 감지 확인.
- [x] 규칙 **제거/편집** 시 링크 의존이 깨지면 **고아 검사 게이트** — dogfood: 마크다운 링크 의존 5건 감지.
- [x] 새 규칙 **base/overlay 배치 매번 확인** — SKILL §4(I-4) 배선.
- [x] 저작 후 **올바른 배포 제안**(base=--no-repo, overlay=repo) + managed-only — SKILL §5 + deploy.ts 대조.

> 전체 AC·검증 상태: `spec.md` §검증 결과. self-review clean(MAJOR 1 수정). end-to-end 실측은 사용자 실사용 시.

## Non-goals — 비목표

- **설정/config/env 관리**(별개 영역 — .env·make setup). 이 커맨드는 *규칙*만.
- **스킬·페르소나 저작**(별도 배포 체계).
- **런타임 MCP 규칙 pull**(specs/041 D1대로 배포시점 합성 유지 — 하드주입 보존).
- **충돌 자동 해소**(사용자 없이 봉합 금지 — 게이트는 필수).
- **새 규칙 저장·배포 메커니즘 신설**(기존 registry/compose/deploy를 재사용).

## Constraints — 제약

- **기존 인프라 재사용**: 규칙 registry·compose·deploy(src/rules/*, make rules-deploy)를 새로 만들지
  않고 그 위에 얹는다. 규칙당 `.md` 1개·kebab name·managed 섹션 불변식 준수.
- **충돌 감지는 의미 기반**(LLM이 전 규칙을 읽고 모순 추론) — 키워드 매칭으론 hotfix↔no-work-without-doc
  류를 못 잡는다. 구조 검사(중복 name·problems)는 registry 재사용.
- **base vs overlay 매번 확인** · overlay 승 의미 보존.
- **hotfix 규칙은 no-work-without-doc와 조정 필요** — 무단 오버라이드 금지(예외 절 또는 overlay).
- **비개발자 사용자 포함**(OSS) — 게이트·메시지는 평이한 한국어.

## Stakeholders — 이해관계자

- **단일 사용자**(localmind를 설치한 개인 누구나 — 비개발자 포함). 규칙 저작·조정·배포의 주체.

## Risks — 리스크

- **의미 충돌 오탐/미탐**: LLM이 실제 충돌을 놓치면 게이트가 못 잡는다 → 검증 게이트가 "감지된 것"에만
  작동한다는 한계. 미탐 시 규칙이 조용히 모순될 위험.
- **파괴적 제거**: load-bearing 규칙 제거가 다른 규칙을 고아로 만듦 → 링크 검사 게이트로 완화.
- **배포 표면 오배치**: base/overlay 선택 오류로 잘못된 표면에 배포 → 배치 확인 게이트로 완화.
- **범위 침투**: "거버넌스/설정"으로 커지면 규칙 커맨드가 설정 관리까지 흡수 → Non-goal로 방어.

---

> **상태**: draft. 다음 — 이 goal 검토 후 `spec.md`(FR→goal 추적·충돌/고아/배치/배포 AC를 Given-When-Then)
> · `plan.md`(SKILL.md 커맨드 흐름·registry 재사용 경계·5단계 인터뷰 매핑). `/goal` 착수 전 readiness 점검.
