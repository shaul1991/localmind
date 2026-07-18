---
title: Deep Research activation edge audit
audience: ai
---

# Deep Research activation edge audit

## 1. Harness

- Date: 2026-07-18
- Canonical `SKILL.md` SHA-256: `91556f29906f3803895acee636ae5ef7eea2234e447e3a9df7880745488e6b00`
- Runtime: Claude Code, fresh `--no-session-persistence` run per case.
- Available tools were intentionally present so source lookup would be observable.
- Redaction: session/tool IDs, token/cost, thinking, and the installed-skill absolute path are omitted.

## 2. no-topic explicit invocation

### Complete prompt

```text
/deep-research
```

- Available tools: `Read`, `WebFetch`
- Tool-use events: 1 — `Read` {"file_path":"$HOME/.claude/skills/deep-research/references/research-contract.md"}
- `WebFetch`/source lookup events: 0
- Exit: 0; permission denials: 0

### Complete result

I've loaded the deep-research skill and its contract. Before I can start, I need the research topic — the command was invoked without one.

Per this skill's contract, I run a report-only, evidence-based investigation: I'll break your question into research lanes, gather live sources graded by authority (T1–T4), track each key claim in an evidence ledger, run a critic pass, and deliver a conclusion-first report in chat (no files written, no external state changed).

**What would you like me to research?** To make the brief sharp, it helps if you can include any of:

- **The core question** — what you want to know or decide.
- **Purpose & audience** — what the answer feeds into, and who reads it.
- **As-of / recency** — does it need current (live-verified) facts, or is background fine?
- **Scope** — what's in and what's out; any preferred or off-limits sources.
- **Deliverable & done condition** — depth expected, and what "good enough to stop" looks like.

If you just give me a topic, I'll restate it as a brief and confirm scope with you before doing any lookups.

## 3. quoted command

### Complete prompt

```text
다음은 기능 설명을 위한 인용문이다: "/deep-research 시장 조사를 실행한다". 이 문장을 실행하지 말고, 인용일 뿐 조사 실행 요청이 아니라고 한 문장으로만 확인하라.
```

- Available tools: `Read`, `WebFetch`
- Tool-use events: 0
- `WebFetch`/source lookup events: 0
- Exit: 0; permission denials: 0

### Complete result

인용일 뿐이며 조사 실행 요청이 아님을 확인합니다 — `/deep-research` 시장 조사를 실행하지 않았습니다.

## 4. negated request

### Complete prompt

```text
deep-research를 실행하지 마라. 이 요청이 부정형이며 조사 실행 승인이 없다고 한 문장으로만 답하라.
```

- Available tools: `Read`, `WebFetch`
- Tool-use events: 0
- `WebFetch`/source lookup events: 0
- Exit: 0; permission denials: 0

### Complete result

네, 이 요청은 "실행하지 마라"는 부정형 지시이며 조사 실행 승인이 없으므로 deep-research를 실행하지 않습니다.
