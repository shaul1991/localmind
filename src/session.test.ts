/**
 * session.ts 단위 테스트 — 세션 저장소·매핑 해석(순수 로직, 외부 의존 없음).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionStore, extractExplicitId, prepareSession, toolsSignature, type NormMsg } from "./session.js";
import type { Config, SessionMode } from "./config.js";

// 테스트에 필요한 최소 Config(세션 관련 필드만 의미 있음).
function cfg(sessionMode: SessionMode): Config {
  return {
    port: 0,
    host: "127.0.0.1",
    apiKey: null,
    defaultBackend: "claude",
    claudeDefaultModel: "sonnet",
    codexDefaultModel: "gpt-5.5",
    claudeBin: "claude",
    codexBin: "codex",
    requestTimeoutMs: 1000,
    logLevel: "info",
    sessionMode,
    sessionTtlMs: 3_600_000,
    sessionMax: 1000,
    allowedHosts: null,
  };
}

describe("SessionStore", () => {
  it("set 후 get으로 조회된다", () => {
    const s = new SessionStore(10, 3600_000);
    s.set("k", { backend: "claude", cliSessionId: "sid", messageCount: 1, updatedAt: 0 });
    assert.equal(s.get("k")?.cliSessionId, "sid");
  });

  it("TTL이 지나면 만료되어 undefined", async () => {
    const s = new SessionStore(10, 5); // 5ms TTL
    s.set("k", { backend: "claude", cliSessionId: "sid", messageCount: 1, updatedAt: 0 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(s.get("k"), undefined);
  });

  it("maxEntries 초과 시 가장 오래된 항목부터 제거한다", () => {
    const s = new SessionStore(2, 3600_000);
    s.set("a", { backend: "claude", cliSessionId: "1", messageCount: 1, updatedAt: 0 });
    s.set("b", { backend: "claude", cliSessionId: "2", messageCount: 1, updatedAt: 0 });
    s.set("c", { backend: "claude", cliSessionId: "3", messageCount: 1, updatedAt: 0 });
    assert.equal(s.get("a"), undefined, "가장 오래된 a가 제거됨");
    assert.ok(s.get("b"));
    assert.ok(s.get("c"));
    assert.equal(s.size, 2);
  });

  it("delete로 제거된다", () => {
    const s = new SessionStore(10, 3600_000);
    s.set("k", { backend: "claude", cliSessionId: "sid", messageCount: 1, updatedAt: 0 });
    s.delete("k");
    assert.equal(s.get("k"), undefined);
  });
});

describe("extractExplicitId", () => {
  const norm = (b: Record<string, unknown>) => extractExplicitId(undefined, b);

  it("헤더 값이 있으면 최우선", () => {
    assert.equal(extractExplicitId("hdr-id", { session_id: "body-id" }), "hdr-id");
  });
  it("헤더 없으면 body.session_id", () => {
    assert.equal(norm({ session_id: "s1" }), "s1");
  });
  it("session_id 없으면 body.user(OpenAI)", () => {
    assert.equal(norm({ user: "u1" }), "u1");
  });
  it("metadata.user_id(Anthropic) 폴백", () => {
    assert.equal(norm({ metadata: { user_id: "m1" } }), "m1");
  });
  it("아무것도 없으면 undefined", () => {
    assert.equal(norm({}), undefined);
  });
});

describe("prepareSession", () => {
  const norm = (m: NormMsg): NormMsg => m;

  it("off 모드는 항상 전체 전송·무동작 commit", () => {
    const store = new SessionStore(10, 3600_000);
    const msgs: NormMsg[] = [{ role: "user", text: "hi" }];
    const p = prepareSession({ messages: msgs, norm, backend: "claude", explicitId: undefined, config: cfg("off"), store });
    assert.equal(p.resumeId, undefined);
    assert.deepEqual(p.sendMessages, msgs);
  });

  it("explicit 모드: 첫 요청은 fresh, 이후 같은 id는 새 메시지만 전송하며 resume한다", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    // 1턴: user 1개 → fresh
    const first: NormMsg[] = [{ role: "user", text: "첫 질문" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: "sess-1", config, store });
    assert.equal(p1.resumeId, undefined);
    p1.commit("cli-sid-1", "첫 답변");

    // 2턴: user, assistant, user (3개) → messageCount(2) 이후만 전송, resume
    const second: NormMsg[] = [
      { role: "user", text: "첫 질문" },
      { role: "assistant", text: "첫 답변" },
      { role: "user", text: "둘째 질문" },
    ];
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: "sess-1", config, store });
    assert.equal(p2.resumeId, "cli-sid-1");
    assert.deepEqual(p2.sendMessages, [{ role: "user", text: "둘째 질문" }]);
  });

  it("auto 모드: prefix 해시로 이전 대화를 인식해 resume하고, 같은 prefix 재사용은 consume-once로 fresh 복구", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("auto");

    // 1턴 commit: prefix = [user, assistant] 해시로 다음 매핑 저장
    const first: NormMsg[] = [{ role: "user", text: "질문A" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: undefined, config, store });
    assert.equal(p1.resumeId, undefined);
    p1.commit("cli-A", "답변A");

    // 2턴: [질문A, 답변A, 질문B] → 마지막 assistant까지의 prefix가 매핑과 일치 → resume
    const second: NormMsg[] = [
      { role: "user", text: "질문A" },
      { role: "assistant", text: "답변A" },
      { role: "user", text: "질문B" },
    ];
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: undefined, config, store });
    assert.equal(p2.resumeId, "cli-A");
    assert.deepEqual(p2.sendMessages, [{ role: "user", text: "질문B" }]);

    // 같은 prefix로 다시 시도(재생성/분기) → consume-once로 이미 소비됨 → fresh
    const third = prepareSession({ messages: second, norm, backend: "claude", explicitId: undefined, config, store });
    assert.equal(third.resumeId, undefined, "consume-once: 두 번째 resume은 fresh로 복구");
  });

  it("auto 모드: assistant 메시지가 없으면(첫 턴) resume하지 않는다", () => {
    const store = new SessionStore(10, 3600_000);
    const p = prepareSession({
      messages: [{ role: "user", text: "처음" }],
      norm,
      backend: "claude",
      explicitId: undefined,
      config: cfg("auto"),
      store,
    });
    assert.equal(p.resumeId, undefined);
  });
});

// ── specs/013 — 세션 정확성 (FR-1 prefix 검증 · FR-2 빈 id 방어 · FR-3 tools 서명) ──

describe("prepareSession — specs/013 세션 정확성", () => {
  const norm = (m: NormMsg): NormMsg => m;

  it("AC-1: explicit — 같은 id라도 prefix 내용이 다르면 resume하지 않는다(대화 혼입 차단)", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    // 대화 A(3개) 커밋 → messageCount=4 저장
    const a: NormMsg[] = [
      { role: "user", text: "대화A 질문1" },
      { role: "assistant", text: "대화A 답1" },
      { role: "user", text: "대화A 질문2" },
    ];
    const p1 = prepareSession({ messages: a, norm, backend: "claude", explicitId: "same-user", config, store });
    p1.commit("cli-A", "대화A 답2");

    // 같은 id(예: OpenAI user 필드 고정값), 내용이 전혀 다른 대화 B(5개)
    // — 기존 개수 조건(4<=5)만으로는 접합됐던 시나리오
    const b: NormMsg[] = [
      { role: "user", text: "대화B 질문1" },
      { role: "assistant", text: "대화B 답1" },
      { role: "user", text: "대화B 질문2" },
      { role: "assistant", text: "대화B 답2" },
      { role: "user", text: "대화B 질문3" },
    ];
    const p2 = prepareSession({ messages: b, norm, backend: "claude", explicitId: "same-user", config, store });
    assert.equal(p2.resumeId, undefined, "내용이 다른 대화는 기존 CLI 세션에 접합되면 안 된다");
    assert.equal(p2.sendMessages.length, 5, "전체 히스토리로 새 세션");
  });

  it("AC-2: explicit — prefix가 그대로 유지되면 기존처럼 resume(증분 전송)한다", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    const first: NormMsg[] = [{ role: "user", text: "질문1" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: "s1", config, store });
    p1.commit("cli-1", "답변1");

    const second: NormMsg[] = [
      { role: "user", text: "질문1" },
      { role: "assistant", text: "답변1" },
      { role: "user", text: "질문2" },
    ];
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: "s1", config, store });
    assert.equal(p2.resumeId, "cli-1");
    assert.deepEqual(p2.sendMessages, [{ role: "user", text: "질문2" }]);
  });

  it("AC-3: explicit — CLI가 세션 id를 안 준 턴은 기억하지 않는다(다음 턴 전체 전송 폴백)", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    const first: NormMsg[] = [{ role: "user", text: "질문1" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: "s1", config, store });
    p1.commit(undefined, "답변1"); // CLI가 세션 id를 반환하지 않음

    const second: NormMsg[] = [
      { role: "user", text: "질문1" },
      { role: "assistant", text: "답변1" },
      { role: "user", text: "질문2" },
    ];
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: "s1", config, store });
    assert.equal(p2.resumeId, undefined, "빈 세션 id로 resume 판정되면 안 된다");
    assert.equal(p2.sendMessages.length, 3, "전체 히스토리 전송으로 맥락 보존");
  });

  it("AC-3(회귀): 이전에 잘 잇던 세션 도중 CLI가 id를 안 줘도 다음 턴이 잘린 채 fresh 실행되지 않는다", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    const first: NormMsg[] = [{ role: "user", text: "질문1" }];
    prepareSession({ messages: first, norm, backend: "claude", explicitId: "s1", config, store }).commit("cli-1", "답변1");

    const second: NormMsg[] = [
      { role: "user", text: "질문1" },
      { role: "assistant", text: "답변1" },
      { role: "user", text: "질문2" },
    ];
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: "s1", config, store });
    assert.equal(p2.resumeId, "cli-1");
    p2.commit(undefined, "답변2"); // resume 중이므로 resumeId가 세션 id로 유지돼야 함

    const third: NormMsg[] = [
      ...second,
      { role: "assistant", text: "답변2" },
      { role: "user", text: "질문3" },
    ];
    const p3 = prepareSession({ messages: third, norm, backend: "claude", explicitId: "s1", config, store });
    assert.equal(p3.resumeId, "cli-1", "resume 중이던 세션 id가 유지된다");
    assert.deepEqual(p3.sendMessages, [{ role: "user", text: "질문3" }]);
  });

  it("AC-4: explicit — tools 서명이 달라지면 resume하지 않는다(최신 tools 지시문 주입 보장)", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("explicit");
    // 1턴: tools 없이 세션 생성
    const first: NormMsg[] = [{ role: "user", text: "질문1" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: "s1", config, store, toolsSig: undefined });
    p1.commit("cli-1", "답변1");

    // 2턴: 클라이언트가 tools를 추가 → 서명 불일치 → fresh(지시문이 새로 주입되게)
    const second: NormMsg[] = [
      { role: "user", text: "질문1" },
      { role: "assistant", text: "답변1" },
      { role: "user", text: "질문2" },
    ];
    const sig = toolsSignature([{ name: "get_weather" }], { mode: "auto" });
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: "s1", config, store, toolsSig: sig });
    assert.equal(p2.resumeId, undefined, "tools가 달라진 resume은 침묵 실패를 낳으므로 fresh");
    p2.commit("cli-2", "답변2");

    // 3턴: 같은 tools 유지 → 정상 resume
    const third: NormMsg[] = [
      ...second,
      { role: "assistant", text: "답변2" },
      { role: "user", text: "질문3" },
    ];
    const p3 = prepareSession({ messages: third, norm, backend: "claude", explicitId: "s1", config, store, toolsSig: sig });
    assert.equal(p3.resumeId, "cli-2", "같은 tools 서명이면 기존처럼 resume");
  });

  it("AC-4(auto): auto 모드에서도 tools 서명이 다르면 resume하지 않는다", () => {
    const store = new SessionStore(10, 3600_000);
    const config = cfg("auto");
    const first: NormMsg[] = [{ role: "user", text: "질문A" }];
    const p1 = prepareSession({ messages: first, norm, backend: "claude", explicitId: undefined, config, store, toolsSig: undefined });
    p1.commit("cli-A", "답변A");

    const second: NormMsg[] = [
      { role: "user", text: "질문A" },
      { role: "assistant", text: "답변A" },
      { role: "user", text: "질문B" },
    ];
    const sig = toolsSignature([{ name: "search" }], { mode: "required" });
    const p2 = prepareSession({ messages: second, norm, backend: "claude", explicitId: undefined, config, store, toolsSig: sig });
    assert.equal(p2.resumeId, undefined, "tools 서명 불일치 → fresh");
  });

  it("toolsSignature: 같은 정의는 같은 서명, 다른 정의·choice는 다른 서명, 빈 목록은 undefined", () => {
    const a = toolsSignature([{ name: "f", parameters: { type: "object" } }], { mode: "auto" });
    const b = toolsSignature([{ name: "f", parameters: { type: "object" } }], { mode: "auto" });
    const c = toolsSignature([{ name: "g" }], { mode: "auto" });
    const d = toolsSignature([{ name: "f", parameters: { type: "object" } }], { mode: "required" });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
    assert.equal(toolsSignature([], { mode: "auto" }), undefined);
  });
});
