import assert from "node:assert";
import { describe, it } from "node:test";
import type { Config } from "../config.js";
import { Router, detectBackend } from "./router.js";

function cfg(over: Partial<Config> = {}): Config {
  return {
    defaultBackend: "claude",
    claudeDefaultModel: "sonnet",
    codexDefaultModel: "gpt-5.5",
    geminiDefaultModel: "gemini-3.5-flash",
    geminiApiKey: "k",
    geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    claudeBin: "claude",
    codexBin: "codex",
    ...over,
  } as unknown as Config;
}

describe("router — Gemini 라우팅", () => {
  it("AC-1: detectBackend가 gemini* 모델을 gemini로 판별한다", () => {
    assert.strictEqual(detectBackend("gemini-3.5-flash"), "gemini");
    assert.strictEqual(detectBackend("gemini-3.1-flash-lite"), "gemini");
    assert.strictEqual(detectBackend("google/gemini-3.5-flash"), "gemini");
  });

  it("AC-3: claude/codex 판별은 불변(회귀 0)", () => {
    assert.strictEqual(detectBackend("claude-sonnet"), "claude");
    assert.strictEqual(detectBackend("opus"), "claude");
    assert.strictEqual(detectBackend("gpt-5.5"), "codex");
    assert.strictEqual(detectBackend("o3"), "codex");
    assert.strictEqual(detectBackend("random-model"), null);
  });

  it("AC-1: Router.resolve가 gemini 모델을 gemini 백엔드로 보낸다", () => {
    const r = new Router(cfg());
    const { backend, model } = r.resolve("gemini-3.5-flash");
    assert.strictEqual(backend.name, "gemini");
    assert.strictEqual(model, "gemini-3.5-flash");
  });

  it("AC-2: gemini: 프리픽스를 벗기고 gemini 백엔드로 보낸다", () => {
    const r = new Router(cfg());
    const { backend, model } = r.resolve("gemini:gemini-3.5-flash");
    assert.strictEqual(backend.name, "gemini");
    assert.strictEqual(model, "gemini-3.5-flash");
  });

  it("AC-7: gemini: (모델 공백)이면 기본 모델로 폴백한다", () => {
    const r = new Router(cfg({ geminiDefaultModel: "gemini-3.1-flash-lite" }));
    const { backend, model } = r.resolve("gemini:");
    assert.strictEqual(backend.name, "gemini");
    assert.strictEqual(model, "gemini-3.1-flash-lite");
  });

  it("AC-3: claude/codex 기존 라우팅 유지", () => {
    const r = new Router(cfg());
    assert.strictEqual(r.resolve("claude-sonnet").backend.name, "claude");
    assert.strictEqual(r.resolve("gpt-5.5").backend.name, "codex");
    assert.strictEqual(r.resolve("codex:gpt-5.5").backend.name, "codex");
    // 기본 백엔드(claude)로 폴백
    assert.strictEqual(r.resolve("").backend.name, "claude");
  });

  it("claude:/codex: (모델 공백)도 기본 모델로 폴백한다(백엔드는 불변)", () => {
    const r = new Router(cfg());
    const c = r.resolve("claude:");
    assert.strictEqual(c.backend.name, "claude");
    assert.strictEqual(c.model, "sonnet");
    const x = r.resolve("codex:");
    assert.strictEqual(x.backend.name, "codex");
    assert.strictEqual(x.model, "gpt-5.5");
  });
});
