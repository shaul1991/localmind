---
title: Claude Deep Research redacted audit
audience: ai
---

# Claude Deep Research redacted audit

## 1. Invocation contract

- Date: 2026-07-18
- Canonical `SKILL.md` SHA-256: `91556f29906f3803895acee636ae5ef7eea2234e447e3a9df7880745488e6b00`
- Invocation: `/deep-research <brief>`
- Harness: `claude -p --output-format stream-json --verbose --include-hook-events --no-session-persistence --permission-mode dontAsk --tools Read,WebFetch --allowedTools Read,WebFetch --strict-mcp-config`
- Exit: 0; permission denials: 0; `WebFetch` tool-use events: 4
- Redaction: session/tool UUID, token/cost fields, thinking blocks, and fetched source bodies are omitted. Ordered assistant text, tool name/input, result status, and the complete final report are preserved.

### Complete user brief and termination guard

```text
2026-07-18 기준 Agent Skills 표준과 Claude Code·Codex·Gemini CLI의 skill 호출 방식을 비교한다. 이 완성형 brief는 추가 질문 없이 즉시 실행하라는 사용자 확인이다. 공식 T1 문서는 정확히 다음 네 URL만 각각 한 번씩 WebFetch하고 다른 URL·redirect 보완 조회·재시도는 하지 않는다: https://agentskills.io/specification , https://code.claude.com/docs/en/skills , https://developers.openai.com/codex/skills , https://geminicli.com/docs/cli/skills/ . 접근 불가 사실은 미검증으로 남기고 네 번째 결과 뒤 즉시 수집을 종료한다. 격리 위임은 사용하지 못하면 current-session fallback과 not independent를 명시한다. 범위는 invocation·explicit activation·공통 canonical 가능성이며 가격과 Antigravity 전용 adapter는 제외한다. 첫 broad lookup 전에 brief와 claim별 source/live-verify 전략, 네 문서 종료 조건을 짧게 기록한다. 한국어로 TL;DR, 범위/기준일, findings, URL·접근일 ledger, conflicts/limits, recommendations, Open questions, 실행 투명성, final critic을 반환한다. write/capture/git/message는 0건이다.
```

## 2. Ordered event trace

1. `system.init` — available tools: `Read`, `WebFetch`.

2. `assistant.text` — I'll start by reading the research contract, then record the brief before any lookups.

3. `assistant.tool_use tool-1` — `Read` {"file_path":"$HOME/.claude/skills/deep-research/references/research-contract.md"}.

4. `tool_result tool-1` — success; source/local body 2561 chars omitted.

5. `assistant.text` — ## 실행 계획 기록 (첫 lookup 전)  **Brief 재진술:** - **질문:** 2026-07-18 기준 Agent Skills 표준과 Claude Code·Codex·Gemini CLI의 skill 호출(invocation) 방식 비교 - **범위:** invocation · explicit activation · 공통 canonical 표준 가능성 / **제외:** 가격, Antigravity 전용 adapter - **활성화 근거:** 완성형 brief + "추가 질문 없이 즉시 실행" 명시 확인 → 재질문 없이 진행 - **산출물:** report-only 채팅 보고(한국어), write/capture/git/message 0건  **Claim별 source / live-verify 전략:** 4개 claim군(표준 스펙 / Claude Code / Codex / Gemini CLI) 각각을 지정된 T1 공식 문서 1개로 라이브 확인. 시간 민감(invocation 방식·activation)이므로 기억이 아닌 라이브 fetch만 근거로 사용.  **종료 조건:** 지정된 4개 URL을 각각 정확히 1회만 WebFetch. redirect 보완·재시도·추가 URL 없음. 네 번째 결과 수신 즉시 수집 종료. 접근 불가 URL은 "미검증"으로 남김.  **격리 위임:** 이 세션에서 격리된 read-only lane 위임 능력이 없음 → current-session fallback, **not independent** 명시 예정.  이제 4개 URL을 각각 1회씩 조회한다.

6. `assistant.tool_use tool-2` — `WebFetch` {"url":"https://agentskills.io/specification","prompt":"Extract the Agent Skills specification details: what is a skill, the SKILL.md format/frontmatter fields, how skills are invoked/activated (model-invoked vs explicit), progressive disclosure, and any statement about this being a canonical/cross-tool open standard. Quote key fields and invocation mechanics. Note publication or update dates if present."}.

7. `tool_result tool-2` — success; source/local body 7956 chars omitted.

8. `assistant.tool_use tool-3` — `WebFetch` {"url":"https://code.claude.com/docs/en/skills","prompt":"Extract how Claude Code invokes/activates skills: are skills model-invoked automatically based on description, or explicitly triggered? SKILL.md structure and frontmatter (name, description, allowed-tools). How does Claude decide to use a skill (explicit activation vs automatic)? Any mention of the Agent Skills open standard/spec. Note dates if present."}.

9. `tool_result tool-3` — success; source/local body 2098 chars omitted.

10. `assistant.tool_use tool-4` — `WebFetch` {"url":"https://developers.openai.com/codex/skills","prompt":"Extract how OpenAI Codex handles skills: SKILL.md format, how skills are invoked/activated (automatic model-invoked vs explicit), frontmatter fields, and whether it references the Agent Skills standard or compatibility with Claude's skills. How does Codex decide to invoke a skill? Note dates if present."}.

11. `tool_result tool-4` — success; source/local body 699 chars omitted.

12. `assistant.tool_use tool-5` — `WebFetch` {"url":"https://geminicli.com/docs/cli/skills/","prompt":"Extract how Gemini CLI handles skills: SKILL.md format, how skills are invoked/activated (automatic vs explicit), frontmatter fields, and whether it references the Agent Skills standard or cross-tool compatibility. How does Gemini CLI decide to invoke a skill? Note dates if present."}.

13. `tool_result tool-5` — success; source/local body 1494 chars omitted.

14. `assistant.text` — 4개 결과 수신 완료 (종료 조건 도달). Codex URL은 다른 호스트로 308 redirect되어, brief 제약(redirect 보완 조회 금지)에 따라 **따라가지 않고 미검증**으로 처리한다. Claude Code 상세는 저장된 전체 출력에서 invocation 통제 부분을 확인한다.

15. `assistant.tool_use tool-6` — `Read` {"file_path":"<redacted-tool-result-path>"}.

16. `tool_result tool-6` — success; source/local body 71425 chars omitted.

17. `assistant.text` — final report 작성 시작(전문은 아래 §3).

## 3. Complete final report

4개 문서 수집 완료. 네 번째 결과 뒤 즉시 종료했다(Codex는 308 redirect → brief 제약상 미추적 → 미검증). 이제 종합·critic(current-session, **not independent**) 후 보고한다.

---

# Agent Skills 표준 vs Claude Code·Codex·Gemini CLI의 skill 호출 방식

## 1. TL;DR

- **공통 canonical 표준은 실재한다.** `agentskills.io`의 Agent Skills 스펙(SKILL.md + YAML frontmatter + progressive disclosure)이 canonical 정본이고, **Claude Code와 Gemini CLI 둘 다 "Agent Skills open standard 기반"이라고 공식 문서에서 명시**했다 `[T1]`.
- **호출의 뼈대는 세 문서에서 동일하다:** 시작 시 `name`+`description`(≈100토큰)만 로드 → 모델이 task가 description에 맞다고 판단하면 skill을 **activate**해 본문 로드(progressive disclosure). 즉 **description 기반 model-invoked activation이 표준의 기본**이다.
- **차이는 "명시적 활성화(explicit)"와 통제 레이어에 있다:** Claude Code는 `/skill-name` 직접 호출 + `disable-model-invocation`/`user-invocable`로 누가 부를지 세밀 통제. Gemini CLI는 `activate_skill` 툴 호출 + **매 활성화 사용자 동의 프롬프트**가 특징(명시적 슬래시 호출 여부는 가져온 문서에 없음 → 미검증).
- **Codex는 미검증.** 지정 URL이 `learn.chatgpt.com`으로 308 redirect되어, brief 제약(redirect 보완·재시도 금지)에 따라 따라가지 않았다. Codex의 skill 호출 방식은 이번 조사에서 확인 불가.

## 2. 범위 / 기준일

- **기준일:** 2026-07-18 (조사·확인일 동일)
- **범위:** invocation(호출) · explicit activation(명시적 활성화) · 공통 canonical 표준 가능성
- **제외:** 가격, Antigravity 전용 adapter
- **대상 문서:** 지정 4개 T1 URL만, 각 1회 WebFetch (추가 URL·redirect 보완·재시도 없음)

## 3. 핵심 발견 (findings)

### 3-1. Agent Skills 표준 (agentskills.io/specification) `[T1]`
- **구조:** skill = `SKILL.md`(필수) 담은 디렉토리 + 선택 `scripts/`·`references/`·`assets/`.
- **Frontmatter:** `name`(필수), `description`(필수), 그리고 선택 `license`·`compatibility`·`metadata`·`allowed-tools`(실험적).
- **호출/활성화 모델 = progressive disclosure 3단계:**
  1. **Metadata**(~100토큰): 모든 skill의 `name`+`description`을 시작 시 로드
  2. **Instructions**(<5000토큰 권장): "the agent will load this entire file **once it's decided to activate a skill**" — 즉 에이전트(모델)가 활성화를 **결정**하면 본문 로드
  3. **Resources**: 필요 시에만 참조 파일 로드
- **표준의 성격:** description으로 "무엇을·언제" 쓰는지 기술 → 에이전트가 관련 task 식별. 명시적 슬래시 호출 문법은 표준이 **규정하지 않음**(클라이언트 확장 영역). `skills-ref` 검증 라이브러리 제공.

### 3-2. Claude Code (code.claude.com/docs/en/skills) `[T1]`
- **표준 준수 명시:** "Claude Code skills follow the **Agent Skills open standard**, which works across multiple AI tools." + invocation control·subagent execution·dynamic context injection을 **표준 확장**으로 추가한다고 명시.
- **이중 호출(dual invocation):** ① Claude가 description 기반으로 **자동 활성화**, ② 사용자가 **`/skill-name`으로 직접 호출**. ("Claude uses skills when relevant, or you can invoke one directly with `/skill-name`.")
- **명시적 활성화 통제(표준 확장 frontmatter):**
  - `disable-model-invocation: true` → **사용자만** 호출(모델 자동 X). commit/deploy 등 부작용 워크플로에 사용.
  - `user-invocable: false` → **Claude만** 호출(메뉴 숨김). 배경 지식용.
  - 기본값은 사용자·Claude 둘 다 호출 가능.
- **커스텀 커맨드 통합:** `.claude/commands/deploy.md`와 `.claude/skills/deploy/SKILL.md`가 동일하게 `/deploy` 생성. skill이 command보다 우선.

### 3-3. Codex (developers.openai.com/codex/skills) — **미검증**
- 지정 URL이 `https://learn.chatgpt.com/docs/build-skills`로 **308 Permanent Redirect**. brief 제약상 다른 호스트 redirect는 따라가지 않음.
- 따라서 Codex의 SKILL.md 포맷·호출 방식·표준 준수 여부는 **이번 조사에서 확인 불가**. (URL이 별도 build-skills 문서로 옮겨졌다는 사실 자체만 관측됨.)

### 3-4. Gemini CLI (geminicli.com/docs/cli/skills/) `[T1]`
- **표준 준수 명시:** "Based on the **Agent Skills open standard**." + `.agents/skills/`를 "AI 툴 간 호환되는 interoperable path"로 언급.
- **호출/활성화:** 반자동(semi-automatic) — 모델이 *언제* 부를지 결정하되 사람이 매번 승인:
  1. 세션 시작 시 skill name·description을 system prompt에 주입
  2. task가 skill description에 맞으면 모델이 **`activate_skill` 툴 호출**
  3. **사용자 동의 프롬프트**(skill 목적·디렉토리 접근 표시)
  4. 승인 시 SKILL.md 본문·파일 권한이 대화에 주입
- **discovery 우선순위(낮음→높음):** built-in < extensions < user(`~/.gemini/skills/`) < workspace(`.gemini/skills/`).
- **주의:** 가져온 문서에 frontmatter 필드 상세와 **명시적(슬래시) 사용자 호출 문법은 기술되지 않음** → 그 부분은 미검증. 또한 문서에 **"April 30, 2026" 날짜(미래·문서 artifact 가능성)**가 있어 날짜 신뢰도에 유의.

### 3-5. 비교 요약표

| 항목 | 표준(agentskills.io) | Claude Code | Codex | Gemini CLI |
|---|---|---|---|---|
| 표준 준수 명시 | (정본) | ✅ 명시 + 확장 | 미검증 | ✅ 명시 |
| 기본 활성화 | description 기반 model-invoked | model 자동 | 미검증 | model이 `activate_skill` 호출 |
| 명시적 사용자 호출 | 규정 안 함(클라 확장) | ✅ `/skill-name` | 미검증 | 문서에 없음(미검증) |
| 활성화 통제 | `allowed-tools`(실험) | `disable-model-invocation`·`user-invocable` 등 | 미검증 | **매 활성화 사용자 동의** |
| SKILL.md 포맷 | 정본 규정 | 표준 + 확장 필드 | 미검증 | 표준 기반(상세 미기술) |

## 4. 근거 ledger (URL · 접근일)

| Claim | Evidence (URL) | Authority | Dates | Relation | Status |
|---|---|---|---|---|---|
| Agent Skills 표준이 SKILL.md+frontmatter+progressive disclosure를 canonical로 규정 | agentskills.io/specification | T1(표준 정본) | 접근 2026-07-18(발행일 미표기) | 지지 | 확인된 사실 |
| 표준의 기본 활성화 = 에이전트가 description 보고 활성화 결정 후 본문 로드 | agentskills.io/specification ("once it's decided to activate a skill") | T1 | 접근 2026-07-18 | 지지 | 확인된 사실 |
| Claude Code는 Agent Skills open standard 준수 + 확장 | code.claude.com/docs/en/skills | T1(공식) | 접근 2026-07-18 | 지지 | 확인된 사실 |
| Claude Code는 자동 활성화 + `/skill-name` 명시 호출 이중 지원, `disable-model-invocation`/`user-invocable`로 통제 | code.claude.com/docs/en/skills | T1 | 접근 2026-07-18 | 지지 | 확인된 사실 |
| Gemini CLI는 Agent Skills open standard 기반, `activate_skill`+사용자 동의로 활성화 | geminicli.com/docs/cli/skills/ | T1(공식) | 문서표기 2026-04-30(artifact 의심), 접근 2026-07-18 | 지지 | 확인된 사실(날짜 유의) |
| Gemini CLI의 명시적 슬래시 호출·frontmatter 상세 | (문서에 없음) | — | 접근 2026-07-18 | — | 미검증 |
| Codex의 skill 호출 방식 | developers.openai.com/codex/skills → 308 redirect(learn.chatgpt.com) | — | 접근 2026-07-18 | — | 미검증(redirect 미추적) |

## 5. 상충 / 한계 (conflicts / limits)

- **상충 근거 없음.** 세 문서가 공통으로 "Agent Skills open standard"를 지목해 서로 정합적. 조용히 합친 부분 없음.
- **한계 1 — Codex 공백:** 지정 URL redirect로 Codex는 완전 미검증. 4-way 비교가 아니라 **사실상 3-way(표준·Claude·Gemini) + Codex 공백**.
- **한계 2 — Gemini 세부 공백:** 가져온 Gemini 페이지가 frontmatter 필드·명시적 호출 문법을 기술하지 않아, Claude Code와 동일 수준의 세부 비교 불가.
- **한계 3 — 날짜 신뢰도:** Gemini 문서의 "2026-04-30" 표기가 기준일(2026-07-18) 이전이나 문서 스스로 artifact 가능성을 시사. 표준·Claude 문서는 명시 발행일 없음(접근일만 확정).
- **한계 4 — 단발 fetch:** 각 URL 1회·redirect 미추적·재시도 없음이라 페이지 내 추가 섹션·하위문서는 미수집.

## 6. 권고 / 다음 단계 (recommendations)

- **canonical 표준 채택 판단:** Agent Skills(agentskills.io)를 공통 SSoT로 봐도 근거 충분 — Claude·Gemini가 공식적으로 준수 선언. 크로스툴 skill 작성 시 **표준 frontmatter(`name`·`description`)에 최소 의존**하고, 툴별 확장 필드(`disable-model-invocation` 등)는 해당 툴 전용으로 격리 권장.
- **Codex 확인이 필요하면** 별도 승인 하에 redirect 목적지(`learn.chatgpt.com/docs/build-skills`)를 1회 조회하는 후속 태스크로 분리(이번 brief 제약 밖).
- **explicit activation 설계 시:** 부작용 있는 워크플로는 Claude Code `disable-model-invocation`, Gemini는 동의 프롬프트가 이미 기본 안전장치 — 자동 활성화에 부작용 skill을 맡기지 말 것.

## 7. Open questions

1. **Codex는 Agent Skills 표준을 준수하는가? 호출은 자동/명시 중 무엇인가?** (redirect 목적지 미확인 → 미검증)
2. **Gemini CLI에 `/skill-name` 같은 명시적 사용자 호출 문법이 있는가?** (가져온 문서 미기술)
3. **Gemini CLI frontmatter 필드가 표준과 정확히 일치하는가?** (상세 미확인)
4. **표준 스펙·Claude 문서의 실제 발행/개정일은?** (접근일만 확정, 발행일 미표기)
5. **Gemini 문서 "2026-04-30" 표기의 실체**(오타/artifact/실제 개정일 중?)

## 8. 실행 투명성

- **Live 확인:** 지정 4개 URL을 각각 정확히 1회 WebFetch. 추가 URL·redirect 보완·재시도 **0건**(제약 준수). agentskills·Claude·Gemini는 라이브 로드 성공, Codex는 308 redirect로 미추적.
- **종료 조건:** 네 번째 결과 수신 즉시 수집 종료 — 준수.
- **Research lane / 격리 위임:** 이 세션에서 격리된 read-only lane 위임 능력 없음 → **current-session fallback**으로 순차 처리. **not independent.**
- **실행 등급:** source scout/researcher/synthesizer/critic 등급을 별도 에이전트에 바인딩하지 못함(위임 불가) → 등급 적용 없이 current-session 수행. 낮은 등급으로 조용히 대체한 것 아님, 애초 위임 경로 부재.
- **부작용:** write/capture/git/message **0건**. report-only 준수.

## 9. Final critic (current-session, **not independent**)

- **claim-evidence coverage:** 각 확정 claim에 direct link 인접 배치됨. Codex·Gemini 세부는 evidence 부재를 근거로 "미검증"으로 정직 표기 — link 없는 단정 없음. ✅
- **최신성·authority:** 4개 모두 T1(공식/표준). Gemini 날짜 artifact를 숨기지 않고 flag. ✅
- **사실/추론/권고/미검증 구분:** ledger Status 컬럼과 본문에서 분리. Codex를 "확인 못 함"이 아니라 마치 표준 준수인 듯 추정하지 않음. ✅
- **scope·종료 조건:** invocation·explicit activation·canonical만 다룸, 가격·Antigravity 제외. 4문서 1회·즉시 종료 준수. ✅
- **과도한 확신 점검:** "공통 canonical 표준 실재"는 3개 T1 명시 근거라 확정 유지가 타당하나, **Codex 미포함이 4-way 완전성을 제한**함을 §5에 명시 — 결론을 표준 전체로 과일반화하지 않음. ✅
- **결함 발견·수정:** 초안에서 Gemini "명시적 호출 지원"을 단정할 뻔했으나 가져온 문서에 근거 없어 **미검증으로 강등**(Open Q2). 재검 결과 잔여 결함 없음.

**결론 상태:** 확정 3-way 비교 + Codex 명시적 공백. report-only·제약 전부 준수, 부작용 0.
