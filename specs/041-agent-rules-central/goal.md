# Goal: 에이전트 작업 규칙 중앙관리 — base + overlay 정본을 각 표면에 배포

> 모델 이력 — 작성: Opus 4.8(인터뷰·초안, 메인 세션) · 검토: Opus 4.8(critic 서브에이전트) · 구현(예상): 미정(Sonnet 5 위임 가능 — tasks.md 확정 후)
> (최고 모델 Fable 5는 2026-07-08부터 구독 요금제 밖이라 불가 → Opus 4.8 fallback, AGENTS.md 모델정책)

<!-- 왜(why). 구현 세부는 spec/plan. -->

## Background — 배경

localmind는 이미 **정본 레지스트리 → 여러 에이전트 표면 배포** 아키텍처를 가진다. `deploy_agents`가
페르소나 정의(`~/.localmind/agents/*.md`)를 Claude 서브에이전트(`~/.claude/agents/*.md`)·Codex
프로필/에이전트(`~/.codex/*`)로 렌더하며, `managed-by: localmind` 마커로 멱등·불가침·prune을
보장한다(specs/016).

그러나 배포되는 것은 **페르소나(서브에이전트)뿐**이고, 정작 "에이전트가 매 작업에서 따라야 하는
작업 규칙"(spec-first, self-review, DDD/TDD, live-verify, 인터뷰 프로토콜 등 base 규칙과, 프로젝트별
규칙)은 이 파이프라인 밖에 있다. 현재 그 규칙들은:

- **Claude 글로벌**: 벌트 `second-brain-private/contexts/governance/*`가 정본이고,
  `~/.claude/CLAUDE.md` 스텁이 `@import`로 **하드 주입**(항상 컨텍스트)한다. 동기화는 별도 백업 레인.
- **Codex 글로벌**: `@import`이 없어 공통 불변식이 소프트 포인터 뒤에 있어 **약하다**. Codex는
  `CLAUDE.md`를 읽지 않는다.
- **프로젝트별**: 각 repo의 `AGENTS.md`에 의존하는데, 어떤 repo에는 **아예 없다**(예: 규칙 파일
  없는 저장소를 Codex로 열면 그 프로젝트의 spec-first·push 금지·배포 규칙을 하나도 못 본다).

## Problem — 문제

에이전트 작업 규칙이 **디바이스·에이전트(Claude/Codex)·프로젝트마다 흩어져** 있어, 어느 조합에서
작업하느냐에 따라 적용되는 규칙이 달라진다. 구체적으로:

1. **Codex 하드주입 부재**: 공통 안전 불변식(self-review·spec-first)이 Codex에서 "항상 컨텍스트"로
   보장되지 않는다. 안전 불변식이 누락되면 그 위에 쌓는 모든 작업이 오염된다.
2. **프로젝트 규칙 공백**: 규칙 파일이 없는 repo는 프로젝트 규약을 전달할 표면 자체가 없다.
3. **규칙파일 배포 메커니즘 부재**: localmind는 페르소나는 배포하지만 `CLAUDE.md`/`AGENTS.md` 같은
   규칙 파일을 정본에서 생성·병합해 배포하는 코드가 없다(생성 0, `scaffold_sdd`의 1회 복사뿐).
4. **경로 발산**: 규칙에 절대경로가 얽히면 디바이스(m5 `/Users/jihoonkim/...`, m1 `/Users/shaul/...`,
   원격 MCP `/root/...`)마다 깨진다.

## Objective — 목표

localmind를 **에이전트 작업 규칙의 단일 정본 소유자**로 만든다 — base 규칙 + 프로젝트별 overlay를
localmind가 소유하고, **배포 시점에 base+overlay를 합성**해 각 디바이스·에이전트 표면(Claude
`CLAUDE.md`, Codex `AGENTS.md`, repo 규칙 파일)에 **managed 섹션/파일로 기록**한다. 그 결과 **어느
디바이스·어느 에이전트에서든 동일한 실효 규칙**(base + 그 프로젝트 overlay, 충돌 시 overlay 우선)이
적용되고, Claude의 하드주입 보장은 보존되며, 경로 발산은 배포 방식으로 회피한다.

## Expected outcome — 기대 결과

- 규칙 정본은 한 곳(localmind, 노트 저장소 하위 → git 백업·동기화)에서 사람이 저작한다.
- `deploy`(로컬 실행) 한 단계로 그 기기의 Claude·Codex 글로벌 표면과 현재 repo의 규칙 파일이
  정본과 일치하게 갱신된다.
- 규칙 파일 없던 repo도 그 repo에서 배포하면 base+overlay가 담긴 `AGENTS.md`(+`CLAUDE.md` 스텁)를
  얻는다.
- 사용자가 손으로 쓴 부분은 절대 훼손되지 않는다(managed 섹션만 갱신·prune).

## Success metrics — 성공 지표

<!-- self-review clean 후 달성 지표는 [x], 미달성은 사유 부기. -->
- [x] base 규칙 1벌을 localmind 정본에서 저작하면, Claude 글로벌·Codex 글로벌 두 표면에 동일 실효
  규칙이 배포된다(같은 base가 두 표면에서 하드주입/인라인으로 도달).
- [x] 규칙 파일이 없던 repo에서 배포 시 base+overlay가 담긴 `AGENTS.md`와 `@AGENTS.md` 스텁
  `CLAUDE.md`가 생성된다(Claude·Codex 둘 다 동일 내용 참조).
- [x] 배포는 멱등: 같은 정본으로 재배포해도 managed 섹션 외 사용자 저작·포매팅이 바뀌지 않는다.
- [x] 정본에서 overlay/규칙을 제거하면 다음 배포에서 해당 managed 산출물이 prune된다(사용자 파일은
  불가침).
- [x] 규칙 정본·산출물 어디에도 디바이스 절대경로가 박히지 않는다(경로 발산 0).

## Non-goals — 비목표

- **라이브 pull 모델**: 런타임에 MCP recall로 규칙을 가져오는 방식은 하드주입 상실 때문에 채택하지
  않는다(D1).
- **페르소나 레지스트리 재설계**: 기존 `deploy_agents`/페르소나(016)는 그대로 두고, 규칙 표면을
  같은 패턴으로 확장할 뿐이다.
- **기기별 project→절대경로 맵**: cwd 기반 in-place 배포로 맵 자체를 불필요하게 한다(D5).
- **원격 MCP 서버에서의 배포**: 배포는 로컬 CLI 작업이다. 원격 서버(`/root`)는 recall/capture용.
- **Windows 심볼릭 링크 이슈 해결**: repo 스텁은 `@import` 방식이라 심볼릭 링크에 의존하지 않는다.
- **벌트 백업 레인 자체의 재설계**: governance 은퇴로 그 레인의 governance 부분만 빠진다.

## Constraints — 제약

- **하드주입 보존**: Claude 표면에서 base 규칙은 `@import`로 "항상 컨텍스트"여야 한다(안전 불변식).
- **Codex 비대칭**: Codex는 `@import`·`CLAUDE.md`를 지원하지 않는다 → `AGENTS.md` 인라인 필수.
  [출처 T1 확정: learn.chatgpt.com/docs/agent-configuration/agents-md, T090 2026-07-15]
- **managed-marker 불가침**: 사용자가 만든/편집한 규칙 파일·비managed 섹션은 절대 건드리지 않는다.
- **경로 무관**: 규칙 내용은 논리 라벨만, 디바이스 절대경로 금지(기존 규약과 정합).
- **YAML 무의존**: 정본 파싱은 기존 결정적 미니파서 계열을 유지한다(공급망 고정, specs/010).
- **오픈소스 대상**: 특정 개인·절대경로를 규칙/예시에 특정하지 않는다(비개발자 포함 단일 사용자).

## Stakeholders — 이해관계자

- **단일 사용자(localmind를 설치한 개인 누구나 — 비개발자 포함)** — 여러 디바이스·여러 에이전트
  (Claude Code / Codex)에서 동일 규칙으로 작업하려는 사용자.
- **에이전트 표면**: Claude Code, Codex(향후 다른 표면도 렌더러 추가로 확장 가능).

## Risks — 리스크

- **거버넌스 이관 리스크**: 벌트 `governance/*` 은퇴 시 기존 `@import` 체인이 끊기는 전환 구간 —
  이관 완료 전까지 규칙 공백이 생길 수 있다. → 단계적 전환(정본 이관 → 배포 검증 → 스텁 전환 →
  벌트 은퇴)로 완화.
- **섹션 병합 오염**: 사용자 저작과 managed 섹션이 한 파일에 공존 → 병합 경계 버그가 사용자 내용을
  덮어쓸 위험. → 명확한 마커 경계 + 멱등 테스트로 방어(최우선 AC).
- **하드주입 약화**: 메커니즘 전환 중 Claude가 규칙을 놓치면 안전 불변식이 약해진다. → `@import`
  방식 유지로 하드주입 보장을 구조적으로 보존.
- ~~**낡은 사실**: Codex의 `AGENTS.md` 병합 규칙·32KiB 상한·`@import` 미지원은 라이브 공식문서로
  재검증해야 한다~~ **해소(T090, T1)**: 전부 확정(Codex CLAUDE.md 미인식·인라인 필수·32KiB). Claude
  `@import` 상대경로 해석도 T1 확정(code.claude.com/docs/en/memory). 잔여 리스크: repo에서 base 이중
  계상(Codex 32KiB) — plan Open question.
