# AGENTS.md — localmind 작업 규약

이 저장소에서 작업하는 모든 AI 에이전트(Claude Code, Codex 등)가 따르는 규약이다.

## SDD 흐름 — 기본값

모든 기능·변경은 `specs/{NNN}-{feature-slug}/` 폴더에 3개 문서로 시작한다:

- `goal.md` — 왜(why): Background·Problem·Objective·Success metrics·Non-goals·Constraints·Stakeholders·Risks
- `spec.md` — 무엇을(what): FR(각 FR은 goal 항목을 지지), Acceptance Criteria(Given-When-Then, 테스트와 1:1 매핑), Open questions
- `plan.md` — 어떻게(how): 도메인 경계, 영향 모듈, 단계, 테스트 전략

번호는 3자리(`001`, `002`, ...), 슬러그는 kebab-case. 다음 사용 가능 번호는 기존 `specs/`
폴더의 최댓값 + 1이다(현재 최신: `005-note-link-graph` → 다음은 `006`).

## `/goal {NNN}` 처리 방법

사용자가 `/goal {NNN}`(숫자만)으로 작업을 지시하면:

1. `specs/{NNN}-*/` 폴더를 찾는다(번호 프리픽스로 매칭, 슬러그는 몰라도 됨).
2. 해당 폴더의 `goal.md` · `spec.md` · `plan.md`를 모두 읽는다.
3. `plan.md`의 단계를 기준으로 구현한다 — FR/AC는 `spec.md`, 배경/의도는 `goal.md`를 따른다.
4. 구현 후 AC를 테스트로 검증한다(TDD — 실패 테스트를 먼저 쓰고 통과시킨다).
5. 세 문서 중 하나라도 없으면 진행 전에 사용자에게 알린다 — 문서 없이 구현하지 않는다.

## 구현 규율

- TDD: 유저 시나리오 → 실패 테스트 → 최소 구현 → 리팩터. AC를 테스트로 1:1 매핑한다.
- 외과적 변경: 요청과 무관한 리팩터·포매팅 변경을 하지 않는다.
- git commit/push는 사용자가 명시적으로 요청했을 때만 수행한다.

## 오픈소스 대상 — 비개발자 포함, 특정 개인 아님

localmind는 누구나 설치해 쓰는 오픈소스 개인 second-brain 도구다. **비개발자도 사용자다.**

- `goal.md`의 Stakeholders 등에 특정 인물(예: 저장소 소유자)을 사용자로 특정하지 않는다 —
  "단일 사용자(설치한 개인 누구나 — 비개발자 포함)"로 쓴다.
- 예시·AC에 실제 개인 절대경로를 넣지 않는다 — 플레이스홀더(`/home/<user>/...`)를 쓴다.
- 에러 메시지·MCP 도구 응답은 비개발자가 이해할 수 있는 평이한 한국어로 작성한다.
