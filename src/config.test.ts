/**
 * DEFAULT_BACKEND(주 백엔드) 해석 테스트 — claude|codex|gemini 허용, 그 외는 claude로 안전 폴백.
 * 실행: npm test (node:test).
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

describe("loadConfig — DEFAULT_BACKEND(주 백엔드) 해석", () => {
  const saved = process.env.DEFAULT_BACKEND;
  afterEach(() => {
    if (saved === undefined) delete process.env.DEFAULT_BACKEND;
    else process.env.DEFAULT_BACKEND = saved;
  });

  it("claude", () => {
    process.env.DEFAULT_BACKEND = "claude";
    assert.equal(loadConfig().defaultBackend, "claude");
  });
  it("codex", () => {
    process.env.DEFAULT_BACKEND = "codex";
    assert.equal(loadConfig().defaultBackend, "codex");
  });
  it("gemini (신규 허용)", () => {
    process.env.DEFAULT_BACKEND = "gemini";
    assert.equal(loadConfig().defaultBackend, "gemini");
  });
  it("미설정 → 기본 claude", () => {
    delete process.env.DEFAULT_BACKEND;
    assert.equal(loadConfig().defaultBackend, "claude");
  });
  it("미지의 값 → 안전하게 claude", () => {
    process.env.DEFAULT_BACKEND = "banana";
    assert.equal(loadConfig().defaultBackend, "claude");
  });
});
