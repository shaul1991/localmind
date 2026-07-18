---
title: Codex Deep Research redacted audit
audience: ai
---

# Codex Deep Research redacted audit

## 1. Invocation contract

- Date: 2026-07-18
- Canonical `SKILL.md` SHA-256: `91556f29906f3803895acee636ae5ef7eea2234e447e3a9df7880745488e6b00`
- Invocation: `$deep-research <brief>`
- Harness: `codex exec --ephemeral --sandbox read-only --json -C /private/tmp --skip-git-repo-check`
- Exit: 0
- Redaction: thread/item IDs, token fields, source bodies, prior-context result bodies, and 11 read-only command outputs are omitted. The user brief, ordered workflow messages, live URL events, lane barrier/critic messages, and complete final report are preserved. The omitted commands ran inside the CLI's read-only sandbox.

### Complete user brief

```text
2026-07-18 기준 Agent Skills 표준과 Claude Code·Codex·Gemini CLI의 skill 호출 방식을 비교한다. 이 완성형 brief는 추가 질문 없이 즉시 실행하라는 사용자 확인이다. 공식 T1 문서만 최대 4개 사용하고 접근 불가 사실은 미검증으로 남긴다. 격리 위임은 사용하지 못하면 current-session fallback과 not independent를 명시한다. 범위는 invocation·explicit activation·공통 canonical 가능성이며 가격과 Antigravity 전용 adapter는 제외한다. 한국어로 TL;DR, 범위/기준일, findings, URL·접근일 ledger, conflicts/limits, recommendations, Open questions, 실행 투명성, final critic을 반환한다. write/capture/git/message는 0건이다.
```

## 2. Ordered event trace

1. `thread.started / turn.started` — ephemeral read-only run.

2. `agent_message` — 명시 호출된 `deep-research` 스킬을 적용합니다. 먼저 해당 연구 계약과 세션 컨텍스트를 읽고, 범위를 네 가지 질문(표준·Claude Code·Codex·Gemini CLI)으로 나눈 뒤 공식 T1 문서 최대 4개만 라이브 검증하겠습니다. 결과는 읽기 전용으로만 처리하며, brief가 완결되어 있어 추가 확인 없이 진행합니다.

3. `agent_message` — 연구 계약은 적용했습니다. 확인된 brief는 “2026-07-18 현재, 네 공식 문서로 호출·명시 활성화·공통 canonical 가능성만 비교하고, 가격·Antigravity 전용 adapter는 제외하며, 접근 불가 항목은 미검증으로 남기는 보고서”입니다. `openai-docs` 스킬도 Codex 공식 근거를 고르는 데 사용하며, 해당 스킬 지침 때문에 Codex는 우선 공식 Codex 매뉴얼 경로에서 검증합니다.

4. `agent_message` — 선행 run record(2026-07-10)를 찾았지만 최신 근거로 간주하지 않고 탐색 시드로만 사용합니다. 이제 `deep-research`가 요구하는 격리 연구 lane을 사용합니다: Agent Skills 표준, Claude Code, Gemini CLI를 각각 `fork_turns=none`의 읽기 전용 작업으로 분리하고, 저는 Codex 공식 문서를 담당합니다. 모든 lane이 끝나기 전에는 종합하지 않겠습니다.

5. `web_search` — query "https://developers.openai.com/codex/skills"; completed.

6. `web_search` — query "https://developers.openai.com/codex/skills"; completed.

7. `web_search` — query "<empty runtime navigation event>"; completed.

8. `todo.updated` — done:연구 계약·선행 문맥·기존 조사 확인 | pending:질문 분해 후 공식 T1 4개 연구 lane 수행 | pending:evidence ledger 종합과 canonical 가능성 판정 | pending:final critic 재검 후 한국어 보고

9. `agent_message` — Codex 공식 문서는 live 확인됐습니다. 현행 문서는 explicit 호출을 CLI/IDE의 `/skills` 선택 또는 `$skill` mention으로, implicit 호출을 `description` 일치 기반으로 구분하며, `agents/openai.yaml`의 `allow_implicit_invocation`은 Codex 전용 확장입니다. 아직 다른 세 lane 결과 전이므로 공통 결론은 보류합니다.

10. `collab.wait` — completed; thread identifiers redacted.

11. `collab.wait` — completed; thread identifiers redacted.

12. `collab.wait` — completed; thread identifiers redacted.

13. `agent_message` — 네 연구 lane이 모두 완료되었습니다. 현재 종합 결론은 “공통 canonical은 호출 명령이 아니라 표준형 skill 패키지에만 성립한다”입니다. Claude는 `/name`, Codex는 `$name`/`/skills` 선택, Gemini CLI는 문서상 모델의 `activate_skill`+사용자 동의이며 직접 사용자 호출 문법은 미규정입니다. 이제 이 종합안을 fresh 격리 critic에게 넘겨 과대해석과 근거 누락을 점검합니다.

14. `todo.updated` — done:연구 계약·선행 문맥·기존 조사 확인 | done:질문 분해 후 공식 T1 4개 연구 lane 수행 | done:evidence ledger 종합과 canonical 가능성 판정 | pending:final critic 재검 후 한국어 보고

15. `collab.wait` — completed; thread identifiers redacted.

16. `collab.wait` — completed; thread identifiers redacted.

17. `agent_message` — critic이 네 출처의 직접 지지 여부와 “미규정”을 “미지원”으로 잘못 확장한 곳이 없는지 재확인 중입니다. 특히 Gemini의 직접 호출, Codex의 `/skills`와 `$skill` 차이, 공통 canonical의 적용 범위를 중점 점검하고 있습니다.

18. `collab.wait` — completed; thread identifiers redacted.

19. `collab.wait` — completed; thread identifiers redacted.

20. `collab.wait` — completed; thread identifiers redacted.

21. `agent_message` — critic은 치명적 오류는 없다고 봤지만 표현 강도와 섹션 누락을 지적했습니다. 이를 반영해 Claude의 `paths`/`user-invocable` 의미를 바로잡고, “단일 target 불가”를 “공통 보장 없음”으로 낮추며, 사실·추론·권고·미검증을 명시적으로 분리했습니다. 수정안을 같은 독립 critic에게 재검 요청합니다.

22. `collab.wait` — completed; thread identifiers redacted.

23. `todo.updated` — done:연구 계약·선행 문맥·기존 조사 확인 | done:질문 분해 후 공식 T1 4개 연구 lane 수행 | done:evidence ledger 종합과 canonical 가능성 판정 | done:final critic 재검 후 한국어 보고

24. `agent_message` — complete final report emitted(전문은 아래 §3).

## 3. Complete final report

# Agent Skills 표준과 3개 CLI 비교

## TL;DR

세 런타임은 표준형 `SKILL.md`를 공통 canonical로 공유할 수 있지만, 공통 범위는 지침·메타데이터·상대경로 리소스까지다. 호출 방식은 Claude Code `/skill`, Codex `$skill`/`/skills`, Gemini CLI 모델 자동 활성화+사용자 동의로 서로 다르므로 런타임별 adapter가 필요하다.

Gemini CLI의 직접 사용자 호출 문법은 지정 공식 문서에서 확인되지 않았다. 이는 “미지원”이 아니라 “미규정·미검증”이다.

## 범위·기준일

- 기준일: 2026-07-18
- 포함: invocation, explicit activation, 공통 canonical 가능성
- 제외: 가격, Antigravity 전용 adapter
- 근거: 공식 T1 문서 4개만 사용
- 방법: 문서 계약 비교. 런타임 E2E는 수행하지 않음

## Findings

### 1. 비교표

| 대상 | 암시적 활성화 | 사용자의 명시적 활성화 | 런타임 고유 제어 |
|---|---|---|---|
| Agent Skills 표준 | metadata를 먼저 읽고 선택 후 본문을 읽는 progressive disclosure만 규정 | 공통 문법을 정의하지 않음 | 설치 경로·호출 UX·권한은 구현체 영역 |
| Claude Code | `description`·`when_to_use`로 적용 판단. `paths`는 자동 활성화 가능 범위를 glob으로 제한 | `/skill-name [args]`; plugin은 `/plugin:skill` | `disable-model-invocation: true`, `user-invocable: false` |
| Codex | 작업이 `description`과 맞으면 Codex가 선택 | CLI/IDE에서 `/skills` 선택 또는 `$skill` mention | `agents/openai.yaml`의 `allow_implicit_invocation: false` |
| Gemini CLI | 모델이 설명을 매칭해 `activate_skill` 호출 → 사용자 동의 → 본문 주입 | 지정 문서에는 직접 호출 문법이 없음 | `/skills …`와 `gemini skills …`는 조회·활성 상태·설치 등 관리 명령 |

### 2. Agent Skills 표준

[확인된 사실] 지정된 specification은 다음 portable 계약을 정의한다.

- `<skill-name>/SKILL.md`
- YAML frontmatter와 Markdown 본문
- 필수 `name`, `description`
- 디렉터리명과 `name`의 일치
- 선택적 `scripts/`, `references/`, `assets/`
- skill root 기준 상대경로 참조

반면 런타임 공통의 `/skill`, `$skill` 같은 사용자 invocation 문법이나 explicit activation protocol은 정의하지 않는다. [`allowed-tools`는 experimental이고 구현별 지원이 다를 수 있다.](https://agentskills.io/specification)

### 3. Claude Code

[확인된 사실] 사용자는 `/skill-name`으로 직접 호출할 수 있다. 기본적으로 사용자와 Claude 모두 호출할 수 있다.

- `disable-model-invocation: true`: Claude의 자동·프로그램 호출을 차단해 사용자 전용으로 만든다.
- `user-invocable: false`: `/` 메뉴에서 숨기고 사용자 호출을 막아 Claude 전용으로 만든다.
- plugin skill은 `/plugin-name:skill-name` namespace를 사용한다.
- 개인 경로는 `~/.claude/skills/<name>/SKILL.md`, 프로젝트 경로는 `.claude/skills/<name>/SKILL.md`다.

[`description`과 `when_to_use`가 자동 적용 판단에 사용되고, `paths`는 관련 파일 glob으로 자동 활성화 범위를 제한한다.](https://code.claude.com/docs/en/skills)

### 4. Codex

[확인된 사실] Codex는 두 활성화 방식을 공식적으로 구분한다.

1. Explicit: CLI/IDE에서 `/skills`를 실행하거나 `$`로 skill을 mention한다.
2. Implicit: 작업이 `description`과 일치할 때 Codex가 선택한다.

`agents/openai.yaml`에서 `allow_implicit_invocation: false`를 설정하면 자동 선택은 차단되지만 explicit `$skill` 호출은 유지된다. 사용자 skill 경로는 `$HOME/.agents/skills`, 저장소 경로는 CWD부터 repo root까지의 `.agents/skills`다. [Codex는 이 형식이 open Agent Skills 표준에 기반한다고 명시한다.](https://developers.openai.com/codex/skills)

### 5. Gemini CLI

[확인된 사실] Gemini CLI의 문서화된 실행 lifecycle은 다음과 같다.

```text
enabled skill의 name·description discovery
→ 모델이 task와 description을 매칭
→ activate_skill 호출
→ 사용자 UI 동의
→ SKILL.md와 디렉터리 구조 주입
```

사용자 경로는 `~/.gemini/skills/` 또는 `~/.agents/skills/`, workspace 경로는 `.gemini/skills/` 또는 `.agents/skills/`다.

`/skills list|enable|disable|reload|refresh|link`와 `gemini skills …`는 discovery·설치·상태 관리 명령이다. 특정 skill을 실행하는 invocation 문법으로 문서화되어 있지 않다. [따라서 직접 사용자 호출은 미지원이 아니라 지정 페이지에서 미규정이다.](https://geminicli.com/docs/cli/skills/)

### 6. 공통 canonical 가능성

[비교 추론] 공통 canonical은 가능하지만 “동일한 skill 콘텐츠”에 한정된다.

```text
<logical-skill-id>/
├── SKILL.md       # name + description + vendor-neutral instructions
├── references/    # 상대경로 자료
└── assets/        # 선택
```

세 제품 모두가 보장하는 단일 invocation contract나 단일 discovery/install target은 문서화되어 있지 않다. 동일 원본을 복사·링크해 배포할 수 있는지는 별도 E2E 검증 대상이다.

## URL·접근일 ledger

| T1 문서 | URL | 문서 날짜 | 접근일·상태 |
|---|---|---|---|
| Agent Skills Specification | `https://agentskills.io/specification` | 미표기 | 2026-07-18, 성공 |
| Claude Code Skills | `https://code.claude.com/docs/en/skills` | 미표기 | 2026-07-18, 성공 |
| Codex Build Skills | 요청: `https://developers.openai.com/codex/skills` → 도착: `https://learn.chatgpt.com/docs/build-skills` | 미표기 | 2026-07-18, 성공 |
| Gemini CLI Agent Skills | `https://geminicli.com/docs/cli/skills/` | 2026-04-30 갱신 | 2026-07-18, 성공 |

## Conflicts / limits

- 직접 충돌하는 공식 근거는 없었다. 차이는 표준과 런타임 adapter의 책임 분리로 설명된다.
- Agent Skills의 `name` 설명에는 “unicode lowercase alphanumeric” 표현과 `a-z`, `0-9` 열거 사이에 문구상 긴장이 있다.
- Gemini의 직접 사용자 호출 문법은 지정 문서에서 확인되지 않았다.
- Codex 문서는 접근 중 ChatGPT Learn으로 redirect됐다.
- Gemini 외 세 문서는 페이지 내 갱신일이 없어 정확한 문서 버전은 확인할 수 없다.
- 공식 문서 계약만 비교했으며 실제 세 런타임의 설치·충돌·권한·호출 E2E는 수행하지 않았다.
- “canonical”은 세 문서가 정의한 공식 제품 개념이 아니라 비교 결과에서 도출한 설계 용어다.

## Recommendations

[권고] 다음과 같이 분리하는 것이 안전하다.

- Canonical core:

  - `name`과 디렉터리명을 일치시킨다.
  - 가장 보수적으로 `a-z`, `0-9`, `-`만 사용한다.
  - `description`에 기능과 사용 시점을 명확히 쓴다.
  - 상대경로 `references/`·`assets/`만 의존한다.
  - experimental `allowed-tools`와 vendor 전용 activation 필드는 제외한다.

- Runtime adapter:

  - Claude Code: `/id`, `.claude/skills`, Claude 전용 frontmatter
  - Codex: `$id` 또는 `/skills`, `.agents/skills`, `agents/openai.yaml`
  - Gemini CLI: description 기반 자동 활성화+동의, Gemini discovery/precedence 관리

- 사용자 문서에는 논리 ID와 런타임별 호출 매핑을 별도 표로 유지한다.
- 실제 배포 전 세 런타임에서 discovery, implicit activation, explicit activation, name collision을 E2E로 검증한다.

## Open questions

- Gemini CLI에 문서화된 직접 사용자 skill invocation 문법이 별도로 존재하는가?
- Agent Skills `name`의 Unicode 표현과 ASCII 열거 중 어느 범위가 규범적 의도인가?
- 하나의 물리적 canonical 디렉터리를 copy 또는 symlink로 세 런타임에 배포했을 때 precedence·reload·충돌 동작이 동일한가?
- 각 런타임이 다른 제품의 추가 frontmatter를 무시하는지, 오류로 처리하는지?

## 실행 투명성

- `deep-research` 명시 호출과 완결된 brief를 확인해 추가 질문 없이 실행했다.
- 기존 second-brain run record는 탐색 시드로만 읽었으며 최종 근거로 사용하지 않았다.
- 격리 연구 lane:

  - Agent Skills 표준: fresh `fork_turns=none`
  - Claude Code: fresh `fork_turns=none`
  - Gemini CLI: fresh `fork_turns=none`
  - Codex: coordinator current session

- 네 공식 문서 모두 live 확인했다.
- 실행 등급은 runtime에서 직접 선택할 수 없어 `economy`·`standard`·`critical-reasoning` binding은 보장하지 못한다.
- 파일 write, capture, git 작업, 외부 message 전송: 각각 0건
- 내부 서브에이전트 task dispatch는 격리 연구 orchestration이며 외부 상태 변경이 아니다.
- 가격·Antigravity 전용 adapter 조사 및 런타임 E2E: 0건

## Final critic

Fresh `fork_turns=none` critic이 독립 검수했다. 최초 판정은 `not clean`이었으며 섹션 누락, Claude activation 표현, canonical 보장 범위의 과대 표현을 지적했다. 이를 수정한 뒤 재검했고 최종 판정은 `clean`이었다.

Critic은 독립 context였지만 모델 등급을 직접 선택할 수 없어 `critical-reasoning` 등급 자체는 보장하지 않는다.
